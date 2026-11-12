from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.land.models import LandListing
from tests.conftest import authed, make_user
from apps.accounts.models import Role

PIN = {"latitude": -1.265, "longitude": 36.82}  # inside the synthetic Parklands ward
BASE = {"title": "Quarter acre, Kitengela", "price": "1500000", "title_type": "freehold",
        "size_value": "0.25", "size_unit": "acre", **PIN}
PDF = b"%PDF-1.4\n% test file\n"


def _post(user, **over):
    return authed(user).post("/api/v1/land/", {**BASE, **over}, format="json")


def _doc(listing_id, user, name="deed.pdf", data=PDF, doc_type="title_deed"):
    f = SimpleUploadedFile(name, data, content_type="application/pdf")
    return authed(user).post(f"/api/v1/land/{listing_id}/documents/", {"doc_type": doc_type, "file": f}, format="multipart")


def test_any_signed_in_user_can_list_land_and_ward_is_derived(tenant, geo):
    r = _post(tenant)
    assert r.status_code == 201, r.data
    assert r.data["ward_name"] == "Parklands" and r.data["county_name"] == "Nairobi"
    assert r.data["is_verified"] is False and r.data["status"] == "published"
    assert Decimal(r.data["size_acres"]) == Decimal("0.2500")


def test_anonymous_cannot_create(client):
    assert client.post("/api/v1/land/", BASE, format="json").status_code in (401, 403)


def test_sizes_acres_hectares_and_plots(tenant, geo):
    ha = _post(tenant, size_value="2", size_unit="hectare")
    assert Decimal(ha.data["size_acres"]) == Decimal("4.9421")
    plots = _post(tenant, size_value=None, size_unit="", plot_width_ft=50, plot_length_ft=100, plot_count=4)
    assert plots.status_code == 201, plots.data
    assert Decimal(plots.data["size_acres"]) == Decimal("0.4591")  # 20,000 sq ft


def test_size_is_required_and_pin_must_be_in_kenya(tenant, geo):
    no_size = _post(tenant, size_value=None, size_unit="")
    assert no_size.status_code == 400
    assert _post(tenant, latitude=51.5, longitude=-0.12).status_code == 400
    assert _post(tenant, price="0").status_code == 400
    assert _post(tenant, title_type="made_up").status_code == 400


def test_features_use_the_fixed_list(tenant, geo):
    ok = _post(tenant, features=["fenced", "water_available", "fenced"])
    assert ok.data["features"] == ["fenced", "water_available"]
    assert _post(tenant, features=["helipad"]).status_code == 400


def test_public_list_shows_unverified_but_verified_first_and_filters(tenant, admin_user, landlord, geo):
    a = _post(tenant, title="Plain plot", price="500000").data["id"]
    b = _post(landlord, title="Verified plot", price="900000", size_value="2").data["id"]
    _doc(b, landlord)
    assert authed(admin_user).post(f"/api/v1/land/{b}/verify/").status_code == 200
    r = APIClient_get("/api/v1/land/")
    assert [x["id"] for x in r.data["results"]] == [b, a]
    assert [x["is_verified"] for x in r.data["results"]] == [True, False]
    assert [x["id"] for x in APIClient_get("/api/v1/land/?verified=1").data["results"]] == [b]
    assert [x["id"] for x in APIClient_get("/api/v1/land/?max_price=600000").data["results"]] == [a]
    assert [x["id"] for x in APIClient_get("/api/v1/land/?min_acres=1").data["results"]] == [b]
    assert APIClient_get("/api/v1/land/?max_price=abc").status_code == 400


def APIClient_get(url):
    from rest_framework.test import APIClient

    return APIClient().get(url)


def test_nearby_search(tenant, geo):
    near = _post(tenant, title="Near").data["id"]
    _post(tenant, title="Coast", latitude=-4.03, longitude=39.72)
    r = APIClient_get("/api/v1/land/?lat=-1.26&lng=36.82&radius_km=5")
    assert [x["id"] for x in r.data["results"]] == [near]


def test_seller_phone_only_for_signed_in_users(tenant, landlord, geo):
    lid = _post(landlord).data["id"]
    assert APIClient_get(f"/api/v1/land/{lid}/").data["seller_phone"] is None
    assert authed(tenant).get(f"/api/v1/land/{lid}/").data["seller_phone"] == landlord.phone


