from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from cars.models import CarBrand, CarModel, CarType


class CarTypeListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        car_types = CarType.objects.order_by("name")
        return Response(
            {
                "data": [
                    {
                        "id": car_type.id,
                        "name": car_type.name,
                        "description": car_type.description,
                    }
                    for car_type in car_types
                ]
            }
        )


class CarBrandListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        brands = CarBrand.objects.order_by("name")
        return Response(
            {
                "data": [
                    {
                        "id": brand.id,
                        "name": brand.name,
                    }
                    for brand in brands
                ]
            }
        )


class CarModelListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        models = CarModel.objects.order_by("name")
        return Response(
            {
                "data": [
                    {
                        "id": car_model.id,
                        "name": car_model.name,
                    }
                    for car_model in models
                ]
            }
        )
