from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("properties", views.PropertyViewSet, basename="property")
router.register("units", views.UnitViewSet, basename="unit")
router.register("saved-searches", views.SavedSearchViewSet, basename="saved-search")

urlpatterns = router.urls + [
    path("amenities/", views.AmenityCatalogView.as_view()),
    path("media/cloudinary-signature/", views.CloudinarySignatureView.as_view()),
    path("agent-invites/mine/", views.MyAgentInvitesView.as_view()),
    path("agent-invites/<str:token>/accept/", views.AcceptAgentInviteView.as_view()),
]
