from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.audit.utils import log_action

from .models import (Booking, BookingStatus, ProviderDocType, ProviderDocument, ProviderProfile, ProviderStatus, Quote, QuoteRequest,
                     QuoteStatus, ServiceCategory)
from .serializers import (BookingSerializer, CategorySerializer, ProviderDocUploadSerializer, ProviderSerializer, QuoteRequestSerializer,
                          QuoteSerializer)


class CategoryList(ListAPIView):
    queryset = ServiceCategory.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None


class ProviderViewSet(viewsets.ModelViewSet):
    """Public: approved providers. Owners manage their own profile; staff review the rest."""

    serializer_class = ProviderSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        u = self.request.user
        qs = ProviderProfile.objects.prefetch_related("categories", "counties", "documents")
        p = self.request.query_params
        if u.is_authenticated and u.is_platform_staff:
            if p.get("status"):
                qs = qs.filter(status=p["status"])
        elif self.action in ("list", "retrieve") or not u.is_authenticated:
            qs = qs.filter(status=ProviderStatus.APPROVED) | (qs.filter(user=u) if u.is_authenticated else qs.none())
        else:
            qs = qs.filter(user=u)
        if p.get("category"):
            qs = qs.filter(categories__slug=p["category"])
        if p.get("county"):
            qs = qs.filter(Q(counties=p["county"]) | Q(counties__isnull=True))
        if p.get("kind"):
            qs = qs.filter(kind=p["kind"])
        return qs.distinct()

    def create(self, request, *a, **k):
        if request.user.role not in (Role.PROVIDER, Role.AGENT, Role.LANDLORD):
            raise PermissionDenied("Only service providers, agents and companies can create a business profile.")
        if ProviderProfile.objects.filter(user=request.user).exists():
            raise ValidationError("You already have a business profile.")
        return super().create(request, *a, **k)

    def perform_create(self, serializer):
        obj = serializer.save(user=self.request.user)
        log_action(self.request.user, "provider.created", obj)

    def perform_update(self, serializer):
        u = self.request.user
        if serializer.instance.user_id != u.id:
            raise PermissionDenied("You can only edit your own profile.")
        was_approved = serializer.instance.status == ProviderStatus.APPROVED
        changed_private = {"kra_pin", "registration_number", "business_name"} & set(serializer.validated_data)
        obj = serializer.save()
        if was_approved and changed_private:  # changing legal details sends it back for review
            obj.status = ProviderStatus.PENDING
            obj.save(update_fields=["status"])

    @action(detail=False, methods=["get"])
    def mine(self, request):
        obj = ProviderProfile.objects.filter(user=request.user).first() if request.user.is_authenticated else None
        if not obj:
            raise Http404
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"], url_path="documents")
    def documents(self, request, pk=None):
        obj = self.get_object()
        if obj.user_id != request.user.id:
            raise PermissionDenied("Only the owner can upload documents.")
        if obj.documents.count() >= 10:
            raise ValidationError("At most 10 documents.")
        s = ProviderDocUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        doc = ProviderDocument.objects.create(profile=obj, doc_type=s.validated_data["doc_type"], file=s.validated_data["file"])
        return Response({"id": doc.id, "doc_type": doc.doc_type}, status=status.HTTP_201_CREATED)

    def _staff(self, request):
        if not (request.user.is_authenticated and request.user.is_platform_staff):
            raise PermissionDenied("Staff only.")

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        self._staff(request)
        obj = self.get_object()
        have = set(obj.documents.values_list("doc_type", flat=True))
        if not {ProviderDocType.KRA_PIN, ProviderDocType.REGISTRATION} <= have:
            raise ValidationError("Needs both the KRA PIN certificate and the business registration before approval.")
        obj.status, obj.reviewed_by, obj.reviewed_at, obj.rejection_reason = ProviderStatus.APPROVED, request.user, timezone.now(), ""
        obj.save()
        log_action(request.user, "provider.approved", obj)
        return Response(self.get_serializer(obj).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        self._staff(request)
        obj = self.get_object()
        reason = str(request.data.get("reason", "")).strip()[:200]
        if not reason:
            raise ValidationError({"reason": "Tell them why, so they can fix it."})
        obj.status, obj.reviewed_by, obj.reviewed_at, obj.rejection_reason = ProviderStatus.REJECTED, request.user, timezone.now(), reason
        obj.save()
        log_action(request.user, "provider.rejected", obj, reason=reason)
        return Response(self.get_serializer(obj).data)


class ProviderDocumentFile(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        doc = ProviderDocument.objects.select_related("profile").filter(pk=pk).first()
        if not doc or not (request.user.is_platform_staff or doc.profile.user_id == request.user.id):
            raise Http404
        resp = FileResponse(doc.file.open("rb"))
        resp["Cache-Control"] = "private, no-store"
        return resp


def approved_profile(user):
    return ProviderProfile.objects.filter(user=user, status=ProviderStatus.APPROVED).first()


class QuoteRequestViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = QuoteRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _matching(prof):
        """Open requests an approved provider may see: sent to them, or in one of their categories and areas."""
        q = Q(is_open=True) & (Q(provider=prof) | (Q(provider__isnull=True) & Q(category__in=prof.categories.all())))
        if prof.counties.exists():
            q &= Q(county__isnull=True) | Q(county__in=prof.counties.all())
        return q

    def get_queryset(self):
        u = self.request.user
        prof = approved_profile(u)
        qs = QuoteRequest.objects.select_related("category")
        if self.request.query_params.get("inbox") and prof:
            return qs.filter(self._matching(prof)).exclude(requester=u).distinct()
        if u.is_platform_staff:
            return qs
        visible = Q(requester=u)
        if prof:
            visible |= Q(quotes__provider=prof) | (self._matching(prof) & ~Q(requester=u))
        return qs.filter(visible).distinct()

    def perform_create(self, serializer):
        u = self.request.user
        if QuoteRequest.objects.filter(requester=u, is_open=True).count() >= 10:
            raise ValidationError("You have 10 open requests. Close or finish one first.")
        obj = serializer.save(requester=u)
        log_action(u, "quote_request.created", obj)

    @action(detail=True, methods=["get", "post"])
    def quotes(self, request, pk=None):
        req = self.get_object()
        prof = approved_profile(request.user)
        if request.method == "GET":
            qs = req.quotes.select_related("provider", "request")
            if req.requester_id != request.user.id and not request.user.is_platform_staff:
                qs = qs.filter(provider=prof) if prof else qs.none()
            return Response(QuoteSerializer(qs, many=True, context={"request": request}).data)
        if not prof:
            raise PermissionDenied("Only approved service providers can send quotes.")
        if req.requester_id == request.user.id:
            raise PermissionDenied("You cannot quote your own request.")
        if not req.is_open:
            raise ValidationError("This request is closed.")
        if req.provider_id and req.provider_id != prof.id:
            raise PermissionDenied("This request was sent to a different provider.")
        if not req.provider_id and not prof.categories.filter(pk=req.category_id).exists():
            raise PermissionDenied("This is not one of your services.")
        s = QuoteSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        if Quote.objects.filter(request=req, provider=prof).exists():
            raise ValidationError("You already sent a quote for this request.")
        q = s.save(request=req, provider=prof)
        log_action(request.user, "quote.sent", q)
        return Response(QuoteSerializer(q, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        req = self.get_object()
        if req.requester_id != request.user.id:
            raise PermissionDenied()
        req.is_open = False
        req.save(update_fields=["is_open"])
        return Response(self.get_serializer(req).data)


class QuoteAccept(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, pk):
        q = Quote.objects.select_for_update().select_related("request", "provider").filter(pk=pk, request__requester=request.user).first()
        if not q:
            raise Http404
        if q.status != QuoteStatus.SENT or not q.request.is_open:
            raise ValidationError("This quote can no longer be accepted.")
        pct = Decimal(str(settings.SERVICE_COMMISSION_PERCENT))
        booking = Booking.objects.create(quote=q, customer=request.user, provider=q.provider, price=q.price, scheduled_for=q.request.preferred_date,
                                         commission_percent=pct, commission_amount=(q.price * pct / 100).quantize(Decimal("0.01")))
        q.status = QuoteStatus.ACCEPTED
        q.save(update_fields=["status"])
        q.request.quotes.exclude(pk=q.pk).update(status=QuoteStatus.DECLINED)
        q.request.is_open = False
        q.request.save(update_fields=["is_open"])
        log_action(request.user, "booking.created", booking, price=str(q.price))
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = BookingSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        u = self.request.user
        prof = ProviderProfile.objects.filter(user=u).first()
        qs = Booking.objects.select_related("provider", "quote", "quote__request", "quote__request__category")
        return qs.filter(Q(customer=u) | Q(provider=prof) if prof else Q(customer=u))

    def perform_update(self, serializer):
        u = self.request.user
        inst = serializer.instance
        if set(self.request.data.keys()) - {"status"}:
            raise ValidationError("Only the status can be changed.")
        new = self.request.data.get("status")
        is_provider = inst.provider.user_id == u.id
        allowed = {BookingStatus.COMPLETED} if is_provider else {BookingStatus.CANCELLED} if inst.customer_id == u.id else set()
        if inst.status != BookingStatus.CONFIRMED or new not in allowed:
            raise PermissionDenied("You cannot make that change.")
        inst.status = new
        inst.save(update_fields=["status"])
        log_action(u, f"booking.{new}", inst)
