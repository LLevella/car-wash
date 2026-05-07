from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from back.api import success_response
from customer.models import Customer
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

        return success_response([car_payload(customer.car)])


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


def customer_payload(customer):
    return {
        "id": customer.id,
        "name": customer.name,
        "phone_number": customer.phoneNumber,
        "user_id": customer.user_id,
        "car": car_payload(customer.car),
    }


def car_payload(car):
    return {
        "id": car.id,
        "number": car.number,
        "car_type": {
            "id": car.carType_id,
            "name": car.carType.name,
            "description": car.carType.description,
        },
    }
