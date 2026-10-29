import hashlib
import json
import time

from django.conf import settings
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.geos import GEOSGeometry, Point, Polygon
from django.contrib.gis.measure import D
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.accounts.permissions import IsPropertyManagerRole
from apps.audit.utils import log_action

from .filters import UnitFilter
from .models import (AgentInvite, Property, PropertyAgent, SavedSearch, Unit, UnitMedia,
                     properties_with_public_units)
from .serializers import (AgentInviteSerializer, PropertySerializer, SavedSearchSerializer, UnitMediaSerializer,
                          UnitSerializer, validate_kenya_point)

MAX_RADIUS_KM = 50


def _float(request, name, required=True):
    raw = request.query_params.get(name)
    if raw in (None, ""):
        if required:
            raise ValidationError({name: "This parameter is required."})
        return None
    try:
        return float(raw)
    except ValueError:
        raise ValidationError({name: "Must be a number."})


def _is_manager(user):
    return user.is_authenticated and (user.role in (Role.LANDLORD, Role.AGENT) or user.is_platform_staff)


class PropertyViewSet(viewsets.ModelViewSet):
    """Property records for the people who manage them. Everyone else sees only public properties."""

    serializer_class = PropertySerializer
    permission_classes = [IsPropertyManagerRole]

    def get_queryset(self):
        u = self.request.user
        qs = Property.objects.select_related("county", "constituency", "ward")
        if u.is_authenticated and u.is_platform_staff:
            return qs
        if u.is_authenticated and u.role == Role.LANDLORD:
            return qs.filter(landlord=u)
        if u.is_authenticated and u.role == Role.AGENT:
            return qs.filter(assignments__agent=u).distinct()
        return qs.filter(pk__in=properties_with_public_units().values("pk"))

    def perform_create(self, serializer):
        u = self.request.user
        if u.role == Role.LANDLORD:
            serializer.save(landlord=u)
        elif u.is_platform_staff:
            landlord_id = self.request.data.get("landlord")
            from django.contrib.auth import get_user_model

            landlord = get_user_model().objects.filter(pk=landlord_id, role=Role.LANDLORD).first()
            if not landlord:
                raise ValidationError({"landlord": "Provide the id of an existing landlord."})
            serializer.save(landlord=landlord)
        else:
            raise PermissionDenied("Only landlords can create properties. Agents manage assigned properties.")

    def _owner_only(self, prop):
        u = self.request.user
        if not (u.is_platform_staff or prop.landlord_id == u.id):
            raise PermissionDenied("Only the property owner can do this.")

    def perform_update(self, serializer):
        prop = serializer.instance
        if not prop.can_be_managed_by(self.request.user):
            raise PermissionDenied()
        serializer.save()

    def perform_destroy(self, instance):
        self._owner_only(instance)
        log_action(self.request.user, "property.deleted", instance, name=instance.name)
        instance.delete()

    @action(detail=True, methods=["get", "post"], url_path="agents")
    def agents(self, request, pk=None):
        prop = self.get_object()
        self._owner_only(prop)
        if request.method == "POST":
            s = AgentInviteSerializer(data=request.data)
            s.is_valid(raise_exception=True)
            inv = AgentInvite.objects.create(property=prop, invited_by=request.user, phone=s.validated_data["phone"])
            log_action(request.user, "agent.invited", inv, property=prop.pk)
            return Response(AgentInviteSerializer(inv).data, status=status.HTTP_201_CREATED)
        return Response({
            "assigned": [{"id": a.agent_id, "name": a.agent.full_name, "phone": a.agent.phone}
                         for a in prop.assignments.select_related("agent")],
            "invites": AgentInviteSerializer(prop.invites.filter(status="pending"), many=True).data,
        })

    @action(detail=True, methods=["delete"], url_path=r"agents/(?P<agent_id>\d+)")
    def remove_agent(self, request, pk=None, agent_id=None):
        prop = self.get_object()
        self._owner_only(prop)
        deleted, _ = prop.assignments.filter(agent_id=agent_id).delete()
        if not deleted:
            raise Http404
        log_action(request.user, "agent.removed", prop, agent=int(agent_id))
        return Response(status=status.HTTP_204_NO_CONTENT)


