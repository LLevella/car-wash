"""Seed rich booking history for the demo image.

Adds a handful of bookings across today, yesterday, and tomorrow with
various statuses, a paid one, and a couple of cancellations. The booking
service is used for create/cancel/reschedule so the audit log and
notification outbox get populated as a side-effect — opening the demo
manager view immediately shows realistic activity without manual setup.

Idempotent: re-running does nothing once the demo bookings already
exist (matched by their starts_at + customer combination).
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.utils import timezone

from cars.models import CarType
from customer.models import Car, Customer
from personal.models import Washer, WashStation

from car_wash.models import Booking, WasherShift, WashType
from car_wash.permissions import CUSTOMER_GROUP
from car_wash.services.booking import (
    BookingError,
    cancel_booking,
    change_booking_status,
    create_booking,
    mark_booking_paid,
)


class Command(BaseCommand):
    help = "Create demo bookings, audit history, and notifications for the demo image."

    def handle(self, *args, **options):
        try:
            station = WashStation.objects.get(name="Demo Station")
            wash_type = WashType.objects.get(name="Standard wash")
            car_type = CarType.objects.get(name="Sedan")
            manager_user = User.objects.get(username="demo_manager")
        except (
            WashStation.DoesNotExist,
            WashType.DoesNotExist,
            CarType.DoesNotExist,
            User.DoesNotExist,
        ) as exc:
            self.stderr.write(
                self.style.ERROR(
                    f"seed_demo_data must run before seed_demo_bookings: {exc}"
                )
            )
            raise SystemExit(1) from exc

        customers = self._ensure_demo_customers(car_type)
        now = timezone.localtime()
        today = now.date()
        yesterday = today - timedelta(days=1)
        tomorrow = today + timedelta(days=1)
        self._ensure_shifts_for_days(station, [yesterday, today, tomorrow])

        scenarios = [
            (yesterday, 9, customers[0], "completed", True),
            (yesterday, 14, customers[1], "no_show", False),
            (today, 10, customers[0], "confirmed", True),
            (today, 12, customers[2], "in_progress", True),
            (today, 16, customers[1], "pending", False),
            (tomorrow, 11, customers[2], "pending", False),
        ]

        created = 0
        for day, hour, customer, target_status, paid in scenarios:
            starts_at = timezone.make_aware(
                timezone.datetime.combine(
                    day,
                    timezone.datetime.min.time().replace(hour=hour),
                )
            )
            already = Booking.objects.filter(
                customer=customer,
                wash_station=station,
                starts_at=starts_at,
            ).first()
            if already is not None:
                continue

            try:
                booking = create_booking(
                    customer=customer,
                    car=customer.car,
                    wash_station=station,
                    wash_type=wash_type,
                    starts_at=starts_at,
                    actor=manager_user,
                )
            except BookingError as exc:
                self.stdout.write(
                    self.style.WARNING(
                        f"Skipped {customer.name} at {starts_at}: {exc}"
                    )
                )
                continue

            if target_status != Booking.Status.PENDING:
                change_booking_status(
                    booking=booking,
                    status=target_status,
                    actor=manager_user,
                )
            if paid:
                mark_booking_paid(
                    booking=booking,
                    amount=booking.down_payment,
                    provider="demo",
                    reference=f"demo-{booking.id:04d}",
                    actor=manager_user,
                )

            created += 1

        # One cancellation visible in the audit log so the history panel has
        # something to show for the manager demo flow.
        cancellation_starts_at = timezone.make_aware(
            timezone.datetime.combine(
                today,
                timezone.datetime.min.time().replace(hour=17),
            )
        )
        cancellation_customer = customers[1]
        existing_cancel = Booking.objects.filter(
            customer=cancellation_customer,
            starts_at=cancellation_starts_at,
        ).first()
        if existing_cancel is None:
            try:
                booking = create_booking(
                    customer=cancellation_customer,
                    car=cancellation_customer.car,
                    wash_station=station,
                    wash_type=wash_type,
                    starts_at=cancellation_starts_at,
                    actor=manager_user,
                )
                cancel_booking(booking=booking, actor=manager_user)
                created += 1
            except BookingError as exc:
                self.stdout.write(
                    self.style.WARNING(f"Skipped cancellation demo: {exc}")
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Demo bookings ready ({created} new). Audit log and "
                f"notification outbox populated transactionally."
            )
        )

    def _ensure_shifts_for_days(self, station, days):
        """seed_demo_data only creates shifts for today; for the demo
        bookings to land on yesterday and tomorrow as well, mirror those
        shifts onto the other days."""

        for washer in Washer.objects.all():
            for day in days:
                starts_at = timezone.make_aware(
                    timezone.datetime.combine(
                        day,
                        timezone.datetime.min.time().replace(hour=9),
                    )
                )
                ends_at = timezone.make_aware(
                    timezone.datetime.combine(
                        day,
                        timezone.datetime.min.time().replace(hour=18),
                    )
                )
                WasherShift.objects.update_or_create(
                    washer=washer,
                    wash_station=station,
                    starts_at=starts_at,
                    defaults={"ends_at": ends_at, "is_active": True},
                )

    def _ensure_demo_customers(self, car_type):
        """Create three demo customers so manager views show a non-trivial
        list. The first one re-uses the demo_customer profile from
        seed_demo_data."""

        existing = Customer.objects.get(phoneNumber="+10000000000")

        from django.contrib.auth.models import Group

        customer_group, _ = Group.objects.get_or_create(name=CUSTOMER_GROUP)

        extras = [
            ("demo_customer_2", "Анна Демо", "+10000000001", "DEMO002"),
            ("demo_customer_3", "Сергей Демо", "+10000000002", "DEMO003"),
        ]
        result = [existing]
        for username, name, phone, plate in extras:
            user, created = User.objects.get_or_create(username=username)
            if created:
                user.set_password("password")
                user.save()
            user.groups.add(customer_group)

            car, _ = Car.objects.get_or_create(
                number=plate,
                defaults={"carType": car_type},
            )
            customer, _ = Customer.objects.update_or_create(
                phoneNumber=phone,
                defaults={"user": user, "name": name, "car": car},
            )
            if car.customer_id != customer.id:
                car.customer = customer
                car.save(update_fields=["customer"])
            result.append(customer)

        return result
