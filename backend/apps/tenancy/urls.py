from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("leases", views.LeaseViewSet, basename="lease")
router.register("invoices", views.InvoiceViewSet, basename="invoice")
router.register("repairs", views.MaintenanceViewSet, basename="repair")
router.register("vendors", views.VendorViewSet, basename="vendor")
router.register("viewings", views.ViewingViewSet, basename="viewing")

urlpatterns = router.urls + [
    path("me/landlord-settings/", views.LandlordSettingsView.as_view()),
    path("dashboard/landlord/", views.LandlordDashboardView.as_view()),
]