class UnitViewSet(viewsets.ModelViewSet):
    """
    Anyone can browse public units. Landlords/agents also see (and can edit) their own, via ?scope=mine
    or by id. Search endpoints (nearby, in-area, markers) only ever return public units.
    """

    serializer_class = UnitSerializer
    permission_classes = [IsPropertyManagerRole]
    filterset_class = UnitFilter
    ordering = ["-created_at"]

    def _base(self):
        return Unit.objects.select_related("property", "property__county", "property__constituency",
                                           "property__ward").prefetch_related("media")

    def get_queryset(self):
        u = self.request.user
        qs = self._base()
        public = qs.public()
        if not _is_manager(u):
            return public
        mine = qs.managed_by(u)
        if self.request.query_params.get("scope") == "mine" or self.action in ("update", "partial_update", "destroy", "media", "remove_media"):
            return mine
        return qs.filter(Q(pk__in=public.values("pk")) | Q(pk__in=mine.values("pk")))

    def perform_update(self, serializer):
        old_status = serializer.instance.status
        unit = serializer.save()
        if unit.status != old_status:
            log_action(self.request.user, "unit.status_changed", unit, old=old_status, new=unit.status)

    # ---- search ---------------------------------------------------------
    def _public_search(self, request):
        return self.filter_queryset(self._base().public())

    def _page(self, qs):
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @action(detail=False, methods=["get"])
    def nearby(self, request):
        lat, lng = _float(request, "lat"), _float(request, "lng")
        radius = _float(request, "radius_km", required=False) or 5
        if not (0 < radius <= MAX_RADIUS_KM):
            raise ValidationError({"radius_km": f"Must be between 0 and {MAX_RADIUS_KM}."})
        try:
            validate_kenya_point(lat, lng)
        except Exception as e:
            raise ValidationError({"lat": e.detail if hasattr(e, "detail") else str(e)})
        pt = Point(lng, lat, srid=4326)
        qs = (self._public_search(request)
              .filter(property__location__dwithin=(pt, D(km=radius)))
              .annotate(distance=Distance("property__location", pt))
              .order_by("distance"))
        return self._page(qs)

    @action(detail=False, methods=["get"], url_path="in-area")
    def in_area(self, request):
        p = request.query_params
        qs = self._public_search(request)
        if p.get("polygon"):
            try:
                poly = GEOSGeometry(p["polygon"], srid=4326)
            except Exception:
                raise ValidationError({"polygon": "Invalid GeoJSON polygon."})
            if not isinstance(poly, Polygon) or not poly.valid or poly.num_coords > 200:
                raise ValidationError({"polygon": "Must be a valid single polygon with at most 200 points."})
            minx, miny, maxx, maxy = poly.extent
            if (maxx - minx) > 3 or (maxy - miny) > 3:
                raise ValidationError({"polygon": "Area is too large."})
            qs = qs.filter(property__location__intersects=poly)
        elif p.get("bbox"):
            try:
                minx, miny, maxx, maxy = (float(v) for v in p["bbox"].split(","))
            except ValueError:
                raise ValidationError({"bbox": "Use bbox=min_lng,min_lat,max_lng,max_lat."})
            if (maxx - minx) > 3 or (maxy - miny) > 3:
                raise ValidationError({"bbox": "Area is too large; zoom in."})
            from django.contrib.gis.geos import Polygon as P

            qs = qs.filter(property__location__intersects=P.from_bbox((minx, miny, maxx, maxy)))
        elif not any(p.get(k) for k in ("ward", "constituency", "county")):
            raise ValidationError("Provide ward, constituency, county, polygon or bbox.")
        return self._page(qs)

    @action(detail=False, methods=["get"])
    def markers(self, request):
        """Lightweight map pins: one per property that has public units, with lowest rent and count."""
        try:
            minx, miny, maxx, maxy = (float(v) for v in request.query_params.get("bbox", "").split(","))
        except ValueError:
            raise ValidationError({"bbox": "Use bbox=min_lng,min_lat,max_lng,max_lat."})
        if (maxx - minx) > 3 or (maxy - miny) > 3:
            raise ValidationError({"bbox": "Area is too large; zoom in or use /geo/counts/."})
        box = Polygon.from_bbox((minx, miny, maxx, maxy))
        box.srid = 4326
        limit = 500
        props = list(properties_with_public_units().filter(location__intersects=box)[: limit + 1])
        truncated = len(props) > limit
        return Response({
            "truncated": truncated,
            "markers": [{"property_id": p.id, "name": p.name, "latitude": p.location.y, "longitude": p.location.x,
                         "available_units": p.available_units, "min_rent": str(p.min_rent)}
                        for p in props[:limit]],
        })

    # ---- media metadata --------------------------------------------------
    @action(detail=True, methods=["post"], url_path="media")
    def media(self, request, pk=None):
        unit = self.get_object()
        if not unit.property.can_be_managed_by(request.user):
            raise PermissionDenied()
        if unit.media.count() >= 20:
            raise ValidationError("A unit can have at most 20 media items.")
        s = UnitMediaSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            if s.validated_data.get("is_cover"):
                unit.media.update(is_cover=False)
            m = UnitMedia.objects.create(unit=unit, **s.validated_data)
        return Response(UnitMediaSerializer(m).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"media/(?P<media_id>\d+)")
    def remove_media(self, request, pk=None, media_id=None):
        unit = self.get_object()
        if not unit.property.can_be_managed_by(request.user):
            raise PermissionDenied()
        deleted, _ = unit.media.filter(pk=media_id).delete()
        if not deleted:
            raise Http404
        return Response(status=status.HTTP_204_NO_CONTENT)


