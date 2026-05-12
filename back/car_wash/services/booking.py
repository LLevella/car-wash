from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from customer.models import Car, Customer
from personal.models import Washer, WashStation

from car_wash.models import (
    AuditEvent,
    Booking,
    BookingAssignment,
    NotificationOutbox,
    WashBox,
    WashType,
)
from car_wash.services.availability import get_available_resources
from car_wash.services.pricing import build_pricing_quote


class BookingError(ValueError):
    """Raised when a booking operation cannot be completed."""


CHANGEABLE_BOOKING_STATUSES = {
    Booking.Status.PENDING,
    Booking.Status.CONFIRMED,
}


def _validate_booking_can_change(*, booking: Booking) -> None:
    if booking.status not in CHANGEABLE_BOOKING_STATUSES:
        raise BookingError("Эту запись уже нельзя изменить.")

    if booking.starts_at <= timezone.now():
        raise BookingError("Прошедшую или начавшуюся запись нельзя изменить.")


def _validate_starts_at_in_future(starts_at) -> None:
    if starts_at <= timezone.now():
        raise BookingError("Время записи должно быть в будущем.")


def _record_audit(*, actor, action, entity, context=None):
    """Persist an audit event next to the domain change. Always called
    inside an active transaction so the audit row is committed atomically
    with the operation it describes."""

    AuditEvent.objects.create(
        actor=actor if (actor is not None and getattr(actor, "is_authenticated", False)) else None,
        action=action,
        entity_type=type(entity).__name__,
        entity_id=entity.pk,
        context=context or {},
    )


def _enqueue_notification(*, booking, event, payload=None):
    """Append an outbox row in the same transaction as the booking change.

    Each domain transition produces exactly one row. The
    ``process_notifications`` management command (or a future
    SMS/email worker) iterates over ``status="pending"`` rows in
    insertion order and bumps them to ``sent`` once delivered."""

    NotificationOutbox.objects.create(
        booking=booking,
        event=event,
        payload=payload or {},
    )


def _lock_station(wash_station: WashStation) -> None:
    """Acquire a row-level lock on the wash station to serialize concurrent
    booking transactions on the same station. On PostgreSQL this issues
    ``SELECT ... FOR UPDATE`` and forces a second concurrent transaction to
    wait for the first to commit. On SQLite the call is a no-op because the
    database itself serializes writers via a database-level lock, so the
    behavior we want is already enforced by the engine."""

    list(
        WashStation.objects.select_for_update().filter(id=wash_station.id)
    )


def _lock_booking(booking: Booking) -> Booking:
    return (
        Booking.objects.select_for_update()
        .select_related("car", "car__carType", "wash_station", "wash_type")
        .get(pk=booking.pk)
    )


def create_booking(
    *,
    customer: Customer,
    car: Car,
    wash_station: WashStation,
    wash_type: WashType,
    starts_at,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
    actor=None,
) -> Booking:
    starts_at = _make_aware(starts_at)
    _validate_starts_at_in_future(starts_at)
    _validate_customer_car(customer=customer, car=car)
    quote = build_pricing_quote(
        car_type=car.carType,
        wash_type=wash_type,
        wash_station=wash_station,
    )
    ends_at = starts_at + timedelta(minutes=quote.duration_minutes)

    with transaction.atomic():
        _lock_station(wash_station)
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
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_CREATED,
            entity=booking,
            context={
                "wash_box": booking.wash_box_id,
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
                "washers": [washer.id for washer in selected_washers],
            },
        )
        _enqueue_notification(
            booking=booking,
            event=NotificationOutbox.Event.BOOKING_CREATED,
            payload={
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
                "wash_station": booking.wash_station_id,
            },
        )

    return booking


def cancel_booking(*, booking: Booking, actor=None) -> Booking:
    with transaction.atomic():
        booking = _lock_booking(booking)
        _validate_booking_can_change(booking=booking)
        previous_status = booking.status
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status", "updated_at"])
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_CANCELLED,
            entity=booking,
            context={"previous_status": previous_status},
        )
        _enqueue_notification(
            booking=booking,
            event=NotificationOutbox.Event.BOOKING_CANCELLED,
            payload={"previous_status": previous_status},
        )
    return booking


