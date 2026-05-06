from datetime import date, datetime, time
from decimal import Decimal
from io import StringIO
import os
from pathlib import Path
from unittest import mock

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.test import Client, SimpleTestCase, TestCase
from django.urls import reverse
from django.utils import timezone

from back.config import database_config, env_bool, env_int, env_list
from cars.models import CarType
from customer.models import Car, Customer
from personal.models import City, District, Washer, WashStation
from car_wash.models import (
    Booking,
    BookingAssignment,
    DownPayment,
    ResourceBlock,
    WashBox,
    WashCost,
    WashDuration,
    WasherShift,
    WashType,
)
from car_wash.permissions import ADMIN_GROUP, CUSTOMER_GROUP, MANAGER_GROUP
from car_wash.services.availability import get_available_slots
from car_wash.services.booking import (
    BookingError,
    cancel_booking,
    create_booking,
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
        self.assertIn("password", response.json()["field_errors"])

    def test_logout_clears_session(self):
        self.client.force_login(self.customer_user)

        response = self.client.post(reverse("api:auth:logout"))

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["data"]["is_authenticated"])

        me_response = self.client.get(reverse("api:auth:me"))
        self.assertFalse(me_response.json()["data"]["is_authenticated"])


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
        self.day = date(2026, 5, 6)
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

    def test_booking_api_requires_authenticated_user(self):
        url = reverse("api:car_wash:booking-list")

        response = self.client.get(url)

        self.assertEqual(response.status_code, 403)

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
        return other_customer, other_car

    def _create_booking(self, *, starts_at, ends_at, status):
        car = Car.objects.create(
            number=f"TEST{Booking.objects.count()}",
            carType=self.car_type,
        )
        customer = Customer.objects.create(
            name="Анна",
            phoneNumber=f"+7999000000{Booking.objects.count()}",
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
        self.assertIn("Demo data created", out.getvalue())
