from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from personal.models import WashStation


class WashStationListView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        stations = WashStation.objects.select_related("city", "district").order_by(
            "city__name",
            "district__name",
            "name",
        )
        return Response(
            {
                "data": [
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
            }
        )
