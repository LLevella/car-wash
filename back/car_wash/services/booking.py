from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from customer.models import Car, Customer
from personal.models import Washer, WashStation

from car_wash.models import Booking, BookingAssignment, WashBox, WashType
from car_wash.services.availability import get_available_resources
from car_wash.services.pricing import build_pricing_quote


class BookingError(ValueError):
    """Raised when a booking operation cannot be completed."""


def create_booking(
    *,
    customer: Customer,
    car: Car,
    wash_station: WashStation,
    wash_type: WashType,
    starts_at,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
) -> Booking:
    starts_at = _make_aware(starts_at)
    _validate_customer_car(customer=customer, car=car)
    quote = build_pricing_quote(
        car_type=car.carType,
        wash_type=wash_type,
        wash_station=wash_station,
    )
    ends_at = starts_at + timedelta(minutes=quote.duration_minutes)

    with transaction.atomic():
        selected_box, selected_washers = _select_resources(
            wash_station=wash_station,
            starts_at=starts_at,
            ends_at=ends_at,
            wash_box=wash_box,
            washers=washers,
        )
        booking = Booking.objects.create(
            customer=customer,
            car=car,
            wash_station=wash_station,
            wash_box=selected_box,
            wash_type=wash_type,
            starts_at=starts_at,
            ends_at=ends_at,
            status=Booking.Status.PENDING,
            cost=quote.cost,
            down_payment=quote.down_payment,
            residual=quote.residual,
        )
        _replace_assignments(booking=booking, washers=selected_washers)

    return booking


def cancel_booking(*, booking: Booking) -> Booking:
    if booking.status == Booking.Status.COMPLETED:
        raise BookingError("Завершенную запись нельзя отменить.")

    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status", "updated_at"])
    return booking


def reschedule_booking(
    *,
    booking: Booking,
    starts_at,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
) -> Booking:
    starts_at = _make_aware(starts_at)
    quote = build_pricing_quote(
        car_type=booking.car.carType,
        wash_type=booking.wash_type,
        wash_station=booking.wash_station,
    )
    ends_at = starts_at + timedelta(minutes=quote.duration_minutes)

    with transaction.atomic():
        selected_box, selected_washers = _select_resources(
            wash_station=booking.wash_station,
            starts_at=starts_at,
            ends_at=ends_at,
            wash_box=wash_box,
            washers=washers,
            exclude_booking_id=booking.id,
        )
        booking.starts_at = starts_at
        booking.ends_at = ends_at
        booking.wash_box = selected_box
        booking.cost = quote.cost
        booking.down_payment = quote.down_payment
        booking.residual = quote.residual
        if booking.status == Booking.Status.CANCELLED:
            booking.status = Booking.Status.PENDING
        booking.save(
            update_fields=[
                "starts_at",
                "ends_at",
                "wash_box",
                "cost",
                "down_payment",
                "residual",
                "status",
                "updated_at",
            ]
        )
        _replace_assignments(booking=booking, washers=selected_washers)

    return booking


def change_booking_status(*, booking: Booking, status: str) -> Booking:
    valid_statuses = {choice for choice, _ in Booking.Status.choices}
    if status not in valid_statuses:
        raise BookingError("Неизвестный статус записи.")

    booking.status = status
    booking.save(update_fields=["status", "updated_at"])
    return booking


def _select_resources(
    *,
    wash_station: WashStation,
    starts_at,
    ends_at,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
    exclude_booking_id: int | None = None,
) -> tuple[WashBox, list[Washer]]:
    available_boxes, available_washers = get_available_resources(
        wash_station=wash_station,
        starts_at=starts_at,
        ends_at=ends_at,
        exclude_booking_id=exclude_booking_id,
    )
    available_box_ids = {box.id for box in available_boxes}
    available_washer_ids = {washer.id for washer in available_washers}

    if wash_box is None:
        if not available_boxes:
            raise BookingError("Нет свободного бокса на выбранное время.")
        selected_box_id = available_boxes[0].id
    elif wash_box.id not in available_box_ids:
        raise BookingError("Выбранный бокс недоступен на это время.")
    else:
        selected_box_id = wash_box.id

    if washers:
        selected_washer_ids = [washer.id for washer in washers]
        if not set(selected_washer_ids).issubset(available_washer_ids):
            raise BookingError("Один или несколько мойщиков недоступны на это время.")
    else:
        if not available_washers:
            raise BookingError("Нет свободного мойщика на выбранное время.")
        selected_washer_ids = [available_washers[0].id]

    selected_box = WashBox.objects.get(id=selected_box_id)
    selected_washers = list(Washer.objects.filter(id__in=selected_washer_ids))
    return selected_box, selected_washers


def _replace_assignments(*, booking: Booking, washers: list[Washer]) -> None:
    BookingAssignment.objects.filter(booking=booking).delete()
    BookingAssignment.objects.bulk_create(
        [
            BookingAssignment(
                booking=booking,
                washer=washer,
            )
            for washer in washers
        ]
    )


def _validate_customer_car(*, customer: Customer, car: Car) -> None:
    if customer.car_id != car.id:
        raise BookingError("Автомобиль должен принадлежать заказчику.")


def _make_aware(value):
    if timezone.is_aware(value):
        return value

    return timezone.make_aware(value, timezone.get_current_timezone())
