import hmac
import logging
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.audit.utils import log_action

from . import mpesa
from .models import MpesaPayment, PaymentStatus, PropertyRequest, RequestStatus
from .serializers import PaymentStatusSerializer, PaySerializer, PropertyRequestSerializer

log = logging.getLogger(__name__)


class IsTenantOrStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.role == Role.TENANT or u.is_platform_staff))


class PropertyRequestViewSet(viewsets.ModelViewSet):
    serializer_class = PropertyRequestSerializer
    permission_classes = [IsTenantOrStaff]
    http_method_names = ["get", "post", "head", "options"]  # a paid request can't be edited, only cancelled
    throttle_scope = None  # only the pay action is throttled (see its decorator)

    def get_queryset(self):
        qs = PropertyRequest.objects.select_related("county", "ward")
        return qs if self.request.user.is_platform_staff else qs.filter(tenant=self.request.user)

    def perform_create(self, serializer):
        obj = serializer.save(tenant=self.request.user)
        log_action(self.request.user, "request.created", obj)

    @action(detail=True, methods=["post"], throttle_scope="pay")
    def pay(self, request, pk=None):
        req = self.get_object()
        if req.tenant_id != request.user.id:
            raise PermissionDenied("Only the tenant who made the request can pay for it.")
        if req.status != RequestStatus.PENDING_PAYMENT:
            raise ValidationError("This request is not waiting for payment.")
        s = PaySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone = s.validated_data.get("phone") or request.user.phone
        recent = req.payments.filter(status=PaymentStatus.PENDING, created_at__gte=timezone.now() - timedelta(minutes=2)).first()
        if recent:  # don't spam the customer's phone with prompts
            return Response(PaymentStatusSerializer(recent).data, status=status.HTTP_200_OK)
        try:
            merchant_id, checkout_id = mpesa.stk_push(phone, req.fee_amount, f"REQ{req.pk}")
        except mpesa.MpesaError as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        pay = MpesaPayment.objects.create(request=req, phone=phone, amount=req.fee_amount,
                                          merchant_request_id=merchant_id, checkout_request_id=checkout_id)
        log_action(request.user, "payment.initiated", pay, request_id=req.pk)
        return Response(PaymentStatusSerializer(pay).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def payment(self, request, pk=None):
        """Poll this after the M-Pesa prompt is sent."""
        pay = self.get_object().payments.first()
        if not pay:
            raise Http404
        return Response(PaymentStatusSerializer(pay).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        req = self.get_object()
        if req.tenant_id != request.user.id and not request.user.is_platform_staff:
            raise PermissionDenied()
        if req.status not in (RequestStatus.PENDING_PAYMENT, RequestStatus.ACTIVE):
            raise ValidationError("This request can't be cancelled.")
        req.status = RequestStatus.CANCELLED
        req.save(update_fields=["status"])
        log_action(request.user, "request.cancelled", req)
        return Response(self.get_serializer(req).data)


class MpesaCallbackView(APIView):
    """Safaricom posts the payment result here. The secret in the URL stops random callers."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def post(self, request, secret):
        if not settings.MPESA_CALLBACK_SECRET or not hmac.compare_digest(secret, settings.MPESA_CALLBACK_SECRET):
            raise Http404
        ack = Response({"ResultCode": 0, "ResultDesc": "Accepted"})
        try:
            cb = request.data["Body"]["stkCallback"]
            checkout_id, code = cb["CheckoutRequestID"], int(cb["ResultCode"])
        except (KeyError, TypeError, ValueError):
            return ack
        with transaction.atomic():
            pay = MpesaPayment.objects.select_for_update().select_related("request").filter(checkout_request_id=checkout_id).first()
            if not pay:
                log.warning("M-Pesa callback for unknown checkout id")
                return ack
            if pay.status != PaymentStatus.PENDING:  # Safaricom can retry; stay idempotent
                return ack
            pay.result_code, pay.result_desc = code, str(cb.get("ResultDesc", ""))[:255]
            pay.completed_at = timezone.now()
            if code == 0:
                meta = {i.get("Name"): i.get("Value") for i in cb.get("CallbackMetadata", {}).get("Item", [])}
                pay.mpesa_receipt = str(meta.get("MpesaReceiptNumber", ""))[:32]
                try:
                    paid = Decimal(str(meta.get("Amount")))
                except Exception:
                    paid = None
                if paid is None or paid != pay.amount:
                    pay.status = PaymentStatus.MISMATCH  # never activate on a wrong amount; staff review
                else:
                    pay.status = PaymentStatus.SUCCESS
                    req = pay.request
                    if req.status == RequestStatus.PENDING_PAYMENT:
                        req.status = RequestStatus.ACTIVE
                        req.activated_at = timezone.now()
                        req.expires_at = req.activated_at + timedelta(days=settings.REQUEST_ACTIVE_DAYS)
                        req.save(update_fields=["status", "activated_at", "expires_at"])
            else:
                pay.status = PaymentStatus.CANCELLED if code == 1032 else PaymentStatus.FAILED
            pay.save()
            log_action(None, f"payment.{pay.status}", pay, request_id=pay.request_id, receipt=pay.mpesa_receipt)
        return ack
