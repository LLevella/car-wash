from dataclasses import dataclass
from datetime import datetime, time, timedelta

from django.utils import timezone

from cars.models import CarType
from personal.models import WashStation

from car_wash.models import (
    Booking,
    BookingAssignment,
    ResourceBlock,
    WashBox,
    WasherShift,
    WashType,
)
from car_wash.services.pricing import get_wash_duration


ACTIVE_BOOKING_STATUSES = (
    Booking.Status.PENDING,
    Booking.Status.CONFIRMED,
    Booking.Status.IN_PROGRESS,
)


@dataclass(frozen=True)
class ResourceOption:
    id: int
    name: str

    def as_dict(self):
        return {
            "id": self.id,
            "name": self.name,
        }


@dataclass(frozen=True)
class AvailableSlot:
    starts_at: datetime
    ends_at: datetime
    duration_minutes: int
    boxes: tuple[ResourceOption, ...]
    washers: tuple[ResourceOption, ...]

    def as_dict(self):
        return {
            "starts_at": self.starts_at.isoformat(),
            "ends_at": self.ends_at.isoformat(),
            "duration_minutes": self.duration_minutes,
            "boxes": [box.as_dict() for box in self.boxes],
            "washers": [washer.as_dict() for washer in self.washers],
        }


def get_available_slots(
    *,
    wash_station: WashStation,
    car_type: CarType,
    wash_type: WashType,
    day,
    step_minutes: int = 15,
    min_washers: int = 1,
) -> list[AvailableSlot]:
    duration_minutes = get_wash_duration(
        car_type=car_type,
        wash_type=wash_type,
        wash_station=wash_station,
    )

    slots = []
    cursor = _make_aware(datetime.combine(day, time.min))
    day_end = _make_aware(datetime.combine(day + timedelta(days=1), time.min))
    step = timedelta(minutes=step_minutes)
    duration = timedelta(minutes=duration_minutes)

    while cursor + duration <= day_end:
        starts_at = cursor
        ends_at = cursor + duration

        boxes, washers = get_available_resources(
            wash_station=wash_station,
            starts_at=starts_at,
            ends_at=ends_at,
        )

        if boxes and len(washers) >= min_washers:
            slots.append(
                AvailableSlot(
                    starts_at=starts_at,
                    ends_at=ends_at,
                    duration_minutes=duration_minutes,
                    boxes=tuple(boxes),
                    washers=tuple(washers),
                )
            )

        cursor += step

    return slots


def get_available_resources(
    *,
    wash_station: WashStation,
    starts_at: datetime,
    ends_at: datetime,
    exclude_booking_id: int | None = None,
) -> tuple[list[ResourceOption], list[ResourceOption]]:
    starts_at = _make_aware(starts_at)
    ends_at = _make_aware(ends_at)

    if _has_station_block(wash_station, starts_at, ends_at):
        return [], []

    return (
        _get_available_boxes(
            wash_station,
            starts_at,
            ends_at,
            exclude_booking_id=exclude_booking_id,
        ),
        _get_available_washers(
            wash_station,
            starts_at,
            ends_at,
            exclude_booking_id=exclude_booking_id,
        ),
    )


def _make_aware(value: datetime) -> datetime:
    if timezone.is_aware(value):
        return value

    return timezone.make_aware(value, timezone.get_current_timezone())


def _overlaps(starts_at: datetime, ends_at: datetime):
    return {
        "starts_at__lt": ends_at,
        "ends_at__gt": starts_at,
    }


def _has_station_block(
    wash_station: WashStation,
    starts_at: datetime,
    ends_at: datetime,
) -> bool:
    return ResourceBlock.objects.filter(
        wash_station=wash_station,
        wash_box__isnull=True,
        washer__isnull=True,
        **_overlaps(starts_at, ends_at),
    ).exists()


def _get_available_boxes(
    wash_station: WashStation,
    starts_at: datetime,
    ends_at: datetime,
    *,
    exclude_booking_id: int | None = None,
) -> list[ResourceOption]:
    occupied_bookings = Booking.objects.filter(
        wash_station=wash_station,
        status__in=ACTIVE_BOOKING_STATUSES,
        **_overlaps(starts_at, ends_at),
    )
    if exclude_booking_id is not None:
        occupied_bookings = occupied_bookings.exclude(id=exclude_booking_id)

    occupied_box_ids = occupied_bookings.values_list("wash_box_id", flat=True)
    blocked_box_ids = ResourceBlock.objects.filter(
        wash_station=wash_station,
        wash_box__isnull=False,
        **_overlaps(starts_at, ends_at),
    ).values_list("wash_box_id", flat=True)

    boxes = (
        WashBox.objects.filter(wash_station=wash_station, is_active=True)
        .exclude(id__in=occupied_box_ids)
        .exclude(id__in=blocked_box_ids)
        .order_by("name")
    )

    return [
        ResourceOption(id=box.id, name=box.name)
        for box in boxes
    ]


def _get_available_washers(
    wash_station: WashStation,
    starts_at: datetime,
    ends_at: datetime,
    *,
    exclude_booking_id: int | None = None,
) -> list[ResourceOption]:
    washer_ids_on_shift = WasherShift.objects.filter(
        wash_station=wash_station,
        is_active=True,
        starts_at__lte=starts_at,
        ends_at__gte=ends_at,
    ).values_list("washer_id", flat=True)
    occupied_assignments = BookingAssignment.objects.filter(
        booking__wash_station=wash_station,
        booking__status__in=ACTIVE_BOOKING_STATUSES,
        **{
            "booking__starts_at__lt": ends_at,
            "booking__ends_at__gt": starts_at,
        },
    )
    if exclude_booking_id is not None:
        occupied_assignments = occupied_assignments.exclude(
            booking_id=exclude_booking_id
        )

    occupied_washer_ids = occupied_assignments.values_list("washer_id", flat=True)
    blocked_washer_ids = ResourceBlock.objects.filter(
        wash_station=wash_station,
        washer__isnull=False,
        **_overlaps(starts_at, ends_at),
    ).values_list("washer_id", flat=True)

    shifts = (
        WasherShift.objects.filter(
            wash_station=wash_station,
            is_active=True,
            washer_id__in=washer_ids_on_shift,
        )
        .exclude(washer_id__in=occupied_washer_ids)
        .exclude(washer_id__in=blocked_washer_ids)
        .select_related("washer")
        .order_by("washer__surname", "washer__name")
    )

    washers_by_id = {}
    for shift in shifts:
        washers_by_id[shift.washer_id] = ResourceOption(
            id=shift.washer_id,
            name=str(shift.washer),
        )

    return list(washers_by_id.values())
