from django.contrib import admin

from .models import LandDocument, LandListing


class DocInline(admin.TabularInline):
    model = LandDocument
    extra = 0


@admin.register(LandListing)
class LandListingAdmin(admin.ModelAdmin):
    list_display = ("title", "seller", "price", "size_acres", "is_verified", "status")
    list_filter = ("is_verified", "status", "title_type")
    inlines = [DocInline]
