from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date, parse_datetime

from rest_framework import status
from rest_framework.views import APIView

from back.api import error_response, success_response
from cars.models import CarType
from customer.models import Car, Customer
from personal.models import Washer, WashStation

from car_wash.models import Booking, WashBox, WashType
from car_wash.permissions import (
    IsCustomerOrManager,
    IsManager,
    can_access_customer,
    can_access_booking,
    can_access_station,
    get_request_customer,
    is_manager_user,
    restrict_queryset_to_accessible_stations,
)
from car_wash.services.availability import get_available_slots
from car_wash.services.booking import (
    BookingError,
    cancel_booking,
    change_booking_status,
    create_booking,
    reschedule_booking,
)
from car_wash.services.pricing import PricingConfigurationError


class WashTypeListView(APIView):
    def get(self, request):
        wash_types = WashType.objects.order_by("name")
        return success_response(
            [
                {
                    "id": wash_type.id,
                    "name": wash_type.name,
                    "description": wash_type.description,
                }
                for wash_type in wash_types
            ]
        )


class AvailabilityView(APIView):
    def get(self, request):
        station_id = request.query_params.get("station")
        car_type_id = request.query_params.get("car_type")
        wash_type_id = request.query_params.get("wash_type")
        day = parse_date(request.query_params.get("date", ""))

        if not station_id or not car_type_id or not wash_type_id or day is None:
            return error_response(
                (
                    "Параметры station, car_type, wash_type и date обязательны. "
                    "Дата должна быть в формате YYYY-MM-DD."
                ),
                field_errors=_availability_field_errors(request),
                code="validation_error",
            )

        wash_station = get_object_or_404(WashStation, pk=station_id)
        car_type = get_object_or_404(CarType, pk=car_type_id)
        wash_type = get_object_or_404(WashType, pk=wash_type_id)

        try:
            slots = get_available_slots(
                wash_station=wash_station,
                car_type=car_type,
                wash_type=wash_type,
                day=day,
            )
        except PricingConfigurationError as exc:
            return error_response(str(exc), code="pricing_configuration_error")

        return success_response([slot.as_dict() for slot in slots])


class BookingListCreateView(APIView):
    permission_classes = (IsCustomerOrManager,)

    def get(self, request):
        customer_id = request.query_params.get("customer")
        bookings = Booking.objects.select_related(
            "customer",
            "car",
            "wash_station",
            "wash_box",
            "wash_type",
        ).order_by("-starts_at")

        if is_manager_user(request.user):
            bookings = restrict_queryset_to_accessible_stations(
                bookings,
                request.user,
                station_field="wash_station",
            )
            if customer_id:
                bookings = bookings.filter(customer_id=customer_id)
        elif not is_manager_user(request.user):
            customer = get_request_customer(request.user)
            if customer is None:
                return success_response([])
            bookings = bookings.filter(customer=customer)

        return success_response([_booking_payload(booking) for booking in bookings])

    def post(self, request):
        try:
            starts_at = _parse_required_datetime(request.data.get("starts_at"))
            customer = get_object_or_404(Customer, pk=request.data.get("customer"))
            car = get_object_or_404(Car, pk=request.data.get("car"))
            wash_station = get_object_or_404(
                WashStation,
                pk=request.data.get("wash_station"),
            )
            wash_type = get_object_or_404(WashType, pk=request.data.get("wash_type"))

            if not can_access_customer(request.user, customer):
                return error_response(
                    "Нет доступа к этому заказчику.",
                    status_code=status.HTTP_403_FORBIDDEN,
                )

            if is_manager_user(request.user) and not can_access_station(
                request.user,
                wash_station,
            ):
                return _station_access_denied_response()

            if (
                not is_manager_user(request.user)
                and (
                    request.data.get("wash_box") is not None
                    or request.data.get("washers") is not None
                )
            ):
                return error_response(
                    "Назначать бокс и мойщиков может только менеджер.",
                    field_errors={
                        "wash_box": ["Назначать бокс может только менеджер."],
                        "washers": ["Назначать мойщиков может только менеджер."],
                    },
                    code="manager_assignment_required",
                    status_code=status.HTTP_403_FORBIDDEN,
                )

            wash_box = _get_optional_wash_box(request.data.get("wash_box"))
            washers = _get_optional_washers(request.data.get("washers"))

            booking = create_booking(
                customer=customer,
                car=car,
                wash_station=wash_station,
                wash_type=wash_type,
                starts_at=starts_at,
                wash_box=wash_box,
                washers=washers,
                actor=request.user,
            )
        except ValueError as exc:
            return _starts_at_error_response(exc)
        except PricingConfigurationError as exc:
            return error_response(str(exc), code="pricing_configuration_error")
        except BookingError as exc:
            return error_response(str(exc), code="booking_error")

        return success_response(
            _booking_payload(booking),
            status_code=status.HTTP_201_CREATED,
        )


