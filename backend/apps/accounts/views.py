from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.utils import log_action

from . import emailverify
from . import otp as otp_service
from .models import LandlordVerification, Role, VerificationDocument, VerificationStatus
from .permissions import IsLandlord, IsPlatformStaff
from .serializers import (ConfirmEmailSerializer, DocumentUploadSerializer, LandlordVerificationSerializer,
                          LoginSerializer, MeSerializer, OTPRequestSerializer, OTPVerifySerializer,
                          ResendConfirmationSerializer, SetPasswordSerializer, SignupSerializer)

User = get_user_model()


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class OTPRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "otp"

    def post(self, request):
        s = OTPRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            otp_service.request_otp(s.validated_data["phone"])
        except otp_service.OTPError as e:
            return Response({"detail": str(e)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        return Response({"detail": "Code sent."})


class OTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_scope = "otp"

    @transaction.atomic
    def post(self, request):
        s = OTPVerifySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        try:
            otp_service.verify_otp(d["phone"], d["code"])
        except otp_service.OTPError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if not settings.OTP_SIGNUP_ENABLED and not User.objects.filter(phone=d["phone"]).exists():
            return Response({"detail": "No account for this number. Sign up with your email first."},
                            status=status.HTTP_400_BAD_REQUEST)
        user, created = User.objects.get_or_create(
            phone=d["phone"],
            defaults={"role": d.get("role", Role.TENANT), "full_name": d.get("full_name", ""),
                      "is_phone_verified": True},
        )
        if not user.is_active:
            return Response({"detail": "This account is suspended."}, status=status.HTTP_403_FORBIDDEN)
        if not created and not user.is_phone_verified:
            user.is_phone_verified = True
            user.save(update_fields=["is_phone_verified"])
        if created:
            user.set_unusable_password()
            user.save(update_fields=["password"])
            log_action(user, "user.registered", user, role=user.role)
        return Response({"created": created, "user": MeSerializer(user).data, **tokens_for(user)})


class SignupView(APIView):
    """Email signup. The account stays inactive until the emailed link is confirmed."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "signup"

    @transaction.atomic
    def post(self, request):
        s = SignupSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pending = User.objects.filter(email__iexact=d["email"], is_active=False, is_email_verified=False).first()
        taken_email = User.objects.filter(email__iexact=d["email"]).exclude(pk=getattr(pending, "pk", None)).exists()
        taken_phone = User.objects.filter(phone=d["phone"]).exclude(pk=getattr(pending, "pk", None)).exists()
        if taken_email or taken_phone:
            errors = {}
            if taken_email:
                errors["email"] = ["An account with this email already exists. Try logging in."]
            if taken_phone:
                errors["phone"] = ["This phone number is already used by another account."]
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            if pending:
                # Latest signup wins, and older links die (the token binds to the password hash).
                user = pending
                user.phone, user.full_name, user.role = d["phone"], d["full_name"], d["role"]
                user.set_password(d["password"])
                user.contact_consent, user.contact_consent_at = True, timezone.now()
                user.save()
            else:
                user = User.objects.create_user(
                    d["phone"], d["password"], email=d["email"], full_name=d["full_name"], role=d["role"],
                    is_active=False, contact_consent=True, contact_consent_at=timezone.now())
                log_action(user, "user.registered", user, role=user.role, via="email")
        except IntegrityError:
            return Response({"detail": "Could not create the account. Check your details."},
                            status=status.HTTP_400_BAD_REQUEST)
        emailverify.send_confirmation(user)
        return Response({"detail": "Check your email and click the confirmation link to activate your account."},
                        status=status.HTTP_201_CREATED)


class ConfirmEmailView(APIView):
    """POST (not GET) so mail scanners that pre-fetch links can't confirm accounts by accident."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def post(self, request):
        s = ConfirmEmailSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            payload = emailverify.read_token(s.validated_data["token"])
        except signing.SignatureExpired:
            return Response({"detail": "This link has expired. Request a new one.", "code": "expired"},
                            status=status.HTTP_400_BAD_REQUEST)
        except signing.BadSignature:
            return Response({"detail": "This link is not valid.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.filter(pk=payload.get("uid")).first()
        if (not user or user.email != payload.get("email") or user.password[-12:] != payload.get("pw")):
            return Response({"detail": "This link is not valid.", "code": "invalid"}, status=status.HTTP_400_BAD_REQUEST)
        if not user.is_email_verified:
            user.is_email_verified = True
            user.is_active = True
            user.save(update_fields=["is_email_verified", "is_active"])
            log_action(user, "user.email_confirmed", user)
        return Response({"detail": "Email confirmed. You can log in now."})


class ResendConfirmationView(APIView):
    """Always answers the same way so it can't be used to discover which emails are registered."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "email_resend"

    def post(self, request):
        s = ResendConfirmationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        email = s.validated_data["email"].strip().lower()
        if cache.add(f"resend:{email}", 1, timeout=60):  # one per minute per address
            user = User.objects.filter(email__iexact=email, is_active=False, is_email_verified=False).first()
            if user:
                emailverify.send_confirmation(user)
        return Response({"detail": "If that email is waiting for confirmation, we sent a new link."})


class LoginView(APIView):
    """Email-or-phone + password login (secondary to phone OTP)."""

    permission_classes = [permissions.AllowAny]
    throttle_scope = "login"

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ident = s.validated_data["identifier"].strip()
        user = None
        if "@" in ident:
            user = User.objects.filter(email__iexact=ident).first()
        else:
            from .phone import normalise_phone
            from django.core.exceptions import ValidationError

            try:
                user = User.objects.filter(phone=normalise_phone(ident)).first()
            except ValidationError:
                user = None
        if not user or not user.has_usable_password() or not user.check_password(s.validated_data["password"]):
            return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            if not user.is_email_verified:
                return Response({"detail": "Please confirm your email first. Check your inbox for the link.",
                                 "code": "email_not_confirmed"}, status=status.HTTP_403_FORBIDDEN)
            return Response({"detail": "This account is suspended."}, status=status.HTTP_403_FORBIDDEN)
        return Response({"user": MeSerializer(user).data, **tokens_for(user)})


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class SetPasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        s = SetPasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        user = request.user
        user.set_password(s.validated_data["password"])
        if "email" in s.validated_data:
            user.email = s.validated_data["email"]
        user.save()
        return Response({"detail": "Password set. You can now sign in with email or phone and password."})


# --- Landlord verification ---------------------------------------------------

class MyVerificationView(APIView):
    """Landlord uploads ID/ownership documents; platform staff review them."""

    permission_classes = [IsLandlord]

    def get(self, request):
        v = getattr(request.user, "verification", None)
        if not v:
            return Response({"status": "not_submitted", "documents": []})
        return Response(LandlordVerificationSerializer(v).data)

    @transaction.atomic
    def post(self, request):
        s = DocumentUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        v, _ = LandlordVerification.objects.get_or_create(landlord=request.user)
        if v.status == VerificationStatus.APPROVED:
            return Response({"detail": "Already verified."}, status=status.HTTP_400_BAD_REQUEST)
        if v.status == VerificationStatus.REJECTED:  # resubmission
            v.status = VerificationStatus.PENDING
            v.rejection_reason = ""
            v.submitted_at = timezone.now()
            v.save()
        VerificationDocument.objects.create(verification=v, **s.validated_data)
        return Response(LandlordVerificationSerializer(v).data, status=status.HTTP_201_CREATED)


class VerificationQueueView(generics.ListAPIView):
    serializer_class = LandlordVerificationSerializer
    permission_classes = [IsPlatformStaff]

    def get_queryset(self):
        qs = LandlordVerification.objects.select_related("landlord").prefetch_related("documents")
        return qs.filter(status=self.request.query_params.get("status", VerificationStatus.PENDING))


class VerificationDecisionView(APIView):
    permission_classes = [IsPlatformStaff]

    @transaction.atomic
    def post(self, request, pk, decision):
        try:
            v = LandlordVerification.objects.select_for_update().select_related("landlord").get(pk=pk)
        except LandlordVerification.DoesNotExist:
            raise Http404
        if decision == "approve":
            if not v.documents.exists():
                return Response({"detail": "No documents uploaded."}, status=status.HTTP_400_BAD_REQUEST)
            v.status = VerificationStatus.APPROVED
            v.rejection_reason = ""
            v.landlord.landlord_verified = True
        else:
            reason = (request.data.get("reason") or "").strip()
            if not reason:
                return Response({"detail": "A reason is required."}, status=status.HTTP_400_BAD_REQUEST)
            v.status = VerificationStatus.REJECTED
            v.rejection_reason = reason[:300]
            v.landlord.landlord_verified = False
        v.reviewed_by = request.user
        v.reviewed_at = timezone.now()
        v.save()
        v.landlord.save(update_fields=["landlord_verified"])
        log_action(request.user, f"verification.{decision}", v, landlord=v.landlord_id)
        return Response(LandlordVerificationSerializer(v).data)


class VerificationDocumentFileView(APIView):
    """Private download: only the owning landlord or platform staff."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            doc = VerificationDocument.objects.select_related("verification").get(pk=pk)
        except VerificationDocument.DoesNotExist:
            raise Http404
        if not (request.user.is_platform_staff or doc.verification.landlord_id == request.user.id):
            raise Http404  # do not reveal existence
        log_action(request.user, "verification.document_viewed", doc)
        resp = FileResponse(doc.file.open("rb"), as_attachment=False)
        resp["Cache-Control"] = "private, no-store"
        return resp
