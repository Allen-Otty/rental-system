from django.conf import settings
from django.contrib.gis.geos import Point
from rest_framework import serializers

from apps.accounts.serializers import DocumentUploadSerializer
from apps.properties.amenities import LAND_KEYS, clean_keys
from apps.properties.serializers import validate_kenya_point

from .models import LandDocType, LandDocument, LandListing, LandStatus

# Changing any of these on a verified listing sends it back for re-checking.
RECHECK_FIELDS = ("size_value", "size_unit", "plot_width_ft", "plot_length_ft", "plot_count", "title_type")


class LandListingSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    constituency_name = serializers.CharField(source="constituency.name", read_only=True, default=None)
    ward_name = serializers.CharField(source="ward.name", read_only=True, default=None)
    seller_name = serializers.CharField(source="seller.full_name", read_only=True)
    seller_phone = serializers.SerializerMethodField()
    documents_count = serializers.IntegerField(source="documents.count", read_only=True)

    class Meta:
        model = LandListing
        fields = ["id", "title", "description", "estate", "landmark", "address_text", "latitude", "longitude",
                  "county_name", "constituency_name", "ward_name", "size_value", "size_unit", "plot_width_ft",
                  "plot_length_ft", "plot_count", "size_acres", "price", "price_negotiable", "title_type",
                  "features", "status", "is_verified", "verified_at", "documents_count", "seller_name",
                  "seller_phone", "created_at"]
        read_only_fields = ["id", "size_acres", "is_verified", "verified_at", "created_at"]

    def get_seller_phone(self, obj):
        # Only signed-in users see contact details (limits scraping of seller numbers).
        request = self.context.get("request")
        return obj.seller.phone if request and request.user.is_authenticated else None

    def validate_features(self, value):
        try:
            return clean_keys(value, LAND_KEYS, "Features")
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_status(self, value):
        if value not in (LandStatus.PUBLISHED, LandStatus.SOLD, LandStatus.REMOVED):
            raise serializers.ValidationError("Invalid status.")
        return value

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))
        has_area = bool(get("size_value") and get("size_unit"))
        has_plot = bool(get("plot_width_ft") and get("plot_length_ft"))
        if not (has_area or has_plot):
            raise serializers.ValidationError(
                "Give the land size in acres/hectares, or as a plot size (width x length in feet)."
            )
        if self.instance is None and ("latitude" not in attrs or "longitude" not in attrs):
            raise serializers.ValidationError("Drop a pin: latitude and longitude are required.")
        if "latitude" in attrs or "longitude" in attrs:
            lat = attrs.get("latitude", self.instance.latitude if self.instance else None)
            lng = attrs.get("longitude", self.instance.longitude if self.instance else None)
            validate_kenya_point(lat, lng)
        return attrs

    def _with_point(self, validated):
        lat, lng = validated.pop("latitude", None), validated.pop("longitude", None)
        if lat is not None and lng is not None:
            validated["location"] = Point(lng, lat, srid=4326)
        return validated

    def create(self, validated):
        return super().create(self._with_point(validated))

    def update(self, instance, validated):
        request = self.context["request"]
        changed = [f for f in RECHECK_FIELDS if f in validated and validated[f] != getattr(instance, f)]
        validated = self._with_point(validated)
        if "location" in validated and instance.location.distance(validated["location"]) > 0:
            changed.append("location")
        if changed and instance.is_verified and not request.user.is_platform_staff:
            validated["is_verified"] = False
            validated["verified_at"] = None
            validated["verified_by"] = None
        return super().update(instance, validated)


class LandDocumentUploadSerializer(DocumentUploadSerializer):
    doc_type = serializers.ChoiceField(choices=LandDocType.choices)


class LandDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandDocument
        fields = ["id", "doc_type", "uploaded_at"]
