import json

import pytest
from django.contrib.gis.geos import Point

from apps.geo.models import Ward, locate
from apps.properties.models import Property, SavedSearch, Unit

from .conftest import authed

pytestmark = pytest.mark.django_db

PARKLANDS = (-1.265, 36.82)
KILELESHWA = (-1.265, 36.78)
NYALI = (-4.035, 39.72)


def test_property_gets_ward_constituency_county_from_pin(make_property, landlord):
    p = make_property(landlord, *PARKLANDS)
    assert (p.ward.name, p.constituency.name, p.county.name) == ("Parklands", "Westlands", "Nairobi")
    p.location = Point(NYALI[1], NYALI[0], srid=4326)
    p.save()
    assert (p.ward.name, p.county.name) == ("Nyali", "Mombasa")  # re-derived when the pin moves


def test_pin_outside_any_ward_is_saved_without_area(make_property, landlord):
    p = make_property(landlord, 0.5, 35.0)
    assert p.ward is None and p.county is None


def test_locate_returns_none_outside(geo):
    assert locate(Point(30.0, 0.0, srid=4326)) is None


def test_public_visibility_rules(make_property, make_unit, landlord, unverified_landlord):
    ok = make_unit(make_property(landlord, *PARKLANDS), "A1")
    make_unit(make_property(landlord, *PARKLANDS, name="Occupied"), "B1", status="occupied")
    make_unit(make_property(landlord, *PARKLANDS, name="Inactive"), "C1", is_active=False)
    make_unit(make_property(unverified_landlord, *PARKLANDS, name="Unverified"), "D1")
    ids = {u.id for u in Unit.objects.public()}
    assert ids == {ok.id}


def test_nearby_sorted_by_distance_and_respects_radius(client, make_property, make_unit, landlord):
    near = make_unit(make_property(landlord, -1.265, 36.820, name="Near"), "1")
    mid = make_unit(make_property(landlord, -1.265, 36.835, name="Mid"), "1")      # ~1.7 km east
    far = make_unit(make_property(landlord, -1.265, 36.780, name="Far"), "1")      # ~4.4 km west
    make_unit(make_property(landlord, *NYALI, name="Mombasa"), "1")
    r = client.get("/api/v1/units/nearby/", {"lat": -1.265, "lng": 36.820, "radius_km": 3})
    assert r.status_code == 200
    assert [u["id"] for u in r.data["results"]] == [near.id, mid.id]
    assert r.data["results"][0]["distance_km"] == 0.0 and 1.5 < r.data["results"][1]["distance_km"] < 1.9
    wide = client.get("/api/v1/units/nearby/", {"lat": -1.265, "lng": 36.820, "radius_km": 6})
    assert [u["id"] for u in wide.data["results"]] == [near.id, mid.id, far.id]


def test_nearby_applies_filters(client, make_property, make_unit, landlord):
    prop = make_property(landlord, *PARKLANDS)
    cheap = make_unit(prop, "1", rent=8000, unit_type="bedsitter", bedrooms=0)
    make_unit(prop, "2", rent=30000, unit_type="2br", bedrooms=2)
    r = client.get("/api/v1/units/nearby/", {"lat": PARKLANDS[0], "lng": PARKLANDS[1], "max_rent": 10000})
    assert [u["id"] for u in r.data["results"]] == [cheap.id]
    r = client.get("/api/v1/units/nearby/", {"lat": PARKLANDS[0], "lng": PARKLANDS[1], "unit_type": "2br,3br"})
    assert len(r.data["results"]) == 1 and r.data["results"][0]["unit_type"] == "2br"


@pytest.mark.parametrize("params", [{}, {"lat": "x", "lng": 36.8}, {"lat": 36.8, "lng": -1.2},  # swapped
                                    {"lat": -1.2, "lng": 36.8, "radius_km": 500}])
def test_nearby_validation(client, params):
    assert client.get("/api/v1/units/nearby/", params).status_code == 400


