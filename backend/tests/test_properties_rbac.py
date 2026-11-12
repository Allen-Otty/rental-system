import pytest

from apps.audit.models import AuditLog
from apps.properties.models import Property, PropertyAgent, Unit

from .conftest import authed

pytestmark = pytest.mark.django_db

PROP = {"name": "Green Court", "property_type": "building", "latitude": -1.265, "longitude": 36.82,
        "estate": "Parklands", "landmark": "Opposite the mosque"}
UNIT = {"label": "A1", "unit_type": "1br", "bedrooms": 1, "rent_amount": "15000.00"}


def test_landlord_creates_property_and_unit(landlord, geo):
    c = authed(landlord)
    r = c.post("/api/v1/properties/", PROP, format="json")
    assert r.status_code == 201
    assert (r.data["ward_name"], r.data["county_name"]) == ("Parklands", "Nairobi")
    assert r.data["landlord"] == landlord.id
    u = c.post("/api/v1/units/", {**UNIT, "property": r.data["id"]}, format="json")
    assert u.status_code == 201 and u.data["status"] == "available"


def test_property_rejects_coordinates_outside_kenya(landlord, geo):
    c = authed(landlord)
    assert c.post("/api/v1/properties/", {**PROP, "latitude": 36.8, "longitude": -1.2}, format="json").status_code == 400
    assert c.post("/api/v1/properties/", {**PROP, "latitude": 51.5, "longitude": -0.1}, format="json").status_code == 400


def test_tenant_and_anonymous_cannot_create(tenant, client, geo):
    assert authed(tenant).post("/api/v1/properties/", PROP, format="json").status_code == 403
    assert client.post("/api/v1/properties/", PROP, format="json").status_code == 401


def test_agent_cannot_create_property(agent, geo):
    assert authed(agent).post("/api/v1/properties/", PROP, format="json").status_code == 403


def test_landlords_are_isolated(landlord, landlord2, make_property, make_unit):
    p = make_property(landlord)
    u = make_unit(p)
    other = authed(landlord2)
    assert other.get("/api/v1/properties/").data["results"] == [] or all(
        x["id"] != p.id for x in other.get("/api/v1/properties/").data["results"])
    assert other.patch(f"/api/v1/properties/{p.id}/", {"name": "hijack"}, format="json").status_code == 404
    assert other.delete(f"/api/v1/properties/{p.id}/").status_code == 404
    assert other.patch(f"/api/v1/units/{u.id}/", {"rent_amount": "1.00"}, format="json").status_code == 404
    assert other.post("/api/v1/units/", {**UNIT, "label": "X", "property": p.id}, format="json").status_code == 400
    p.refresh_from_db()
    assert p.name == "Sunrise Apartments"


def test_public_can_read_public_units_but_not_edit(client, tenant, landlord, make_property, make_unit):
    u = make_unit(make_property(landlord))
    assert client.get(f"/api/v1/units/{u.id}/").status_code == 200
    assert client.patch(f"/api/v1/units/{u.id}/", {"rent_amount": "1"}, format="json").status_code == 401
    assert authed(tenant).patch(f"/api/v1/units/{u.id}/", {"rent_amount": "1"}, format="json").status_code == 403


def test_unpublished_units_are_hidden_from_public_but_visible_to_owner(
        client, landlord, unverified_landlord, make_property, make_unit):
    u = make_unit(make_property(unverified_landlord, name="Pending"), "1")
    assert client.get(f"/api/v1/units/{u.id}/").status_code == 404
    assert client.get("/api/v1/units/").data["results"] == []
    assert authed(unverified_landlord).get(f"/api/v1/units/{u.id}/").status_code == 200
    assert authed(landlord).get(f"/api/v1/units/{u.id}/").status_code == 404
    assert len(authed(unverified_landlord).get("/api/v1/units/", {"scope": "mine"}).data["results"]) == 1


