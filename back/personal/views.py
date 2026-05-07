from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from back.api import success_response
from personal.models import WashStation


class WashStationListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        stations = WashStation.objects.select_related("city", "district").order_by(
            "city__name",
            "district__name",
            "name",
        )
        return success_response(
            [
                {
                    "id": station.id,
                    "name": station.name,
                    "address": station.address,
                    "city": {
                        "id": station.city_id,
                        "name": station.city.name,
                    },
                    "district": {
                        "id": station.district_id,
                        "name": station.district.name,
                    },
                }
                for station in stations
            ]
        )
