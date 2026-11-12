import pytest

from apps.audit.models import AuditLog
from apps.tenant_requests import mpesa
from apps.tenant_requests.models import MpesaPayment, PropertyRequest
from tests.conftest import authed, make_user
from apps.accounts.models import Role

SECRET = "s3cret-token"
BODY = {"goal": "rent", "area_text": "Roysambu", "unit_types": ["1br"], "min_rent": "8000", "max_rent": "15000",
        "amenities": ["parking", "swimming_pool", "gated_community"], "notes": "Move in by December",
        "alert_channels": ["sms", "whatsapp", "email"]}


@pytest.fixture(autouse=True)
def _mpesa(settings):
    settings.MPESA_CALLBACK_SECRET = SECRET
    settings.MPESA_BACKEND = "mock"
    mpesa.mock_outbox.clear()


def _create(user, **over):
    return authed(user).post("/api/v1/requests/", {**BODY, **over}, format="json")


def _callback(checkout_id, code=0, amount=200, receipt="QGH7XYZ123", secret=SECRET):
    from rest_framework.test import APIClient

    cb = {"MerchantRequestID": "m", "CheckoutRequestID": checkout_id, "ResultCode": code, "ResultDesc": "done"}
    if code == 0:
        cb["CallbackMetadata"] = {"Item": [{"Name": "Amount", "Value": amount},
                                           {"Name": "MpesaReceiptNumber", "Value": receipt}]}
    return APIClient().post(f"/api/v1/payments/mpesa/callback/{secret}/", {"Body": {"stkCallback": cb}}, format="json")


def _paid_setup(tenant):
    rid = _create(tenant).data["id"]
    p = authed(tenant).post(f"/api/v1/requests/{rid}/pay/")
    return rid, MpesaPayment.objects.get(pk=p.data["id"])


def test_tenant_creates_request_with_fixed_fee_and_amenities(tenant):
    r = _create(tenant, fee_amount="1", status="active")
    assert r.status_code == 201, r.data
    assert r.data["status"] == "pending_payment" and r.data["fee_amount"] == "200.00"
    assert r.data["amenities"] == ["parking", "swimming_pool", "gated_community"]


def test_request_validation(tenant, landlord, client, geo):
    assert _create(tenant, amenities=["jacuzzi"]).status_code == 400
    assert _create(tenant, alert_channels=["fax"]).status_code == 400
    assert _create(tenant, unit_types=["castle"]).status_code == 400
    assert _create(tenant, min_rent="20000", max_rent="10000").status_code == 400
    assert _create(tenant, area_text="").status_code == 400  # no location at all
    assert _create(tenant, area_text="", latitude=51.0, longitude=0.0).status_code == 400
    assert _create(tenant, area_text="", latitude=-1.26, longitude=36.82).status_code == 201
    assert _create(landlord).status_code == 403
    assert client.post("/api/v1/requests/", BODY, format="json").status_code in (401, 403)


def test_ward_choice_fills_in_wider_areas(tenant, geo):
    ward = geo["wards"]["parklands"]
    r = _create(tenant, area_text="", ward=ward.id)
    assert r.data["county_name"] == "Nairobi" and r.data["ward_name"] == "Parklands"


def test_pay_sends_stk_push_for_200_to_the_tenants_phone(tenant):
    rid, pay = _paid_setup(tenant)
    sent = mpesa.mock_outbox[-1]
    assert sent["amount"] == 200 and sent["phone"] == tenant.phone.lstrip("+")
    assert pay.status == "pending" and pay.amount == 200
    # a second tap within two minutes doesn't send another prompt
    again = authed(tenant).post(f"/api/v1/requests/{rid}/pay/")
    assert again.status_code == 200 and len(mpesa.mock_outbox) == 1


def test_pay_can_use_another_mpesa_number(tenant):
    rid = _create(tenant).data["id"]
    authed(tenant).post(f"/api/v1/requests/{rid}/pay/", {"phone": "0722111222"}, format="json")
    assert mpesa.mock_outbox[-1]["phone"] == "254722111222"


