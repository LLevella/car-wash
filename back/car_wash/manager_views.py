from collections import defaultdict
from datetime import datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.views import APIView

from back.api import error_response, success_response, validation_error_response
from personal.models import Washer, WashStation

from car_wash.models import Booking, ResourceBlock, WashBox, WasherShift
from car_wash.permissions import (
    IsManager,
    can_access_station,
    restrict_queryset_to_accessible_stations,
)
from car_wash.services.availability import ACTIVE_BOOKING_STATUSES
from car_wash.services.booking import (
    BookingError,
    assign_booking_resources,
    change_booking_status,
)
from car_wash.views import _booking_payload


SCHEDULE_DEFAULT_STEP_MINUTES = 30


class StationAccessError(PermissionError):
    """Raised when a manager has no access to the requested station."""


class ManagerScheduleView(APIView):
    permission_classes = (IsManager,)

    def get(self, request):
        try:
            wash_station, day = _get_station_and_day(request)
        except ValueError as exc:
            return error_response(
                str(exc),
                field_errors=_station_day_field_errors(request),
                code="validation_error",
            )
        except StationAccessError:
            return _station_access_denied_response()

        day_start, day_end = _day_bounds(day)

        bookings = _manager_bookings_queryset().filter(
            wash_station=wash_station,
            starts_at__lt=day_end,
            ends_at__gt=day_start,
        )
        boxes = WashBox.objects.filter(wash_station=wash_station).order_by("name")
        shifts = (
            WasherShift.objects.filter(
                wash_station=wash_station,
                starts_at__lt=day_end,
                ends_at__gt=day_start,
            )
            .select_related("washer")
            .order_by("starts_at", "washer__surname", "washer__name")
        )
        blocks = (
            ResourceBlock.objects.filter(
                wash_station=wash_station,
                starts_at__lt=day_end,
                ends_at__gt=day_start,
            )
            .select_related("wash_box", "washer")
            .order_by("starts_at")
        )

        ordered_bookings = list(
            bookings.order_by("starts_at", "wash_box__name")
        )

        return success_response(
            {
                "station": wash_station.id,
                "date": day.isoformat(),
                "day_starts_at": day_start.isoformat(),
                "day_ends_at": day_end.isoformat(),
                "step_minutes": SCHEDULE_DEFAULT_STEP_MINUTES,
                "boxes": [_box_payload(box) for box in boxes],
                "shifts": [_shift_payload(shift) for shift in shifts],
                "resource_blocks": [
                    _resource_block_payload(block)
                    for block in blocks
                ],
                "bookings": [_booking_payload(booking) for booking in ordered_bookings],
                "summary": _schedule_summary(
                    bookings=ordered_bookings,
                    day_start=day_start,
                    day_end=day_end,
                ),
            }
        )


class ManagerBookingDetailView(APIView):
    permission_classes = (IsManager,)

    @extend_schema(operation_id="manager_booking_retrieve")
    def get(self, request, pk):
        booking = get_object_or_404(_manager_bookings_queryset(), pk=pk)

        if not can_access_station(request.user, booking.wash_station):
            return _station_access_denied_response()

        return success_response(_booking_payload(booking))


class ManagerBookingListView(APIView):
    permission_classes = (IsManager,)

    def get(self, request):
        bookings = restrict_queryset_to_accessible_stations(
            _manager_bookings_queryset(),
            request.user,
            station_field="wash_station",
        ).order_by("-starts_at")
        station_id = request.query_params.get("station")
        status_value = request.query_params.get("status")
        box_id = request.query_params.get("box")
        washer_id = request.query_params.get("washer")
        day = parse_date(request.query_params.get("date", ""))

        if station_id:
            wash_station = get_object_or_404(WashStation, pk=station_id)
            if not can_access_station(request.user, wash_station):
                return _station_access_denied_response()
            bookings = bookings.filter(wash_station=wash_station)
        if status_value:
            bookings = bookings.filter(status=status_value)
        if box_id:
            bookings = bookings.filter(wash_box_id=box_id)
        if washer_id:
            bookings = bookings.filter(assignments__washer_id=washer_id)
        if day:
            day_start, day_end = _day_bounds(day)
            bookings = bookings.filter(starts_at__lt=day_end, ends_at__gt=day_start)

        return success_response(
            [
                _booking_payload(booking)
                for booking in bookings.distinct()
            ]
        )


