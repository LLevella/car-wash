from django.db import connections
from django.db.utils import OperationalError
from django.http import JsonResponse


def health_check(request):
    response = JsonResponse({"status": "ok"})
    response["Cache-Control"] = "no-store"
    return response


def readiness_check(request):
    """Readiness endpoint for orchestrators (k8s, ECS, deploy probes).

    Confirms the default database connection is reachable. If it isn't,
    returns 503 so the orchestrator stops sending traffic until the
    process can talk to its database again."""

    try:
        with connections["default"].cursor() as cursor:
            cursor.execute("SELECT 1")
    except OperationalError as exc:
        response = JsonResponse(
            {"status": "unavailable", "detail": str(exc)},
            status=503,
        )
    else:
        response = JsonResponse({"status": "ready"})

    response["Cache-Control"] = "no-store"
    return response
