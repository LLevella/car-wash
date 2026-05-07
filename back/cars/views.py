from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from back.api import success_response
from cars.models import CarBrand, CarModel, CarType


class CarTypeListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        car_types = CarType.objects.order_by("name")
        return success_response(
            [
                {
                    "id": car_type.id,
                    "name": car_type.name,
                    "description": car_type.description,
                }
                for car_type in car_types
            ]
        )


class CarBrandListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        brands = CarBrand.objects.order_by("name")
        return success_response(
            [
                {
                    "id": brand.id,
                    "name": brand.name,
                }
                for brand in brands
            ]
        )


class CarModelListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        models = CarModel.objects.order_by("name")
        return success_response(
            [
                {
                    "id": car_model.id,
                    "name": car_model.name,
                }
                for car_model in models
            ]
        )