class ManagerBookingAssignView(APIView):
    permission_classes = (IsManager,)

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        if not can_access_station(request.user, booking.wash_station):
            return _station_access_denied_response()

        try:
            wash_box = _get_optional_wash_box(request.data.get("wash_box"))
            washers = _get_required_washers(request.data.get("washers"))
            booking = assign_booking_resources(
                booking=booking,
                wash_box=wash_box,
                washers=washers,
            )
        except (BookingError, ValueError) as exc:
            return error_response(
                str(exc),
                field_errors=_assignment_field_errors(exc),
                code="validation_error",
            )

        return success_response(_booking_payload(booking))


class ManagerBookingStatusView(APIView):
    permission_classes = (IsManager,)

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        if not can_access_station(request.user, booking.wash_station):
            return _station_access_denied_response()

        try:
            booking = change_booking_status(
                booking=booking,
                status=request.data.get("status"),
            )
        except BookingError as exc:
            return error_response(
                str(exc),
                field_errors={"status": [str(exc)]},
                code="validation_error",
            )

        return success_response(_booking_payload(booking))


class ManagerShiftListCreateView(APIView):
    permission_classes = (IsManager,)

    def get(self, request):
        shifts = restrict_queryset_to_accessible_stations(
            WasherShift.objects.select_related("washer", "wash_station"),
            request.user,
            station_field="wash_station",
        ).order_by("-starts_at")
        station_id = request.query_params.get("station")
        day = parse_date(request.query_params.get("date", ""))

        if station_id:
            wash_station = get_object_or_404(WashStation, pk=station_id)
            if not can_access_station(request.user, wash_station):
                return _station_access_denied_response()
            shifts = shifts.filter(wash_station=wash_station)
        if day:
            day_start, day_end = _day_bounds(day)
            shifts = shifts.filter(starts_at__lt=day_end, ends_at__gt=day_start)

        return success_response([_shift_payload(shift) for shift in shifts])

    def post(self, request):
        try:
            wash_station = get_object_or_404(
                WashStation,
                pk=request.data.get("wash_station"),
            )
            if not can_access_station(request.user, wash_station):
                return _station_access_denied_response()

            shift = WasherShift(
                washer=get_object_or_404(Washer, pk=request.data.get("washer")),
                wash_station=wash_station,
                starts_at=_parse_required_datetime(
                    request.data.get("starts_at"),
                    field_name="starts_at",
                ),
                ends_at=_parse_required_datetime(
                    request.data.get("ends_at"),
                    field_name="ends_at",
                ),
                is_active=request.data.get("is_active", True),
            )
            shift.full_clean()
            shift.save()
        except ValidationError as exc:
            return validation_error_response(exc)
        except ValueError as exc:
            return _datetime_error_response(exc)

        return success_response(
            _shift_payload(shift),
            status_code=status.HTTP_201_CREATED,
        )


class ManagerResourceBlockListCreateView(APIView):
    permission_classes = (IsManager,)

    def get(self, request):
        blocks = restrict_queryset_to_accessible_stations(
            ResourceBlock.objects.select_related("wash_station", "wash_box", "washer"),
            request.user,
            station_field="wash_station",
        ).order_by("-starts_at")
        station_id = request.query_params.get("station")
        day = parse_date(request.query_params.get("date", ""))

        if station_id:
            wash_station = get_object_or_404(WashStation, pk=station_id)
            if not can_access_station(request.user, wash_station):
                return _station_access_denied_response()
            blocks = blocks.filter(wash_station=wash_station)
        if day:
            day_start, day_end = _day_bounds(day)
            blocks = blocks.filter(starts_at__lt=day_end, ends_at__gt=day_start)

        return success_response([_resource_block_payload(block) for block in blocks])

    def post(self, request):
        try:
            wash_station = get_object_or_404(
                WashStation,
                pk=request.data.get("wash_station"),
            )
            if not can_access_station(request.user, wash_station):
                return _station_access_denied_response()

            block = ResourceBlock(
                wash_station=wash_station,
                wash_box=_get_optional_wash_box(request.data.get("wash_box")),
                washer=_get_optional_washer(request.data.get("washer")),
                starts_at=_parse_required_datetime(
                    request.data.get("starts_at"),
                    field_name="starts_at",
                ),
                ends_at=_parse_required_datetime(
                    request.data.get("ends_at"),
                    field_name="ends_at",
                ),
                reason=request.data.get("reason", ""),
            )
            block.full_clean()
            block.save()
        except ValidationError as exc:
            return validation_error_response(exc)
        except ValueError as exc:
            return _datetime_error_response(exc)

        return success_response(
            _resource_block_payload(block),
            status_code=status.HTTP_201_CREATED,
        )


def _manager_bookings_queryset():
    return Booking.objects.select_related(
        "customer",
        "car",
        "wash_station",
        "wash_box",
        "wash_type",
    ).prefetch_related("assignments__washer")


