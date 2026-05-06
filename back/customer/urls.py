"""API routes for customer resources."""

from django.urls import path

from customer.views import CurrentCustomerView, CustomerCarListView


app_name = "customer"

urlpatterns = [
    path("cars/", CustomerCarListView.as_view(), name="car-list"),
    path("me/", CurrentCustomerView.as_view(), name="me"),
]
