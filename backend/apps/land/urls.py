from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("land", views.LandViewSet, basename="land")

urlpatterns = router.urls + [
    path("land-documents/<int:pk>/file/", views.LandDocumentFileView.as_view()),
]
