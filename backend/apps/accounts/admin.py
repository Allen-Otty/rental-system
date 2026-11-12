from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import LandlordVerification, User, VerificationDocument


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("-date_joined",)
    list_display = ("phone", "full_name", "role", "landlord_verified", "is_active")
    list_filter = ("role", "landlord_verified", "is_active")
    search_fields = ("phone", "email", "full_name")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        ("Profile", {"fields": ("full_name", "email", "language", "role", "is_phone_verified")}),
        ("Landlord", {"fields": ("landlord_verified", "commission_percent")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("phone", "role", "password1", "password2")}),)


admin.site.register(LandlordVerification)
admin.site.register(VerificationDocument)
