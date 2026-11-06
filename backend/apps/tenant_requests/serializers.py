from django.conf import settings
from django.contrib.gis.geos import Point
from rest_framework import serializers

from apps.accounts.serializers import PhoneField
from apps.properties.amenities import RENTAL_KEYS, clean_keys
from apps.properties.models import UnitType
from apps.properties.serializers import validate_kenya_point

from .models import Channel, MpesaPayment, PropertyRequest


class PropertyRequestSerializer(serializers.ModelSerializer):
    latitude = serializers.FloatField(min_value=-90, max_value=90, required=False, write_only=True)
    longitude = serializers.FloatField(min_value=-180, max_value=180, required=False, write_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True, default=None)
    ward_name = serializers.CharField(source="ward.name", read_only=True, default=None)

    class Meta:
        model = PropertyRequest
        fields = ["id", "goal", "county", "constituency", "ward", "county_name", "ward_name", "area_text", "landmark",
                  "latitude", "longitude", "radius_km", "unit_types", "min_rent", "max_rent", "amenities", "notes",
                  "alert_channels", "status", "fee_amount", "created_at", "activated_at", "expires_at"]
        read_only_fields = ["id", "status", "fee_amount", "created_at", "activated_at", "expires_at"]

    def validate_amenities(self, value):
        try:
            return clean_keys(value, RENTAL_KEYS)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_unit_types(self, value):
        try:
            return clean_keys(value, set(UnitType.values), "Unit types")
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_alert_channels(self, value):
        try:
            return clean_keys(value, set(Channel.values), "Alert channels")
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate_radius_km(self, value):
        if not 1 <= value <= 50:
            raise serializers.ValidationError("Radius must be between 1 and 50 km.")
        return value

    def validate(self, attrs):
        if attrs.get("min_rent") is not None and attrs.get("max_rent") is not None and attrs["min_rent"] > attrs["max_rent"]:
            raise serializers.ValidationError({"max_rent": "Maximum must be at least the minimum."})
        has_pin = "latitude" in attrs and "longitude" in attrs
        if ("latitude" in attrs) != ("longitude" in attrs):
            raise serializers.ValidationError("Send both latitude and longitude, or neither.")
        if has_pin:
            validate_kenya_point(attrs["latitude"], attrs["longitude"])
        if not any(attrs.get(k) for k in ("ward", "constituency", "county", "area_text")) and not has_pin:
            raise serializers.ValidationError("Tell us where you want to live: a ward, county, area name or a map pin.")
        return attrs

    def create(self, validated):
        lat, lng = validated.pop("latitude", None), validated.pop("longitude", None)
        if lat is not None:
            validated["location"] = Point(lng, lat, srid=4326)
        # derive the wider areas from the most specific one given
        if validated.get("ward"):
            validated["constituency"], validated["county"] = validated["ward"].constituency, validated["ward"].county
        elif validated.get("constituency"):
            validated["county"] = validated["constituency"].county
        validated["fee_amount"] = settings.REQUEST_FEE_KES  # set here so clients can never choose it
        return super().create(validated)


class PaySerializer(serializers.Serializer):
    phone = PhoneField(required=False)


class PaymentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = MpesaPayment
        fields = ["id", "status", "amount", "mpesa_receipt", "result_desc", "created_at", "completed_at"]
