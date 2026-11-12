from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role


class IsPlatformStaff(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_platform_staff)


class IsLandlord(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.role == Role.LANDLORD)


class IsPropertyManagerRole(BasePermission):
    """Landlords, agents and platform staff may write; everyone else is read-only."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        u = request.user
        return bool(u and u.is_authenticated and (u.role in (Role.LANDLORD, Role.AGENT) or u.is_platform_staff))
