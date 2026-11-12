from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounts.models import Role
from apps.services.models import ProviderProfile, ServiceCategory
from tests.conftest import authed, make_user

PDF = b"%PDF-1.4\n% t\n"


@pytest.fixture
def mover(db):
    return make_user("0722000001", Role.PROVIDER, full_name="Sam Mover")


@pytest.fixture
def cleaner(db):
    return make_user("0722000002", Role.PROVIDER, full_name="Clara Cleaner")


def profile_body(**over):
    return {"kind": "company", "business_name": "Swift Movers Ltd", "kra_pin": "a123456789z", "registration_number": "CPR/2020/1234", "phone": "0722000001",
            "categories": ["movers"], "price_from": "6500", **over}


def doc(profile_id, user, doc_type, name="cert.pdf"):
    f = SimpleUploadedFile(name, PDF, content_type="application/pdf")
    return authed(user).post(f"/api/v1/providers/{profile_id}/documents/", {"doc_type": doc_type, "file": f}, format="multipart")


def approved(user, admin_user, **over):
    pid = authed(user).post("/api/v1/providers/", profile_body(**over), format="json").data["id"]
    doc(pid, user, "kra_pin"); doc(pid, user, "registration")
    assert authed(admin_user).post(f"/api/v1/providers/{pid}/approve/").status_code == 200
    return pid


def test_categories_are_seeded_and_public(client):
    r = client.get("/api/v1/service-categories/")
    slugs = [c["slug"] for c in r.data]
    assert {"movers", "cleaning", "laundry", "plumbing", "electrical", "painting", "gas", "water"} <= set(slugs)
    assert all(c["name_sw"] for c in r.data)


def test_provider_signup_role_and_profile_validation(client, mover, tenant):
    r = client.post("/api/v1/auth/signup/", {"email": "p@example.com", "password": "Str0ng-pass-2026!", "phone": "0755111222", "full_name": "P", "role": "provider", "contact_consent": True}, format="json")
    assert r.status_code == 201
    assert authed(tenant).post("/api/v1/providers/", profile_body(), format="json").status_code == 403
    assert authed(mover).post("/api/v1/providers/", profile_body(kra_pin="12345"), format="json").status_code == 400
    ok = authed(mover).post("/api/v1/providers/", profile_body(), format="json")
    assert ok.status_code == 201 and ok.data["status"] == "pending" and ok.data["kra_pin"] == "A123456789Z"
    assert authed(mover).post("/api/v1/providers/", profile_body(), format="json").status_code == 400  # one per user


def test_pending_providers_are_hidden_and_private_details_stay_private(client, mover, admin_user, tenant):
    pid = authed(mover).post("/api/v1/providers/", profile_body(), format="json").data["id"]
    assert client.get("/api/v1/providers/").data["count"] == 0
    assert client.get(f"/api/v1/providers/{pid}/").status_code == 404
    assert authed(tenant).get(f"/api/v1/providers/{pid}/").status_code == 404
    assert authed(mover).get(f"/api/v1/providers/{pid}/").status_code == 200
    doc(pid, mover, "kra_pin"); doc(pid, mover, "registration")
    authed(admin_user).post(f"/api/v1/providers/{pid}/approve/")
    pub = client.get(f"/api/v1/providers/{pid}/").data
    assert pub["business_name"] == "Swift Movers Ltd" and "kra_pin" not in pub and "documents" in pub and pub["documents"] == []
    assert "kra_pin" in authed(mover).get(f"/api/v1/providers/{pid}/").data


def test_approval_needs_both_documents_and_staff(mover, tenant, admin_user):
    pid = authed(mover).post("/api/v1/providers/", profile_body(), format="json").data["id"]
    doc(pid, mover, "kra_pin")
    assert authed(admin_user).post(f"/api/v1/providers/{pid}/approve/").status_code == 400
    assert authed(mover).post(f"/api/v1/providers/{pid}/approve/").status_code == 403
    doc(pid, mover, "registration")
    assert authed(admin_user).post(f"/api/v1/providers/{pid}/approve/").data["status"] == "approved"
    assert authed(admin_user).post(f"/api/v1/providers/{pid}/reject/", {}, format="json").status_code == 400
    r = authed(admin_user).post(f"/api/v1/providers/{pid}/reject/", {"reason": "PIN does not match name"}, format="json")
    assert r.data["status"] == "rejected" and authed(mover).get(f"/api/v1/providers/{pid}/").data["rejection_reason"]


def test_changing_legal_details_sends_an_approved_profile_back_for_review(mover, admin_user):
    pid = approved(mover, admin_user)
    authed(mover).patch(f"/api/v1/providers/{pid}/", {"bio": "We move homes in Nairobi."}, format="json")
    assert ProviderProfile.objects.get(pk=pid).status == "approved"
    authed(mover).patch(f"/api/v1/providers/{pid}/", {"kra_pin": "A999999999Z"}, format="json")
    assert ProviderProfile.objects.get(pk=pid).status == "pending"


