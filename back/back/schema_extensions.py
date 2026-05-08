"""Schema extensions for drf-spectacular.

The car wash backend exposes plain ``APIView`` endpoints that build their
JSON payloads with hand-written helper functions instead of DRF
serializers. drf-spectacular cannot derive a request/response shape from
those views, so by default it emits an ``unable to guess serializer``
error per endpoint. Until per-view serializers are introduced, fall back
to a generic object payload so the OpenAPI schema generates cleanly.

This loosens precision intentionally: the schema describes "an object",
not the exact field set. Frontend type generation (planned in F11) will
replace these placeholders with real serializers/component schemas.
"""

from rest_framework.generics import GenericAPIView

from drf_spectacular.openapi import AutoSchema
from drf_spectacular.types import OpenApiTypes


def _has_serializer_hint(view) -> bool:
    return (
        isinstance(view, GenericAPIView)
        or callable(getattr(view, "get_serializer", None))
        or callable(getattr(view, "get_serializer_class", None))
        or hasattr(view, "serializer_class")
    )


class LooseAutoSchema(AutoSchema):
    def get_request_serializer(self):
        if not _has_serializer_hint(self.view):
            return OpenApiTypes.OBJECT
        return super().get_request_serializer()

    def get_response_serializers(self):
        if not _has_serializer_hint(self.view):
            return OpenApiTypes.OBJECT
        return super().get_response_serializers()
