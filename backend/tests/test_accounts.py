import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts import sms
from apps.accounts.models import LandlordVerification, User
from apps.accounts.phone import normalise_phone

from .conftest import authed

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("raw,expected", [
    ("0712345678", "+254712345678"),
    ("0112345678", "+254112345678"),
    ("+254 712 345 678", "+254712345678"),
    ("254712345678", "+254712345678"),
    ("+14155550123", "+14155550123"),
])
def test_phone_normalisation(raw, expected):
    assert normalise_phone(raw) == expected


@pytest.mark.parametrize("raw", ["", "12345", "0612345678", "abc"])
def test_phone_rejects_bad_numbers(raw):
    with pytest.raises(ValidationError):
        normalise_phone(raw)


def _code():
    return sms.outbox[-1]["message"].split("code is ")[1][:6]


def test_otp_flow_creates_account_and_returns_jwt(client):
    assert client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"}).status_code == 200
    r = client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": _code(),
                                                  "role": "landlord", "full_name": "Lena"})
    assert r.status_code == 200
    assert r.data["created"] is True and r.data["user"]["role"] == "landlord"
    assert r.data["user"]["landlord_verified"] is False
    me = client.get("/api/v1/me/", HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
    assert me.status_code == 200 and me.data["phone"] == "+254712345678"


def test_otp_code_is_single_use_and_wrong_code_rejected(client):
    client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"})
    code = _code()
    bad = "000000" if code != "000000" else "111111"
    assert client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": bad}).status_code == 400
    assert client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": code}).status_code == 200
    assert client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": code}).status_code == 400


def test_otp_locks_after_too_many_attempts(client):
    client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"})
    code = _code()
    bad = "000000" if code != "000000" else "111111"
    for _ in range(5):
        client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": bad})
    assert client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": code}).status_code == 400


def test_otp_request_rate_limited_per_phone(client):
    codes = [client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_cannot_self_register_as_admin(client):
    client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"})
    r = client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": _code(), "role": "admin"})
    assert r.status_code == 400
    assert not User.objects.filter(phone="+254712345678").exists()


def test_existing_user_cannot_change_role_via_otp(client, tenant):
    client.post("/api/v1/auth/otp/request/", {"phone": tenant.phone})
    r = client.post("/api/v1/auth/otp/verify/", {"phone": tenant.phone, "code": _code(), "role": "landlord"})
    assert r.status_code == 200 and r.data["user"]["role"] == "tenant"


def test_password_login_with_email_or_phone(client, tenant):
    c = authed(tenant)
    assert c.post("/api/v1/auth/password/", {"password": "S0me-long-pass!"}).status_code == 200
    assert client.post("/api/v1/auth/login/", {"identifier": "tom@example.com", "password": "S0me-long-pass!"}).status_code == 200
    assert client.post("/api/v1/auth/login/", {"identifier": "0733000001", "password": "S0me-long-pass!"}).status_code == 200
    assert client.post("/api/v1/auth/login/", {"identifier": "0733000001", "password": "wrong"}).status_code == 401


def test_otp_only_account_cannot_password_login(client, tenant):
    assert client.post("/api/v1/auth/login/", {"identifier": tenant.phone, "password": ""}).status_code in (400, 401)


def test_me_cannot_escalate_role(tenant):
    c = authed(tenant)
    c.patch("/api/v1/me/", {"role": "admin", "landlord_verified": True, "full_name": "Tommy"}, format="json")
    tenant.refresh_from_db()
    assert tenant.role == "tenant" and tenant.landlord_verified is False and tenant.full_name == "Tommy"


# --- landlord verification ---------------------------------------------------

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def _upload(c, name="id.png", content=PNG, doc_type="id_front"):
    return c.post("/api/v1/landlord/verification/",
                  {"doc_type": doc_type, "file": SimpleUploadedFile(name, content)}, format="multipart")


def test_landlord_submits_documents_and_admin_approves(unverified_landlord, admin_user):
    c = authed(unverified_landlord)
    r = _upload(c)
    assert r.status_code == 201 and r.data["status"] == "pending"
    vid = r.data["id"]
    # admin queue + approve
    a = authed(admin_user)
    assert len(a.get("/api/v1/admin/verifications/").data["results"]) == 1
    assert a.post(f"/api/v1/admin/verifications/{vid}/approve/").status_code == 200
    unverified_landlord.refresh_from_db()
    assert unverified_landlord.landlord_verified is True


def test_reject_requires_reason_and_unverifies(unverified_landlord, admin_user):
    vid = _upload(authed(unverified_landlord)).data["id"]
    a = authed(admin_user)
    assert a.post(f"/api/v1/admin/verifications/{vid}/reject/").status_code == 400
    assert a.post(f"/api/v1/admin/verifications/{vid}/reject/", {"reason": "Blurry ID"}).status_code == 200
    # landlord can resubmit after rejection
    assert _upload(authed(unverified_landlord)).data["status"] == "pending"


def test_non_staff_cannot_review(unverified_landlord, landlord2, tenant):
    vid = _upload(authed(unverified_landlord)).data["id"]
    for u in (landlord2, tenant, unverified_landlord):
        assert authed(u).post(f"/api/v1/admin/verifications/{vid}/approve/").status_code == 403
    assert authed(tenant).get("/api/v1/admin/verifications/").status_code == 403


def test_upload_validation(unverified_landlord):
    c = authed(unverified_landlord)
    assert _upload(c, "x.exe", b"MZ" + b"0" * 10).status_code == 400
    assert _upload(c, "fake.png", b"not really a png").status_code == 400  # magic bytes mismatch
    assert _upload(c, "big.png", PNG + b"0" * (6 * 1024 * 1024)).status_code == 400
    assert LandlordVerification.objects.filter(landlord=unverified_landlord).count() in (0, 1)


def test_tenant_cannot_upload_verification(tenant):
    assert _upload(authed(tenant)).status_code == 403


def test_documents_are_private(unverified_landlord, landlord2, admin_user, client):
    r = _upload(authed(unverified_landlord))
    doc_id = r.data["documents"][0]["id"]
    url = f"/api/v1/verification-documents/{doc_id}/file/"
    assert client.get(url).status_code == 401
    assert authed(landlord2).get(url).status_code == 404
    own = authed(unverified_landlord).get(url)
    assert own.status_code == 200 and own["Cache-Control"] == "private, no-store"
    assert authed(admin_user).get(url).status_code == 200