def test_documents_only_for_owner_and_staff(mover, cleaner, tenant, admin_user):
    pid = authed(mover).post("/api/v1/providers/", profile_body(), format="json").data["id"]
    assert doc(pid, cleaner, "kra_pin").status_code in (403, 404)
    assert doc(pid, mover, "kra_pin", name="x.exe").status_code == 400
    did = doc(pid, mover, "kra_pin").data["id"]
    assert authed(mover).get(f"/api/v1/provider-documents/{did}/file/").status_code == 200
    assert authed(admin_user).get(f"/api/v1/provider-documents/{did}/file/").status_code == 200
    assert authed(tenant).get(f"/api/v1/provider-documents/{did}/file/").status_code == 404


def test_directory_filters(client, mover, cleaner, admin_user):
    approved(mover, admin_user)
    approved(cleaner, admin_user, business_name="Sparkle Cleaners", kra_pin="A111111111B", categories=["cleaning"], phone="0722000002")
    assert client.get("/api/v1/providers/?category=movers").data["count"] == 1
    assert client.get("/api/v1/providers/?category=cleaning").data["results"][0]["business_name"] == "Sparkle Cleaners"
    assert client.get("/api/v1/providers/").data["count"] == 2


def test_quote_flow_request_quote_accept_book_complete(tenant, mover, cleaner, admin_user, settings):
    settings.SERVICE_COMMISSION_PERCENT = 10
    approved(mover, admin_user)
    approved(cleaner, admin_user, business_name="Sparkle Cleaners", kra_pin="A111111111B", categories=["cleaning"], phone="0722000002")
    body = {"category": "movers", "from_place": "Roysambu", "to_place": "Kitengela", "description": "2 bedroom house", "preferred_date": (date.today() + timedelta(days=7)).isoformat()}
    rid = authed(tenant).post("/api/v1/quote-requests/", body, format="json").data["id"]
    assert authed(tenant).post("/api/v1/quote-requests/", {**body, "from_place": ""}, format="json").status_code == 400  # movers need both places
    inbox = authed(mover).get("/api/v1/quote-requests/?inbox=1").data["results"]
    assert [r["id"] for r in inbox] == [rid]
    assert authed(cleaner).get("/api/v1/quote-requests/?inbox=1").data["results"] == []
    assert authed(cleaner).post(f"/api/v1/quote-requests/{rid}/quotes/", {"price": "5000"}, format="json").status_code == 404  # not their request, so not even visible
    q = authed(mover).post(f"/api/v1/quote-requests/{rid}/quotes/", {"price": "8000", "message": "Truck and 3 men"}, format="json")
    assert q.status_code == 201 and q.data["provider_phone"] == "+254722000001"
    assert authed(mover).post(f"/api/v1/quote-requests/{rid}/quotes/", {"price": "7000"}, format="json").status_code == 400  # one per provider
    seen = authed(tenant).get(f"/api/v1/quote-requests/{rid}/quotes/").data
    assert len(seen) == 1 and seen[0]["price"] == "8000.00"
    stranger = make_user("0744000002", Role.TENANT)
    assert authed(stranger).post(f"/api/v1/quotes/{q.data['id']}/accept/").status_code == 404
    b = authed(tenant).post(f"/api/v1/quotes/{q.data['id']}/accept/")
    assert b.status_code == 201 and b.data["price"] == "8000.00" and b.data["status"] == "confirmed"
    from apps.services.models import Booking
    assert Booking.objects.get().commission_amount == Decimal("800.00")
    assert authed(tenant).post(f"/api/v1/quotes/{q.data['id']}/accept/").status_code == 400
    bid = b.data["id"]
    assert authed(tenant).patch(f"/api/v1/bookings/{bid}/", {"status": "completed"}, format="json").status_code == 403
    assert authed(mover).patch(f"/api/v1/bookings/{bid}/", {"status": "completed"}, format="json").status_code == 200
    assert authed(mover).get("/api/v1/bookings/").data["count"] == 1
    assert authed(stranger).get("/api/v1/bookings/").data["count"] == 0


def test_direct_request_goes_only_to_that_provider(tenant, mover, admin_user):
    other = make_user("0722000009", Role.PROVIDER)
    pid = approved(mover, admin_user)
    approved(other, admin_user, business_name="Other Movers", kra_pin="A222222222C", phone="0722000009")
    body = {"category": "movers", "provider": pid, "from_place": "A", "to_place": "B", "description": "Small move"}
    rid = authed(tenant).post("/api/v1/quote-requests/", body, format="json").data["id"]
    assert [r["id"] for r in authed(mover).get("/api/v1/quote-requests/?inbox=1").data["results"]] == [rid]
    assert authed(other).get("/api/v1/quote-requests/?inbox=1").data["results"] == []
    assert authed(other).post(f"/api/v1/quote-requests/{rid}/quotes/", {"price": "1000"}, format="json").status_code == 404


def test_request_limits_and_closing(tenant, mover, admin_user):
    approved(mover, admin_user)
    body = {"category": "cleaning", "description": "Deep clean"}
    for _ in range(10):
        assert authed(tenant).post("/api/v1/quote-requests/", body, format="json").status_code == 201
    assert authed(tenant).post("/api/v1/quote-requests/", body, format="json").status_code == 400
    rid = authed(tenant).get("/api/v1/quote-requests/").data["results"][0]["id"]
    assert authed(tenant).post(f"/api/v1/quote-requests/{rid}/close/").data["is_open"] is False
    assert authed(tenant).post("/api/v1/quote-requests/", {**body, "preferred_date": "2020-01-01"}, format="json").status_code == 400
