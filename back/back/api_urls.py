"""Top-level API routes for the car wash backend."""

from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
from rest_framework.routers import DefaultRouter


app_name = "api"

router = DefaultRouter()

urlpatterns = [
    path("", include(router.urls)),
    path("auth/", include("back.auth_urls")),
    path("cars/", include("cars.urls")),
    path("customers/", include("customer.urls")),
    path("personal/", include("personal.urls")),
    path("car-wash/", include("car_wash.urls")),
    path("manager/", include("car_wash.manager_urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "schema/swagger/",
        SpectacularSwaggerView.as_view(url_name="api:schema"),
        name="schema-swagger",
    ),
    path(
        "schema/redoc/",
        SpectacularRedocView.as_view(url_name="api:schema"),
        name="schema-redoc",
    ),
]