def reschedule_booking(
    *,
    booking: Booking,
    starts_at,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
    actor=None,
) -> Booking:
    starts_at = _make_aware(starts_at)

    with transaction.atomic():
        booking = _lock_booking(booking)
        _validate_booking_can_change(booking=booking)
        _validate_starts_at_in_future(starts_at)
        previous_starts_at = booking.starts_at
        previous_ends_at = booking.ends_at
        quote = build_pricing_quote(
            car_type=booking.car.carType,
            wash_type=booking.wash_type,
            wash_station=booking.wash_station,
        )
        ends_at = starts_at + timedelta(minutes=quote.duration_minutes)
        _lock_station(booking.wash_station)
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
        booking.save(
            update_fields=[
                "starts_at",
                "ends_at",
                "wash_box",
                "cost",
                "down_payment",
                "residual",
                "updated_at",
            ]
        )
        _replace_assignments(booking=booking, washers=selected_washers)
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_RESCHEDULED,
            entity=booking,
            context={
                "previous_starts_at": previous_starts_at.isoformat(),
                "previous_ends_at": previous_ends_at.isoformat(),
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
                "wash_box": booking.wash_box_id,
                "washers": [washer.id for washer in selected_washers],
            },
        )
        _enqueue_notification(
            booking=booking,
            event=NotificationOutbox.Event.BOOKING_RESCHEDULED,
            payload={
                "previous_starts_at": previous_starts_at.isoformat(),
                "previous_ends_at": previous_ends_at.isoformat(),
                "starts_at": booking.starts_at.isoformat(),
                "ends_at": booking.ends_at.isoformat(),
            },
        )

    return booking


def assign_booking_resources(
    *,
    booking: Booking,
    wash_box: WashBox | None = None,
    washers: list[Washer] | None = None,
    actor=None,
) -> Booking:
    previous_box_id = booking.wash_box_id
    with transaction.atomic():
        _lock_station(booking.wash_station)
        selected_box, selected_washers = _select_resources(
            wash_station=booking.wash_station,
            starts_at=booking.starts_at,
            ends_at=booking.ends_at,
            wash_box=wash_box,
            washers=washers,
            exclude_booking_id=booking.id,
        )
        booking.wash_box = selected_box
        booking.save(update_fields=["wash_box", "updated_at"])
        _replace_assignments(booking=booking, washers=selected_washers)
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_ASSIGNED,
            entity=booking,
            context={
                "previous_wash_box": previous_box_id,
                "wash_box": booking.wash_box_id,
                "washers": [washer.id for washer in selected_washers],
            },
        )

    return booking


def mark_booking_paid(
    *,
    booking: Booking,
    amount,
    provider: str = "",
    reference: str = "",
    actor=None,
) -> Booking:
    """Record an external payment against a booking.

    The plan separates the calculated down payment (set when the booking
    is created) from the amount actually settled by the customer; this
    helper writes the latter alongside provider/reference fields. It is
    called only by the payment integration layer — the booking status
    itself is not changed automatically because that decision is policy-
    dependent (auto-confirm-on-paid vs. manual confirmation)."""

    if amount is None:
        raise BookingError("Сумма оплаты обязательна.")
    if amount < 0:
        raise BookingError("Сумма оплаты не может быть отрицательной.")

    with transaction.atomic():
        booking.paid_amount = amount
        booking.payment_provider = provider
        booking.payment_reference = reference
        booking.payment_status = (
            Booking.PaymentStatus.PAID
            if amount and amount >= booking.down_payment
            else Booking.PaymentStatus.AWAITING
        )
        booking.save(
            update_fields=[
                "paid_amount",
                "payment_provider",
                "payment_reference",
                "payment_status",
                "updated_at",
            ]
        )
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_STATUS_CHANGED,
            entity=booking,
            context={
                "payment_status": booking.payment_status,
                "paid_amount": str(booking.paid_amount),
                "provider": provider,
            },
        )

    return booking


def change_booking_status(*, booking: Booking, status: str, actor=None) -> Booking:
    valid_statuses = {choice for choice, _ in Booking.Status.choices}
    if status not in valid_statuses:
        raise BookingError("Неизвестный статус записи.")

    previous_status = booking.status
    with transaction.atomic():
        booking.status = status
        booking.save(update_fields=["status", "updated_at"])
        _record_audit(
            actor=actor,
            action=AuditEvent.Action.BOOKING_STATUS_CHANGED,
            entity=booking,
            context={
                "previous_status": previous_status,
                "status": status,
            },
        )
        _enqueue_notification(
            booking=booking,
            event=NotificationOutbox.Event.BOOKING_STATUS_CHANGED,
            payload={
                "previous_status": previous_status,
                "status": status,
            },
        )
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

    if washers is not None:
        if not washers:
            raise BookingError("Укажите хотя бы одного мойщика.")
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
    if not car.is_active:
        raise BookingError("Автомобиль недоступен.")

    if car.customer_id != customer.id and customer.car_id != car.id:
        raise BookingError("Автомобиль должен принадлежать заказчику.")


def _make_aware(value):
    if timezone.is_aware(value):
        return value

    return timezone.make_aware(value, timezone.get_current_timezone())
