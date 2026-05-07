"""API routes for customer resources."""

from django.urls import path

from customer.views import (
    CurrentCustomerView,
    CustomerCarDetailView,
    CustomerCarListView,
)


app_name = "customer"

urlpatterns = [
    path("cars/", CustomerCarListView.as_view(), name="car-list"),
    path("cars/<int:pk>/", CustomerCarDetailView.as_view(), name="car-detail"),
    path("me/", CurrentCustomerView.as_view(), name="me"),
]
