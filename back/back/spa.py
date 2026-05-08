"""SPA serving glue for the demo image.

The backend hosts both the API and the prebuilt frontend assets so the
demo can ship a single container. ``WhiteNoise`` covers static asset
delivery (`/static/...`); this module renders ``index.html`` for any
non-API path so the React Router routes resolve client-side.
"""

from django.conf import settings
from django.http import FileResponse, HttpResponseNotFound


def serve_spa(request, *args, **kwargs):
    index_path = settings.SPA_DIST_DIR / "index.html"
    if not index_path.exists():
        return HttpResponseNotFound("Demo SPA bundle is not built.")

    response = FileResponse(index_path.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-store"
    return response
