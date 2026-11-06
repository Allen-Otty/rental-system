import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.gis.db import models
from django.contrib.gis.geos import Point
from django.core.validators import MinValueValidator
from django.utils import timezone

from apps.accounts.storage import get_private_storage
from apps.geo.models import Constituency, County, Ward, locate

HECTARE_TO_ACRE = Decimal("2.47105")
SQFT_PER_ACRE = Decimal("43560")


class SizeUnit(models.TextChoices):
    ACRE = "acre", "Acres"
    HECTARE = "hectare", "Hectares"


class TitleType(models.TextChoices):
    FREEHOLD = "freehold", "Freehold title deed"
    LEASEHOLD = "leasehold", "Leasehold"
    ALLOTMENT = "allotment", "Allotment letter"
    SHARE = "share", "Share certificate / company"
    OTHER = "other", "Other / not sure"


class LandStatus(models.TextChoices):
    PUBLISHED = "published", "Published"
    SOLD = "sold", "Sold"
    REMOVED = "removed", "Removed"


class LandListing(models.Model):
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="land_listings")
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    estate = models.CharField(max_length=120, blank=True)
    landmark = models.CharField(max_length=200, blank=True)
    address_text = models.CharField(max_length=250, blank=True)
    location = models.PointField(geography=True, srid=4326)
    county = models.ForeignKey(County, null=True, blank=True, on_delete=models.SET_NULL, related_name="land_listings")
    constituency = models.ForeignKey(Constituency, null=True, blank=True, on_delete=models.SET_NULL, related_name="land_listings")
    ward = models.ForeignKey(Ward, null=True, blank=True, on_delete=models.SET_NULL, related_name="land_listings")

    # Size can be given as acres/hectares OR as plots (e.g. 50 x 100 ft, 4 plots). size_acres is always derived.
    size_value = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, validators=[MinValueValidator(Decimal("0.001"))])
    size_unit = models.CharField(max_length=8, choices=SizeUnit.choices, blank=True)
    plot_width_ft = models.PositiveIntegerField(null=True, blank=True)
    plot_length_ft = models.PositiveIntegerField(null=True, blank=True)
    plot_count = models.PositiveIntegerField(default=1)
    size_acres = models.DecimalField(max_digits=12, decimal_places=4, editable=False, db_index=True)

    price = models.DecimalField(max_digits=14, decimal_places=2, validators=[MinValueValidator(1)], help_text="Total price in KES")
    price_negotiable = models.BooleanField(default=False)
    title_type = models.CharField(max_length=12, choices=TitleType.choices, default=TitleType.OTHER)
    features = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=LandStatus.choices, default=LandStatus.PUBLISHED, db_index=True)

    # Staff set this after checking the uploaded ownership documents. Unverified listings are still
    # public, but clients must show them without the badge.
    is_verified = models.BooleanField(default=False, db_index=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_verified", "-created_at"]
        indexes = [models.Index(fields=["status", "price"])]

    def __str__(self):
        return self.title

    @property
    def latitude(self):
        return self.location.y

    @property
    def longitude(self):
        return self.location.x

    def compute_size_acres(self):
        if self.size_value and self.size_unit:
            v = Decimal(self.size_value)
            return v if self.size_unit == SizeUnit.ACRE else v * HECTARE_TO_ACRE
        if self.plot_width_ft and self.plot_length_ft:
            return Decimal(self.plot_width_ft * self.plot_length_ft * max(self.plot_count, 1)) / SQFT_PER_ACRE
        return None

    def save(self, *args, **kwargs):
        acres = self.compute_size_acres()
        if acres is None:
            raise ValueError("Land size is required (acres/hectares or plot dimensions).")
        self.size_acres = acres.quantize(Decimal("0.0001"))
        ward = locate(Point(self.location.x, self.location.y, srid=4326))
        self.ward = ward
        self.constituency = ward.constituency if ward else None
        self.county = ward.county if ward else None
        super().save(*args, **kwargs)

    def can_be_managed_by(self, user):
        return bool(user and user.is_authenticated and (user.is_platform_staff or self.seller_id == user.id))


class LandDocType(models.TextChoices):
    TITLE_DEED = "title_deed", "Title deed"
    SEARCH = "search", "Official search certificate"
    SURVEY = "survey", "Survey map / deed plan"
    OTHER = "other", "Other"


def _land_doc_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"land/{instance.listing_id}/{uuid.uuid4().hex}.{ext}"


class LandDocument(models.Model):
    """Ownership proof. Stored privately; only the seller and platform staff can open it."""

    listing = models.ForeignKey(LandListing, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=12, choices=LandDocType.choices)
    file = models.FileField(upload_to=_land_doc_path, storage=get_private_storage)
    uploaded_at = models.DateTimeField(auto_now_add=True)