def test_only_the_seller_can_edit_or_delete(tenant, landlord, geo):
    lid = _post(landlord).data["id"]
    assert authed(tenant).patch(f"/api/v1/land/{lid}/", {"price": "1"}, format="json").status_code in (403, 404)
    assert authed(tenant).delete(f"/api/v1/land/{lid}/").status_code in (403, 404)
    assert authed(landlord).patch(f"/api/v1/land/{lid}/", {"price": "1700000"}, format="json").status_code == 200
    assert authed(landlord).delete(f"/api/v1/land/{lid}/").status_code == 204


def test_sold_and_removed_listings_leave_the_public_list(landlord, geo):
    lid = _post(landlord).data["id"]
    authed(landlord).patch(f"/api/v1/land/{lid}/", {"status": "sold"}, format="json")
    assert APIClient_get("/api/v1/land/").data["count"] == 0
    assert authed(landlord).get("/api/v1/land/?mine=1").data["count"] == 1


def test_documents_are_private_and_validated(tenant, landlord, admin_user, geo):
    lid = _post(landlord).data["id"]
    assert _doc(lid, landlord).status_code == 201
    assert _doc(lid, landlord, name="deed.exe").status_code == 400
    assert _doc(lid, landlord, name="deed.pdf", data=b"not a pdf at all").status_code == 400
    assert authed(tenant).get(f"/api/v1/land/{lid}/documents/").status_code in (403, 404)
    assert authed(landlord).get(f"/api/v1/land/{lid}/documents/").status_code == 200
    doc_id = authed(landlord).get(f"/api/v1/land/{lid}/documents/").data[0]["id"]
    assert authed(landlord).get(f"/api/v1/land-documents/{doc_id}/file/").status_code == 200
    assert authed(admin_user).get(f"/api/v1/land-documents/{doc_id}/file/").status_code == 200
    assert authed(tenant).get(f"/api/v1/land-documents/{doc_id}/file/").status_code == 404
    assert APIClient_get(f"/api/v1/land-documents/{doc_id}/file/").status_code in (401, 403)


def test_verification_is_staff_only_needs_documents_and_resets_on_key_edits(landlord, tenant, admin_user, geo):
    lid = _post(landlord).data["id"]
    assert authed(landlord).post(f"/api/v1/land/{lid}/verify/").status_code == 403
    assert authed(admin_user).post(f"/api/v1/land/{lid}/verify/").status_code == 400  # no documents yet
    _doc(lid, landlord)
    pend = authed(admin_user).get("/api/v1/land/pending-verification/")
    assert [x["id"] for x in pend.data["results"]] == [lid]
    assert authed(tenant).get("/api/v1/land/pending-verification/").status_code == 403
    assert authed(admin_user).post(f"/api/v1/land/{lid}/verify/").data["is_verified"] is True
    # cosmetic edit keeps the badge...
    assert authed(landlord).patch(f"/api/v1/land/{lid}/", {"description": "Nice view"}, format="json").data["is_verified"] is True
    # ...changing the size (or location, title type) sends it back for checking
    assert authed(landlord).patch(f"/api/v1/land/{lid}/", {"size_value": "5"}, format="json").data["is_verified"] is False


def test_listing_cap_per_seller(tenant, geo, settings):
    settings.LAND_MAX_ACTIVE_PER_SELLER = 2
    assert _post(tenant).status_code == 201 and _post(tenant).status_code == 201
    assert _post(tenant).status_code == 400


def test_amenity_catalog_and_unit_amenities_use_it(landlord, geo, make_property):
    from rest_framework.test import APIClient

    cat = APIClient().get("/api/v1/amenities/")
    keys = [a["key"] for a in cat.data["rental"]]
    assert {"parking", "swimming_pool", "gated_community"} <= set(keys)
    prop = make_property(landlord)
    unit = {"property": prop.id, "unit_type": "1br", "bedrooms": 1, "rent_amount": "12000", "label": "A1"}
    ok = authed(landlord).post("/api/v1/units/", {**unit, "amenities": ["parking", "swimming_pool", "parking"]}, format="json")
    assert ok.status_code == 201, ok.data
    assert ok.data["amenities"] == ["parking", "swimming_pool"]
    bad = authed(landlord).post("/api/v1/units/", {**unit, "label": "A2", "amenities": ["jacuzzi"]}, format="json")
    assert bad.status_code == 400
