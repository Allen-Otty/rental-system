import uuid
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from .phone import normalise_phone
from .storage import get_private_storage


class Role(models.TextChoices):
    TENANT = "tenant", "Tenant"
    LANDLORD = "landlord", "Landlord"
    AGENT = "agent", "Property agent"
    ADMIN = "admin", "Administrator"
    STAFF = "staff", "Finance/support staff"


SELF_SIGNUP_ROLES = (Role.TENANT, Role.LANDLORD, Role.AGENT)


class UserManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, phone, password=None, **extra):
        phone = normalise_phone(phone)
        email = extra.pop("email", None)
        if email:
            email = self.normalize_email(email)
        user = self.model(phone=phone, email=email or None, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", Role.ADMIN)
        extra.setdefault("is_phone_verified", True)
        return self.create_user(phone, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    phone = models.CharField(max_length=16, unique=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    full_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.TENANT)
    language = models.CharField(max_length=2, choices=[("en", "English"), ("sw", "Kiswahili")], default="en")
    is_phone_verified = models.BooleanField(default=False)
    # Set by an admin when the landlord's ID/documents are approved. Listings of
    # unverified landlords are never public.
    landlord_verified = models.BooleanField(default=False)
    # Percent of first month's rent. Null means "use DEFAULT_COMMISSION_PERCENT".
    commission_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # Django admin site access
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()
    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.full_name or self.phone} ({self.role})"

    @property
    def is_platform_staff(self):
        return self.is_superuser or self.role in (Role.ADMIN, Role.STAFF)

    @property
    def effective_commission_percent(self):
        if self.commission_percent is not None:
            return self.commission_percent
        return Decimal(str(settings.DEFAULT_COMMISSION_PERCENT))


class OTPCode(models.Model):
    phone = models.CharField(max_length=16, db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["phone", "created_at"])]


class VerificationStatus(models.TextChoices):
    PENDING = "pending", "Pending review"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class LandlordVerification(models.Model):
    landlord = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="verification")
    status = models.CharField(max_length=10, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    submitted_at = models.DateTimeField(default=timezone.now)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["submitted_at"]

    def __str__(self):
        return f"Verification for {self.landlord_id}: {self.status}"


class DocType(models.TextChoices):
    NATIONAL_ID_FRONT = "id_front", "National ID (front)"
    NATIONAL_ID_BACK = "id_back", "National ID (back)"
    PASSPORT = "passport", "Passport"
    OWNERSHIP = "ownership", "Proof of ownership / authority to let"


def _doc_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"verification/{instance.verification_id}/{uuid.uuid4().hex}.{ext}"


class VerificationDocument(models.Model):
    verification = models.ForeignKey(LandlordVerification, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=12, choices=DocType.choices)
    file = models.FileField(upload_to=_doc_path, storage=get_private_storage)
    uploaded_at = models.DateTimeField(auto_now_add=True)
