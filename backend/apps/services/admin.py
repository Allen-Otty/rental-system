from django.contrib import admin

from . import models

admin.site.register(models.ServiceCategory)
admin.site.register(models.QuoteRequest)
admin.site.register(models.Quote)
admin.site.register(models.Booking)


class DocInline(admin.TabularInline):
    model = models.ProviderDocument
    extra = 0


@admin.register(models.ProviderProfile)
class ProviderAdmin(admin.ModelAdmin):
    list_display = ("business_name", "kind", "status", "created_at")
    list_filter = ("status", "kind")
    inlines = [DocInline]
