from datetime import datetime, time, timedelta
from decimal import Decimal
from io import StringIO
import os
from pathlib import Path
from unittest import mock

from django.contrib.auth import authenticate
from django.contrib.auth.models import Group, User
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, SimpleTestCase, TestCase
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.throttling import ScopedRateThrottle

from back.api import (
    NON_FIELD_ERRORS,
    error_response,
    success_response,
    validation_error_response,
)
from back.config import database_config, env_bool, env_int, env_list
from cars.models import CarBrand, CarModel, CarType
from customer.models import Car, Customer
from personal.models import City, District, Washer, WashStation
from car_wash.models import (
    AuditEvent,
    Booking,
    BookingAssignment,
    DownPayment,
    ManagerStationAccess,
    NotificationOutbox,
    ResourceBlock,
    WashBox,
    WashCost,
    WashDuration,
    WasherShift,
    WashType,
)
from car_wash.permissions import (
    ADMIN_GROUP,
    CUSTOMER_GROUP,
    MANAGER_GROUP,
    can_access_station,
    user_accessible_station_ids,
)
from car_wash.services.availability import get_available_slots
from car_wash.services.booking import (
    BookingError,
    assign_booking_resources,
    cancel_booking,
    create_booking,
    mark_booking_paid,
    reschedule_booking,
)
from car_wash.services.pricing import (
    PricingConfigurationError,
    build_pricing_quote,
    calculate_down_payment,
    get_wash_cost,
    get_wash_duration,
)


def make_dt(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class RuntimeConfigTests(SimpleTestCase):
    @mock.patch.dict(
        os.environ,
        {
            "CONFIG_TRUE": "yes",
            "CONFIG_FALSE": "0",
            "CONFIG_INVALID": "maybe",
            "CONFIG_INT": "42",
            "CONFIG_LIST": "localhost, 127.0.0.1, ,example.com",
        },
    )
    def test_env_helpers_parse_common_values(self):
        self.assertTrue(env_bool("CONFIG_TRUE"))
        self.assertFalse(env_bool("CONFIG_FALSE", default=True))
        self.assertTrue(env_bool("CONFIG_INVALID", default=True))
        self.assertEqual(env_int("CONFIG_INT"), 42)
        self.assertEqual(
            env_list("CONFIG_LIST"),
            ["localhost", "127.0.0.1", "example.com"],
        )

    def test_env_helpers_use_defaults_for_missing_or_empty_values(self):
        with mock.patch.dict(os.environ, {"CONFIG_EMPTY_INT": ""}, clear=False):
            self.assertEqual(env_bool("CONFIG_MISSING_BOOL", default=True), True)
            self.assertEqual(env_int("CONFIG_MISSING_INT", default=7), 7)
            self.assertEqual(env_int("CONFIG_EMPTY_INT", default=9), 9)
            self.assertEqual(env_list("CONFIG_MISSING_LIST", ["localhost"]), ["localhost"])

    def test_database_config_defaults_to_sqlite(self):
        sqlite_path = Path("/tmp/car-wash.sqlite3")

        config = database_config(sqlite_path, url="")

        self.assertEqual(config["ENGINE"], "django.db.backends.sqlite3")
        self.assertEqual(config["NAME"], sqlite_path)

    def test_database_config_parses_sqlite_url_variants(self):
        sqlite_path = Path("/tmp/car-wash.sqlite3")

        self.assertEqual(
            database_config(sqlite_path, url="sqlite://")["NAME"],
            sqlite_path,
        )
        self.assertEqual(
            database_config(sqlite_path, url="sqlite:///:memory:")["NAME"],
            ":memory:",
        )
        self.assertEqual(
            database_config(sqlite_path, url="sqlite://server/shared.sqlite3")["NAME"],
            Path("//server/shared.sqlite3"),
        )

    def test_database_config_parses_postgres_url(self):
        config = database_config(
            Path("/tmp/car-wash.sqlite3"),
            url="postgres://carwash:p%40ss@db.example.com:5432/carwash?sslmode=require",
        )

        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["NAME"], "carwash")
        self.assertEqual(config["USER"], "carwash")
        self.assertEqual(config["PASSWORD"], "p@ss")
        self.assertEqual(config["HOST"], "db.example.com")
        self.assertEqual(config["PORT"], "5432")
        self.assertEqual(config["OPTIONS"], {"sslmode": "require"})

    def test_database_config_parses_postgres_url_without_options(self):
        config = database_config(
            Path("/tmp/car-wash.sqlite3"),
            url="postgresql://carwash@db.example.com/carwash",
        )

        self.assertEqual(config["ENGINE"], "django.db.backends.postgresql")
        self.assertEqual(config["NAME"], "carwash")
        self.assertEqual(config["USER"], "carwash")
        self.assertEqual(config["PASSWORD"], "")
        self.assertEqual(config["HOST"], "db.example.com")
        self.assertEqual(config["PORT"], "")
        self.assertNotIn("OPTIONS", config)

    def test_database_config_rejects_unsupported_scheme(self):
        with self.assertRaises(ValueError):
            database_config(Path("/tmp/car-wash.sqlite3"), url="mysql://db/carwash")


