import json
import re

from django.conf import settings
from django.contrib.gis.geos import GEOSGeometry, Point, Polygon
from rest_framework import serializers

from apps.accounts.models import Role
from apps.accounts.phone import normalise_phone

from .models import (MANUAL_STATUSES, AgentInvite, Property, PropertyType, SavedSearch, Unit, UnitMedia,
                     UnitStatus)


def validate_kenya_point(lat, lng):
    b = settings.KENYA_BBOX
    if not (b["min_lat"] <= lat <= b["max_lat"] and b["min_lng"] <= lng <= b["max_lng"]):
        raise serializers.ValidationError(
            "Coordinates are outside Kenya. Check that latitude and longitude are not swapped."
        )


class PropertySerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    constituency_name = serializers.CharField(source="constituency.name", read_only=True, default=None)
    ward_name = serializers.CharField(source="ward.name", read_only=True, default=None)
    unit_count = serializers.IntegerField(source="units.count", read_only=True)
    landlord = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Property
        fields = ["id", "landlord", "name", "property_type", "description", "estate", "landmark", "address_text",
                  "latitude", "longitude", "county", "county_name", "constituency", "constituency_name",
                  "ward", "ward_name", "unit_count", "created_at"]
        read_only_fields = ["county", "constituency", "ward", "created_at"]

    def to_representation(self, instance):
        d = super().to_representation(instance)
        d["latitude"], d["longitude"] = instance.location.y, instance.location.x
        return d

    def validate(self, attrs):
        lat = attrs.get("latitude", getattr(self.instance, "latitude", None) if self.instance else None)
        lng = attrs.get("longitude", getattr(self.instance, "longitude", None) if self.instance else None)
        if lat is not None and lng is not None:
            validate_kenya_point(lat, lng)
        if self.instance and "property_type" in attrs and attrs["property_type"] == PropertyType.HOUSE \
                and self.instance.units.count() > 1:
            raise serializers.ValidationError({"property_type": "A standalone house can have only one unit."})
        return attrs

    def _apply_location(self, validated):
        lat, lng = validated.pop("latitude", None), validated.pop("longitude", None)
        if lat is not None and lng is not None:
            validated["location"] = Point(lng, lat, srid=4326)
        return validated

    def create(self, validated):
        return super().create(self._apply_location(validated))

    def update(self, instance, validated):
        return super().update(instance, self._apply_location(validated))


class UnitMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitMedia
        fields = ["id", "public_id", "url", "kind", "width", "height", "bytes", "position", "is_cover"]

    def validate_url(self, value):
        if not value.startswith("https://"):
            raise serializers.ValidationError("Media URLs must use https.")
        cloud = settings.CLOUDINARY_CLOUD_NAME
        if cloud and not value.startswith(f"https://res.cloudinary.com/{cloud}/"):
            raise serializers.ValidationError("Media must be uploaded to this platform's Cloudinary account.")
        return value


class UnitSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source="property.name", read_only=True)
    property_type = serializers.CharField(source="property.property_type", read_only=True)
    estate = serializers.CharField(source="property.estate", read_only=True)
    landmark = serializers.CharField(source="property.landmark", read_only=True)
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    county_name = serializers.CharField(source="property.county.name", read_only=True, default=None)
    constituency_name = serializers.CharField(source="property.constituency.name", read_only=True, default=None)
    ward_name = serializers.CharField(source="property.ward.name", read_only=True, default=None)
    distance_km = serializers.SerializerMethodField()
    media = UnitMediaSerializer(many=True, read_only=True)

    class Meta:
        model = Unit
        fields = ["id", "property", "property_name", "property_type", "estate", "landmark", "latitude", "longitude",
                  "county_name", "constituency_name", "ward_name", "label", "unit_type", "bedrooms", "bathrooms",
                  "rent_amount", "deposit_amount", "status", "amenities", "description", "is_active",
                  "distance_km", "media", "created_at"]
        read_only_fields = ["created_at"]

    def get_latitude(self, obj):
        return obj.property.location.y

    def get_longitude(self, obj):
        return obj.property.location.x

    def get_distance_km(self, obj):
        d = getattr(obj, "distance", None)
        return round(d.km, 2) if d is not None else None

    def validate_status(self, value):
        if value not in MANUAL_STATUSES:
            raise serializers.ValidationError(
                "Only 'available' or 'occupied' can be set manually; other states are set by bookings."
            )
        return value

    def validate_amenities(self, value):
        from .amenities import RENTAL_KEYS, clean_keys

        try:
            return clean_keys(value, RENTAL_KEYS)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate(self, attrs):
        request = self.context["request"]
        if self.instance is None:
            prop = attrs["property"]
            if not prop.can_be_managed_by(request.user):
                raise serializers.ValidationError({"property": "You cannot manage this property."})
            if prop.property_type == PropertyType.HOUSE and prop.units.exists():
                raise serializers.ValidationError({"property": "A standalone house can have only one unit."})
        elif "property" in attrs and attrs["property"].pk != self.instance.property_id:
            raise serializers.ValidationError({"property": "A unit cannot be moved to another property."})
        return attrs


