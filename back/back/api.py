"""Small helpers for the public JSON API contract."""

from django.core.exceptions import ValidationError

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


DEFAULT_ERROR_DETAIL = "Запрос завершился ошибкой."
NON_FIELD_ERRORS = "non_field_errors"

ERROR_CODES_BY_STATUS = {
    status.HTTP_400_BAD_REQUEST: "bad_request",
    status.HTTP_401_UNAUTHORIZED: "unauthorized",
    status.HTTP_403_FORBIDDEN: "forbidden",
    status.HTTP_404_NOT_FOUND: "not_found",
}


def success_response(data, *, status_code=status.HTTP_200_OK):
    return Response({"data": data}, status=status_code)


def error_response(
    detail,
    *,
    field_errors=None,
    code=None,
    status_code=status.HTTP_400_BAD_REQUEST,
):
    return Response(
        error_payload(
            detail,
            field_errors=field_errors,
            code=code,
            status_code=status_code,
        ),
        status=status_code,
    )


def error_payload(
    detail,
    *,
    field_errors=None,
    code=None,
    status_code=status.HTTP_400_BAD_REQUEST,
):
    return {
        "detail": str(detail or DEFAULT_ERROR_DETAIL),
        "field_errors": normalize_field_errors(field_errors),
        "code": code or ERROR_CODES_BY_STATUS.get(status_code, "api_error"),
    }


def validation_error_response(
    exc,
    *,
    detail="Проверьте поля формы.",
    code="validation_error",
):
    return error_response(
        detail,
        field_errors=validation_field_errors(exc),
        code=code,
        status_code=status.HTTP_400_BAD_REQUEST,
    )


def validation_field_errors(exc):
    if isinstance(exc, ValidationError):
        if hasattr(exc, "message_dict"):
            return normalize_field_errors(exc.message_dict)
        if hasattr(exc, "messages"):
            return {NON_FIELD_ERRORS: normalize_messages(exc.messages)}

    return {NON_FIELD_ERRORS: normalize_messages(str(exc))}


def exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None

    response.data = exception_error_payload(response.data, response.status_code)
    return response


def exception_error_payload(data, status_code):
    if isinstance(data, dict) and "detail" not in data:
        return error_payload(
            "Проверьте поля формы.",
            field_errors=data,
            code="validation_error",
            status_code=status_code,
        )

    return error_payload(
        detail=_exception_detail(data),
        code=_exception_code(data, status_code),
        status_code=status_code,
    )


def normalize_field_errors(field_errors):
    if not field_errors:
        return {}

    if isinstance(field_errors, dict):
        return {
            str(field): normalize_messages(messages)
            for field, messages in field_errors.items()
        }

    return {NON_FIELD_ERRORS: normalize_messages(field_errors)}


def normalize_messages(messages):
    if messages is None:
        return []

    if isinstance(messages, (list, tuple, set)):
        return [str(message) for message in messages]

    return [str(messages)]


def _exception_detail(data):
    if isinstance(data, dict):
        data = data.get("detail", DEFAULT_ERROR_DETAIL)

    messages = normalize_messages(data)
    return " ".join(messages) if messages else DEFAULT_ERROR_DETAIL


def _exception_code(data, status_code):
    if isinstance(data, dict):
        data = data.get("detail")

    if hasattr(data, "code"):
        return str(data.code)

    return ERROR_CODES_BY_STATUS.get(status_code, "api_error")