class HealthCheckTests(TestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get(reverse("health-check"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_readiness_check_returns_ready_when_db_is_reachable(self):
        response = self.client.get(reverse("readiness-check"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ready"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_readiness_check_returns_503_when_db_query_fails(self):
        from django.db.utils import OperationalError
        from django.db import connections

        default_connection = connections["default"]

        def raise_operational_error(*args, **kwargs):
            raise OperationalError("simulated failure")

        with mock.patch.object(default_connection, "cursor", side_effect=raise_operational_error):
            response = self.client.get(reverse("readiness-check"))

        self.assertEqual(response.status_code, 503)
        body = response.json()
        self.assertEqual(body["status"], "unavailable")
        self.assertIn("simulated failure", body["detail"])


class HealthDiagnosticsCommandTests(TestCase):
    def test_command_reports_health(self):
        out = StringIO()
        call_command("health_diagnostics", stdout=out)

        output = out.getvalue()
        self.assertIn("Database engine", output)
        self.assertIn("DB reachable: OK", output)
        self.assertIn("Pending notifications", output)


class OpenApiSchemaTests(TestCase):
    """The OpenAPI schema endpoints must stay reachable and
    permission-gated: anonymous users see a 403 (so production deployments
    don't leak the API surface), authenticated managers can introspect the
    contract, and the YAML schema lists at least one core endpoint."""

    def setUp(self):
        from car_wash.permissions import MANAGER_GROUP

        manager_user = User.objects.create_user(
            username="schema-manager",
            password="password",
        )
        Group.objects.get_or_create(name=MANAGER_GROUP)[0].user_set.add(manager_user)
        self.manager_user = manager_user

    def test_schema_endpoint_requires_authentication(self):
        response = self.client.get(reverse("api:schema"))
        self.assertEqual(response.status_code, 403)

    def test_schema_endpoint_returns_openapi_yaml_for_manager(self):
        self.client.force_login(self.manager_user)
        response = self.client.get(reverse("api:schema"))

        self.assertEqual(response.status_code, 200)
        body = response.content.decode("utf-8")
        self.assertIn("openapi:", body)
        self.assertIn("/api/auth/me/", body)
        self.assertIn("/api/auth/register/", body)
        self.assertIn("'201':", body)
        self.assertIn("/api/manager/schedule/", body)

    def test_swagger_ui_endpoint_requires_manager(self):
        self.client.force_login(self.manager_user)
        response = self.client.get(reverse("api:schema-swagger"))
        self.assertEqual(response.status_code, 200)
        self.assertIn("swagger", response.content.decode("utf-8").lower())


class ApiResponseHelperTests(SimpleTestCase):
    def test_success_response_wraps_data_payload(self):
        response = success_response({"id": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"data": {"id": 1}})

    def test_error_response_uses_standard_contract(self):
        response = error_response(
            "Нет доступа.",
            field_errors={"station": "Недоступная станция."},
            status_code=403,
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Нет доступа.")
        self.assertEqual(response.data["code"], "forbidden")
        self.assertEqual(
            response.data["field_errors"],
            {"station": ["Недоступная станция."]},
        )

    def test_validation_error_response_normalizes_model_errors(self):
        response = validation_error_response(
            ValidationError(
                {
                    "starts_at": ["Начало обязательно."],
                    "__all__": ["Интервал некорректен."],
                }
            )
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "validation_error")
        self.assertEqual(response.data["field_errors"]["starts_at"], ["Начало обязательно."])
        self.assertEqual(
            response.data["field_errors"]["__all__"],
            ["Интервал некорректен."],
        )

    def test_validation_error_response_normalizes_non_field_errors(self):
        response = validation_error_response(ValidationError("Некорректное значение."))

        self.assertEqual(
            response.data["field_errors"][NON_FIELD_ERRORS],
            ["Некорректное значение."],
        )


class AuthApiTests(TestCase):
    def setUp(self):
        self.customer_group, _ = Group.objects.get_or_create(name=CUSTOMER_GROUP)
        self.manager_group, _ = Group.objects.get_or_create(name=MANAGER_GROUP)
        self.admin_group, _ = Group.objects.get_or_create(name=ADMIN_GROUP)

        self.customer_user = User.objects.create_user(
            username="anna",
            password="password",
            email="anna@example.com",
            first_name="Анна",
        )
        self.customer_user.groups.add(self.customer_group)

        car_type = CarType.objects.create(
            name="Седан",
            description="Легковой автомобиль",
        )
        car = Car.objects.create(number="A001AA", carType=car_type)
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Анна",
            phoneNumber="+79990000000",
            car=car,
        )

        self.manager_user = User.objects.create_user(
            username="manager",
            password="password",
        )
        self.manager_user.groups.add(self.manager_group)

        self.admin_user = User.objects.create_user(
            username="admin",
            password="password",
            is_staff=True,
        )
        self.admin_user.groups.add(self.admin_group)

    def test_me_returns_anonymous_payload(self):
        response = self.client.get(reverse("api:auth:me"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["data"],
            {
                "is_authenticated": False,
                "user": None,
                "roles": [],
                "customer_id": None,
            },
        )

    def test_csrf_endpoint_sets_cookie_and_returns_token(self):
        response = self.client.get(reverse("api:auth:csrf"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["csrf_token"])
        self.assertIn("csrftoken", response.cookies)

    def test_login_returns_current_customer_user(self):
        response = self.client.post(
            reverse("api:auth:login"),
            {
                "username": "anna",
                "password": "password",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertTrue(payload["is_authenticated"])
        self.assertEqual(payload["user"]["username"], "anna")
        self.assertEqual(payload["user"]["email"], "anna@example.com")
        self.assertEqual(payload["roles"], [CUSTOMER_GROUP])
        self.assertEqual(payload["customer_id"], self.customer.id)

        me_response = self.client.get(reverse("api:auth:me"))
        self.assertTrue(me_response.json()["data"]["is_authenticated"])

    def test_login_works_with_csrf_token_when_checks_are_enforced(self):
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_response = csrf_client.get(reverse("api:auth:csrf"))
        csrf_token = csrf_response.cookies["csrftoken"].value

        response = csrf_client.post(
            reverse("api:auth:login"),
            {"username": "anna", "password": "password"},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["data"]["is_authenticated"])

    def test_login_returns_manager_and_admin_roles(self):
        manager_response = self.client.post(
            reverse("api:auth:login"),
            {"username": "manager", "password": "password"},
            content_type="application/json",
        )
        self.assertEqual(manager_response.status_code, 200)
        self.assertEqual(manager_response.json()["data"]["roles"], [MANAGER_GROUP])

        self.client.post(reverse("api:auth:logout"))
        admin_response = self.client.post(
            reverse("api:auth:login"),
            {"username": "admin", "password": "password"},
            content_type="application/json",
        )
        self.assertEqual(admin_response.status_code, 200)
        self.assertEqual(
            admin_response.json()["data"]["roles"],
            [MANAGER_GROUP, ADMIN_GROUP],
        )

    def test_login_validates_required_fields(self):
        response = self.client.post(
            reverse("api:auth:login"),
            {},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["detail"], "Заполните username и password.")
        self.assertEqual(payload["code"], "bad_request")
        self.assertIn("username", payload["field_errors"])
        self.assertIn("password", payload["field_errors"])

    def test_login_rejects_bad_credentials(self):
        response = self.client.post(
            reverse("api:auth:login"),
            {"username": "anna", "password": "bad"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Неверный username или password.")
        self.assertEqual(response.json()["code"], "unauthorized")
        self.assertIn("password", response.json()["field_errors"])

    def test_login_is_throttled(self):
        rest_framework = settings.REST_FRAMEWORK.copy()
        rest_framework["DEFAULT_THROTTLE_RATES"] = {
            **rest_framework.get("DEFAULT_THROTTLE_RATES", {}),
            "auth_login": "1/min",
        }
        cache.clear()
        try:
            with override_settings(REST_FRAMEWORK=rest_framework):
                with mock.patch.object(
                    ScopedRateThrottle,
                    "THROTTLE_RATES",
                    rest_framework["DEFAULT_THROTTLE_RATES"],
                ):
                    first_response = self.client.post(
                        reverse("api:auth:login"),
                        {"username": "anna", "password": "bad"},
                        content_type="application/json",
                    )
                    second_response = self.client.post(
                        reverse("api:auth:login"),
                        {"username": "anna", "password": "bad"},
                        content_type="application/json",
                    )
        finally:
            cache.clear()

        self.assertEqual(first_response.status_code, 401)
        self.assertEqual(second_response.status_code, 429)

    def test_logout_clears_session(self):
        self.client.force_login(self.customer_user)

        response = self.client.post(reverse("api:auth:logout"))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["data"]["is_authenticated"])

        me_response = self.client.get(reverse("api:auth:me"))
        self.assertFalse(me_response.json()["data"]["is_authenticated"])

    def test_register_creates_customer_and_logs_in(self):
        response = self.client.post(
            reverse("api:auth:register"),
            {
                "username": "newbie",
                "password": "supersecret123",
                "password_confirm": "supersecret123",
                "name": "Новый Клиент",
                "phone_number": "+79990001111",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["data"]
        self.assertTrue(payload["is_authenticated"])
        self.assertEqual(payload["user"]["username"], "newbie")
        self.assertIn(CUSTOMER_GROUP, payload["roles"])
        self.assertIsNotNone(payload["customer_id"])

        # The session should be live, so /api/auth/me/ now returns the same
        # user without an extra login round-trip.
        me_response = self.client.get(reverse("api:auth:me"))
        self.assertTrue(me_response.json()["data"]["is_authenticated"])

        new_user = User.objects.get(username="newbie")
        new_customer = Customer.objects.get(user=new_user)
        self.assertEqual(new_customer.name, "Новый Клиент")
        self.assertEqual(new_customer.phoneNumber, "+79990001111")
        self.assertIsNone(new_customer.car_id)

    def test_register_rejects_duplicate_username(self):
        response = self.client.post(
            reverse("api:auth:register"),
            {
                "username": "anna",
                "password": "supersecret123",
                "password_confirm": "supersecret123",
                "name": "Anna 2",
                "phone_number": "+79990002222",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertIn("username", body["field_errors"])
        self.assertEqual(body["code"], "validation_error")

    def test_register_rejects_duplicate_phone(self):
        response = self.client.post(
            reverse("api:auth:register"),
            {
                "username": "newbie",
                "password": "supersecret123",
                "password_confirm": "supersecret123",
                "name": "Anna 2",
                "phone_number": self.customer.phoneNumber,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertIn("phone_number", body["field_errors"])
        self.assertEqual(body["code"], "validation_error")

    def test_register_is_throttled(self):
        rest_framework = settings.REST_FRAMEWORK.copy()
        rest_framework["DEFAULT_THROTTLE_RATES"] = {
            **rest_framework.get("DEFAULT_THROTTLE_RATES", {}),
            "auth_register": "1/min",
        }
        payload = {
            "username": "ab",
            "password": "",
            "password_confirm": "",
            "name": "",
            "phone_number": "",
        }
        cache.clear()
        try:
            with override_settings(REST_FRAMEWORK=rest_framework):
                with mock.patch.object(
                    ScopedRateThrottle,
                    "THROTTLE_RATES",
                    rest_framework["DEFAULT_THROTTLE_RATES"],
                ):
                    first_response = self.client.post(
                        reverse("api:auth:register"),
                        payload,
                        content_type="application/json",
                    )
                    second_response = self.client.post(
                        reverse("api:auth:register"),
                        payload,
                        content_type="application/json",
                    )
        finally:
            cache.clear()

        self.assertEqual(first_response.status_code, 400)
        self.assertEqual(second_response.status_code, 429)

    def test_register_rejects_mismatched_passwords(self):
        response = self.client.post(
            reverse("api:auth:register"),
            {
                "username": "newuser",
                "password": "supersecret123",
                "password_confirm": "typoooo",
                "name": "Тест",
                "phone_number": "+79990003333",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password_confirm", response.json()["field_errors"])

    def test_register_rejects_short_username_and_missing_fields(self):
        response = self.client.post(
            reverse("api:auth:register"),
            {
                "username": "ab",
                "password": "",
                "password_confirm": "",
                "name": "",
                "phone_number": "",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        errors = response.json()["field_errors"]
        for field in ("username", "password", "name", "phone_number"):
            self.assertIn(field, errors)


class DictionaryApiTests(TestCase):
    def setUp(self):
        self.customer_user = User.objects.create_user(
            username="anna",
            password="password",
        )
        self.manager_user = User.objects.create_user(
            username="manager",
            password="password",
        )
        self._add_user_to_group(self.customer_user, CUSTOMER_GROUP)
        self._add_user_to_group(self.manager_user, MANAGER_GROUP)

        self.brand = CarBrand.objects.create(name="Lada")
        self.model = CarModel.objects.create(name="Vesta")
        self.car_type = CarType.objects.create(
            name="Седан",
            description="Легковой автомобиль",
        )
        self.car = Car.objects.create(number="A001AA", carType=self.car_type)
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Анна",
            phoneNumber="+79990000000",
            car=self.car,
        )
        self.second_car = Car.objects.create(
            number="B002BB",
            carType=self.car_type,
            customer=self.customer,
        )

        city = City.objects.create(name="Москва")
        district = District.objects.create(name="Центральный")
        self.station = WashStation.objects.create(
            name="Мойка 1",
            city=city,
            district=district,
            address="Тестовая улица, 1",
        )
        ManagerStationAccess.objects.create(
            user=self.manager_user,
            wash_station=self.station,
        )
        self.wash_type = WashType.objects.create(
            name="Комплекс",
            description="Комплексная мойка",
        )

    def test_car_dictionary_endpoints_are_public(self):
        type_response = self.client.get(reverse("api:cars:type-list"))
        brand_response = self.client.get(reverse("api:cars:brand-list"))
        model_response = self.client.get(reverse("api:cars:model-list"))

        self.assertEqual(type_response.status_code, 200)
        self.assertEqual(brand_response.status_code, 200)
        self.assertEqual(model_response.status_code, 200)
        self.assertEqual(type_response.json()["data"][0]["name"], "Седан")
        self.assertEqual(brand_response.json()["data"][0]["name"], "Lada")
        self.assertEqual(model_response.json()["data"][0]["name"], "Vesta")

    def test_station_dictionary_endpoint_is_public(self):
        response = self.client.get(reverse("api:personal:station-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"][0]
        self.assertEqual(payload["name"], "Мойка 1")
        self.assertEqual(payload["address"], "Тестовая улица, 1")
        self.assertEqual(payload["city"]["name"], "Москва")
        self.assertEqual(payload["district"]["name"], "Центральный")

    def test_wash_type_dictionary_endpoint_is_public(self):
        response = self.client.get(reverse("api:car_wash:wash-type-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"][0]["name"], "Комплекс")

    def test_customer_profile_and_cars_return_current_customer(self):
        self.client.force_login(self.customer_user)

        profile_response = self.client.get(reverse("api:customer:me"))
        cars_response = self.client.get(reverse("api:customer:car-list"))

        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(cars_response.status_code, 200)
        self.assertEqual(profile_response.json()["data"]["id"], self.customer.id)
        self.assertEqual(profile_response.json()["data"]["car"]["number"], "A001AA")
        self.assertEqual(len(cars_response.json()["data"]), 2)
        self.assertEqual(cars_response.json()["data"][0]["number"], "A001AA")
        self.assertEqual(cars_response.json()["data"][1]["number"], "B002BB")

    def test_customer_profile_returns_empty_payload_without_profile(self):
        user = User.objects.create_user(username="no-profile", password="password")
        self.client.force_login(user)

        profile_response = self.client.get(reverse("api:customer:me"))
        cars_response = self.client.get(reverse("api:customer:car-list"))

        self.assertEqual(profile_response.status_code, 200)
        self.assertIsNone(profile_response.json()["data"])
        self.assertEqual(cars_response.json()["data"], [])

    def test_manager_can_read_customer_cars_by_query_param(self):
        self.client.force_login(self.manager_user)

        response = self.client.get(
            reverse("api:customer:car-list"),
            {"customer": self.customer.id},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [car["id"] for car in response.json()["data"]],
            [self.car.id, self.second_car.id],
        )

    def test_customer_can_create_car(self):
        self.client.force_login(self.customer_user)

        response = self.client.post(
            reverse("api:customer:car-list"),
            {"number": "C003CC", "car_type": self.car_type.id},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["data"]
        self.assertEqual(payload["number"], "C003CC")
        self.assertEqual(payload["customer"], self.customer.id)
        self.assertTrue(payload["is_active"])
        self.assertTrue(
            Car.objects.filter(
                number="C003CC",
                customer=self.customer,
                is_active=True,
            ).exists()
        )

    def test_customer_car_create_returns_field_errors(self):
        self.client.force_login(self.customer_user)

        response = self.client.post(
            reverse("api:customer:car-list"),
            {},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("number", payload["field_errors"])
        self.assertIn("car_type", payload["field_errors"])

    def test_customer_can_update_own_car(self):
        self.client.force_login(self.customer_user)

        response = self.client.patch(
            reverse("api:customer:car-detail", kwargs={"pk": self.second_car.id}),
            {"number": "B999BB"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.second_car.refresh_from_db()
        self.assertEqual(self.second_car.number, "B999BB")
        self.assertEqual(response.json()["data"]["number"], "B999BB")

    def test_customer_cannot_update_another_customer_car(self):
        other_user = User.objects.create_user(username="oleg", password="password")
        self._add_user_to_group(other_user, CUSTOMER_GROUP)
        other_car = Car.objects.create(
            number="O001OO",
            carType=self.car_type,
        )
        other_customer = Customer.objects.create(
            user=other_user,
            name="Олег",
            phoneNumber="+79990000001",
            car=other_car,
        )
        other_car.customer = other_customer
        other_car.save(update_fields=["customer"])
        self.client.force_login(self.customer_user)

        response = self.client.patch(
            reverse("api:customer:car-detail", kwargs={"pk": other_car.id}),
            {"number": "HACK"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 404)
        payload = response.json()
        self.assertEqual(payload["field_errors"], {})
        self.assertIn("code", payload)

    def test_customer_can_soft_delete_own_car(self):
        self.client.force_login(self.customer_user)

        response = self.client.delete(
            reverse("api:customer:car-detail", kwargs={"pk": self.second_car.id}),
        )

        self.assertEqual(response.status_code, 200)
        self.second_car.refresh_from_db()
        self.assertFalse(self.second_car.is_active)
        list_response = self.client.get(reverse("api:customer:car-list"))
        self.assertEqual(
            [car["id"] for car in list_response.json()["data"]],
            [self.car.id],
        )

    def test_customer_deleting_last_primary_car_clears_profile_car(self):
        self.client.force_login(self.customer_user)

        self.client.delete(
            reverse("api:customer:car-detail", kwargs={"pk": self.second_car.id}),
        )
        response = self.client.delete(
            reverse("api:customer:car-detail", kwargs={"pk": self.car.id}),
        )

        self.assertEqual(response.status_code, 200)
        self.customer.refresh_from_db()
        self.assertIsNone(self.customer.car_id)

        profile_response = self.client.get(reverse("api:customer:me"))
        list_response = self.client.get(reverse("api:customer:car-list"))

        self.assertIsNone(profile_response.json()["data"]["car"])
        self.assertEqual(list_response.json()["data"], [])

    def _add_user_to_group(self, user, group_name):
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)


class ManagerStationAccessTests(TestCase):
    def setUp(self):
        self.manager_group, _ = Group.objects.get_or_create(name=MANAGER_GROUP)
        self.admin_group, _ = Group.objects.get_or_create(name=ADMIN_GROUP)
        self.manager_user = User.objects.create_user(
            username="manager",
            password="password",
        )
        self.manager_user.groups.add(self.manager_group)
        self.admin_user = User.objects.create_user(
            username="admin",
            password="password",
            is_staff=True,
        )
        self.admin_user.groups.add(self.admin_group)

        city = City.objects.create(name="Москва")
        district = District.objects.create(name="Центральный")
        self.station = WashStation.objects.create(
            name="Мойка 1",
            city=city,
            district=district,
            address="Тестовая улица, 1",
        )
        self.other_station = WashStation.objects.create(
            name="Мойка 2",
            city=city,
            district=district,
            address="Тестовая улица, 2",
        )

    def test_manager_without_station_access_has_empty_scope(self):
        self.assertEqual(user_accessible_station_ids(self.manager_user), [])
        self.assertFalse(can_access_station(self.manager_user, self.station))

    def test_manager_with_active_station_access_is_limited_to_that_station(self):
        ManagerStationAccess.objects.create(
            user=self.manager_user,
            wash_station=self.station,
        )

        self.assertEqual(
            user_accessible_station_ids(self.manager_user),
            [self.station.id],
        )
        self.assertTrue(can_access_station(self.manager_user, self.station))
        self.assertFalse(can_access_station(self.manager_user, self.other_station))

    def test_admin_has_unrestricted_station_scope(self):
        self.assertIsNone(user_accessible_station_ids(self.admin_user))
        self.assertTrue(can_access_station(self.admin_user, self.station))

    def test_staff_without_admin_group_does_not_get_business_scope(self):
        staff_user = User.objects.create_user(
            username="staff-only",
            password="password",
            is_staff=True,
        )

        self.assertEqual(user_accessible_station_ids(staff_user), [])
        self.assertFalse(can_access_station(staff_user, self.station))


class PricingServiceTests(TestCase):
    def setUp(self):
        city = City.objects.create(name="Москва")
        district = District.objects.create(name="Центральный")
        self.station = WashStation.objects.create(
            name="Мойка 1",
            city=city,
            district=district,
            address="Тестовая улица, 1",
        )
        self.car_type = CarType.objects.create(
            name="Седан",
            description="Легковой автомобиль",
        )
        self.wash_type = WashType.objects.create(
            name="Комплекс",
            description="Комплексная мойка",
        )

    def test_build_pricing_quote_uses_station_dictionaries(self):
        WashDuration.objects.create(
            carType=self.car_type,
            washType=self.wash_type,
            washStation=self.station,
            duration=45,
        )
        WashCost.objects.create(
            carType=self.car_type,
            washType=self.wash_type,
            washStation=self.station,
            cost=Decimal("1200.00"),
        )
        DownPayment.objects.create(
            washStation=self.station,
            rate=Decimal("25.00"),
        )

        quote = build_pricing_quote(
            car_type=self.car_type,
            wash_type=self.wash_type,
            wash_station=self.station,
        )

        self.assertEqual(quote.duration_minutes, 45)
        self.assertEqual(quote.cost, Decimal("1200.00"))
        self.assertEqual(quote.down_payment, Decimal("300.00"))
        self.assertEqual(quote.residual, Decimal("900.00"))

    def test_calculate_down_payment_rounds_to_money(self):
        down_payment = calculate_down_payment(
            cost=Decimal("999.99"),
            rate=Decimal("12.50"),
        )

        self.assertEqual(down_payment, Decimal("125.00"))

    def test_get_wash_duration_fails_when_dictionary_entry_is_missing(self):
        with self.assertRaises(PricingConfigurationError):
            get_wash_duration(
                car_type=self.car_type,
                wash_type=self.wash_type,
                wash_station=self.station,
            )

    def test_get_wash_cost_fails_when_dictionary_entry_is_missing(self):
        with self.assertRaises(PricingConfigurationError):
            get_wash_cost(
                car_type=self.car_type,
                wash_type=self.wash_type,
                wash_station=self.station,
            )


class AvailabilityServiceTests(TestCase):
    def setUp(self):
        self.customer_user = User.objects.create_user(
            username="anna",
            password="password",
        )
        self.manager_user = User.objects.create_user(
            username="manager",
            password="password",
        )
        self._add_user_to_group(self.customer_user, CUSTOMER_GROUP)
        self._add_user_to_group(self.manager_user, MANAGER_GROUP)

        city = City.objects.create(name="Москва")
        district = District.objects.create(name="Центральный")
        self.station = WashStation.objects.create(
            name="Мойка 1",
            city=city,
            district=district,
            address="Тестовая улица, 1",
        )
        ManagerStationAccess.objects.create(
            user=self.manager_user,
            wash_station=self.station,
        )
        self.car_type = CarType.objects.create(
            name="Седан",
            description="Легковой автомобиль",
        )
        self.wash_type = WashType.objects.create(
            name="Комплекс",
            description="Комплексная мойка",
        )
        WashDuration.objects.create(
            carType=self.car_type,
            washType=self.wash_type,
            washStation=self.station,
            duration=60,
        )
        WashCost.objects.create(
            carType=self.car_type,
            washType=self.wash_type,
            washStation=self.station,
            cost=Decimal("1000.00"),
        )
        DownPayment.objects.create(
            washStation=self.station,
            rate=Decimal("25.00"),
        )
        self.box = WashBox.objects.create(
            wash_station=self.station,
            name="Бокс 1",
        )
        self.washer = Washer.objects.create(
            name="Иван",
            surname="Петров",
        )
        self.day = timezone.localdate() + timedelta(days=7)
        WasherShift.objects.create(
            washer=self.washer,
            wash_station=self.station,
            starts_at=make_dt(self.day, 9),
            ends_at=make_dt(self.day, 12),
        )
        self.car = Car.objects.create(number="A001AA", carType=self.car_type)
        self.customer = Customer.objects.create(
            user=self.customer_user,
            name="Анна",
            phoneNumber="+79990000000",
            car=self.car,
        )

    def test_returns_slots_with_available_box_and_washer(self):
        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 10, 11])
        self.assertEqual(slots[0].boxes[0].id, self.box.id)
        self.assertEqual(slots[0].washers[0].id, self.washer.id)

    def test_active_booking_blocks_occupied_box(self):
        self._create_booking(
            starts_at=make_dt(self.day, 10),
            ends_at=make_dt(self.day, 11),
            status=Booking.Status.CONFIRMED,
        )

        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 11])

    def test_cancelled_booking_does_not_block_box(self):
        self._create_booking(
            starts_at=make_dt(self.day, 10),
            ends_at=make_dt(self.day, 11),
            status=Booking.Status.CANCELLED,
        )

        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 10, 11])

    def test_station_resource_block_hides_slots(self):
        ResourceBlock.objects.create(
            wash_station=self.station,
            starts_at=make_dt(self.day, 10),
            ends_at=make_dt(self.day, 11),
            reason="Технический перерыв",
        )

        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 11])

    def test_booking_assignment_blocks_washer(self):
        booking = self._create_booking(
            starts_at=make_dt(self.day, 10),
            ends_at=make_dt(self.day, 11),
            status=Booking.Status.CONFIRMED,
        )
        second_box = WashBox.objects.create(
            wash_station=self.station,
            name="Бокс 2",
        )
        booking.wash_box = second_box
        booking.save()
        BookingAssignment.objects.create(
            booking=booking,
            washer=self.washer,
        )

        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 11])

    def test_booking_assignment_blocks_washer_across_stations(self):
        other_station = self._create_station_without_manager_access()
        other_box = WashBox.objects.create(
            wash_station=other_station,
            name="Бокс другой станции",
        )
        other_customer, other_car = self._create_other_customer()
        booking = Booking.objects.create(
            customer=other_customer,
            car=other_car,
            wash_station=other_station,
            wash_box=other_box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 10),
            ends_at=make_dt(self.day, 11),
            status=Booking.Status.CONFIRMED,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )
        BookingAssignment.objects.create(booking=booking, washer=self.washer)

        slots = get_available_slots(
            wash_station=self.station,
            car_type=self.car_type,
            wash_type=self.wash_type,
            day=self.day,
            step_minutes=60,
        )

        self.assertEqual([slot.starts_at.hour for slot in slots], [9, 11])

    def test_washer_shift_save_rejects_overlapping_shift_for_same_washer(self):
        other_station = self._create_station_without_manager_access()

        with self.assertRaises(ValidationError):
            WasherShift.objects.create(
                washer=self.washer,
                wash_station=other_station,
                starts_at=make_dt(self.day, 10),
                ends_at=make_dt(self.day, 11),
            )

    def test_availability_api_returns_slots(self):
        url = reverse("api:car_wash:availability")

        response = self.client.get(
            url,
            {
                "station": self.station.id,
                "car_type": self.car_type.id,
                "wash_type": self.wash_type.id,
                "date": self.day.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("data", payload)
        self.assertTrue(payload["data"])

    def test_availability_api_validates_required_query_params(self):
        response = self.client.get(reverse("api:car_wash:availability"))

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("station", payload["field_errors"])
        self.assertIn("car_type", payload["field_errors"])
        self.assertIn("wash_type", payload["field_errors"])
        self.assertIn("date", payload["field_errors"])

    def test_create_booking_assigns_resources_and_pricing(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        self.assertEqual(booking.wash_box_id, self.box.id)
        self.assertEqual(booking.ends_at, make_dt(self.day, 10))
        self.assertEqual(booking.cost, Decimal("1000.00"))
        self.assertEqual(booking.down_payment, Decimal("250.00"))
        self.assertEqual(booking.residual, Decimal("750.00"))
        self.assertEqual(booking.assignments.get().washer_id, self.washer.id)

    def test_create_booking_allows_additional_customer_car(self):
        second_car = Car.objects.create(
            number="B002BB",
            carType=self.car_type,
            customer=self.customer,
        )

        booking = create_booking(
            customer=self.customer,
            car=second_car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        self.assertEqual(booking.car_id, second_car.id)

    def test_create_booking_rejects_car_linked_to_another_customer(self):
        other_customer, _ = self._create_other_customer()
        other_car = Car.objects.create(
            number="B002BB",
            carType=self.car_type,
            customer=other_customer,
        )

        with self.assertRaises(BookingError):
            create_booking(
                customer=self.customer,
                car=other_car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=make_dt(self.day, 9),
            )

    def test_create_booking_rejects_inactive_car(self):
        inactive_car = Car.objects.create(
            number="B002BB",
            carType=self.car_type,
            customer=self.customer,
            is_active=False,
        )

        with self.assertRaises(BookingError):
            create_booking(
                customer=self.customer,
                car=inactive_car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=make_dt(self.day, 9),
            )

    def test_create_booking_fails_when_resources_are_busy(self):
        create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        another_car = Car.objects.create(number="B002BB", carType=self.car_type)
        another_customer = Customer.objects.create(
            name="Олег",
            phoneNumber="+79990000001",
            car=another_car,
        )

        with self.assertRaises(BookingError):
            create_booking(
                customer=another_customer,
                car=another_car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=make_dt(self.day, 9),
            )

    def test_create_booking_rejects_past_start_time(self):
        with self.assertRaises(BookingError):
            create_booking(
                customer=self.customer,
                car=self.car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=timezone.now() - timedelta(hours=1),
            )

    def test_create_booking_rejects_empty_explicit_washer_list(self):
        with self.assertRaises(BookingError):
            create_booking(
                customer=self.customer,
                car=self.car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=make_dt(self.day, 9),
                washers=[],
            )

    def test_cancel_booking_marks_booking_cancelled(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        booking = cancel_booking(booking=booking)

        self.assertEqual(booking.status, Booking.Status.CANCELLED)

    def test_cancel_booking_locks_booking_before_validation(self):
        from car_wash.services import booking as booking_service

        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        with mock.patch.object(
            booking_service,
            "_lock_booking",
            wraps=booking_service._lock_booking,
        ) as lock_spy:
            cancel_booking(booking=booking)

        lock_spy.assert_called_once_with(booking)

    def test_cancel_booking_rejects_started_or_terminal_statuses(self):
        for booking_status in (
            Booking.Status.IN_PROGRESS,
            Booking.Status.COMPLETED,
            Booking.Status.CANCELLED,
            Booking.Status.NO_SHOW,
        ):
            booking = self._create_booking(
                starts_at=make_dt(self.day, 9),
                ends_at=make_dt(self.day, 10),
                status=booking_status,
            )

            with self.assertRaises(BookingError):
                cancel_booking(booking=booking)

    def test_reschedule_booking_updates_time_and_keeps_assignments_valid(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        booking = reschedule_booking(
            booking=booking,
            starts_at=make_dt(self.day, 10),
        )

        self.assertEqual(booking.starts_at, make_dt(self.day, 10))
        self.assertEqual(booking.ends_at, make_dt(self.day, 11))
        self.assertEqual(booking.assignments.get().washer_id, self.washer.id)

    def test_reschedule_booking_locks_booking_before_validation(self):
        from car_wash.services import booking as booking_service

        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        with mock.patch.object(
            booking_service,
            "_lock_booking",
            wraps=booking_service._lock_booking,
        ) as lock_spy:
            reschedule_booking(
                booking=booking,
                starts_at=make_dt(self.day, 10),
            )

        lock_spy.assert_called_once_with(booking)

    def test_reschedule_booking_rejects_terminal_status(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status"])

        with self.assertRaises(BookingError):
            reschedule_booking(
                booking=booking,
                starts_at=make_dt(self.day, 10),
            )

        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.CANCELLED)
        self.assertEqual(booking.starts_at, make_dt(self.day, 9))

    def test_reschedule_booking_rejects_past_target_time(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        with self.assertRaises(BookingError):
            reschedule_booking(
                booking=booking,
                starts_at=timezone.now() - timedelta(hours=1),
            )

        booking.refresh_from_db()
        self.assertEqual(booking.starts_at, make_dt(self.day, 9))

    def test_create_booking_acquires_station_lock_before_resource_check(self):
        """The station row lock must be taken inside the booking transaction.
        On PostgreSQL this serializes concurrent attempts; on SQLite the
        engine itself serializes writers, so the call is a no-op but kept
        for cross-engine parity."""
        from car_wash.services import booking as booking_service

        with mock.patch.object(
            booking_service,
            "_lock_station",
            wraps=booking_service._lock_station,
        ) as lock_spy:
            create_booking(
                customer=self.customer,
                car=self.car,
                wash_station=self.station,
                wash_type=self.wash_type,
                starts_at=make_dt(self.day, 9),
            )

        lock_spy.assert_called_once_with(self.station)

    def test_repeated_create_booking_attempts_only_one_succeeds(self):
        """Stress: launch N sequential create_booking calls into the same
        slot with a single available box and washer. The first must commit,
        the rest must raise BookingError without leaking active bookings."""
        attempts = 5
        successes = 0
        failures = 0

        for index in range(attempts):
            extra_user = User.objects.create_user(
                username=f"stress-customer-{index}",
                password="password",
            )
            extra_car = Car.objects.create(
                number=f"STRESS{index:03d}",
                carType=self.car_type,
            )
            extra_customer = Customer.objects.create(
                user=extra_user,
                name=f"Стресс {index}",
                phoneNumber=f"+7990000{index:04d}",
                car=extra_car,
            )
            extra_car.customer = extra_customer
            extra_car.save(update_fields=["customer"])

            try:
                create_booking(
                    customer=extra_customer,
                    car=extra_car,
                    wash_station=self.station,
                    wash_type=self.wash_type,
                    starts_at=make_dt(self.day, 9),
                )
                successes += 1
            except BookingError:
                failures += 1

        self.assertEqual(successes, 1)
        self.assertEqual(failures, attempts - 1)
        active_count = Booking.objects.filter(
            wash_station=self.station,
            wash_box=self.box,
            starts_at=make_dt(self.day, 9),
            status__in=(
                Booking.Status.PENDING,
                Booking.Status.CONFIRMED,
                Booking.Status.IN_PROGRESS,
            ),
        ).count()
        self.assertEqual(active_count, 1)

    def test_reschedule_booking_into_busy_slot_raises(self):
        """Reschedule must reject overlapping slots even when the only
        conflicting booking belongs to a different customer."""
        own_booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        other_customer, other_car = self._create_other_customer()
        Booking.objects.create(
            customer=other_customer,
            car=other_car,
            wash_station=self.station,
            wash_box=self.box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 11),
            ends_at=make_dt(self.day, 12),
            status=Booking.Status.CONFIRMED,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )

        with self.assertRaises(BookingError):
            reschedule_booking(
                booking=own_booking,
                starts_at=make_dt(self.day, 11),
            )

        own_booking.refresh_from_db()
        self.assertEqual(own_booking.starts_at, make_dt(self.day, 9))

    def test_notification_outbox_records_lifecycle_events(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
            actor=self.customer_user,
        )
        reschedule_booking(
            booking=booking,
            starts_at=make_dt(self.day, 11),
            actor=self.manager_user,
        )
        cancel_booking(booking=booking, actor=self.manager_user)

        events = list(
            NotificationOutbox.objects.filter(booking=booking).order_by("created_at")
        )
        self.assertEqual(
            [event.event for event in events],
            [
                NotificationOutbox.Event.BOOKING_CREATED,
                NotificationOutbox.Event.BOOKING_RESCHEDULED,
                NotificationOutbox.Event.BOOKING_CANCELLED,
            ],
        )
        for event in events:
            self.assertEqual(event.status, NotificationOutbox.Status.PENDING)

    def test_process_notifications_marks_rows_sent(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
            actor=self.manager_user,
        )

        out = StringIO()
        call_command("process_notifications", stdout=out)
        output = out.getvalue()

        self.assertIn("отправлено 1", output)
        event = NotificationOutbox.objects.get(booking=booking)
        self.assertEqual(event.status, NotificationOutbox.Status.SENT)
        self.assertEqual(event.attempts, 1)
        self.assertIsNotNone(event.processed_at)

        # Re-running on a drained queue is a no-op.
        out2 = StringIO()
        call_command("process_notifications", stdout=out2)
        self.assertIn("Очередь уведомлений пуста.", out2.getvalue())

    def test_process_notifications_dry_run_keeps_rows_pending(self):
        create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        call_command("process_notifications", "--dry-run")

        self.assertTrue(
            NotificationOutbox.objects.filter(
                status=NotificationOutbox.Status.PENDING,
            ).exists()
        )

    def test_new_booking_starts_unpaid(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        self.assertEqual(booking.payment_status, Booking.PaymentStatus.UNPAID)
        self.assertEqual(booking.paid_amount, Decimal("0"))
        self.assertEqual(booking.payment_provider, "")
        self.assertEqual(booking.payment_reference, "")

    def test_mark_booking_paid_records_full_payment(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        mark_booking_paid(
            booking=booking,
            amount=booking.down_payment,
            provider="stripe",
            reference="pi_test_001",
            actor=self.customer_user,
        )
        booking.refresh_from_db()

        self.assertEqual(booking.payment_status, Booking.PaymentStatus.PAID)
        self.assertEqual(booking.paid_amount, booking.down_payment)
        self.assertEqual(booking.payment_provider, "stripe")
        self.assertEqual(booking.payment_reference, "pi_test_001")

    def test_mark_booking_paid_with_partial_amount_marks_awaiting(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        mark_booking_paid(booking=booking, amount=Decimal("100.00"))
        booking.refresh_from_db()

        self.assertEqual(booking.payment_status, Booking.PaymentStatus.AWAITING)

    def test_mark_booking_paid_rejects_negative_amount(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        with self.assertRaises(BookingError):
            mark_booking_paid(booking=booking, amount=Decimal("-1"))

    def test_booking_payload_exposes_payment_fields(self):
        self._login_customer()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        mark_booking_paid(booking=booking, amount=booking.down_payment)

        response = self.client.get(reverse("api:car_wash:booking-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(len(payload), 1)
        item = payload[0]
        self.assertEqual(item["payment_status"], Booking.PaymentStatus.PAID)
        self.assertIn("paid_amount", item)
        self.assertIn("payment_provider", item)
        self.assertIn("payment_reference", item)

    def test_audit_log_records_lifecycle_events(self):
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
            actor=self.customer_user,
        )
        reschedule_booking(
            booking=booking,
            starts_at=make_dt(self.day, 11),
            actor=self.manager_user,
        )
        cancel_booking(booking=booking, actor=self.manager_user)

        events = list(
            AuditEvent.objects.filter(
                entity_type=Booking.__name__,
                entity_id=booking.id,
            ).order_by("created_at")
        )
        actions = [event.action for event in events]
        self.assertEqual(
            actions,
            [
                AuditEvent.Action.BOOKING_CREATED,
                AuditEvent.Action.BOOKING_RESCHEDULED,
                AuditEvent.Action.BOOKING_CANCELLED,
            ],
        )
        self.assertEqual(events[0].actor_id, self.customer_user.id)
        self.assertEqual(events[1].actor_id, self.manager_user.id)
        self.assertIn("previous_starts_at", events[1].context)
        self.assertEqual(events[2].context["previous_status"], Booking.Status.PENDING)

    def test_manager_booking_audit_endpoint_returns_history(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
            actor=self.manager_user,
        )

        response = self.client.get(
            reverse("api:manager:booking-audit", args=[booking.id]),
        )

        self.assertEqual(response.status_code, 200)
        events = response.json()["data"]
        self.assertGreaterEqual(len(events), 1)
        first = events[0]
        self.assertEqual(first["action"], AuditEvent.Action.BOOKING_CREATED)
        self.assertEqual(first["actor"], self.manager_user.id)
        self.assertEqual(first["actor_username"], self.manager_user.username)

    def test_manager_reports_endpoint_aggregates_for_day(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        mark_booking_paid(booking=booking, amount=booking.down_payment)

        response = self.client.get(
            reverse("api:manager:reports"),
            {"station": self.station.id, "date_from": self.day.isoformat()},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["date_from"], self.day.isoformat())
        self.assertEqual(payload["date_to"], self.day.isoformat())
        self.assertEqual(payload["bookings_total"], 1)
        self.assertEqual(payload["bookings_by_status"], [{"status": "pending", "count": 1}])
        self.assertEqual(payload["revenue_paid"], str(booking.down_payment))
        self.assertEqual(
            payload["box_utilization"][0]["wash_box"], self.box.id
        )
        self.assertEqual(payload["box_utilization"][0]["minutes"], 60)
        self.assertEqual(
            payload["washer_utilization"][0]["washer"], self.washer.id
        )

    def test_manager_reports_endpoint_validates_range(self):
        self._login_manager()

        response = self.client.get(
            reverse("api:manager:reports"),
            {"date_from": "not-a-date"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")

    def test_manager_reports_endpoint_rejects_inaccessible_station(self):
        self._login_manager()
        other_station = self._create_station_without_manager_access()

        response = self.client.get(
            reverse("api:manager:reports"),
            {"station": other_station.id, "date_from": self.day.isoformat()},
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_booking_audit_endpoint_rejects_inaccessible_station(self):
        self._login_manager()
        booking = self._create_booking_without_manager_station_access()

        response = self.client.get(
            reverse("api:manager:booking-audit", args=[booking.id]),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_assign_booking_resources_rejects_box_in_use(self):
        own_booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        other_customer, other_car = self._create_other_customer()
        Booking.objects.create(
            customer=other_customer,
            car=other_car,
            wash_station=self.station,
            wash_box=self.box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
            ends_at=make_dt(self.day, 10),
            status=Booking.Status.CONFIRMED,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )

        with self.assertRaises(BookingError):
            assign_booking_resources(
                booking=own_booking,
                wash_box=self.box,
                washers=[self.washer],
            )

    def test_booking_api_creates_booking(self):
        self._login_customer()
        url = reverse("api:car_wash:booking-list")

        response = self.client.post(
            url,
            {
                "customer": self.customer.id,
                "car": self.car.id,
                "wash_station": self.station.id,
                "wash_type": self.wash_type.id,
                "starts_at": make_dt(self.day, 9).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["data"]["status"], Booking.Status.PENDING)
        self.assertEqual(payload["data"]["wash_box"], self.box.id)
        self.assertEqual(payload["data"]["washers"][0]["id"], self.washer.id)

    def test_manager_booking_api_rejects_unknown_washer(self):
        self._login_manager()
        url = reverse("api:car_wash:booking-list")

        response = self.client.post(
            url,
            {
                "customer": self.customer.id,
                "car": self.car.id,
                "wash_station": self.station.id,
                "wash_type": self.wash_type.id,
                "starts_at": make_dt(self.day, 9).isoformat(),
                "washers": [999999],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "booking_error")
        self.assertFalse(Booking.objects.exists())

    def test_booking_api_requires_authenticated_user(self):
        url = reverse("api:car_wash:booking-list")

        response = self.client.get(url)

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertIn("detail", payload)
        self.assertEqual(payload["field_errors"], {})
        self.assertIn("code", payload)

    def test_customer_booking_list_returns_only_own_bookings(self):
        own_booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        other_customer, _ = self._create_other_customer()
        Booking.objects.create(
            customer=other_customer,
            car=other_customer.car,
            wash_station=self.station,
            wash_box=self.box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 11),
            ends_at=make_dt(self.day, 12),
            status=Booking.Status.PENDING,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )
        self._login_customer()
        url = reverse("api:car_wash:booking-list")

        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], own_booking.id)

    def test_customer_cannot_create_booking_for_another_customer(self):
        other_customer, other_car = self._create_other_customer()
        self._login_customer()
        url = reverse("api:car_wash:booking-list")

        response = self.client.post(
            url,
            {
                "customer": other_customer.id,
                "car": other_car.id,
                "wash_station": self.station.id,
                "wash_type": self.wash_type.id,
                "starts_at": make_dt(self.day, 9).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertEqual(payload["code"], "forbidden")
        self.assertEqual(payload["field_errors"], {})

    def test_customer_cannot_manually_assign_resources(self):
        self._login_customer()
        url = reverse("api:car_wash:booking-list")

        response = self.client.post(
            url,
            {
                "customer": self.customer.id,
                "car": self.car.id,
                "wash_station": self.station.id,
                "wash_type": self.wash_type.id,
                "starts_at": make_dt(self.day, 9).isoformat(),
                "wash_box": self.box.id,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertEqual(payload["code"], "manager_assignment_required")
        self.assertIn("wash_box", payload["field_errors"])
        self.assertIn("washers", payload["field_errors"])

    def test_cancel_api_rejects_terminal_booking(self):
        self._login_customer()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        booking.status = Booking.Status.COMPLETED
        booking.save(update_fields=["status"])

        response = self.client.patch(
            reverse("api:car_wash:booking-cancel", args=[booking.id]),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "booking_error")
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.COMPLETED)

    def test_reschedule_api_rejects_cancelled_booking(self):
        self._login_customer()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status"])

        response = self.client.patch(
            reverse("api:car_wash:booking-reschedule", args=[booking.id]),
            {"starts_at": make_dt(self.day, 10).isoformat()},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "booking_error")
        booking.refresh_from_db()
        self.assertEqual(booking.status, Booking.Status.CANCELLED)
        self.assertEqual(booking.starts_at, make_dt(self.day, 9))

    def test_customer_cannot_access_manager_schedule(self):
        self._login_customer()
        url = reverse("api:manager:schedule")

        response = self.client.get(
            url,
            {
                "station": self.station.id,
                "date": self.day.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 403)
        payload = response.json()
        self.assertIn("detail", payload)
        self.assertEqual(payload["field_errors"], {})
        self.assertIn("code", payload)

    def test_manager_schedule_api_returns_day_resources_and_bookings(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        ResourceBlock.objects.create(
            wash_station=self.station,
            starts_at=make_dt(self.day, 11),
            ends_at=make_dt(self.day, 12),
            reason="Перерыв",
        )
        url = reverse("api:manager:schedule")

        response = self.client.get(
            url,
            {
                "station": self.station.id,
                "date": self.day.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["station"], self.station.id)
        self.assertEqual(payload["bookings"][0]["id"], booking.id)
        self.assertEqual(payload["boxes"][0]["id"], self.box.id)
        self.assertEqual(payload["shifts"][0]["washer"], self.washer.id)
        self.assertEqual(payload["resource_blocks"][0]["reason"], "Перерыв")
        self.assertIn("day_starts_at", payload)
        self.assertIn("day_ends_at", payload)
        self.assertEqual(payload["step_minutes"], 30)
        self.assertEqual(payload["summary"]["total_bookings"], 1)
        self.assertEqual(payload["summary"]["active_bookings"], 1)
        self.assertEqual(
            payload["summary"]["busy_box_minutes"],
            [{"wash_box": self.box.id, "minutes": 60}],
        )
        self.assertEqual(
            payload["summary"]["busy_washer_minutes"],
            [{"washer": self.washer.id, "minutes": 60}],
        )

    def test_manager_schedule_summary_excludes_cancelled_bookings(self):
        self._login_manager()
        active = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        cancelled_customer, cancelled_car = self._create_other_customer()
        cancelled = Booking.objects.create(
            customer=cancelled_customer,
            car=cancelled_car,
            wash_station=self.station,
            wash_box=self.box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 11),
            ends_at=make_dt(self.day, 12),
            status=Booking.Status.CANCELLED,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )

        response = self.client.get(
            reverse("api:manager:schedule"),
            {"station": self.station.id, "date": self.day.isoformat()},
        )

        payload = response.json()["data"]
        self.assertEqual(payload["summary"]["total_bookings"], 2)
        self.assertEqual(payload["summary"]["active_bookings"], 1)
        self.assertEqual(
            payload["summary"]["busy_box_minutes"][0]["minutes"], 60
        )
        booking_ids = {entry["id"] for entry in payload["bookings"]}
        self.assertEqual(booking_ids, {active.id, cancelled.id})

    def test_manager_booking_detail_returns_booking(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )

        response = self.client.get(
            reverse("api:manager:booking-detail", args=[booking.id]),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["id"], booking.id)
        self.assertEqual(payload["wash_box"], self.box.id)

    def test_manager_booking_detail_rejects_inaccessible_station(self):
        self._login_manager()
        booking = self._create_booking_without_manager_station_access()

        response = self.client.get(
            reverse("api:manager:booking-detail", args=[booking.id]),
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_schedule_api_validates_required_query_params(self):
        self._login_manager()

        response = self.client.get(reverse("api:manager:schedule"))

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("station", payload["field_errors"])
        self.assertIn("date", payload["field_errors"])

    def test_manager_schedule_api_rejects_inaccessible_station(self):
        self._login_manager()
        other_station = self._create_station_without_manager_access()

        response = self.client.get(
            reverse("api:manager:schedule"),
            {
                "station": other_station.id,
                "date": self.day.isoformat(),
            },
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_booking_list_filters_by_status_and_washer(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        url = reverse("api:manager:booking-list")

        response = self.client.get(
            url,
            {
                "station": self.station.id,
                "date": self.day.isoformat(),
                "status": Booking.Status.PENDING,
                "washer": self.washer.id,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["id"], booking.id)

    def test_manager_booking_list_hides_inaccessible_station_bookings(self):
        self._login_manager()
        visible_booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        hidden_booking = self._create_booking_without_manager_station_access()

        response = self.client.get(reverse("api:manager:booking-list"))

        self.assertEqual(response.status_code, 200)
        booking_ids = [booking["id"] for booking in response.json()["data"]]
        self.assertIn(visible_booking.id, booking_ids)
        self.assertNotIn(hidden_booking.id, booking_ids)

    def test_manager_assign_api_replaces_box_and_washer(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        second_box = WashBox.objects.create(
            wash_station=self.station,
            name="Бокс 2",
        )
        second_washer = Washer.objects.create(
            name="Петр",
            surname="Иванов",
        )
        WasherShift.objects.create(
            washer=second_washer,
            wash_station=self.station,
            starts_at=make_dt(self.day, 9),
            ends_at=make_dt(self.day, 12),
        )
        url = reverse("api:manager:booking-assign", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {
                "wash_box": second_box.id,
                "washers": [second_washer.id],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["wash_box"], second_box.id)
        self.assertEqual(payload["washers"][0]["id"], second_washer.id)

    def test_manager_assign_api_rejects_inaccessible_station_booking(self):
        self._login_manager()
        booking = self._create_booking_without_manager_station_access()
        url = reverse("api:manager:booking-assign", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {
                "wash_box": booking.wash_box_id,
                "washers": [self.washer.id],
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_assign_api_validates_required_washers(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        url = reverse("api:manager:booking-assign", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {"wash_box": self.box.id},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("washers", payload["field_errors"])

    def test_manager_assign_api_rejects_empty_washer_list(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        url = reverse("api:manager:booking-assign", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {"wash_box": self.box.id, "washers": []},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "validation_error")
        booking.refresh_from_db()
        self.assertEqual(booking.assignments.get().washer_id, self.washer.id)

    def test_manager_status_api_changes_booking_status(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        url = reverse("api:manager:booking-status", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {"status": Booking.Status.CONFIRMED},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"]["status"], Booking.Status.CONFIRMED)

    def test_manager_status_api_validates_status(self):
        self._login_manager()
        booking = create_booking(
            customer=self.customer,
            car=self.car,
            wash_station=self.station,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 9),
        )
        url = reverse("api:manager:booking-status", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {"status": "unknown"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("status", payload["field_errors"])

    def test_manager_status_api_rejects_inaccessible_station_booking(self):
        self._login_manager()
        booking = self._create_booking_without_manager_station_access()
        url = reverse("api:manager:booking-status", kwargs={"pk": booking.id})

        response = self.client.patch(
            url,
            {"status": Booking.Status.CONFIRMED},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_shift_api_creates_shift(self):
        self._login_manager()
        washer = Washer.objects.create(name="Сергей", surname="Сидоров")
        url = reverse("api:manager:shift-list")

        response = self.client.post(
            url,
            {
                "washer": washer.id,
                "wash_station": self.station.id,
                "starts_at": make_dt(self.day, 13).isoformat(),
                "ends_at": make_dt(self.day, 18).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["data"]
        self.assertEqual(payload["washer"], washer.id)
        self.assertEqual(payload["wash_station"], self.station.id)

    def test_manager_shift_api_validates_datetime_order(self):
        self._login_manager()
        washer = Washer.objects.create(name="Сергей", surname="Сидоров")
        url = reverse("api:manager:shift-list")

        response = self.client.post(
            url,
            {
                "washer": washer.id,
                "wash_station": self.station.id,
                "starts_at": make_dt(self.day, 18).isoformat(),
                "ends_at": make_dt(self.day, 13).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("ends_at", payload["field_errors"])

    def test_manager_shift_api_rejects_overlapping_shift_for_same_washer(self):
        self._login_manager()
        other_station = WashStation.objects.create(
            name="Мойка 2",
            city=self.station.city,
            district=self.station.district,
            address="Тестовая улица, 2",
        )
        ManagerStationAccess.objects.create(
            user=self.manager_user,
            wash_station=other_station,
        )
        url = reverse("api:manager:shift-list")

        response = self.client.post(
            url,
            {
                "washer": self.washer.id,
                "wash_station": other_station.id,
                "starts_at": make_dt(self.day, 10).isoformat(),
                "ends_at": make_dt(self.day, 11).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["code"], "validation_error")
        self.assertIn("__all__", payload["field_errors"])

    def test_manager_shift_api_rejects_inaccessible_station(self):
        self._login_manager()
        other_station = self._create_station_without_manager_access()
        washer = Washer.objects.create(name="Сергей", surname="Сидоров")
        url = reverse("api:manager:shift-list")

        response = self.client.post(
            url,
            {
                "washer": washer.id,
                "wash_station": other_station.id,
                "starts_at": make_dt(self.day, 13).isoformat(),
                "ends_at": make_dt(self.day, 18).isoformat(),
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def test_manager_resource_block_api_creates_block(self):
        self._login_manager()
        url = reverse("api:manager:resource-block-list")

        response = self.client.post(
            url,
            {
                "wash_station": self.station.id,
                "wash_box": self.box.id,
                "starts_at": make_dt(self.day, 13).isoformat(),
                "ends_at": make_dt(self.day, 14).isoformat(),
                "reason": "Ремонт",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["data"]
        self.assertEqual(payload["wash_box"], self.box.id)
        self.assertEqual(payload["reason"], "Ремонт")

    def test_manager_resource_block_api_rejects_inaccessible_station(self):
        self._login_manager()
        other_station = self._create_station_without_manager_access()
        url = reverse("api:manager:resource-block-list")

        response = self.client.post(
            url,
            {
                "wash_station": other_station.id,
                "starts_at": make_dt(self.day, 13).isoformat(),
                "ends_at": make_dt(self.day, 14).isoformat(),
                "reason": "Ремонт",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["code"], "station_access_denied")

    def _add_user_to_group(self, user, group_name):
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)

    def _login_customer(self):
        self.client.force_login(self.customer_user)

    def _login_manager(self):
        self.client.force_login(self.manager_user)

    def _create_other_customer(self):
        other_user = User.objects.create_user(
            username=f"customer-{Customer.objects.count()}",
            password="password",
        )
        self._add_user_to_group(other_user, CUSTOMER_GROUP)
        other_car = Car.objects.create(
            number=f"OTHER{Customer.objects.count()}",
            carType=self.car_type,
        )
        other_customer = Customer.objects.create(
            user=other_user,
            name="Олег",
            phoneNumber=f"+7999000100{Customer.objects.count()}",
            car=other_car,
        )
        other_car.customer = other_customer
        other_car.save(update_fields=["customer"])
        return other_customer, other_car

    def _create_station_without_manager_access(self):
        return WashStation.objects.create(
            name=f"Мойка без доступа {WashStation.objects.count()}",
            city=self.station.city,
            district=self.station.district,
            address="Скрытая улица, 1",
        )

    def _create_booking_without_manager_station_access(self):
        station = self._create_station_without_manager_access()
        box = WashBox.objects.create(
            wash_station=station,
            name="Бокс без доступа",
        )
        return Booking.objects.create(
            customer=self.customer,
            car=self.car,
            wash_station=station,
            wash_box=box,
            wash_type=self.wash_type,
            starts_at=make_dt(self.day, 13),
            ends_at=make_dt(self.day, 14),
            status=Booking.Status.PENDING,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )

    def _create_booking(self, *, starts_at, ends_at, status):
        suffix = Customer.objects.count() + 1000
        car = Car.objects.create(
            number=f"TEST{Booking.objects.count()}",
            carType=self.car_type,
        )
        customer = Customer.objects.create(
            name="Анна",
            phoneNumber=f"+7999200{suffix:06d}",
            car=car,
        )

        return Booking.objects.create(
            customer=customer,
            car=car,
            wash_station=self.station,
            wash_box=self.box,
            wash_type=self.wash_type,
            starts_at=starts_at,
            ends_at=ends_at,
            status=status,
            cost=Decimal("1000.00"),
            down_payment=Decimal("250.00"),
            residual=Decimal("750.00"),
        )


class DemoDataCommandTests(TestCase):
    def test_seed_demo_data_creates_local_demo_dataset(self):
        out = StringIO()

        call_command("seed_demo_data", stdout=out)

        self.assertTrue(User.objects.filter(username="demo_manager").exists())
        self.assertTrue(User.objects.filter(username="demo_customer").exists())
        self.assertTrue(User.objects.filter(username="demo_admin").exists())
        self.assertTrue(WashStation.objects.filter(name="Demo Station").exists())
        self.assertEqual(WashBox.objects.count(), 2)
        self.assertEqual(WasherShift.objects.count(), 2)
        self.assertTrue(Customer.objects.filter(phoneNumber="+10000000000").exists())
        self.assertTrue(
            ManagerStationAccess.objects.filter(
                user__username="demo_manager",
                wash_station__name="Demo Station",
                is_active=True,
            ).exists()
        )
        self.assertIn("Demo data created", out.getvalue())

    def test_seed_demo_data_resets_documented_demo_passwords(self):
        User.objects.create_user(
            username="demo_admin",
            password="stale-password",
            is_staff=False,
            is_superuser=False,
        )

        call_command("seed_demo_data", stdout=StringIO())

        demo_admin = User.objects.get(username="demo_admin")
        self.assertTrue(demo_admin.check_password("password"))
        self.assertTrue(demo_admin.is_staff)
        self.assertTrue(demo_admin.is_superuser)
        self.assertIsNotNone(
            authenticate(username="demo_admin", password="password")
        )


class AdminLanguageSwitcherTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="demo_admin",
            email="demo-admin@example.com",
            password="password",
        )
        self.client.force_login(self.admin)

    def test_admin_header_contains_language_switcher(self):
        response = self.client.get("/admin/")

        self.assertContains(response, 'action="/i18n/setlang/"')
        self.assertContains(response, 'name="language"')
        self.assertContains(response, 'onchange="this.form.submit()"')
        self.assertContains(response, 'value="ru" selected')
        self.assertContains(response, 'value="en"')

    def test_admin_language_switch_updates_rendered_admin_chrome(self):
        response = self.client.post(
            "/i18n/setlang/",
            {"language": "en", "next": "/admin/"},
            follow=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.cookies[settings.LANGUAGE_COOKIE_NAME].value,
            "en",
        )
        self.assertContains(response, "Site administration")
        self.assertContains(response, 'value="en" selected')
        self.assertNotContains(response, "Администрирование сайта")
