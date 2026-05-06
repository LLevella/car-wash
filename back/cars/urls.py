"""API routes for car catalog resources."""

from django.urls import path

from cars.views import CarBrandListView, CarModelListView, CarTypeListView


app_name = "cars"

urlpatterns = [
    path("brands/", CarBrandListView.as_view(), name="brand-list"),
    path("models/", CarModelListView.as_view(), name="model-list"),
    path("types/", CarTypeListView.as_view(), name="type-list"),
]
