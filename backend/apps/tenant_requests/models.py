from django.conf import settings
from django.contrib.gis.db import models
from django.core.validators import MinValueValidator

from apps.geo.models import Constituency, County, Ward


class Goal(models.TextChoices):
    RENT = "rent", "Rent"
    BUY = "buy", "Buy"
    SHORT_STAY = "short_stay", "Short stay"


class Channel(models.TextChoices):
    SMS = "sms", "SMS"
    WHATSAPP = "whatsapp", "WhatsApp"
    EMAIL = "email", "Email"
    PUSH = "push", "Push notification"
    TELEGRAM = "telegram", "Telegram"


class RequestStatus(models.TextChoices):
    PENDING_PAYMENT = "pending_payment", "Waiting for payment"
    ACTIVE = "active", "Active"
    FULFILLED = "fulfilled", "Fulfilled"
    CANCELLED = "cancelled", "Cancelled"
    EXPIRED = "expired", "Expired"


class PropertyRequest(models.Model):
    """A tenant tells us what they want; matching listings alert them. Activated by the KES 200 fee."""

    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="property_requests")
    goal = models.CharField(max_length=10, choices=Goal.choices, default=Goal.RENT)
    county = models.ForeignKey(County, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    constituency = models.ForeignKey(Constituency, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    ward = models.ForeignKey(Ward, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    area_text = models.CharField(max_length=150, blank=True)
    landmark = models.CharField(max_length=200, blank=True)
    location = models.PointField(geography=True, srid=4326, null=True, blank=True)
    radius_km = models.PositiveSmallIntegerField(default=3)
    unit_types = models.JSONField(default=list, blank=True)
    min_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    max_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    amenities = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True, max_length=1000)
    alert_channels = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=16, choices=RequestStatus.choices, default=RequestStatus.PENDING_PAYMENT, db_index=True)
    fee_amount = models.DecimalField(max_digits=8, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class PaymentStatus(models.TextChoices):
    PENDING = "pending", "Waiting for the customer"
    SUCCESS = "success", "Paid"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled by customer"
    MISMATCH = "mismatch", "Amount did not match (needs review)"


class MpesaPayment(models.Model):
    request = models.ForeignKey(PropertyRequest, on_delete=models.CASCADE, related_name="payments")
    phone = models.CharField(max_length=16)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    merchant_request_id = models.CharField(max_length=64, blank=True)
    checkout_request_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.PENDING, db_index=True)
    mpesa_receipt = models.CharField(max_length=32, blank=True)
    result_code = models.IntegerField(null=True, blank=True)
    result_desc = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
