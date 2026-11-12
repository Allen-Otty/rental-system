from datetime import date

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q, Sum

from apps.accounts.storage import get_private_storage
from apps.properties.models import Unit, UnitStatus


class LandlordSettings(models.Model):
    """What a landlord wants leases to collect about tenants (each landlord decides)."""

    landlord = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenancy_settings")
    collect_tenant_id_number = models.BooleanField(default=False)
    collect_tenant_id_photo = models.BooleanField(default=False)


class VendorTrade(models.TextChoices):
    PLUMBER = "plumber", "Plumber"
    ELECTRICIAN = "electrician", "Electrician"
    PAINTER = "painter", "Painter"
    CLEANER = "cleaner", "Cleaner"
    SECURITY = "security", "Security"
    OTHER = "other", "Other"


class Vendor(models.Model):
    """A landlord's own repair contact."""

    landlord = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vendors")
    name = models.CharField(max_length=120)
    trade = models.CharField(max_length=12, choices=VendorTrade.choices, default=VendorTrade.OTHER)
    phone = models.CharField(max_length=16)
    notes = models.CharField(max_length=300, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]


class LeaseStatus(models.TextChoices):
    PENDING = "pending", "Not started"
    ACTIVE = "active", "Active"
    ENDED = "ended", "Ended"


def _id_doc_path(instance, filename):
    import uuid

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"lease-ids/{instance.pk}/{uuid.uuid4().hex}.{ext}"


class Lease(models.Model):
    unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="leases")
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="leases")
    tenant_name = models.CharField(max_length=150)
    tenant_phone = models.CharField(max_length=16)
    tenant_email = models.EmailField(blank=True)
    id_number = models.CharField(max_length=30, blank=True)  # only when the landlord's settings collect it
    id_document = models.FileField(upload_to=_id_doc_path, storage=get_private_storage, null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    rent_due_day = models.PositiveSmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(28)])
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deposit_paid = models.BooleanField(default=False)
    status = models.CharField(max_length=8, choices=LeaseStatus.choices, default=LeaseStatus.ACTIVE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]
        constraints = [models.UniqueConstraint(fields=["unit"], condition=Q(status="active"), name="one_active_lease_per_unit")]

    def clean(self):
        if self.end_date and self.start_date and self.end_date <= self.start_date:
            raise ValidationError("The lease must end after it starts.")

    def sync_unit_status(self):
        if self.status == LeaseStatus.ACTIVE:
            Unit.objects.filter(pk=self.unit_id).update(status=UnitStatus.OCCUPIED)
        elif self.status == LeaseStatus.ENDED and not Lease.objects.filter(unit_id=self.unit_id, status=LeaseStatus.ACTIVE).exclude(pk=self.pk).exists():
            Unit.objects.filter(pk=self.unit_id).update(status=UnitStatus.AVAILABLE)


class RentInvoice(models.Model):
    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name="invoices")
    period = models.DateField(help_text="First day of the month this rent is for")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period"]
        constraints = [models.UniqueConstraint(fields=["lease", "period"], name="one_invoice_per_lease_month")]

    def paid_total(self):
        return self.payments.aggregate(t=Sum("amount"))["t"] or 0

    def balance(self):
        return self.amount - self.paid_total()

    def state(self, today=None):
        today = today or date.today()
        paid = self.paid_total()
        if paid >= self.amount:
            return "paid"
        if self.due_date < today:
            return "overdue"
        return "partial" if paid > 0 else "unpaid"


class PaymentMethod(models.TextChoices):
    MPESA = "mpesa", "M-Pesa"
    CASH = "cash", "Cash"
    BANK = "bank", "Bank"


class RentPayment(models.Model):
    """A payment someone recorded. The platform does not move this money."""

    invoice = models.ForeignKey(RentInvoice, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(1)])
    method = models.CharField(max_length=6, choices=PaymentMethod.choices, default=PaymentMethod.MPESA)
    reference = models.CharField(max_length=30, blank=True, help_text="M-Pesa code or bank reference")
    paid_on = models.DateField()
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_on", "-id"]
        constraints = [models.UniqueConstraint(fields=["reference"], condition=~Q(reference=""), name="unique_payment_reference")]


class RentReminder(models.Model):
    invoice = models.ForeignKey(RentInvoice, on_delete=models.CASCADE, related_name="reminders")
    phone = models.CharField(max_length=16)
    sent_at = models.DateTimeField(auto_now_add=True)


class RepairCategory(models.TextChoices):
    PLUMBING = "plumbing", "Plumbing"
    ELECTRICAL = "electrical", "Electrical"
    PAINTING = "painting", "Painting"
    SECURITY = "security", "Doors and locks"
    OTHER = "other", "Other"


class RepairStatus(models.TextChoices):
    OPEN = "open", "Open"
    SCHEDULED = "scheduled", "Scheduled"
    IN_PROGRESS = "in_progress", "In progress"
    DONE = "done", "Done"
    CLOSED = "closed", "Closed"


class MaintenanceRequest(models.Model):
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="repairs")
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, max_length=1500)
    category = models.CharField(max_length=12, choices=RepairCategory.choices, default=RepairCategory.OTHER)
    priority = models.CharField(max_length=8, choices=[("low", "Low"), ("normal", "Normal"), ("high", "High"), ("urgent", "Urgent")], default="normal")
    status = models.CharField(max_length=12, choices=RepairStatus.choices, default=RepairStatus.OPEN, db_index=True)
    vendor = models.ForeignKey(Vendor, null=True, blank=True, on_delete=models.SET_NULL, related_name="jobs")
    visit_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]


class MaintenanceUpdate(models.Model):
    request = models.ForeignKey(MaintenanceRequest, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    text = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class ViewingStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    CONFIRMED = "confirmed", "Confirmed"
    DECLINED = "declined", "Declined"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class ViewingRequest(models.Model):
    unit = models.ForeignKey(Unit, on_delete=models.CASCADE, related_name="viewings")
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="viewings")
    preferred_at = models.DateTimeField()
    message = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=10, choices=ViewingStatus.choices, default=ViewingStatus.REQUESTED, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
