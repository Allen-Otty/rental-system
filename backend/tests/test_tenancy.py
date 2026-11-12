from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts import sms
from apps.accounts.models import Role
from apps.properties.models import UnitStatus
from apps.tenancy.models import Lease, RentInvoice
from apps.tenancy.services import generate_invoices
from tests.conftest import authed, make_user


@pytest.fixture
def setup(landlord, tenant, make_property, make_unit):
    prop = make_property(landlord)
    unit = make_unit(prop, label="4C", rent=24000)
    return prop, unit


def lease_body(unit, **over):
    today = date.today()
    return {"unit": unit.id, "tenant_name": "Grace Wanjiru", "tenant_phone": "0733000001", "start_date": (today - timedelta(days=90)).isoformat(),
            "end_date": (today + timedelta(days=270)).isoformat(), "rent_amount": "24000", "rent_due_day": 1, "deposit_amount": "24000", **over}


def make_lease(landlord, unit, **over):
    r = authed(landlord).post("/api/v1/leases/", lease_body(unit, **over), format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


def test_creating_a_lease_marks_unit_occupied_and_links_tenant_account(landlord, tenant, setup):
    _, unit = setup
    lid = make_lease(landlord, unit)
    unit.refresh_from_db()
    assert unit.status == UnitStatus.OCCUPIED
    assert Lease.objects.get(pk=lid).tenant_id == tenant.id  # tenant fixture phone is 0733000001


def test_lease_rules(landlord, landlord2, tenant, setup):
    _, unit = setup
    make_lease(landlord, unit)
    assert authed(landlord).post("/api/v1/leases/", lease_body(unit, tenant_phone="0700111222"), format="json").status_code == 400  # already leased
    assert authed(landlord2).post("/api/v1/leases/", lease_body(unit), format="json").status_code == 400  # not their unit
    assert authed(tenant).post("/api/v1/leases/", lease_body(unit), format="json").status_code == 403
    assert authed(landlord).post("/api/v1/leases/", lease_body(unit, end_date="2020-01-01"), format="json").status_code == 400


def test_ending_a_lease_frees_the_unit(landlord, setup):
    _, unit = setup
    lid = make_lease(landlord, unit)
    assert authed(landlord).post(f"/api/v1/leases/{lid}/end/").data["status"] == "ended"
    unit.refresh_from_db()
    assert unit.status == UnitStatus.AVAILABLE
    make_lease(landlord, unit, tenant_phone="0700111222")  # can be leased again


def test_id_details_follow_the_landlords_settings(landlord, setup):
    _, unit = setup
    assert authed(landlord).post("/api/v1/leases/", lease_body(unit, id_number="12345678"), format="json").status_code == 400
    assert authed(landlord).patch("/api/v1/me/landlord-settings/", {"collect_tenant_id_number": True}, format="json").status_code == 200
    r = authed(landlord).post("/api/v1/leases/", lease_body(unit, id_number="12345678"), format="json")
    assert r.status_code == 201 and r.data["id_number"] == "12345678"


def test_tenants_only_see_their_own_lease(landlord, landlord2, tenant, setup, make_property, make_unit):
    _, unit = setup
    mine = make_lease(landlord, unit)
    other_unit = make_unit(make_property(landlord2), label="Z9")
    authed(landlord2).post("/api/v1/leases/", lease_body(other_unit, tenant_phone="0799888777"), format="json")
    ids = [x["id"] for x in authed(tenant).get("/api/v1/leases/").data["results"]]
    assert ids == [mine]
    assert authed(landlord2).get(f"/api/v1/leases/{mine}/").status_code == 404


def test_invoice_generation_is_idempotent_and_respects_lease_dates(landlord, setup):
    _, unit = setup
    make_lease(landlord, unit)
    month = date.today().strftime("%Y-%m")
    assert authed(landlord).post("/api/v1/invoices/generate/", {"month": month}, format="json").data["created"] == 1
    assert authed(landlord).post("/api/v1/invoices/generate/", {"month": month}, format="json").data["created"] == 0
    far = (date.today() + timedelta(days=700)).strftime("%Y-%m")
    assert authed(landlord).post("/api/v1/invoices/generate/", {"month": far}, format="json").data["created"] == 0
    assert authed(landlord).post("/api/v1/invoices/generate/", {"month": "nonsense"}, format="json").status_code == 400
    inv = RentInvoice.objects.get()
    assert inv.amount == 24000 and inv.period == date.today().replace(day=1)


def _overdue_invoice(landlord, unit):
    lid = make_lease(landlord, unit)
    lease = Lease.objects.get(pk=lid)
    period = (date.today().replace(day=1) - timedelta(days=40)).replace(day=1)
    return RentInvoice.objects.create(lease=lease, period=period, amount=24000, due_date=period.replace(day=5))


def test_recording_payments_updates_status_and_blocks_mistakes(landlord, tenant, setup):
    _, unit = setup
    inv = _overdue_invoice(landlord, unit)
    url = f"/api/v1/invoices/{inv.id}/payments/"
    assert authed(landlord).get(f"/api/v1/invoices/{inv.id}/").data["status"] == "overdue"
    pay = {"amount": "10000", "method": "mpesa", "reference": "qgh7xyz123", "paid_on": date.today().isoformat()}
    r = authed(landlord).post(url, pay, format="json")
    assert r.status_code == 201 and r.data["paid_amount"] == "10000.00" and r.data["balance"] == "14000.00" and r.data["status"] == "overdue"
    assert authed(landlord).post(url, {**pay, "amount": "5000"}, format="json").status_code == 400            # same M-Pesa code twice
    assert authed(landlord).post(url, {**pay, "amount": "99999", "reference": "NEW1"}, format="json").status_code == 400  # more than owed
    assert authed(landlord).post(url, {**pay, "reference": ""}, format="json").status_code == 400            # M-Pesa needs a code
    assert authed(landlord).post(url, {**pay, "reference": "N2", "paid_on": (date.today() + timedelta(days=2)).isoformat()}, format="json").status_code == 400
    assert authed(tenant).post(url, {**pay, "reference": "N3"}, format="json").status_code == 403
    done = authed(landlord).post(url, {**pay, "amount": "14000", "reference": "QGH8"}, format="json")
    assert done.data["status"] == "paid"


def test_tenant_sees_own_invoices_but_not_others(landlord, landlord2, tenant, setup, make_property, make_unit):
    _, unit = setup
    inv = _overdue_invoice(landlord, unit)
    assert [i["id"] for i in authed(tenant).get("/api/v1/invoices/").data["results"]] == [inv.id]
    assert authed(landlord2).get(f"/api/v1/invoices/{inv.id}/").status_code == 404


def test_overdue_reminders_are_sent_once_a_day_in_the_tenants_language(landlord, tenant, setup):
    _, unit = setup
    tenant.language = "sw"; tenant.save()
    _overdue_invoice(landlord, unit)
    sms.outbox.clear()
    r = authed(landlord).post("/api/v1/invoices/remind-overdue/")
    assert r.data == {"sent": 1, "skipped": 0}
    assert sms.outbox[-1]["to"] == "+254733000001" and "kodi" in sms.outbox[-1]["message"] and "24,000" in sms.outbox[-1]["message"]
    again = authed(landlord).post("/api/v1/invoices/remind-overdue/")
    assert again.data == {"sent": 0, "skipped": 1}
    assert authed(tenant).post("/api/v1/invoices/remind-overdue/").status_code == 403


def test_dashboard_numbers(landlord, setup, make_unit):
    prop, unit = setup
    make_unit(prop, label="5A")
    inv = _overdue_invoice(landlord, unit)
    authed(landlord).post("/api/v1/invoices/generate/", {}, format="json")
    cur = RentInvoice.objects.get(period=date.today().replace(day=1))
    authed(landlord).post(f"/api/v1/invoices/{cur.id}/payments/", {"amount": "24000", "method": "cash", "paid_on": date.today().isoformat()}, format="json")
    d = authed(landlord).get("/api/v1/dashboard/landlord/").data
    assert d["rent_due"] == "24000.00" and d["rent_collected"] == "24000.00"
    assert d["occupancy"] == {"occupied": 1, "total": 2, "percent": 50}
    assert d["arrears"] == {"amount": "24000.00", "tenants": 1}
    assert d["attention"][0]["type"] == "rent_overdue"


def test_dashboard_is_manager_only_and_scoped(landlord, landlord2, tenant, setup):
    _, unit = setup
    _overdue_invoice(landlord, unit)
    assert authed(tenant).get("/api/v1/dashboard/landlord/").status_code == 403
    assert authed(landlord2).get("/api/v1/dashboard/landlord/").data["arrears"]["tenants"] == 0


def test_repairs_tenant_reports_landlord_assigns_own_vendor(landlord, landlord2, tenant, setup):
    _, unit = setup
    make_lease(landlord, unit)
    sneaky = authed(landlord).post("/api/v1/vendors/", {"name": "Alex Plumbing", "trade": "plumber", "phone": "0711222333"}, format="json").data["id"]
    r = authed(tenant).post("/api/v1/repairs/", {"unit": unit.id, "title": "Leaky faucet", "category": "plumbing", "priority": "high", "status": "done", "vendor": sneaky}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["status"] == "open" and r.data["vendor"] is None and r.data["updates"][0]["text"] == "Request created"
    rid = r.data["id"]
    mine = sneaky
    theirs = authed(landlord2).post("/api/v1/vendors/", {"name": "Other", "trade": "plumber", "phone": "0711222334"}, format="json").data["id"]
    assert authed(landlord).patch(f"/api/v1/repairs/{rid}/", {"vendor": theirs}, format="json").status_code == 400
    visit = (timezone.now() + timedelta(days=2)).isoformat()
    ok = authed(landlord).patch(f"/api/v1/repairs/{rid}/", {"vendor": mine, "visit_at": visit, "status": "scheduled"}, format="json")
    assert ok.status_code == 200 and ok.data["vendor_name"] == "Alex Plumbing"
    texts = [u["text"] for u in ok.data["updates"]]
    assert any("Vendor assigned" in t for t in texts) and any("Visit scheduled" in t for t in texts) and any("Scheduled" in t for t in texts)
    assert authed(tenant).patch(f"/api/v1/repairs/{rid}/", {"status": "closed"}, format="json").status_code == 403
    assert authed(landlord2).get(f"/api/v1/repairs/{rid}/").status_code == 404
    assert authed(landlord2).get("/api/v1/vendors/").data["count"] == 1


def test_tenant_cannot_report_for_a_unit_they_dont_rent(landlord, tenant, setup, make_unit):
    prop, unit = setup
    other = make_unit(prop, label="9Z")
    make_lease(landlord, unit)
    assert authed(tenant).post("/api/v1/repairs/", {"unit": other.id, "title": "x"}, format="json").status_code == 403


def test_viewings_book_confirm_and_privacy(landlord, tenant, landlord2, admin_user, setup):
    prop, unit = setup
    landlord.landlord_verified = True; landlord.save()
    when = (timezone.now() + timedelta(days=3)).isoformat()
    r = authed(tenant).post("/api/v1/viewings/", {"unit": unit.id, "preferred_at": when, "message": "After 5pm please"}, format="json")
    assert r.status_code == 201, r.data
    vid = r.data["id"]
    assert authed(tenant).post("/api/v1/viewings/", {"unit": unit.id, "preferred_at": when}, format="json").status_code == 400  # duplicate
    assert authed(tenant).post("/api/v1/viewings/", {"unit": unit.id, "preferred_at": "2020-01-01T10:00:00Z"}, format="json").status_code == 400
    assert authed(landlord2).get(f"/api/v1/viewings/{vid}/").status_code == 404
    seen = authed(landlord).get("/api/v1/viewings/").data["results"][0]
    assert seen["requester_phone"] == tenant.phone
    assert authed(tenant).patch(f"/api/v1/viewings/{vid}/", {"status": "confirmed"}, format="json").status_code == 403
    assert authed(landlord).patch(f"/api/v1/viewings/{vid}/", {"status": "confirmed"}, format="json").status_code == 200
    assert authed(landlord).patch(f"/api/v1/viewings/{vid}/", {"message": "hack"}, format="json").status_code == 400


def test_viewing_only_for_public_units(landlord, tenant, setup):
    _, unit = setup  # landlord fixture is verified in conftest? make sure unverified landlords can't be booked
    unit.property.landlord.landlord_verified = False; unit.property.landlord.save()
    when = (timezone.now() + timedelta(days=3)).isoformat()
    assert authed(tenant).post("/api/v1/viewings/", {"unit": unit.id, "preferred_at": when}, format="json").status_code == 400


def test_invoice_command(landlord, setup):
    _, unit = setup
    make_lease(landlord, unit)
    from django.core.management import call_command

    call_command("generate_invoices")
    call_command("generate_invoices")
    assert RentInvoice.objects.count() == 1
