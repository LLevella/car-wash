"""Manager API routes for schedule planning resources."""

from django.urls import path

from car_wash.manager_views import (
    ManagerBookingAssignView,
    ManagerBookingDetailView,
    ManagerBookingListView,
    ManagerBookingStatusView,
    ManagerResourceBlockListCreateView,
    ManagerScheduleView,
    ManagerShiftListCreateView,
)


app_name = "manager"

urlpatterns = [
    path("schedule/", ManagerScheduleView.as_view(), name="schedule"),
    path("bookings/", ManagerBookingListView.as_view(), name="booking-list"),
    path(
        "bookings/<int:pk>/",
        ManagerBookingDetailView.as_view(),
        name="booking-detail",
    ),
    path(
        "bookings/<int:pk>/assign/",
        ManagerBookingAssignView.as_view(),
        name="booking-assign",
    ),
    path(
        "bookings/<int:pk>/status/",
        ManagerBookingStatusView.as_view(),
        name="booking-status",
    ),
    path("shifts/", ManagerShiftListCreateView.as_view(), name="shift-list"),
    path(
        "resource-blocks/",
        ManagerResourceBlockListCreateView.as_view(),
        name="resource-block-list",
    ),
]
