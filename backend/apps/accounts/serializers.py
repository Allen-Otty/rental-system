from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import SELF_SIGNUP_ROLES, DocType, LandlordVerification, Role, User, VerificationDocument
from .phone import normalise_phone


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            return normalise_phone(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)


class OTPRequestSerializer(serializers.Serializer):
    phone = PhoneField()


class OTPVerifySerializer(serializers.Serializer):
    phone = PhoneField()
    code = serializers.CharField(min_length=4, max_length=8)
    # Only used when the phone number is new:
    role = serializers.ChoiceField(choices=[r.value for r in SELF_SIGNUP_ROLES], required=False)
    full_name = serializers.CharField(max_length=150, required=False, allow_blank=True)


class SignupSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    phone = PhoneField()
    full_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=[r.value for r in SELF_SIGNUP_ROLES], default=Role.TENANT)
    contact_consent = serializers.BooleanField()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_contact_consent(self, value):
        if value is not True:
            raise serializers.ValidationError("You must agree to be contacted to create an account.")
        return value

    def validate(self, attrs):
        probe = User(email=attrs["email"], phone=attrs["phone"], full_name=attrs["full_name"])
        try:
            password_validation.validate_password(attrs["password"], probe)
        except DjangoValidationError as e:
            raise serializers.ValidationError({"password": e.messages})
        return attrs


class ConfirmEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class ResendConfirmationSerializer(serializers.Serializer):
    email = serializers.EmailField()


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField()  # phone or email
    password = serializers.CharField(write_only=True)


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        try:
            password_validation.validate_password(value, self.context["request"].user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value



class MeSerializer(serializers.ModelSerializer):
    verification_status = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "phone", "email", "full_name", "role", "language", "is_phone_verified",
                  "is_email_verified", "landlord_verified", "verification_status"]
        # email changes need a confirmation flow, so they are not editable here
        read_only_fields = ["id", "phone", "email", "role", "is_phone_verified", "is_email_verified",
                            "landlord_verified"]

    def get_verification_status(self, obj):
        if obj.role != Role.LANDLORD:
            return None
        v = getattr(obj, "verification", None)
        return v.status if v else "not_submitted"

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("This email is already in use.")
        return value.lower() if value else None


class VerificationDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = VerificationDocument
        fields = ["id", "doc_type", "uploaded_at"]


class LandlordVerificationSerializer(serializers.ModelSerializer):
    documents = VerificationDocumentSerializer(many=True, read_only=True)
    landlord_phone = serializers.CharField(source="landlord.phone", read_only=True)
    landlord_name = serializers.CharField(source="landlord.full_name", read_only=True)

    class Meta:
        model = LandlordVerification
        fields = ["id", "landlord", "landlord_phone", "landlord_name", "status", "submitted_at",
                  "reviewed_at", "rejection_reason", "documents"]
        read_only_fields = fields


class DocumentUploadSerializer(serializers.Serializer):
    doc_type = serializers.ChoiceField(choices=DocType.choices)
    file = serializers.FileField()

    ALLOWED_EXT = {"jpg", "jpeg", "png", "pdf"}
    MAGIC = {b"\xff\xd8\xff": {"jpg", "jpeg"}, b"\x89PNG": {"png"}, b"%PDF": {"pdf"}}

    def validate_file(self, f):
        from django.conf import settings

        ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
        if ext not in self.ALLOWED_EXT:
            raise serializers.ValidationError("Only JPG, PNG or PDF files are accepted.")
        if f.size > settings.MAX_VERIFICATION_FILE_MB * 1024 * 1024:
            raise serializers.ValidationError(f"File must be under {settings.MAX_VERIFICATION_FILE_MB} MB.")
        head = f.read(4)
        f.seek(0)
        if not any(head.startswith(sig) and ext in exts for sig, exts in self.MAGIC.items()):
            raise serializers.ValidationError("File contents do not match its extension.")
        return f
