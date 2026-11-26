from rest_framework.permissions import BasePermission


def agent_of(user):
    return getattr(user, "call_agent", None) if user and user.is_authenticated else None


class IsCallCenterStaff(BasePermission):
    """Platform staff/admins only (call center agents use the existing staff role)."""

    def has_permission(self, request, view):
        u = request.user
        return bool(u and u.is_authenticated and u.is_platform_staff)


class IsSupervisor(BasePermission):
    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.is_platform_staff):
            return False
        a = agent_of(u)
        return bool(u.is_superuser or u.role == "admin" or (a and a.is_supervisor))
