import json


from django.db.models import Count
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.properties.models import Unit

from .models import Constituency, County, Ward

LEVELS = {
    "county": (County, "property__county_id", "county_id"),
    "constituency": (Constituency, "property__constituency_id", "county_id"),
    "ward": (Ward, "property__ward_id", "constituency_id"),
}



def _geometry(obj, request):
    """GeoJSON geometry, simplified for map display. Only when ?geometry=1."""
    if request.query_params.get("geometry") not in ("1", "true"):
        return None
    try:
        tol = min(max(float(request.query_params.get("simplify", "0.002")), 0.0), 0.5)
    except ValueError:
        tol = 0.002
    if obj.geom is None:
        return None
    g = obj.geom.simplify(tol, preserve_topology=True) if tol else obj.geom
    return json.loads(g.geojson)


class AreaSerializerMixin:
    def to_rep(self, obj, request, **extra):
        d = {"id": obj.id, "code": obj.code, "name": obj.name, **extra}
        geometry = _geometry(obj, request)
        if geometry is not None:
            d["geometry"] = geometry
        return d


class CountyListView(AreaSerializerMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response([self.to_rep(c, request) for c in County.objects.all()])


class ConstituencyListView(AreaSerializerMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = Constituency.objects.select_related("county")
        if request.query_params.get("county"):
            qs = qs.filter(county_id=request.query_params["county"])
        return Response([self.to_rep(c, request, county=c.county_id) for c in qs])


class WardListView(AreaSerializerMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = Ward.objects.select_related("constituency", "county")
        p = request.query_params
        if p.get("constituency"):
            qs = qs.filter(constituency_id=p["constituency"])
        if p.get("county"):
            qs = qs.filter(county_id=p["county"])
        if p.get("q"):
            qs = qs.filter(name__icontains=p["q"])
        qs = qs[:500]
        return Response([self.to_rep(w, request, constituency=w.constituency_id, county=w.county_id) for w in qs])


class WardDetailView(AreaSerializerMixin, generics.RetrieveAPIView):
    permission_classes = [permissions.AllowAny]
    queryset = Ward.objects.select_related("constituency", "county")

    def retrieve(self, request, *args, **kwargs):
        w = self.get_object()
        return Response(self.to_rep(w, request, constituency=w.constituency_id, county=w.county_id))


class AvailabilityCountsView(APIView):
    """Available-unit counts per area, WITHOUT any listing records or geometry.

    /geo/counts/?level=county
    /geo/counts/?level=constituency&county=<id>
    /geo/counts/?level=ward&constituency=<id>
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        level = request.query_params.get("level", "county")
        if level not in LEVELS:
            return Response({"detail": "level must be county, constituency or ward."}, status=400)
        model, group_field, parent_field = LEVELS[level]
        parent = None if level == "county" else request.query_params.get(parent_field.replace("_id", ""))
        areas = model.objects.all()
        if parent:
            areas = areas.filter(**{parent_field: parent})
        counts = dict(
            Unit.objects.public()
            .exclude(**{group_field: None})
            .values_list(group_field)
            .annotate(n=Count("id"))
            .values_list(group_field, "n")
        )
        return Response([
            {"id": a.id, "code": a.code, "name": a.name, "available_units": counts.get(a.id, 0)}
            for a in areas.only("id", "code", "name")
        ])
