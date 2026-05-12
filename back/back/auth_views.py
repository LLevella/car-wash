from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import Group, User
from django.contrib.auth.password_validation import (
    ValidationError as PasswordValidationError,
    validate_password,
)
from django.db import IntegrityError, transaction
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema

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
from customer.models import Customer


class CurrentUserView(APIView):
    permission_classes = (AllowAny,)

    def get(self, request):
        return success_response(current_user_payload(request.user))


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth_login"

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
class RegisterView(APIView):
    """Public customer self-registration. Creates a Django user, places it
    in the ``customer`` group, attaches a Customer profile (without a car
    yet — the user adds one from /my/cars right after), and logs the user
    in so the SPA can keep navigating without a second round-trip."""

    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "auth_register"

    @extend_schema(responses={201: OpenApiTypes.OBJECT})
    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        password_confirm = request.data.get("password_confirm") or ""
        name = (request.data.get("name") or "").strip()
        phone_number = (request.data.get("phone_number") or "").strip()

        field_errors = {}
        if not username:
            field_errors["username"] = ["Введите username."]
        elif len(username) < 3:
            field_errors["username"] = ["Минимум 3 символа."]
        elif User.objects.filter(username__iexact=username).exists():
            field_errors["username"] = ["Этот username уже занят."]

        if not password:
            field_errors["password"] = ["Введите password."]
        elif password != password_confirm:
            field_errors["password_confirm"] = ["Пароли не совпадают."]
        else:
            try:
                validate_password(password)
            except PasswordValidationError as exc:
                field_errors["password"] = list(exc.messages)

        if not name:
            field_errors["name"] = ["Введите имя."]
        if not phone_number:
            field_errors["phone_number"] = ["Введите телефон."]
        elif Customer.objects.filter(phoneNumber=phone_number).exists():
            field_errors["phone_number"] = ["Этот телефон уже зарегистрирован."]

        if field_errors:
            return error_response(
                "Проверьте поля формы.",
                field_errors=field_errors,
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=username,
                    password=password,
                )
                customer_group, _ = Group.objects.get_or_create(name=CUSTOMER_GROUP)
                user.groups.add(customer_group)
                Customer.objects.create(
                    user=user,
                    name=name,
                    phoneNumber=phone_number,
                )
        except IntegrityError:
            if Customer.objects.filter(phoneNumber=phone_number).exists():
                return error_response(
                    "Этот телефон уже зарегистрирован.",
                    field_errors={
                        "phone_number": ["Этот телефон уже зарегистрирован."],
                    },
                    code="validation_error",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )
            return error_response(
                "Этот username уже занят.",
                field_errors={"username": ["Этот username уже занят."]},
                code="validation_error",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)
        return success_response(
            current_user_payload(user),
            status_code=status.HTTP_201_CREATED,
        )


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
