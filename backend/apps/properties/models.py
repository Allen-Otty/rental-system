import builtins
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.gis.db import models
from django.contrib.gis.geos import Point
from django.core.validators import MinValueValidator
from django.db.models import Count, Min, Q
from django.utils import timezone

from apps.geo.models import Constituency, County, Ward, locate


class PropertyType(models.TextChoices):
    BUILDING = "building", "Building with several units"
    HOUSE = "house", "Standalone house"


class UnitType(models.TextChoices):
    BEDSITTER = "bedsitter", "Bedsitter"
    STUDIO = "studio", "Studio"
    ONE_BR = "1br", "1 bedroom"
    TWO_BR = "2br", "2 bedrooms"
    THREE_BR = "3br", "3 bedrooms"
    FOUR_PLUS = "4br_plus", "4+ bedrooms"
    MAISONETTE = "maisonette", "Maisonette"
    BUNGALOW = "bungalow", "Bungalow"


class UnitStatus(models.TextChoices):
    AVAILABLE = "available", "Available"
    VIEWING_REQUESTED = "viewing_requested", "Viewing requested"
    APPLICATION_PENDING = "application_pending", "Application pending"
    RESERVED = "reserved", "Reserved"
    OCCUPIED = "occupied", "Occupied"


# Statuses a landlord/agent may set by hand. The rest are driven by the booking workflow.
MANUAL_STATUSES = (UnitStatus.AVAILABLE, UnitStatus.OCCUPIED)


class Property(models.Model):
    landlord = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="properties")
    name = models.CharField(max_length=150)
    property_type = models.CharField(max_length=10, choices=PropertyType.choices, default=PropertyType.BUILDING)
    description = models.TextField(blank=True)
    estate = models.CharField(max_length=120, blank=True)
    landmark = models.CharField(max_length=200, blank=True)
    address_text = models.CharField(max_length=250, blank=True)
    location = models.PointField(geography=True, srid=4326)
    county = models.ForeignKey(County, null=True, blank=True, on_delete=models.SET_NULL, related_name="properties")
    constituency = models.ForeignKey(Constituency, null=True, blank=True, on_delete=models.SET_NULL, related_name="properties")
    ward = models.ForeignKey(Ward, null=True, blank=True, on_delete=models.SET_NULL, related_name="properties")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "properties"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @property
    def latitude(self):
        return self.location.y

    @property
    def longitude(self):
        return self.location.x

    def assign_admin_areas(self):
        """Derive ward / constituency / county from the pin. Runs on every save."""
        ward = locate(Point(self.location.x, self.location.y, srid=4326))
        self.ward = ward
        self.constituency = ward.constituency if ward else None
        self.county = ward.county if ward else None

    def save(self, *args, **kwargs):
        self.assign_admin_areas()
        super().save(*args, **kwargs)

    def can_be_managed_by(self, user):
        if not user or not user.is_authenticated:
            return False
        return (
            user.is_platform_staff
            or self.landlord_id == user.id
            or self.assignments.filter(agent=user).exists()
        )


class UnitQuerySet(models.QuerySet):
    def public(self):
        """Units any visitor may see: active, available, and owned by a verified landlord."""
        return self.filter(
            is_active=True,
            status=UnitStatus.AVAILABLE,
            property__landlord__landlord_verified=True,
            property__landlord__is_active=True,
        )

    def managed_by(self, user):
        if user.is_platform_staff:
            return self
        return self.filter(Q(property__landlord=user) | Q(property__assignments__agent=user)).distinct()


class Unit(models.Model):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="units")
    label = models.CharField(max_length=40, blank=True, help_text="e.g. A3, Ground floor")
    unit_type = models.CharField(max_length=12, choices=UnitType.choices)
    bedrooms = models.PositiveSmallIntegerField(default=0)
    bathrooms = models.PositiveSmallIntegerField(default=1)
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=UnitStatus.choices, default=UnitStatus.AVAILABLE, db_index=True)
    amenities = models.JSONField(default=list, blank=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UnitQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["property", "label"], name="uniq_unit_label_per_property")]
        indexes = [models.Index(fields=["status", "rent_amount"])]

    def __str__(self):
        return f"{self.property.name} {self.label}".strip()