def test_public_response_does_not_expose_landlord_contact(client, landlord, make_property, make_unit):
    u = make_unit(make_property(landlord))
    body = client.get(f"/api/v1/units/{u.id}/").content.decode()
    assert landlord.phone not in body and "landlord" not in body.lower().replace("landlord_verified", "")


def test_standalone_house_allows_one_unit_only(landlord, make_property, make_unit):
    house = make_property(landlord, property_type="house", name="Bungalow")
    c = authed(landlord)
    assert c.post("/api/v1/units/", {**UNIT, "property": house.id}, format="json").status_code == 201
    assert c.post("/api/v1/units/", {**UNIT, "label": "A2", "property": house.id}, format="json").status_code == 400


def test_manual_status_limited_and_changes_audited(landlord, make_property, make_unit):
    u = make_unit(make_property(landlord))
    c = authed(landlord)
    assert c.patch(f"/api/v1/units/{u.id}/", {"status": "reserved"}, format="json").status_code == 400
    assert c.patch(f"/api/v1/units/{u.id}/", {"status": "occupied"}, format="json").status_code == 200
    assert AuditLog.objects.filter(action="unit.status_changed", target_id=str(u.id)).exists()
    assert u.__class__.objects.public().count() == 0  # occupied -> off the public map


def test_unit_cannot_move_between_properties(landlord, make_property, make_unit):
    p1, p2 = make_property(landlord), make_property(landlord, name="Other")
    u = make_unit(p1)
    r = authed(landlord).patch(f"/api/v1/units/{u.id}/", {"property": p2.id}, format="json")
    assert r.status_code == 400


def test_duplicate_unit_label_rejected(landlord, make_property, make_unit):
    p = make_property(landlord)
    make_unit(p, "A1")
    r = authed(landlord).post("/api/v1/units/", {**UNIT, "property": p.id}, format="json")
    assert r.status_code == 400


# --- agents -------------------------------------------------------------------

def test_agent_invite_accept_flow_and_scope(landlord, agent, make_property, make_unit):
    mine, other = make_property(landlord), make_property(landlord, name="Not assigned")
    make_unit(mine), make_unit(other)
    ll = authed(landlord)
    inv = ll.post(f"/api/v1/properties/{mine.id}/agents/", {"phone": "0722 000 001"}, format="json")
    assert inv.status_code == 201 and inv.data["phone"] == agent.phone
    ag = authed(agent)
    assert ag.get("/api/v1/properties/").data["results"] == []  # nothing until accepted
    assert len(ag.get("/api/v1/agent-invites/mine/").data) == 1
    assert ag.post(f"/api/v1/agent-invites/{inv.data['token']}/accept/").status_code == 200
    listed = {p["id"] for p in ag.get("/api/v1/properties/").data["results"]}
    assert listed == {mine.id}  # agent sees ONLY the assigned property
    assert ag.patch(f"/api/v1/properties/{other.id}/", {"name": "x"}, format="json").status_code == 404
    unit = mine.units.first()
    assert ag.patch(f"/api/v1/units/{unit.id}/", {"rent_amount": "17000"}, format="json").status_code == 200
    assert ag.delete(f"/api/v1/properties/{mine.id}/").status_code == 403  # owner-only
    assert ag.post(f"/api/v1/properties/{mine.id}/agents/", {"phone": "0700"}, format="json").status_code == 403


def test_invite_cannot_be_used_by_wrong_user_or_twice(landlord, agent, tenant, make_property):
    from apps.accounts.models import Role
    from .conftest import make_user

    p = make_property(landlord)
    inv = authed(landlord).post(f"/api/v1/properties/{p.id}/agents/", {"phone": agent.phone}, format="json").data
    stranger = make_user("0744000009", Role.AGENT)
    assert authed(stranger).post(f"/api/v1/agent-invites/{inv['token']}/accept/").status_code == 404
    assert authed(tenant).post(f"/api/v1/agent-invites/{inv['token']}/accept/").status_code == 403
    assert authed(agent).post(f"/api/v1/agent-invites/{inv['token']}/accept/").status_code == 200
    assert authed(agent).post(f"/api/v1/agent-invites/{inv['token']}/accept/").status_code == 404
    assert PropertyAgent.objects.filter(property=p).count() == 1