def test_in_area_by_ward_constituency_county(client, geo, make_property, make_unit, landlord):
    a = make_unit(make_property(landlord, *PARKLANDS), "1")
    b = make_unit(make_property(landlord, *KILELESHWA, name="K"), "1")
    c = make_unit(make_property(landlord, *NYALI, name="N"), "1")
    ids = lambda r: {u["id"] for u in r.data["results"]}  # noqa: E731
    w = geo["wards"]
    assert ids(client.get("/api/v1/units/in-area/", {"ward": w["parklands"].id})) == {a.id}
    assert ids(client.get("/api/v1/units/in-area/", {"constituency": geo["westlands"].id})) == {a.id, b.id}
    assert ids(client.get("/api/v1/units/in-area/", {"county": geo["mombasa"].id})) == {c.id}
    assert client.get("/api/v1/units/in-area/").status_code == 400


def test_in_area_polygon_and_bbox(client, make_property, make_unit, landlord):
    inside = make_unit(make_property(landlord, *PARKLANDS), "1")
    make_unit(make_property(landlord, *KILELESHWA, name="K"), "1")
    poly = {"type": "Polygon", "coordinates": [[[36.81, -1.27], [36.83, -1.27], [36.83, -1.26], [36.81, -1.26], [36.81, -1.27]]]}
    r = client.get("/api/v1/units/in-area/", {"polygon": json.dumps(poly)})
    assert [u["id"] for u in r.data["results"]] == [inside.id]
    r = client.get("/api/v1/units/in-area/", {"bbox": "36.81,-1.27,36.83,-1.26"})
    assert [u["id"] for u in r.data["results"]] == [inside.id]
    assert client.get("/api/v1/units/in-area/", {"bbox": "30,-5,40,5"}).status_code == 400  # too large
    assert client.get("/api/v1/units/in-area/", {"polygon": "garbage"}).status_code == 400


def test_counts_endpoint_is_light_and_correct(client, geo, make_property, make_unit, landlord, unverified_landlord):
    make_unit(make_property(landlord, *PARKLANDS), "1")
    make_unit(make_property(landlord, *PARKLANDS, name="P2"), "1")
    make_unit(make_property(landlord, *KILELESHWA, name="K"), "1")
    make_unit(make_property(unverified_landlord, *NYALI, name="Hidden"), "1")  # not public -> not counted
    counties = {c["name"]: c for c in client.get("/api/v1/geo/counts/", {"level": "county"}).data}
    assert counties["Nairobi"]["available_units"] == 3 and counties["Mombasa"]["available_units"] == 0
    wards = {w["name"]: w["available_units"] for w in client.get(
        "/api/v1/geo/counts/", {"level": "ward", "constituency": geo["westlands"].id}).data}
    assert wards == {"Parklands": 2, "Kileleshwa": 1}
    assert "geometry" not in client.get("/api/v1/geo/counts/?level=county").data[0]
    assert client.get("/api/v1/geo/counts/", {"level": "bogus"}).status_code == 400


def test_markers_group_by_property(client, make_property, make_unit, landlord):
    p = make_property(landlord, *PARKLANDS)
    make_unit(p, "1", rent=20000)
    make_unit(p, "2", rent=12000)
    make_unit(p, "3", rent=9000, status="occupied")
    r = client.get("/api/v1/units/markers/", {"bbox": "36.79,-1.29,36.85,-1.24"})
    assert r.status_code == 200 and r.data["truncated"] is False
    m = r.data["markers"]
    assert len(m) == 1 and m[0]["available_units"] == 2 and m[0]["min_rent"] == "12000.00"


def test_geo_lists_and_geometry_on_demand(client, geo):
    assert [c["name"] for c in client.get("/api/v1/geo/counties/").data] == ["Mombasa", "Nairobi"]
    wid = geo["wards"]["parklands"].id
    plain = client.get(f"/api/v1/geo/wards/{wid}/").data
    assert "geometry" not in plain
    full = client.get(f"/api/v1/geo/wards/{wid}/", {"geometry": 1}).data
    assert full["geometry"]["type"] in ("MultiPolygon", "Polygon")
    assert [w["name"] for w in client.get("/api/v1/geo/wards/", {"q": "park"}).data] == ["Parklands"]


