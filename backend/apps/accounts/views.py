from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audit.utils import log_action

from . import otp as otp_service
from .models import LandlordVerification, Role, VerificationDocument, VerificationStatus
from .permissions import IsLandlord, IsPlatformStaff
from .serializers import (DocumentUploadSerializer, LandlordVerificationSerializer, LoginSerializer,
                          MeSerializer, OTPRequestSerializer, OTPVerifySerializer, SetPasswordSerializer)

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
