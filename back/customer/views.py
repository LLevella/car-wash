from django.db.models import Q
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from back.api import error_response, success_response
from cars.models import CarType
from customer.models import Car, Customer
from car_wash.permissions import is_manager_user


class CurrentCustomerView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        customer = _customer_for_request(request)
        if customer is None:
            return success_response(None)

        return success_response(customer_payload(customer))


class CustomerCarListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        customer = _customer_for_request(request)
        if customer is None:
            return success_response([])

        cars = customer_cars_queryset(customer)
        return success_response([car_payload(car) for car in cars])

    def post(self, request):
        customer = _customer_for_write(request)
        if customer is None:
            return _customer_required_response()

        field_errors = _car_form_errors(request.data)
        if field_errors:
            return _car_validation_response(field_errors)

        car = Car.objects.create(
            number=request.data.get("number", "").strip(),
            carType=CarType.objects.get(id=request.data.get("car_type")),
            customer=customer,
        )
        return success_response(car_payload(car), status_code=status.HTTP_201_CREATED)


class CustomerCarDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, pk):
        customer = _customer_for_write(request)
        if customer is None:
            return _customer_required_response()

        car = _get_customer_car_or_404(customer, pk)
        field_errors = _car_form_errors(request.data, partial=True)
        if field_errors:
            return _car_validation_response(field_errors)

        update_fields = []
        if "number" in request.data:
            car.number = request.data.get("number", "").strip()
            update_fields.append("number")
        if "car_type" in request.data:
            car.carType = CarType.objects.get(id=request.data.get("car_type"))
            update_fields.append("carType")

        if update_fields:
            car.save(update_fields=update_fields)

        return success_response(car_payload(car))

    def delete(self, request, pk):
        customer = _customer_for_write(request)
        if customer is None:
            return _customer_required_response()

        car = _get_customer_car_or_404(customer, pk)
        car.is_active = False
        car.save(update_fields=["is_active"])

        if customer.car_id == car.id:
            replacement = customer_cars_queryset(customer).exclude(id=car.id).first()
            # ``Customer.car`` is nullable; clearing it prevents the profile
            # endpoint from falling back to a soft-deleted legacy primary car.
            customer.car = replacement
            customer.save(update_fields=["car"])

        return success_response(car_payload(car))


def _customer_for_request(request):
    customer_id = request.query_params.get("customer")
    if customer_id and is_manager_user(request.user):
        return Customer.objects.select_related("user", "car", "car__carType").filter(
            id=customer_id,
        ).first()

    return (
        Customer.objects.select_related("user", "car", "car__carType")
        .filter(user=request.user)
        .first()
    )


def _customer_for_write(request):
    return (
        Customer.objects.select_related("user", "car", "car__carType")
        .filter(user=request.user)
        .first()
    )


def customer_payload(customer):
    primary_car = customer_cars_queryset(customer).first() or customer.car
    return {
        "id": customer.id,
        "name": customer.name,
        "phone_number": customer.phoneNumber,
        "user_id": customer.user_id,
        "car": car_payload(primary_car) if primary_car else None,
    }


def customer_cars_queryset(customer):
    return (
        Car.objects.select_related("carType")
        .filter(Q(customer=customer) | Q(id=customer.car_id), is_active=True)
        .distinct()
        .order_by("id")
    )


def _get_customer_car_or_404(customer, pk):
    return get_object_or_404(
        customer_cars_queryset(customer),
        pk=pk,
    )


def _car_form_errors(data, *, partial=False):
    field_errors = {}

    if not partial or "number" in data:
        if not (data.get("number") or "").strip():
            field_errors["number"] = ["Укажите номер автомобиля."]

    if not partial or "car_type" in data:
        car_type_id = data.get("car_type")
        if not car_type_id:
            field_errors["car_type"] = ["Укажите тип автомобиля."]
        elif not str(car_type_id).isdigit():
            field_errors["car_type"] = ["Тип автомобиля должен быть числовым id."]
        elif not CarType.objects.filter(id=car_type_id).exists():
            field_errors["car_type"] = ["Тип автомобиля не найден."]

    return field_errors


def _car_validation_response(field_errors):
    return error_response(
        "Проверьте поля автомобиля.",
        field_errors=field_errors,
        code="validation_error",
    )


def _customer_required_response():
    return error_response(
        "Профиль клиента не найден.",
        code="customer_profile_required",
        status_code=status.HTTP_403_FORBIDDEN,
    )


def car_payload(car):
    return {
        "id": car.id,
        "number": car.number,
        "customer": car.customer_id,
        "is_active": car.is_active,
        "car_type": {
            "id": car.carType_id,
            "name": car.carType.name,
            "description": car.carType.description,
        },
    }