# --- saved searches ------------------------------------------------------------

def _create(c, **kw):
    return c.post("/api/v1/saved-searches/", kw, format="json")


def test_saved_search_requires_login(client):
    assert client.get("/api/v1/saved-searches/").status_code == 401


def test_channels_require_consent_and_consent_is_timestamped(tenant, geo):
    c = authed(tenant)
    bad = _create(c, name="x", kind="area", ward=geo["wards"]["parklands"].id, channels=["sms"])
    assert bad.status_code == 400 and "consent_given" in bad.data
    ok = _create(c, name="x", kind="area", ward=geo["wards"]["parklands"].id, channels=["sms", "telegram"], consent_given=True)
    assert ok.status_code == 201 and SavedSearch.objects.get(pk=ok.data["id"]).consent_at is not None
    off = c.patch(f"/api/v1/saved-searches/{ok.data['id']}/", {"consent_given": False, "channels": []}, format="json")
    assert off.status_code == 200 and off.data["consent_at"] is None


def test_email_channel_needs_email_on_account(landlord, geo):
    r = _create(authed(landlord), name="x", kind="area", county=geo["nairobi"].id, channels=["email"], consent_given=True)
    assert r.status_code == 400 and "channels" in r.data


def test_saved_search_validation(tenant, geo):
    c = authed(tenant)
    assert _create(c, name="r", kind="radius", radius_km=5).status_code == 400            # no centre
    assert _create(c, name="r", kind="radius", latitude=36.8, longitude=-1.2, radius_km=5).status_code == 400  # swapped
    assert _create(c, name="r", kind="radius", latitude=-1.26, longitude=36.82, radius_km=99).status_code == 400
    assert _create(c, name="a", kind="area").status_code == 400
    assert _create(c, name="p", kind="polygon").status_code == 400
    assert _create(c, name="x", kind="area", county=geo["nairobi"].id, channels=["pigeon"], consent_given=True).status_code == 400


def test_saved_searches_are_private(tenant, landlord, geo):
    sid = _create(authed(tenant), name="mine", kind="area", county=geo["nairobi"].id).data["id"]
    other = authed(landlord)
    assert other.get("/api/v1/saved-searches/").data["results"] == []
    assert other.get(f"/api/v1/saved-searches/{sid}/").status_code == 404
    assert other.delete(f"/api/v1/saved-searches/{sid}/").status_code == 404


def test_matching_unit_finds_radius_area_polygon_and_respects_filters_and_consent(
        tenant, make_property, make_unit, landlord, geo):
    c = authed(tenant)
    kw = dict(channels=["whatsapp"], consent_given=True)
    radius = _create(c, name="r", kind="radius", latitude=-1.265, longitude=36.82, radius_km=2, **kw).data["id"]
    area = _create(c, name="a", kind="area", ward=geo["wards"]["parklands"].id, max_rent=20000, **kw).data["id"]
    poly = {"type": "Polygon", "coordinates": [[[36.81, -1.27], [36.83, -1.27], [36.83, -1.26], [36.81, -1.26], [36.81, -1.27]]]}
    poly_id = _create(c, name="p", kind="polygon", polygon_geojson=poly, min_bedrooms=2, **kw).data["id"]
    no_consent = _create(c, name="n", kind="area", county=geo["nairobi"].id).data["id"]
    elsewhere = _create(c, name="e", kind="area", county=geo["mombasa"].id, **kw).data["id"]

    unit = make_unit(make_property(landlord, *PARKLANDS), "1", rent=15000, bedrooms=1)
    got = set(SavedSearch.matching_unit(unit).values_list("id", flat=True))
    assert got == {radius, area}  # polygon needs 2+ bedrooms; no-consent and Mombasa never match
    unit.bedrooms, unit.rent_amount = 2, 25000
    got = set(SavedSearch.matching_unit(unit).values_list("id", flat=True))
    assert got == {radius, poly_id}  # now over the area search's max rent
    assert no_consent not in got and elsewhere not in got
