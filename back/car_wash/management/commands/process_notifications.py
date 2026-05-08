"""Process pending notification outbox rows.

Until a real SMS/email provider is wired up, this command simulates
delivery for dev/QA: it picks up ``NotificationOutbox`` rows in
``status="pending"`` order, marks them ``sent``, and prints a summary.
The command is idempotent — re-running it after every row is processed
does nothing.

Usage::

    python manage.py process_notifications [--dry-run] [--limit N]
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from car_wash.models import NotificationOutbox


class Command(BaseCommand):
    help = "Process pending notification outbox rows (dev simulation)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Inspect pending rows without marking them sent.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Process at most N rows in this run.",
        )

    def handle(self, *args, dry_run, limit, **options):
        queryset = NotificationOutbox.objects.filter(
            status=NotificationOutbox.Status.PENDING,
        ).order_by("created_at")

        if limit is not None:
            queryset = queryset[:limit]

        rows = list(queryset)
        if not rows:
            self.stdout.write(self.style.SUCCESS("Очередь уведомлений пуста."))
            return

        for row in rows:
            self.stdout.write(
                f"#{row.id} {row.event} booking={row.booking_id} → отправляется"
            )
            if dry_run:
                continue

            row.attempts = row.attempts + 1
            row.status = NotificationOutbox.Status.SENT
            row.processed_at = timezone.now()
            row.last_error = ""
            row.save(
                update_fields=["attempts", "status", "processed_at", "last_error"]
            )

        verb = "проверено" if dry_run else "отправлено"
        self.stdout.write(
            self.style.SUCCESS(f"Готово: {verb} {len(rows)} событий.")
        )
