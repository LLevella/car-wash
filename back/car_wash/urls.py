"""API routes for wash services and booking resources."""

from django.urls import path

from car_wash.views import (
    AvailabilityView,
    BookingCancelView,
    BookingListCreateView,
    BookingRescheduleView,
    BookingStatusView,
    WashTypeListView,
)


app_name = "car_wash"

urlpatterns = [
    path("wash-types/", WashTypeListView.as_view(), name="wash-type-list"),
    path("availability/", AvailabilityView.as_view(), name="availability"),
    path("bookings/", BookingListCreateView.as_view(), name="booking-list"),
    path(
        "bookings/<int:pk>/cancel/",
        BookingCancelView.as_view(),
        name="booking-cancel",
    ),
    path(
        "bookings/<int:pk>/reschedule/",
        BookingRescheduleView.as_view(),
        name="booking-reschedule",
    ),
    path(
        "bookings/<int:pk>/status/",
        BookingStatusView.as_view(),
        name="booking-status",
    ),
]
