"""Quick environment health diagnostics for the car wash backend.

Useful as a deploy smoke test or manual on-call check. Reports:

- database connectivity and engine,
- pending migrations,
- pending notifications in the outbox,
- counts of bookings by status for the last 7 days.

Exits with non-zero status if the database is not reachable so the
command can be wired into health checks. Intentionally does no
mutations.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import connections
from django.db.migrations.executor import MigrationExecutor
from django.utils import timezone

from car_wash.models import Booking, NotificationOutbox


class Command(BaseCommand):
    help = "Print backend health diagnostics for ops and on-call."

    def handle(self, *args, **options):
        connection = connections["default"]
        engine = connection.settings_dict.get("ENGINE", "")
        self.stdout.write(f"Database engine: {engine}")
        self.stdout.write(f"Database name:   {connection.settings_dict.get('NAME')}")

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception as exc:  # noqa: BLE001 — diagnostic catch-all
            self.stderr.write(self.style.ERROR(f"DB connection failed: {exc}"))
            raise SystemExit(1) from exc
        self.stdout.write(self.style.SUCCESS("DB reachable: OK"))

        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
        if plan:
            self.stdout.write(
                self.style.WARNING(f"Pending migrations: {len(plan)}")
            )
            for migration, _ in plan:
                self.stdout.write(f"  - {migration.app_label}.{migration.name}")
        else:
            self.stdout.write(self.style.SUCCESS("Migrations: up to date"))

        pending = NotificationOutbox.objects.filter(
            status=NotificationOutbox.Status.PENDING,
        ).count()
        self.stdout.write(f"Pending notifications: {pending}")

        cutoff = timezone.now() - timedelta(days=7)
        recent = Booking.objects.filter(created_at__gte=cutoff)
        self.stdout.write("Bookings in last 7 days by status:")
        for status_value, label in Booking.Status.choices:
            count = recent.filter(status=status_value).count()
            self.stdout.write(f"  {status_value:12s} ({label}): {count}")
