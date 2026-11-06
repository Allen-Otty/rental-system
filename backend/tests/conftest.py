import pytest
from django.contrib.gis.geos import MultiPolygon, Polygon
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts import sms
from apps.accounts.models import Role, User
from apps.geo.models import Constituency, County, Ward
from apps.properties.models import Property, Unit

# Synthetic boundaries (squares) -- NOT real Kenyan boundaries.
BOXES = {
    "parklands": (36.80, -1.28, 36.84, -1.25),
    "kileleshwa": (36.76, -1.28, 36.80, -1.25),
    "nyali": (39.70, -4.05, 39.74, -4.02),
}


def mp(box):
    p = Polygon.from_bbox(box)
    p.srid = 4326
    return MultiPolygon(p, srid=4326)


@pytest.fixture(autouse=True)
def _private_media(tmp_path, monkeypatch):
    """Never write test uploads into the real private_media folder.

    The model field resolves its (callable) storage once at import, so patch the field's storage directly.
    """
    from django.core.files.storage import FileSystemStorage

    from apps.accounts.models import VerificationDocument

    monkeypatch.setattr(
        VerificationDocument._meta.get_field("file"), "storage", FileSystemStorage(location=str(tmp_path))
    )


@pytest.fixture(autouse=True)
def _clean(db):
    cache.clear()
    sms.outbox.clear()


@pytest.fixture
def geo(db):
    nairobi = County.objects.create(name="Nairobi", code="047")
    mombasa = County.objects.create(name="Mombasa", code="001")
    westlands = Constituency.objects.create(county=nairobi, name="Westlands")
    nyali_c = Constituency.objects.create(county=mombasa, name="Nyali")
    wards = {
        "parklands": Ward.objects.create(county=nairobi, constituency=westlands, name="Parklands", geom=mp(BOXES["parklands"])),
        "kileleshwa": Ward.objects.create(county=nairobi, constituency=westlands, name="Kileleshwa", geom=mp(BOXES["kileleshwa"])),
        "nyali": Ward.objects.create(county=mombasa, constituency=nyali_c, name="Nyali", geom=mp(BOXES["nyali"])),
    }
    return {"nairobi": nairobi, "mombasa": mombasa, "westlands": westlands, "wards": wards}


def make_user(phone, role, **kw):
    return User.objects.create_user(phone, role=role, is_phone_verified=True, **kw)


@pytest.fixture
def landlord(db):
    return make_user("0711000001", Role.LANDLORD, full_name="Lena Landlord", landlord_verified=True)


@pytest.fixture
def landlord2(db):
    return make_user("0711000002", Role.LANDLORD, full_name="Other Landlord", landlord_verified=True)


@pytest.fixture
def unverified_landlord(db):
    return make_user("0711000003", Role.LANDLORD, full_name="New Landlord")


@pytest.fixture
def agent(db):
    return make_user("0722000001", Role.AGENT, full_name="Ann Agent")


@pytest.fixture
def tenant(db):
    return make_user("0733000001", Role.TENANT, full_name="Tom Tenant", email="tom@example.com")


@pytest.fixture
def admin_user(db):
    return make_user("0700000001", Role.ADMIN, full_name="Admin")


@pytest.fixture
def client():
    return APIClient()


def authed(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def make_property(geo):
    def _make(owner, lat=-1.265, lng=36.82, **kw):
        from django.contrib.gis.geos import Point

        defaults = dict(name="Sunrise Apartments", property_type="building", estate="Parklands", landmark="Near mall")
        defaults.update(kw)
        return Property.objects.create(landlord=owner, location=Point(lng, lat, srid=4326), **defaults)

    return _make


@pytest.fixture
def make_unit():
    def _make(prop, label="A1", rent=15000, **kw):
        defaults = dict(unit_type="1br", bedrooms=1)
        defaults.update(kw)
        return Unit.objects.create(property=prop, label=label, rent_amount=rent, **defaults)

    return _make