class BookingCancelView(APIView):
    permission_classes = (IsCustomerOrManager,)

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        if not can_access_booking(request.user, booking):
            return error_response(
                "Нет доступа к этой записи.",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        try:
            booking = cancel_booking(booking=booking, actor=request.user)
        except BookingError as exc:
            return error_response(str(exc), code="booking_error")

        return success_response(_booking_payload(booking))


class BookingRescheduleView(APIView):
    permission_classes = (IsCustomerOrManager,)

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        if not can_access_booking(request.user, booking):
            return error_response(
                "Нет доступа к этой записи.",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        try:
            if (
                not is_manager_user(request.user)
                and (
                    request.data.get("wash_box") is not None
                    or request.data.get("washers") is not None
                )
            ):
                return error_response(
                    "Назначать бокс и мойщиков может только менеджер.",
                    field_errors={
                        "wash_box": ["Назначать бокс может только менеджер."],
                        "washers": ["Назначать мойщиков может только менеджер."],
                    },
                    code="manager_assignment_required",
                    status_code=status.HTTP_403_FORBIDDEN,
                )

            starts_at = _parse_required_datetime(request.data.get("starts_at"))
            wash_box = _get_optional_wash_box(request.data.get("wash_box"))
            washers = _get_optional_washers(request.data.get("washers"))
            booking = reschedule_booking(
                booking=booking,
                starts_at=starts_at,
                wash_box=wash_box,
                washers=washers,
                actor=request.user,
            )
        except ValueError as exc:
            return _starts_at_error_response(exc)
        except PricingConfigurationError as exc:
            return error_response(str(exc), code="pricing_configuration_error")
        except BookingError as exc:
            return error_response(str(exc), code="booking_error")

        return success_response(_booking_payload(booking))


class BookingStatusView(APIView):
    permission_classes = (IsManager,)

    def patch(self, request, pk):
        booking = get_object_or_404(Booking, pk=pk)

        if not can_access_booking(request.user, booking):
            return _station_access_denied_response()

        try:
            booking = change_booking_status(
                booking=booking,
                status=request.data.get("status"),
                actor=request.user,
            )
        except BookingError as exc:
            return error_response(
                str(exc),
                field_errors={"status": [str(exc)]},
                code="validation_error",
            )

        return success_response(_booking_payload(booking))


def _availability_field_errors(request):
    field_errors = {}
    if not request.query_params.get("station"):
        field_errors["station"] = ["Укажите станцию."]
    if not request.query_params.get("car_type"):
        field_errors["car_type"] = ["Укажите тип автомобиля."]
    if not request.query_params.get("wash_type"):
        field_errors["wash_type"] = ["Укажите тип мойки."]

    date_value = request.query_params.get("date", "")
    if not date_value:
        field_errors["date"] = ["Укажите дату."]
    elif parse_date(date_value) is None:
        field_errors["date"] = ["Дата должна быть в формате YYYY-MM-DD."]

    return field_errors


def _starts_at_error_response(exc):
    return error_response(
        str(exc),
        field_errors={"starts_at": [str(exc)]},
        code="validation_error",
    )


def _station_access_denied_response():
    return error_response(
        "Нет доступа к этой станции.",
        code="station_access_denied",
        status_code=status.HTTP_403_FORBIDDEN,
    )


def _parse_required_datetime(value):
    parsed = parse_datetime(value or "")
    if parsed is None:
        raise ValueError("Поле starts_at обязательно в ISO-формате.")

    return parsed


def _get_optional_wash_box(value):
    if not value:
        return None

    return get_object_or_404(WashBox, pk=value)


def _get_optional_washers(value):
    if not value:
        return None

    return list(Washer.objects.filter(id__in=value))


def _booking_payload(booking):
    booking = (
        Booking.objects.select_related(
            "customer",
            "car",
            "wash_station",
            "wash_box",
            "wash_type",
        )
        .prefetch_related("assignments__washer")
        .get(id=booking.id)
    )

    return {
        "id": booking.id,
        "customer": booking.customer_id,
        "car": booking.car_id,
        "wash_station": booking.wash_station_id,
        "wash_box": booking.wash_box_id,
        "wash_type": booking.wash_type_id,
        "starts_at": booking.starts_at.isoformat(),
        "ends_at": booking.ends_at.isoformat(),
        "status": booking.status,
        "cost": str(booking.cost),
        "down_payment": str(booking.down_payment),
        "residual": str(booking.residual),
        "payment_status": booking.payment_status,
        "paid_amount": str(booking.paid_amount),
        "payment_provider": booking.payment_provider,
        "payment_reference": booking.payment_reference,
        "washers": [
            {
                "id": assignment.washer_id,
                "name": str(assignment.washer),
                "role": assignment.role,
            }
            for assignment in booking.assignments.all()
        ],
    }
