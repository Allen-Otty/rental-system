from datetime import date

from django.db.models import Q
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.accounts.permissions import IsPropertyManagerRole
from apps.audit.utils import log_action
from apps.properties.models import Unit

from . import services
from .models import (LandlordSettings, Lease, LeaseStatus, MaintenanceRequest, MaintenanceUpdate, RentInvoice, RepairStatus,
                     Vendor, ViewingRequest, ViewingStatus)
from .serializers import (InvoiceSerializer, LandlordSettingsSerializer, LeaseSerializer, MaintenanceSerializer, PaymentSerializer,
                          VendorSerializer, ViewingSerializer)


def managed_units(user):
    return Unit.objects.managed_by(user)


class ManagerRequired(permissions.BasePermission):
    """Landlords, agents and staff."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and (u.role in (Role.LANDLORD, Role.AGENT) or u.is_platform_staff))


class LandlordSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, ManagerRequired]

    def _obj(self, request):
        return LandlordSettings.objects.get_or_create(landlord=request.user)[0]

    def get(self, request):
        return Response(LandlordSettingsSerializer(self._obj(request)).data)

    def patch(self, request):
        s = LandlordSettingsSerializer(self._obj(request), data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class VendorViewSet(viewsets.ModelViewSet):
    serializer_class = VendorSerializer
    permission_classes = [permissions.IsAuthenticated, ManagerRequired]

    def get_queryset(self):
        return Vendor.objects.filter(landlord=self.request.user)

    def perform_create(self, serializer):
        serializer.save(landlord=self.request.user)


class LeaseViewSet(viewsets.ModelViewSet):
    serializer_class = LeaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        u = self.request.user
        qs = Lease.objects.select_related("unit", "unit__property")
        if u.is_platform_staff or u.role in (Role.LANDLORD, Role.AGENT):
            return qs.filter(unit__in=managed_units(u))
        return qs.filter(tenant=u)  # tenants only ever see their own lease

    def _managers_only(self):
        if not (self.request.user.is_platform_staff or self.request.user.role in (Role.LANDLORD, Role.AGENT)):
            raise PermissionDenied("Only landlords and agents can do this.")

    def create(self, request, *args, **kwargs):
        self._managers_only()
        return super().create(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._managers_only()
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        self._managers_only()
        lease = self.get_object()
        lease.status = LeaseStatus.ENDED
        lease.save(update_fields=["status"])
        lease.sync_unit_status()
        log_action(request.user, "lease.ended", lease)
        return Response(self.get_serializer(lease).data)

    @action(detail=True, methods=["post"], url_path="id-document", parser_classes=[MultiPartParser, FormParser])
    def id_document(self, request, pk=None):
        self._managers_only()
        lease = self.get_object()
        cfg = LandlordSettings.objects.filter(landlord=lease.unit.property.landlord).first()
        if not (cfg and cfg.collect_tenant_id_photo):
            raise ValidationError("This landlord's settings do not collect ID photos.")
        f = request.data.get("file")
        if not f or f.size > 5 * 1024 * 1024 or not str(f.name).lower().endswith((".jpg", ".jpeg", ".png", ".pdf")):
            raise ValidationError({"file": "Upload a JPG, PNG or PDF up to 5 MB."})
        lease.id_document = f
        lease.save(update_fields=["id_document"])
        log_action(request.user, "lease.id_document_added", lease)
        return Response({"detail": "Saved."}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="id-document/file")
    def id_document_file(self, request, pk=None):
        self._managers_only()
        lease = self.get_object()
        if not lease.id_document:
            raise Http404
        resp = FileResponse(lease.id_document.open("rb"))
        resp["Cache-Control"] = "private, no-store"
        return resp


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        qs = RentInvoice.objects.select_related("lease", "lease__unit").prefetch_related("payments")
        qs = qs.filter(lease__unit__in=managed_units(u)) if (u.is_platform_staff or u.role in (Role.LANDLORD, Role.AGENT)) else qs.filter(lease__tenant=u)
        p = self.request.query_params
        if p.get("lease"):
            qs = qs.filter(lease_id=p["lease"])
        if p.get("period"):
            qs = qs.filter(period=p["period"][:7] + "-01")
        if p.get("status") == "overdue":
            qs = services.overdue_invoices(qs)
        return qs

    def _managers_only(self):
        if not (self.request.user.is_platform_staff or self.request.user.role in (Role.LANDLORD, Role.AGENT)):
            raise PermissionDenied("Only landlords and agents can do this.")

    @action(detail=False, methods=["post"])
    def generate(self, request):
        self._managers_only()
        raw = request.data.get("month") or date.today().strftime("%Y-%m")
        try:
            month = date.fromisoformat(str(raw)[:7] + "-01")
        except ValueError:
            raise ValidationError({"month": "Use YYYY-MM."})
        leases = Lease.objects.filter(unit__in=managed_units(request.user))
        return Response({"created": services.generate_invoices(leases, month)})

    @action(detail=True, methods=["post"])
    def payments(self, request, pk=None):
        self._managers_only()
        inv = self.get_object()
        s = PaymentSerializer(data=request.data, context={"invoice": inv})
        s.is_valid(raise_exception=True)
        pay = s.save(invoice=inv, recorded_by=request.user)
        log_action(request.user, "rent.payment_recorded", pay, invoice=inv.pk, amount=str(pay.amount))
        return Response(InvoiceSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="remind-overdue")
    def remind_overdue(self, request):
        self._managers_only()
        invs = RentInvoice.objects.filter(lease__unit__in=managed_units(request.user))
        sent, skipped = services.send_overdue_reminders(invs, request.user)
        log_action(request.user, "rent.reminders_sent", None, sent=sent)
        return Response({"sent": sent, "skipped": skipped})


class MaintenanceViewSet(viewsets.ModelViewSet):
    serializer_class = MaintenanceSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def _is_manager(self, u):
        return u.is_platform_staff or u.role in (Role.LANDLORD, Role.AGENT)

    def get_queryset(self):
        u = self.request.user
        qs = MaintenanceRequest.objects.select_related("unit", "unit__property", "vendor", "reported_by").prefetch_related("updates")
        if self._is_manager(u):
            qs = qs.filter(unit__in=managed_units(u))
        else:
            qs = qs.filter(unit__leases__tenant=u, unit__leases__status=LeaseStatus.ACTIVE).distinct()
        if self.request.query_params.get("status"):
            qs = qs.filter(status=self.request.query_params["status"])
        return qs

    def perform_create(self, serializer):
        u = self.request.user
        unit = serializer.validated_data["unit"]
        if self._is_manager(u):
            if not managed_units(u).filter(pk=unit.pk).exists():
                raise PermissionDenied("You do not manage this unit.")
        elif not Lease.objects.filter(unit=unit, tenant=u, status=LeaseStatus.ACTIVE).exists():
            raise PermissionDenied("You can only report problems in the unit you rent.")
        if not self._is_manager(u):  # tenants report problems; they don't pick vendors or statuses
            for k in ("vendor", "status", "visit_at"):
                serializer.validated_data.pop(k, None)
        elif serializer.validated_data.get("vendor") and serializer.validated_data["vendor"].landlord_id != unit.property.landlord_id:
            raise ValidationError({"vendor": "Choose one of the landlord's own vendors."})
        obj = serializer.save(reported_by=u)
        MaintenanceUpdate.objects.create(request=obj, author=u, text="Request created")
        log_action(u, "repair.created", obj)

    def perform_update(self, serializer):
        u = self.request.user
        if not self._is_manager(u):
            raise PermissionDenied("Only the landlord or agent can update a repair.")
        inst = serializer.instance
        new = serializer.validated_data
        vendor = new.get("vendor")
        if vendor and vendor.landlord_id != inst.unit.property.landlord_id:
            raise ValidationError({"vendor": "Choose one of the landlord's own vendors."})
        notes = []
        if vendor and vendor.pk != inst.vendor_id:
            notes.append(f"Vendor assigned: {vendor.name}")
        if "visit_at" in new and new["visit_at"] and new["visit_at"] != inst.visit_at:
            notes.append(f"Visit scheduled: {timezone.localtime(new['visit_at']):%b %d, %H:%M}")
        if "status" in new and new["status"] != inst.status:
            notes.append(f"Status: {dict(RepairStatus.choices)[new['status']]}")
        obj = serializer.save()
        for t in notes:
            MaintenanceUpdate.objects.create(request=obj, author=u, text=t)


class ViewingViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = ViewingSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        u = self.request.user
        qs = ViewingRequest.objects.select_related("unit", "unit__property", "requester")
        return qs.filter(Q(requester=u) | Q(unit__in=managed_units(u))).distinct()

    def perform_create(self, serializer):
        u = self.request.user
        unit = serializer.validated_data["unit"]
        if not Unit.objects.public().filter(pk=unit.pk).exists():
            raise ValidationError({"unit": "This home is not open for viewings."})
        if serializer.validated_data["preferred_at"] <= timezone.now():
            raise ValidationError({"preferred_at": "Pick a time in the future."})
        if ViewingRequest.objects.filter(unit=unit, requester=u, status__in=[ViewingStatus.REQUESTED, ViewingStatus.CONFIRMED]).exists():
            raise ValidationError("You already have a viewing booked for this home.")
        obj = serializer.save(requester=u)
        log_action(u, "viewing.requested", obj)

    def perform_update(self, serializer):
        u = self.request.user
        inst = serializer.instance
        new_status = self.request.data.get("status")
        if set(self.request.data.keys()) - {"status"}:
            raise ValidationError("Only the status can be changed.")
        is_manager = managed_units(u).filter(pk=inst.unit_id).exists()
        allowed = {ViewingStatus.CONFIRMED, ViewingStatus.DECLINED, ViewingStatus.COMPLETED} if is_manager else {ViewingStatus.CANCELLED} if inst.requester_id == u.id else set()
        if new_status not in allowed:
            raise PermissionDenied("You cannot set that status.")
        serializer.instance.status = new_status
        serializer.instance.save(update_fields=["status"])
        log_action(u, f"viewing.{new_status}", inst)


class LandlordDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, ManagerRequired]

    def get(self, request):
        return Response(services.landlord_dashboard(request.user))