def test_successful_callback_activates_the_request_once(tenant):
    rid, pay = _paid_setup(tenant)
    assert _callback(pay.checkout_request_id).status_code == 200
    req = PropertyRequest.objects.get(pk=rid)
    pay.refresh_from_db()
    assert req.status == "active" and req.activated_at and req.expires_at > req.activated_at
    assert pay.status == "success" and pay.mpesa_receipt == "QGH7XYZ123"
    # Safaricom retries: nothing changes the second time
    activated = req.activated_at
    _callback(pay.checkout_request_id, receipt="OTHER")
    req.refresh_from_db(); pay.refresh_from_db()
    assert req.activated_at == activated and pay.mpesa_receipt == "QGH7XYZ123"
    assert authed(tenant).get(f"/api/v1/requests/{rid}/payment/").data["status"] == "success"
    assert authed(tenant).post(f"/api/v1/requests/{rid}/pay/").status_code == 400  # already paid


def test_cancelled_or_failed_payment_leaves_request_unpaid(tenant):
    rid, pay = _paid_setup(tenant)
    _callback(pay.checkout_request_id, code=1032)
    pay.refresh_from_db()
    assert pay.status == "cancelled" and PropertyRequest.objects.get(pk=rid).status == "pending_payment"
    # customer can try again after the 2-minute guard because this payment is no longer pending
    assert authed(tenant).post(f"/api/v1/requests/{rid}/pay/").status_code == 201


def test_wrong_amount_never_activates(tenant):
    rid, pay = _paid_setup(tenant)
    _callback(pay.checkout_request_id, amount=50)
    pay.refresh_from_db()
    assert pay.status == "mismatch" and PropertyRequest.objects.get(pk=rid).status == "pending_payment"


def test_callback_secret_unknown_ids_and_junk(tenant, settings):
    rid, pay = _paid_setup(tenant)
    assert _callback(pay.checkout_request_id, secret="wrong").status_code == 404
    assert PropertyRequest.objects.get(pk=rid).status == "pending_payment"
    assert _callback("ws_CO_unknown").status_code == 200
    from rest_framework.test import APIClient

    assert APIClient().post(f"/api/v1/payments/mpesa/callback/{SECRET}/", {"hello": 1}, format="json").status_code == 200
    settings.MPESA_CALLBACK_SECRET = ""
    assert _callback(pay.checkout_request_id, secret="").status_code == 404  # disabled when no secret set


def test_other_people_cannot_see_or_pay_for_a_request(tenant):
    other = make_user("0744000009", Role.TENANT, full_name="Other Tenant")
    rid = _create(tenant).data["id"]
    assert authed(other).get(f"/api/v1/requests/{rid}/").status_code == 404
    assert authed(other).post(f"/api/v1/requests/{rid}/pay/").status_code == 404
    assert authed(tenant).get("/api/v1/requests/").data["count"] == 1
    assert authed(other).get("/api/v1/requests/").data["count"] == 0


def test_cancel_and_audit_trail(tenant):
    rid, pay = _paid_setup(tenant)
    _callback(pay.checkout_request_id)
    assert authed(tenant).post(f"/api/v1/requests/{rid}/cancel/").data["status"] == "cancelled"
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"request.created", "payment.initiated", "payment.success", "request.cancelled"} <= actions


def test_mpesa_failure_gives_a_clean_error(tenant, monkeypatch):
    def boom(*a, **k):
        raise mpesa.MpesaError("M-Pesa could not send the payment prompt. Try again.")

    monkeypatch.setattr(mpesa, "stk_push", boom)
    rid = _create(tenant).data["id"]
    r = authed(tenant).post(f"/api/v1/requests/{rid}/pay/")
    assert r.status_code == 502 and not MpesaPayment.objects.exists()
