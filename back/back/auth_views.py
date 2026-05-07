from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from back.api import error_response, success_response
from car_wash.permissions import (
    ADMIN_GROUP,
    CUSTOMER_GROUP,
    MANAGER_GROUP,
    get_request_customer,
    is_admin_user,
    is_customer_user,
    is_manager_user,
)


class CurrentUserView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        return success_response(current_user_payload(request.user))


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""

        field_errors = {}
        if not username:
            field_errors["username"] = ["Введите username."]
        if not password:
            field_errors["password"] = ["Введите password."]

        if field_errors:
            return error_response(
                "Заполните username и password.",
                field_errors=field_errors,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=username, password=password)
        if user is None:
            return error_response(
                "Неверный username или password.",
                field_errors={
                    "username": ["Проверьте username."],
                    "password": ["Проверьте password."],
                },
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        return success_response(current_user_payload(user))


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        logout(request)
        return success_response(current_user_payload(request.user))


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfTokenView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        return success_response({"csrf_token": get_token(request)})


def current_user_payload(user):
    if not user or not user.is_authenticated:
        return {
            "is_authenticated": False,
            "user": None,
            "roles": [],
            "customer_id": None,
        }

    customer = get_request_customer(user)

    return {
        "is_authenticated": True,
        "user": {
            "id": user.id,
            "username": user.get_username(),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "is_staff": user.is_staff,
            "is_superuser": user.is_superuser,
        },
        "roles": user_roles(user),
        "customer_id": customer.id if customer else None,
    }


def user_roles(user):
    roles = []
    if is_customer_user(user):
        roles.append(CUSTOMER_GROUP)
    if is_manager_user(user):
        roles.append(MANAGER_GROUP)
    if is_admin_user(user):
        roles.append(ADMIN_GROUP)
    return roles