def _get_station_and_day(request):
    station_id = request.query_params.get("station")
    day = parse_date(request.query_params.get("date", ""))

    if not station_id or day is None:
        raise ValueError("Параметры station и date обязательны.")

    wash_station = get_object_or_404(WashStation, pk=station_id)
    if not can_access_station(request.user, wash_station):
        raise StationAccessError

    return wash_station, day


def _station_day_field_errors(request):
    field_errors = {}
    if not request.query_params.get("station"):
        field_errors["station"] = ["Укажите станцию."]

    date_value = request.query_params.get("date", "")
    if not date_value:
        field_errors["date"] = ["Укажите дату."]
    elif parse_date(date_value) is None:
        field_errors["date"] = ["Дата должна быть в формате YYYY-MM-DD."]

    return field_errors


def _day_bounds(day):
    day_start = timezone.make_aware(
        datetime.combine(day, time.min),
        timezone.get_current_timezone(),
    )
    day_end = day_start + timedelta(days=1)
    return day_start, day_end


def _parse_required_datetime(value, *, field_name):
    parsed = parse_datetime(value or "")
    if parsed is None:
        raise ValueError(f"Поле {field_name} обязательно в ISO-формате.")

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())

    return parsed


def _datetime_error_response(exc):
    message = str(exc)
    field_name = "starts_at" if "starts_at" in message else "ends_at"
    return error_response(
        message,
        field_errors={field_name: [message]},
        code="validation_error",
    )


def _station_access_denied_response():
    return error_response(
        "Нет доступа к этой станции.",
        code="station_access_denied",
        status_code=status.HTTP_403_FORBIDDEN,
    )


def _assignment_field_errors(exc):
    message = str(exc)
    if "washer" in message or "мойщик" in message or "мойщиков" in message:
        return {"washers": [message]}

    return {}


def _get_optional_wash_box(value):
    if not value:
        return None

    return get_object_or_404(WashBox, pk=value)


def _get_optional_washer(value):
    if not value:
        return None

    return get_object_or_404(Washer, pk=value)


def _get_required_washers(value):
    if value is None:
        raise BookingError("Поле washers обязательно.")

    washer_ids = value if isinstance(value, list) else [value]
    washers = list(Washer.objects.filter(id__in=washer_ids))

    if len(washers) != len(set(map(int, washer_ids))):
        raise BookingError("Один или несколько мойщиков не найдены.")

    return washers


def _schedule_summary(*, bookings, day_start, day_end):
    """Aggregate per-box and per-washer minutes for the requested day so the
    frontend can render load indicators without recomputing intervals on
    each render. Cancelled/completed/no-show bookings are excluded — they do
    not represent actual workload."""

    busy_box_minutes: dict[int, int] = defaultdict(int)
    busy_washer_minutes: dict[int, int] = defaultdict(int)
    active_count = 0

    for booking in bookings:
        if booking.status not in ACTIVE_BOOKING_STATUSES:
            continue

        active_count += 1
        clipped_start = max(booking.starts_at, day_start)
        clipped_end = min(booking.ends_at, day_end)
        if clipped_end <= clipped_start:
            continue

        delta_minutes = int((clipped_end - clipped_start).total_seconds() // 60)
        busy_box_minutes[booking.wash_box_id] += delta_minutes
        for assignment in booking.assignments.all():
            busy_washer_minutes[assignment.washer_id] += delta_minutes

    return {
        "total_bookings": len(bookings),
        "active_bookings": active_count,
        "busy_box_minutes": [
            {"wash_box": box_id, "minutes": minutes}
            for box_id, minutes in sorted(busy_box_minutes.items())
        ],
        "busy_washer_minutes": [
            {"washer": washer_id, "minutes": minutes}
            for washer_id, minutes in sorted(busy_washer_minutes.items())
        ],
    }


def _box_payload(box):
    return {
        "id": box.id,
        "name": box.name,
        "is_active": box.is_active,
    }


def _shift_payload(shift):
    return {
        "id": shift.id,
        "washer": shift.washer_id,
        "washer_name": str(shift.washer),
        "wash_station": shift.wash_station_id,
        "starts_at": shift.starts_at.isoformat(),
        "ends_at": shift.ends_at.isoformat(),
        "is_active": shift.is_active,
    }


def _resource_block_payload(block):
    return {
        "id": block.id,
        "wash_station": block.wash_station_id,
        "wash_box": block.wash_box_id,
        "washer": block.washer_id,
        "starts_at": block.starts_at.isoformat(),
        "ends_at": block.ends_at.isoformat(),
        "reason": block.reason,
    }
