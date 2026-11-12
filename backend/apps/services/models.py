import re
import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models

from apps.accounts.storage import get_private_storage
from apps.geo.models import County


class ServiceCategory(models.Model):
    slug = models.SlugField(unique=True)
    name_en = models.CharField(max_length=60)
    name_sw = models.CharField(max_length=60)
    icon = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    sort = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort", "name_en"]
        verbose_name_plural = "service categories"

    def __str__(self):
        return self.name_en


def validate_kra_pin(value):
    if not re.fullmatch(r"[AP]\d{9}[A-Z]", value.strip().upper()):
        raise ValidationError("Enter a valid KRA PIN, like A123456789Z.")


class ProviderKind(models.TextChoices):
    PROVIDER = "provider", "Service provider"
    AGENT = "agent", "Property agent"
    COMPANY = "company", "Company"


class ProviderStatus(models.TextChoices):
    PENDING = "pending", "Waiting for review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Not approved"


class ProviderProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="provider_profile")
    kind = models.CharField(max_length=10, choices=ProviderKind.choices, default=ProviderKind.PROVIDER)
    business_name = models.CharField(max_length=150)
    kra_pin = models.CharField(max_length=11, validators=[validate_kra_pin])
    registration_number = models.CharField(max_length=40, blank=True)
    phone = models.CharField(max_length=16)
    whatsapp = models.CharField(max_length=16, blank=True)
    bio = models.CharField(max_length=500, blank=True)
    categories = models.ManyToManyField(ServiceCategory, blank=True, related_name="providers")
    counties = models.ManyToManyField(County, blank=True, related_name="+")
    price_from = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    status = models.CharField(max_length=10, choices=ProviderStatus.choices, default=ProviderStatus.PENDING, db_index=True)
    rejection_reason = models.CharField(max_length=200, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *a, **k):
        self.kra_pin = self.kra_pin.strip().upper()
        super().save(*a, **k)


class ProviderDocType(models.TextChoices):
    KRA_PIN = "kra_pin", "KRA PIN certificate"
    REGISTRATION = "registration", "Business registration"
    OTHER = "other", "Other"


def _doc_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"providers/{instance.profile_id}/{uuid.uuid4().hex}.{ext}"


class ProviderDocument(models.Model):
    profile = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=12, choices=ProviderDocType.choices)
    file = models.FileField(upload_to=_doc_path, storage=get_private_storage)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class QuoteRequest(models.Model):
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quote_requests")
    category = models.ForeignKey(ServiceCategory, on_delete=models.PROTECT, related_name="requests")
    provider = models.ForeignKey(ProviderProfile, null=True, blank=True, on_delete=models.CASCADE, related_name="direct_requests",
                                 help_text="Set when the customer asked one provider directly")
    county = models.ForeignKey(County, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    from_place = models.CharField(max_length=150, blank=True)
    to_place = models.CharField(max_length=150, blank=True)
    description = models.CharField(max_length=600)
    preferred_date = models.DateField(null=True, blank=True)
    budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    is_open = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class QuoteStatus(models.TextChoices):
    SENT = "sent", "Sent"
    ACCEPTED = "accepted", "Accepted"
    DECLINED = "declined", "Declined"


class Quote(models.Model):
    request = models.ForeignKey(QuoteRequest, on_delete=models.CASCADE, related_name="quotes")
    provider = models.ForeignKey(ProviderProfile, on_delete=models.CASCADE, related_name="quotes")
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    message = models.CharField(max_length=400, blank=True)
    status = models.CharField(max_length=9, choices=QuoteStatus.choices, default=QuoteStatus.SENT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["price"]
        constraints = [models.UniqueConstraint(fields=["request", "provider"], name="one_quote_per_provider")]


class BookingStatus(models.TextChoices):
    CONFIRMED = "confirmed", "Confirmed"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class Booking(models.Model):
    """Created when a customer accepts a quote. Payment through the app comes in a later release."""

    quote = models.OneToOneField(Quote, on_delete=models.PROTECT, related_name="booking")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="service_bookings")
    provider = models.ForeignKey(ProviderProfile, on_delete=models.PROTECT, related_name="bookings")
    price = models.DecimalField(max_digits=10, decimal_places=2)
    scheduled_for = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=BookingStatus.choices, default=BookingStatus.CONFIRMED)
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