class CloudinarySignatureView(APIView):
    """Signed upload parameters so the browser/app uploads photos straight to Cloudinary."""

    permission_classes = [IsPropertyManagerRole]

    def post(self, request):
        if not _is_manager(request.user):
            raise PermissionDenied()
        if not (settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET):
            return Response({"detail": "Media uploads are not configured."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        timestamp = int(time.time())
        folder = f"units/{request.user.pk}"
        to_sign = f"folder={folder}&timestamp={timestamp}{settings.CLOUDINARY_API_SECRET}"
        return Response({
            "cloud_name": settings.CLOUDINARY_CLOUD_NAME,
            "api_key": settings.CLOUDINARY_API_KEY,
            "timestamp": timestamp,
            "folder": folder,
            "signature": hashlib.sha1(to_sign.encode()).hexdigest(),
        })


class MyAgentInvitesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != Role.AGENT:
            return Response([])
        qs = AgentInvite.objects.filter(phone=request.user.phone, status="pending",
                                        expires_at__gt=timezone.now()).select_related("property")
        return Response(AgentInviteSerializer(qs, many=True).data)


class AcceptAgentInviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request, token):
        if request.user.role != Role.AGENT:
            raise PermissionDenied("Only agent accounts can accept invitations.")
        inv = AgentInvite.objects.select_for_update().filter(token=token).select_related("property").first()
        # Same response for unknown token / wrong phone: do not leak which invites exist.
        if not inv or inv.phone != request.user.phone or not inv.is_usable:
            raise Http404
        PropertyAgent.objects.get_or_create(property=inv.property, agent=request.user)
        inv.status = AgentInvite.Status.ACCEPTED
        inv.save(update_fields=["status"])
        log_action(request.user, "agent.accepted_invite", inv, property=inv.property_id)
        return Response({"detail": "You now manage this property.", "property": inv.property_id})


class SavedSearchViewSet(viewsets.ModelViewSet):
    serializer_class = SavedSearchSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SavedSearch.objects.filter(user=self.request.user)

    def _consent_time(self, serializer, instance=None):
        was = instance.consent_given if instance else False
        now_given = serializer.validated_data.get("consent_given", was)
        if now_given and not was:
            return {"consent_at": timezone.now()}
        if not now_given:
            return {"consent_at": None}
        return {}

    def perform_create(self, serializer):
        if self.request.user.saved_searches.count() >= 20:
            raise ValidationError("You can save up to 20 searches.")
        serializer.save(user=self.request.user, **self._consent_time(serializer))

    def perform_update(self, serializer):
        serializer.save(**self._consent_time(serializer, serializer.instance))
