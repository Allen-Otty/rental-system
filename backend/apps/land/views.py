from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.http import FileResponse, Http404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log_action

from .models import LandDocument, LandListing, LandStatus
from .serializers import LandDocumentSerializer, LandDocumentUploadSerializer, LandListingSerializer


def _dec(request, name):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        return None
    try:
        return Decimal(raw)
    except InvalidOperation:
        raise ValidationError({name: "Must be a number."})


class LandViewSet(viewsets.ModelViewSet):
    serializer_class = LandListingSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        qs = LandListing.objects.select_related("seller", "county", "constituency", "ward")
        user, act = self.request.user, self.action
        public = qs.filter(status=LandStatus.PUBLISHED, seller__is_active=True)
        if act == "list":
            if self.request.query_params.get("mine") and user.is_authenticated:
                return self._filter(qs.filter(seller=user))
            return self._filter(public)
        if act == "retrieve":
            if user.is_authenticated and user.is_platform_staff:
                return qs
            return public | qs.filter(seller=user) if user.is_authenticated else public
        if user.is_authenticated and user.is_platform_staff:
            return qs
        return qs.filter(seller=user) if user.is_authenticated else qs.none()

    def _filter(self, qs):
        p = self.request.query_params
        for key in ("county", "constituency", "ward"):
            if p.get(key):
                qs = qs.filter(**{f"{key}_id": p[key]})
        if p.get("verified") in ("1", "true", "True"):
            qs = qs.filter(is_verified=True)
        if p.get("title_type"):
            qs = qs.filter(title_type=p["title_type"])
        for name, field, op in (("min_price", "price", "gte"), ("max_price", "price", "lte"),
                                ("min_acres", "size_acres", "gte"), ("max_acres", "size_acres", "lte")):
            v = _dec(self.request, name)
            if v is not None:
                qs = qs.filter(**{f"{field}__{op}": v})
        if p.get("q"):
            qs = qs.filter(title__icontains=p["q"][:80])
        if p.get("lat") and p.get("lng"):
            try:
                pt = Point(float(p["lng"]), float(p["lat"]), srid=4326)
                radius = min(float(p.get("radius_km", 10)), 200)
            except ValueError:
                raise ValidationError("lat, lng and radius_km must be numbers.")
            qs = qs.filter(location__distance_lte=(pt, D(km=radius))).annotate(distance=Distance("location", pt)).order_by("distance")
        return qs

    def perform_create(self, serializer):
        active = LandListing.objects.filter(seller=self.request.user, status=LandStatus.PUBLISHED).count()
        if active >= settings.LAND_MAX_ACTIVE_PER_SELLER:
            raise ValidationError(f"You can have at most {settings.LAND_MAX_ACTIVE_PER_SELLER} active land listings.")
        obj = serializer.save(seller=self.request.user)
        log_action(self.request.user, "land.created", obj)

    def _manage(self, obj):
        if not obj.can_be_managed_by(self.request.user):
            raise PermissionDenied("You cannot manage this listing.")

    def perform_update(self, serializer):
        self._manage(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._manage(instance)
        log_action(self.request.user, "land.deleted", instance)
        instance.delete()

    @action(detail=True, methods=["get", "post"], url_path="documents")
    def documents(self, request, pk=None):
        listing = self.get_object()
        if not listing.can_be_managed_by(request.user):
            raise PermissionDenied("Only the seller and platform staff can see these documents.")
        if request.method == "GET":
            return Response(LandDocumentSerializer(listing.documents.all(), many=True).data)
        if listing.seller_id != request.user.id:
            raise PermissionDenied("Only the seller can upload documents.")
        if listing.documents.count() >= 10:
            raise ValidationError("At most 10 documents per listing.")
        s = LandDocumentUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        doc = LandDocument.objects.create(listing=listing, doc_type=s.validated_data["doc_type"], file=s.validated_data["file"])
        return Response(LandDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    def _staff_only(self, request):
        if not (request.user.is_authenticated and request.user.is_platform_staff):
            raise PermissionDenied("Staff only.")

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        self._staff_only(request)
        listing = self.get_object()
        if not listing.documents.exists():
            raise ValidationError("Cannot verify a listing that has no ownership documents.")
        listing.is_verified, listing.verified_at, listing.verified_by = True, timezone.now(), request.user
        listing.save(update_fields=["is_verified", "verified_at", "verified_by", "updated_at"])
        log_action(request.user, "land.verified", listing)
        return Response(self.get_serializer(listing).data)

    @action(detail=True, methods=["post"])
    def unverify(self, request, pk=None):
        self._staff_only(request)
        listing = self.get_object()
        listing.is_verified, listing.verified_at, listing.verified_by = False, None, None
        listing.save(update_fields=["is_verified", "verified_at", "verified_by", "updated_at"])
        log_action(request.user, "land.unverified", listing, reason=str(request.data.get("reason", ""))[:200])
        return Response(self.get_serializer(listing).data)

    @action(detail=False, methods=["get"], url_path="pending-verification")
    def pending_verification(self, request):
        self._staff_only(request)
        qs = LandListing.objects.filter(is_verified=False, documents__isnull=False, status=LandStatus.PUBLISHED).distinct()
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)


class LandDocumentFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        doc = LandDocument.objects.select_related("listing").filter(pk=pk).first()
        if not doc or not doc.listing.can_be_managed_by(request.user):
            raise Http404
        resp = FileResponse(doc.file.open("rb"))
        resp["Cache-Control"] = "private, no-store"
        resp["X-Content-Type-Options"] = "nosniff"
        return resp
