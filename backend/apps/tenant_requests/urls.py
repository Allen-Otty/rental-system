from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("requests", views.PropertyRequestViewSet, basename="property-request")

urlpatterns = router.urls + [
    path("payments/mpesa/callback/<str:secret>/", views.MpesaCallbackView.as_view()),
]
