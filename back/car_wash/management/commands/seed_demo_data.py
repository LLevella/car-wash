from datetime import datetime, time
from decimal import Decimal

from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand
from django.utils import timezone

from cars.models import CarType
from customer.models import Car, Customer
from personal.models import City, District, Washer, WashStation

from car_wash.models import (
    DownPayment,
    WashBox,
    WashCoast,
    WashDuration,
    WasherShift,
    WashType,
)
from car_wash.permissions import ADMIN_GROUP, CUSTOMER_GROUP, MANAGER_GROUP


class Command(BaseCommand):
    help = "Create demo data for local car wash development."

    def handle(self, *args, **options):
        groups = self._create_groups()
        manager_user = self._create_user(
            username="demo_manager",
            password="password",
            group=groups[MANAGER_GROUP],
            is_staff=True,
        )
        customer_user = self._create_user(
            username="demo_customer",
            password="password",
            group=groups[CUSTOMER_GROUP],
        )
        self._create_user(
            username="demo_admin",
            password="password",
            group=groups[ADMIN_GROUP],
            is_staff=True,
            is_superuser=True,
        )

        city, _ = City.objects.get_or_create(name="Demo City")
        district, _ = District.objects.get_or_create(name="Central")
        station, _ = WashStation.objects.get_or_create(
            name="Demo Station",
            defaults={
                "city": city,
                "district": district,
                "address": "1 Demo Street",
            },
        )

        for bay_name in ("Bay 1", "Bay 2"):
            WashBox.objects.get_or_create(
                wash_station=station,
                name=bay_name,
            )

        car_type, _ = CarType.objects.get_or_create(
            name="Sedan",
            defaults={"description": "Passenger car"},
        )
        wash_type, _ = WashType.objects.get_or_create(
            name="Standard wash",
            defaults={"description": "Exterior wash and drying"},
        )
        WashDuration.objects.update_or_create(
            carType=car_type,
            washType=wash_type,
            washStation=station,
            defaults={"duration": 45},
        )
        WashCoast.objects.update_or_create(
            carType=car_type,
            washType=wash_type,
            washStation=station,
            defaults={"cost": Decimal("900.00")},
        )
        DownPayment.objects.update_or_create(
            washStation=station,
            defaults={"rate": Decimal("20.00")},
        )

        car, _ = Car.objects.get_or_create(
            number="DEMO001",
            defaults={"carType": car_type},
        )
        Customer.objects.update_or_create(
            phoneNumber="+10000000000",
            defaults={
                "user": customer_user,
                "name": "Demo Customer",
                "car": car,
            },
        )

        washer_names = (
            ("Alex", "Washer"),
            ("Maria", "Clean"),
        )
        today = timezone.localdate()
        starts_at = timezone.make_aware(datetime.combine(today, time(9, 0)))
        ends_at = timezone.make_aware(datetime.combine(today, time(18, 0)))
        for name, surname in washer_names:
            washer, _ = Washer.objects.get_or_create(name=name, surname=surname)
            WasherShift.objects.update_or_create(
                washer=washer,
                wash_station=station,
                starts_at=starts_at,
                defaults={
                    "ends_at": ends_at,
                    "is_active": True,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Demo data created. Users: demo_manager/password, "
                "demo_customer/password, demo_admin/password."
            )
        )

    def _create_groups(self):
        groups = {}
        for group_name in (CUSTOMER_GROUP, MANAGER_GROUP, ADMIN_GROUP):
            groups[group_name], _ = Group.objects.get_or_create(name=group_name)
        return groups

    def _create_user(
        self,
        *,
        username,
        password,
        group,
        is_staff=False,
        is_superuser=False,
    ):
        user, created = User.objects.get_or_create(username=username)
        if created:
            user.set_password(password)
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.save()
        user.groups.add(group)
        return user