def test_expired_invite_rejected(landlord, agent, make_property):
    from datetime import timedelta

    from django.utils import timezone

    p = make_property(landlord)
    inv = authed(landlord).post(f"/api/v1/properties/{p.id}/agents/", {"phone": agent.phone}, format="json").data
    p.invites.update(expires_at=timezone.now() - timedelta(minutes=1))
    assert authed(agent).post(f"/api/v1/agent-invites/{inv['token']}/accept/").status_code == 404


def test_owner_can_remove_agent(landlord, agent, make_property):
    p = make_property(landlord)
    PropertyAgent.objects.create(property=p, agent=agent)
    ll = authed(landlord)
    assert ll.delete(f"/api/v1/properties/{p.id}/agents/{agent.id}/").status_code == 204
    assert authed(agent).get("/api/v1/properties/").data["results"] == []
    assert ll.delete(f"/api/v1/properties/{p.id}/agents/{agent.id}/").status_code == 404


def test_admin_sees_everything(admin_user, landlord, landlord2, make_property):
    make_property(landlord), make_property(landlord2, name="B")
    assert authed(admin_user).get("/api/v1/properties/").data["count"] == 2


# --- media --------------------------------------------------------------------

MEDIA = {"public_id": "units/1/abc", "url": "https://res.cloudinary.com/demo/image/upload/abc.jpg",
         "width": 1200, "height": 800, "bytes": 150000, "is_cover": True}


def test_media_metadata_add_cover_remove_and_owner_only(landlord, landlord2, make_property, make_unit):
    u = make_unit(make_property(landlord))
    c = authed(landlord)
    m1 = c.post(f"/api/v1/units/{u.id}/media/", MEDIA, format="json")
    assert m1.status_code == 201
    m2 = c.post(f"/api/v1/units/{u.id}/media/", {**MEDIA, "public_id": "units/1/def"}, format="json")
    assert m2.status_code == 201
    assert list(u.media.filter(is_cover=True).values_list("public_id", flat=True)) == ["units/1/def"]
    assert authed(landlord2).post(f"/api/v1/units/{u.id}/media/", {**MEDIA, "public_id": "z"}, format="json").status_code == 404
    assert c.delete(f"/api/v1/units/{u.id}/media/{m1.data['id']}/").status_code == 204


def test_media_url_must_be_https_and_on_our_cloudinary(landlord, make_property, make_unit, settings):
    u = make_unit(make_property(landlord))
    c = authed(landlord)
    assert c.post(f"/api/v1/units/{u.id}/media/", {**MEDIA, "url": "http://evil.example/x.jpg"}, format="json").status_code == 400
    settings.CLOUDINARY_CLOUD_NAME = "mycloud"
    assert c.post(f"/api/v1/units/{u.id}/media/", MEDIA, format="json").status_code == 400  # wrong cloud
    ok = {**MEDIA, "url": "https://res.cloudinary.com/mycloud/image/upload/abc.jpg"}
    assert c.post(f"/api/v1/units/{u.id}/media/", ok, format="json").status_code == 201


def test_cloudinary_signature(landlord, tenant, settings):
    assert authed(landlord).post("/api/v1/media/cloudinary-signature/").status_code == 503  # not configured
    settings.CLOUDINARY_CLOUD_NAME, settings.CLOUDINARY_API_KEY, settings.CLOUDINARY_API_SECRET = "c", "k", "s3cret"
    r = authed(landlord).post("/api/v1/media/cloudinary-signature/")
    assert r.status_code == 200 and len(r.data["signature"]) == 40 and "s3cret" not in str(r.data)
    assert r.data["folder"] == f"units/{landlord.id}"
    assert authed(tenant).post("/api/v1/media/cloudinary-signature/").status_code == 403
