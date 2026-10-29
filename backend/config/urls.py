from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"status": "ok"})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", health),
    path("api/v1/", include("apps.accounts.urls")),
    path("api/v1/", include("apps.geo.urls")),
    path("api/v1/", include("apps.properties.urls")),
]
