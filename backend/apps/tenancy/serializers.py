from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.models import Role, User
from apps.accounts.phone import normalise_phone
from apps.properties.models import Unit

from .models import (LandlordSettings, Lease, LeaseStatus, MaintenanceRequest, MaintenanceUpdate, RentInvoice, RentPayment,
                     Vendor, ViewingRequest)


class LandlordSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandlordSettings
        fields = ["collect_tenant_id_number", "collect_tenant_id_photo"]


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = ["id", "name", "trade", "phone", "notes", "is_active"]

    def validate_phone(self, value):
        try:
            return normalise_phone(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)


class LeaseSerializer(serializers.ModelSerializer):
    unit_label = serializers.CharField(source="unit.label", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    has_id_document = serializers.SerializerMethodField()

    class Meta:
        model = Lease
        fields = ["id", "unit", "unit_label", "property_name", "tenant_name", "tenant_phone", "tenant_email", "id_number",
                  "has_id_document", "start_date", "end_date", "rent_amount", "rent_due_day", "deposit_amount",
                  "deposit_paid", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def get_has_id_document(self, obj):
        return bool(obj.id_document)

    def validate_tenant_phone(self, value):
        try:
            return normalise_phone(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)

    def validate_unit(self, unit):
        request = self.context["request"]
        if self.instance is None and not Unit.objects.managed_by(request.user).filter(pk=unit.pk).exists():
            raise serializers.ValidationError("You can only create leases for units you manage.")
        if self.instance is not None and unit.pk != self.instance.unit_id:
            raise serializers.ValidationError("A lease cannot be moved to another unit.")
        return unit

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))
        if get("end_date") and get("start_date") and get("end_date") <= get("start_date"):
            raise serializers.ValidationError({"end_date": "The lease must end after it starts."})
        unit = get("unit")
        if self.instance is None and Lease.objects.filter(unit=unit, status=LeaseStatus.ACTIVE).exists():
            raise serializers.ValidationError({"unit": "This unit already has an active lease. End it first."})
        if attrs.get("id_number"):
            cfg = LandlordSettings.objects.filter(landlord=unit.property.landlord).first()
            if not (cfg and cfg.collect_tenant_id_number):
                raise serializers.ValidationError({"id_number": "This landlord's settings do not collect ID numbers."})
        return attrs

    def create(self, validated):
        # Link the lease to a tenant account when someone already signed up with this phone.
        tenant = User.objects.filter(phone=validated["tenant_phone"], role=Role.TENANT).first()
        lease = Lease.objects.create(tenant=tenant, created_by=self.context["request"].user, status=LeaseStatus.ACTIVE, **validated)
        lease.sync_unit_status()
        return lease


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentPayment
        fields = ["id", "amount", "method", "reference", "paid_on", "note", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_reference(self, value):
        value = value.strip().upper()
        if value and RentPayment.objects.filter(reference=value).exists():
            raise serializers.ValidationError("This payment reference was already recorded.")
        return value

    def validate_paid_on(self, value):
        if value > date.today():
            raise serializers.ValidationError("The payment date cannot be in the future.")
        return value

    def validate(self, attrs):
        invoice = self.context["invoice"]
        if attrs["amount"] > invoice.balance():
            raise serializers.ValidationError({"amount": f"That is more than the balance of KES {invoice.balance():,.0f}."})
        if attrs.get("method") == "mpesa" and not attrs.get("reference"):
            raise serializers.ValidationError({"reference": "Enter the M-Pesa code."})
        return attrs


class InvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="lease.tenant_name", read_only=True)
    unit_label = serializers.CharField(source="lease.unit.label", read_only=True)
    paid_amount = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    payments = PaymentSerializer(many=True, read_only=True)

    class Meta:
        model = RentInvoice
        fields = ["id", "lease", "tenant_name", "unit_label", "period", "amount", "due_date", "paid_amount", "balance", "status", "payments"]

    def get_paid_amount(self, obj):
        return str(obj.paid_total())

    def get_balance(self, obj):
        return str(obj.balance())

    def get_status(self, obj):
        return obj.state()


class UpdateSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True, default="")

    class Meta:
        model = MaintenanceUpdate
        fields = ["id", "text", "author_name", "created_at"]


class MaintenanceSerializer(serializers.ModelSerializer):
    unit_label = serializers.CharField(source="unit.label", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.full_name", read_only=True, default="")
    vendor_name = serializers.CharField(source="vendor.name", read_only=True, default=None)
    updates = UpdateSerializer(many=True, read_only=True)

    class Meta:
        model = MaintenanceRequest
        fields = ["id", "unit", "unit_label", "property_name", "title", "description", "category", "priority", "status",
                  "vendor", "vendor_name", "visit_at", "reported_by_name", "created_at", "updates"]
        read_only_fields = ["id", "created_at"]

    def get_fields(self):
        fields = super().get_fields()
        u = getattr(self.context.get("request"), "user", None)
        if u is not None and not (u.is_platform_staff or u.role in (Role.LANDLORD, Role.AGENT)):
            for f in ("vendor", "status", "visit_at"):  # tenants report problems; they never set these
                fields[f].read_only = True
        return fields


class ViewingSerializer(serializers.ModelSerializer):
    unit_label = serializers.CharField(source="unit.label", read_only=True)
    property_name = serializers.CharField(source="unit.property.name", read_only=True)
    requester_name = serializers.CharField(source="requester.full_name", read_only=True)
    requester_phone = serializers.SerializerMethodField()

    class Meta:
        model = ViewingRequest
        fields = ["id", "unit", "unit_label", "property_name", "requester_name", "requester_phone", "preferred_at", "message", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

    def get_requester_phone(self, obj):
        # The landlord side needs the number to call; the requester sees their own.
        u = self.context["request"].user
        return obj.requester.phone if (u == obj.requester or Unit.objects.managed_by(u).filter(pk=obj.unit_id).exists()) else None
