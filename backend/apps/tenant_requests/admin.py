from django.contrib import admin

from .models import MpesaPayment, PropertyRequest


class PayInline(admin.TabularInline):
    model = MpesaPayment
    extra = 0
    readonly_fields = ("checkout_request_id", "mpesa_receipt", "status", "amount", "created_at")


@admin.register(PropertyRequest)
class PropertyRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "tenant", "goal", "status", "fee_amount", "created_at")
    list_filter = ("status", "goal")
    inlines = [PayInline]
