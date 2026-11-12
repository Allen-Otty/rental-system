import re

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.phone import normalise_phone
from apps.accounts.serializers import DocumentUploadSerializer
from apps.geo.models import County

from .models import (Booking, ProviderDocType, ProviderDocument, ProviderProfile, Quote, QuoteRequest, ServiceCategory)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ["id", "slug", "name_en", "name_sw", "icon"]


def _phone(value):
    try:
        return normalise_phone(value) if value else ""
    except DjangoValidationError as e:
        raise serializers.ValidationError(e.messages)


class ProviderSerializer(serializers.ModelSerializer):
    categories = serializers.SlugRelatedField(many=True, slug_field="slug", queryset=ServiceCategory.objects.filter(is_active=True), required=False)
    counties = serializers.PrimaryKeyRelatedField(many=True, queryset=County.objects.all(), required=False)
    documents = serializers.SerializerMethodField()

    class Meta:
        model = ProviderProfile
        fields = ["id", "kind", "business_name", "kra_pin", "registration_number", "phone", "whatsapp", "bio", "categories", "counties",
                  "price_from", "status", "rejection_reason", "documents"]
        read_only_fields = ["id", "status", "rejection_reason"]

    def validate_phone(self, v):
        return _phone(v)

    def validate_whatsapp(self, v):
        return _phone(v)

    def get_documents(self, obj):
        # Document types only; the files themselves stay private.
        r = self.context.get("request")
        owner_or_staff = r and r.user.is_authenticated and (r.user.is_platform_staff or r.user.id == obj.user_id)
        return list(obj.documents.values("id", "doc_type", "uploaded_at")) if owner_or_staff else []

    def to_representation(self, obj):
        data = super().to_representation(obj)
        r = self.context.get("request")
        if not (r and r.user.is_authenticated and (r.user.is_platform_staff or r.user.id == obj.user_id)):
            for k in ("kra_pin", "registration_number", "rejection_reason"):  # private business details
                data.pop(k, None)
        return data


class ProviderDocUploadSerializer(DocumentUploadSerializer):
    doc_type = serializers.ChoiceField(choices=ProviderDocType.choices)


class QuoteSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.business_name", read_only=True)
    provider_phone = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = ["id", "request", "provider", "provider_name", "provider_phone", "price", "message", "status", "created_at"]
        read_only_fields = ["id", "request", "provider", "status", "created_at"]

    def get_provider_phone(self, obj):
        # Only the customer who asked (once quoted) and the provider see the number.
        u = self.context["request"].user
        return obj.provider.phone if u.id in (obj.request.requester_id, obj.provider.user_id) else None


class QuoteRequestSerializer(serializers.ModelSerializer):
    category = serializers.SlugRelatedField(slug_field="slug", queryset=ServiceCategory.objects.filter(is_active=True))
    provider = serializers.PrimaryKeyRelatedField(queryset=ProviderProfile.objects.filter(status="approved"), required=False, allow_null=True)
    quotes_count = serializers.IntegerField(source="quotes.count", read_only=True)

    class Meta:
        model = QuoteRequest
        fields = ["id", "category", "provider", "county", "from_place", "to_place", "description", "preferred_date", "budget", "is_open", "quotes_count", "created_at"]
        read_only_fields = ["id", "is_open", "created_at"]

    def validate_preferred_date(self, v):
        from datetime import date

        if v and v < date.today():
            raise serializers.ValidationError("Pick a date from today onwards.")
        return v

    def validate(self, attrs):
        if attrs["category"].slug == "movers" and not (attrs.get("from_place") and attrs.get("to_place")):
            raise serializers.ValidationError("Movers need to know where you are moving from and to.")
        prov = attrs.get("provider")
        if prov and not prov.categories.filter(pk=attrs["category"].pk).exists():
            raise serializers.ValidationError({"provider": "This provider does not offer that service."})
        return attrs


class BookingSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="provider.business_name", read_only=True)
    category = serializers.CharField(source="quote.request.category.slug", read_only=True)

    class Meta:
        model = Booking
        fields = ["id", "provider", "provider_name", "category", "price", "scheduled_for", "status", "created_at"]
        read_only_fields = ["id", "provider", "price", "created_at"]