class AgentInviteSerializer(serializers.ModelSerializer):
    phone = serializers.CharField()
    property_name = serializers.CharField(source="property.name", read_only=True)

    class Meta:
        model = AgentInvite
        fields = ["id", "property", "property_name", "phone", "status", "expires_at", "token"]
        read_only_fields = ["property", "status", "expires_at", "token"]

    def validate_phone(self, value):
        from django.core.exceptions import ValidationError

        try:
            return normalise_phone(value)
        except ValidationError as e:
            raise serializers.ValidationError(e.messages)


class SavedSearchSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(write_only=True, required=False)
    longitude = serializers.FloatField(write_only=True, required=False)
    polygon_geojson = serializers.JSONField(write_only=True, required=False)
    center_lat = serializers.SerializerMethodField()
    center_lng = serializers.SerializerMethodField()

    class Meta:
        model = SavedSearch
        fields = ["id", "name", "kind", "latitude", "longitude", "center_lat", "center_lng", "radius_km",
                  "county", "constituency", "ward", "polygon_geojson", "min_rent", "max_rent", "min_bedrooms",
                  "unit_types", "channels", "consent_given", "consent_at", "is_active", "created_at"]
        read_only_fields = ["consent_at", "created_at"]

    def get_center_lat(self, obj):
        return obj.center.y if obj.center else None

    def get_center_lng(self, obj):
        return obj.center.x if obj.center else None

    def validate_channels(self, value):
        valid = {c.value for c in SavedSearch.Channel}
        if not isinstance(value, list) or not set(value) <= valid:
            raise serializers.ValidationError(f"Channels must be a list of: {', '.join(sorted(valid))}.")
        return sorted(set(value))

    def validate_unit_types(self, value):
        from .models import UnitType

        valid = {u.value for u in UnitType}
        if not isinstance(value, list) or not set(value) <= valid:
            raise serializers.ValidationError("Unknown unit type.")
        return value

    def _polygon(self, raw):
        try:
            geom = GEOSGeometry(json.dumps(raw) if not isinstance(raw, str) else raw, srid=4326)
        except Exception:
            raise serializers.ValidationError({"polygon_geojson": "Invalid GeoJSON polygon."})
        if not isinstance(geom, Polygon):
            raise serializers.ValidationError({"polygon_geojson": "Must be a single GeoJSON Polygon."})
        if not geom.valid:
            raise serializers.ValidationError({"polygon_geojson": "Polygon is self-intersecting."})
        if geom.num_coords > 200:
            raise serializers.ValidationError({"polygon_geojson": "Polygon has too many points (max 200)."})
        minx, miny, maxx, maxy = geom.extent
        if (maxx - minx) > 3 or (maxy - miny) > 3:
            raise serializers.ValidationError({"polygon_geojson": "Area is too large."})
        for x, y in geom.exterior_ring.coords:
            validate_kenya_point(y, x)
        return geom

    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs.get(k, getattr(inst, k, None) if inst else None)  # noqa: E731
        kind = get("kind")
        if kind == SavedSearch.Kind.RADIUS:
            lat, lng, radius = attrs.get("latitude"), attrs.get("longitude"), get("radius_km")
            if inst is None and (lat is None or lng is None):
                raise serializers.ValidationError("Radius searches need latitude and longitude.")
            if radius is None or not (0 < radius <= 50):
                raise serializers.ValidationError({"radius_km": "Radius must be between 0 and 50 km."})
            if lat is not None:
                validate_kenya_point(lat, lng)
                attrs["center"] = Point(lng, lat, srid=4326)
        elif kind == SavedSearch.Kind.AREA:
            if not (get("ward") or get("constituency") or get("county")):
                raise serializers.ValidationError("Choose a county, constituency or ward.")
        elif kind == SavedSearch.Kind.POLYGON:
            if "polygon_geojson" in attrs:
                attrs["polygon"] = self._polygon(attrs["polygon_geojson"])
            elif inst is None:
                raise serializers.ValidationError({"polygon_geojson": "A polygon is required."})
        attrs.pop("latitude", None)
        attrs.pop("longitude", None)
        attrs.pop("polygon_geojson", None)

        channels = attrs.get("channels", getattr(inst, "channels", []) if inst else [])
        consent = attrs.get("consent_given", getattr(inst, "consent_given", False) if inst else False)
        active = attrs.get("is_active", getattr(inst, "is_active", True) if inst else True)
        if channels and not consent:
            raise serializers.ValidationError(
                {"consent_given": "Consent is required before alerts can be sent on these channels."}
            )
        if "email" in channels and not self.context["request"].user.email:
            raise serializers.ValidationError({"channels": "Add an email address to your account to get email alerts."})
        if active and channels and not consent:
            raise serializers.ValidationError({"consent_given": "Consent is required."})
        return attrs
