from django.urls import path

from . import views

urlpatterns = [
    path("geo/counties/", views.CountyListView.as_view()),
    path("geo/constituencies/", views.ConstituencyListView.as_view()),
    path("geo/wards/", views.WardListView.as_view()),
    path("geo/wards/<int:pk>/", views.WardDetailView.as_view()),
    path("geo/counts/", views.AvailabilityCountsView.as_view()),
]