def properties_with_public_units():
    """Properties with at least one public unit, annotated with count and lowest rent (for map markers)."""
    public = Q(
        units__is_active=True,
        units__status=UnitStatus.AVAILABLE,
        landlord__landlord_verified=True,
        landlord__is_active=True,
    )
    return (
        Property.objects.annotate(
            available_units=Count("units", filter=public),
            min_rent=Min("units__rent_amount", filter=public),
        )
        .filter(available_units__gt=0)
    )


class UnitMedia(models.Model):
    """Metadata only. Files live on Cloudinary; the client uploads directly with a signed request."""

    class Kind(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Video"

    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="media")
    provider = models.CharField(max_length=20, default="cloudinary")
    public_id = models.CharField(max_length=255)
    url = models.URLField(max_length=500)
    kind = models.CharField(max_length=5, choices=Kind.choices, default=Kind.PHOTO)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    bytes = models.PositiveIntegerField(null=True, blank=True)
    position = models.PositiveSmallIntegerField(default=0)
    is_cover = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["unit", "public_id"], name="uniq_media_per_unit")]


class PropertyAgent(models.Model):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="assignments")
    agent = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["property", "agent"], name="uniq_agent_per_property")]


def _token():
    return secrets.token_urlsafe(24)


def _invite_expiry():
    return timezone.now() + timedelta(days=7)


class AgentInvite(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="invites")
    phone = models.CharField(max_length=16, db_index=True)
    token = models.CharField(max_length=64, unique=True, default=_token)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField(default=_invite_expiry)
    created_at = models.DateTimeField(auto_now_add=True)

    @builtins.property  # a field named `property` shadows the builtin in this class body
    def is_usable(self):
        return self.status == self.Status.PENDING and self.expires_at > timezone.now()


class SavedSearch(models.Model):
    class Kind(models.TextChoices):
        RADIUS = "radius", "Around a point"
        AREA = "area", "County / constituency / ward"
        POLYGON = "polygon", "Drawn area"

    class Channel(models.TextChoices):
        WHATSAPP = "whatsapp", "WhatsApp"
        PUSH = "push", "Push notification"
        EMAIL = "email", "Email"
        SMS = "sms", "SMS"
        TELEGRAM = "telegram", "Telegram"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_searches")
    name = models.CharField(max_length=80)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    center = models.PointField(geography=True, srid=4326, null=True, blank=True)
    radius_km = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    county = models.ForeignKey(County, null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    constituency = models.ForeignKey(Constituency, null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    ward = models.ForeignKey(Ward, null=True, blank=True, on_delete=models.CASCADE, related_name="+")
    polygon = models.PolygonField(geography=True, srid=4326, null=True, blank=True)
    min_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    min_bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    unit_types = models.JSONField(default=list, blank=True)
    channels = models.JSONField(default=list, blank=True)
    # Alerts are opt-in: nothing is sent unless consent was given for this search.
    consent_given = models.BooleanField(default=False)
    consent_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name

    @classmethod
    def matching_unit(cls, unit):
        """Active, consented searches that a newly available unit satisfies (used by alerts later)."""
        from django.contrib.gis.db.models.functions import Distance

        prop = unit.property
        pt = prop.location
        base = cls.objects.filter(is_active=True, consent_given=True).exclude(channels=[])
        base = base.filter(Q(min_rent__isnull=True) | Q(min_rent__lte=unit.rent_amount))
        base = base.filter(Q(max_rent__isnull=True) | Q(max_rent__gte=unit.rent_amount))
        base = base.filter(Q(min_bedrooms__isnull=True) | Q(min_bedrooms__lte=unit.bedrooms))

        def type_ok(s):
            return not s.unit_types or unit.unit_type in s.unit_types

        ids = [s.id for s in base.filter(kind=cls.Kind.AREA).filter(
            Q(ward_id=prop.ward_id) | Q(constituency_id=prop.constituency_id) | Q(county_id=prop.county_id)
        ).exclude(Q(ward_id=None) & Q(constituency_id=None) & Q(county_id=None)) if type_ok(s)]
        ids += [s.id for s in base.filter(kind=cls.Kind.POLYGON, polygon__intersects=pt) if type_ok(s)]
        radius_candidates = base.filter(kind=cls.Kind.RADIUS).annotate(dist=Distance("center", pt))
        ids += [s.id for s in radius_candidates if type_ok(s) and s.dist.m <= float(s.radius_km) * 1000]
        return cls.objects.filter(id__in=ids)
