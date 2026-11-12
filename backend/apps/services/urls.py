from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("providers", views.ProviderViewSet, basename="provider")
router.register("quote-requests", views.QuoteRequestViewSet, basename="quote-request")
router.register("bookings", views.BookingViewSet, basename="booking")

urlpatterns = router.urls + [
    path("service-categories/", views.CategoryList.as_view()),
    path("quotes/<int:pk>/accept/", views.QuoteAccept.as_view()),
    path("provider-documents/<int:pk>/file/", views.ProviderDocumentFile.as_view()),
]
