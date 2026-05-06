"""API routes for personnel and station resources."""

from django.urls import path

from personal.views import WashStationListView


app_name = "personal"

urlpatterns = [
    path("stations/", WashStationListView.as_view(), name="station-list"),
]
