from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from cars.models import CarType
from customer.models import Car, Customer
from personal.models import Washer, WashStation


class WashType(models.Model):
    """Тип мойки"""
    name = models.CharField("Название", max_length=100)
    description = models.TextField("Описание")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Тип мойки"
        verbose_name_plural = "Типы мойки"


class WashDuration(models.Model):
    """Время мойки"""
    carType = models.ForeignKey(
        CarType, verbose_name="Тип авто", on_delete=models.CASCADE)
    washType = models.ForeignKey(
        WashType, verbose_name="Тип Мойки", on_delete=models.CASCADE)
    washStation = models.ForeignKey(
        WashStation, verbose_name="Станция мойки", on_delete=models.CASCADE)
    duration = models.DecimalField(
        verbose_name="Длительность", max_digits=4, decimal_places=0)

    class Meta:
        unique_together = (('carType', 'washType', 'washStation'),)
        verbose_name = "Время мойки"
        verbose_name_plural = "Время мойки"


class WashCost(models.Model):
    """Стоимость мойки"""
    carType = models.ForeignKey(
        CarType, verbose_name="Тип авто", on_delete=models.CASCADE)
    washType = models.ForeignKey(
        WashType, verbose_name="Тип Мойки", on_delete=models.CASCADE)
    washStation = models.ForeignKey(
        WashStation, verbose_name="Станция мойки", on_delete=models.CASCADE)
    cost = models.DecimalField(
        verbose_name="Стоимость", max_digits=12, decimal_places=2)

    class Meta:
        unique_together = (('carType', 'washType', 'washStation'),)
        verbose_name = "Стоимость мойки"
        verbose_name_plural = "Стоимость мойки"


class DownPayment (models.Model):
    """Процент аванса"""
    washStation = models.ForeignKey(
        WashStation, verbose_name="Станция мойки", on_delete=models.CASCADE)
    rate = models.DecimalField(
        verbose_name="Процент аванса", max_digits=5, decimal_places=2)

    class Meta:
        verbose_name = "Процент аванса"
        verbose_name_plural = "Проценты аванса"


class WashBox(models.Model):
    """Бокс автомойки"""
    wash_station = models.ForeignKey(
        WashStation,
        verbose_name="Станция мойки",
        on_delete=models.PROTECT,
        related_name="wash_boxes",
    )
    name = models.CharField("Название", max_length=100)
    is_active = models.BooleanField("Активен", default=True)
    description = models.TextField("Описание", blank=True)

    def __str__(self):
        return f"{self.wash_station}: {self.name}"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["wash_station", "name"],
                name="unique_wash_box_per_station",
            ),
        ]
        indexes = [
            models.Index(
                fields=["wash_station", "is_active"],
                name="wash_box_station_active_idx",
            ),
        ]
        verbose_name = "Бокс мойки"
        verbose_name_plural = "Боксы мойки"


class ManagerStationAccess(models.Model):
    """Доступ руководителя к станции мойки"""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Пользователь",
        on_delete=models.CASCADE,
        related_name="car_wash_station_access",
    )
    wash_station = models.ForeignKey(
        WashStation,
        verbose_name="Станция мойки",
        on_delete=models.CASCADE,
        related_name="manager_access",
    )
    is_active = models.BooleanField("Активен", default=True)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    def __str__(self):
        return f"{self.user}: {self.wash_station}"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "wash_station"],
                name="unique_manager_station_access",
            ),
        ]
        indexes = [
            models.Index(
                fields=["user", "is_active"],
                name="mgr_station_user_active_idx",
            ),
        ]
        verbose_name = "Доступ руководителя к станции"
        verbose_name_plural = "Доступы руководителей к станциям"


class WasherShift(models.Model):
    """Рабочая смена мойщика"""
    washer = models.ForeignKey(
        Washer,
        verbose_name="Мойщик",
        on_delete=models.PROTECT,
        related_name="shifts",
    )
    wash_station = models.ForeignKey(
        WashStation,
        verbose_name="Станция мойки",
        on_delete=models.PROTECT,
        related_name="washer_shifts",
    )
    starts_at = models.DateTimeField("Начало смены")
    ends_at = models.DateTimeField("Окончание смены")
    is_active = models.BooleanField("Активна", default=True)

    def __str__(self):
        return f"{self.washer}: {self.starts_at:%Y-%m-%d %H:%M}"

    def clean(self):
        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            raise ValidationError(
                {"ends_at": "Окончание смены должно быть позже начала."}
            )

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(ends_at__gt=models.F("starts_at")),
                name="washer_shift_ends_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["wash_station", "starts_at", "ends_at"],
                name="shift_station_time_idx",
            ),
            models.Index(
                fields=["washer", "starts_at", "ends_at"],
                name="shift_washer_time_idx",
            ),
        ]
        verbose_name = "Смена мойщика"
        verbose_name_plural = "Смены мойщиков"


class Booking(models.Model):
    """Запись клиента на мойку"""

    class Status(models.TextChoices):
        DRAFT = "draft", "Черновик"
        PENDING = "pending", "Ожидает подтверждения"
        CONFIRMED = "confirmed", "Подтверждена"
        IN_PROGRESS = "in_progress", "В работе"
        COMPLETED = "completed", "Завершена"
        CANCELLED = "cancelled", "Отменена"
        NO_SHOW = "no_show", "Клиент не приехал"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Не оплачено"
        AWAITING = "awaiting", "Ожидает оплаты"
        PAID = "paid", "Оплачено"
        REFUNDED = "refunded", "Возврат"

    customer = models.ForeignKey(
        Customer,
        verbose_name="Заказчик",
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    car = models.ForeignKey(
        Car,
        verbose_name="Автомобиль",
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    wash_station = models.ForeignKey(
        WashStation,
        verbose_name="Станция мойки",
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    wash_box = models.ForeignKey(
        WashBox,
        verbose_name="Бокс",
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    wash_type = models.ForeignKey(
        WashType,
        verbose_name="Тип мойки",
        on_delete=models.PROTECT,
        related_name="bookings",
    )
    starts_at = models.DateTimeField("Начало записи")
    ends_at = models.DateTimeField("Окончание записи")
    status = models.CharField(
        "Статус",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    cost = models.DecimalField("Стоимость", max_digits=12, decimal_places=2)
    down_payment = models.DecimalField(
        "Предоплата",
        max_digits=12,
        decimal_places=2,
    )
    residual = models.DecimalField("Остаток", max_digits=12, decimal_places=2)
    payment_status = models.CharField(
        "Статус оплаты",
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    paid_amount = models.DecimalField(
        "Оплачено",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    payment_provider = models.CharField("Провайдер оплаты", max_length=64, blank=True)
    payment_reference = models.CharField("Ссылка на оплату", max_length=128, blank=True)
    comment = models.TextField("Комментарий", blank=True)
    created_at = models.DateTimeField("Создана", auto_now_add=True)
    updated_at = models.DateTimeField("Обновлена", auto_now=True)

    def __str__(self):
        return f"{self.customer}: {self.starts_at:%Y-%m-%d %H:%M}"

    def clean(self):
        errors = {}

        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            errors["ends_at"] = "Окончание записи должно быть позже начала."

        if (
            self.customer_id
            and self.car_id
            and self.customer.car_id != self.car_id
            and self.car.customer_id != self.customer_id
        ):
            errors["car"] = "Автомобиль должен принадлежать заказчику."

        if (
            self.wash_box_id
            and self.wash_station_id
            and self.wash_box.wash_station_id != self.wash_station_id
        ):
            errors["wash_box"] = "Бокс должен относиться к выбранной станции."

        if errors:
            raise ValidationError(errors)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(ends_at__gt=models.F("starts_at")),
                name="booking_ends_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["wash_station", "starts_at", "ends_at"],
                name="booking_station_time_idx",
            ),
            models.Index(
                fields=["wash_box", "starts_at", "ends_at"],
                name="booking_box_time_idx",
            ),
            models.Index(
                fields=["customer", "starts_at"],
                name="booking_customer_time_idx",
            ),
            models.Index(fields=["status"], name="booking_status_idx"),
        ]
        verbose_name = "Запись на мойку"
        verbose_name_plural = "Записи на мойку"


class BookingAssignment(models.Model):
    """Назначение мойщика на запись"""

    class Role(models.TextChoices):
        MAIN = "main", "Основной"
        ASSISTANT = "assistant", "Помощник"

    booking = models.ForeignKey(
        Booking,
        verbose_name="Запись",
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    washer = models.ForeignKey(
        Washer,
        verbose_name="Мойщик",
        on_delete=models.PROTECT,
        related_name="booking_assignments",
    )
    role = models.CharField(
        "Роль",
        max_length=20,
        choices=Role.choices,
        default=Role.MAIN,
    )

    def __str__(self):
        return f"{self.booking} - {self.washer}"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["booking", "washer"],
                name="unique_booking_washer_assignment",
            ),
        ]
        indexes = [
            models.Index(fields=["washer"], name="assignment_washer_idx"),
        ]
        verbose_name = "Назначение мойщика"
        verbose_name_plural = "Назначения мойщиков"


class ResourceBlock(models.Model):
    """Блокировка станции, бокса или мойщика"""
    wash_station = models.ForeignKey(
        WashStation,
        verbose_name="Станция мойки",
        on_delete=models.PROTECT,
        related_name="resource_blocks",
    )
    wash_box = models.ForeignKey(
        WashBox,
        verbose_name="Бокс",
        on_delete=models.PROTECT,
        related_name="resource_blocks",
        blank=True,
        null=True,
    )
    washer = models.ForeignKey(
        Washer,
        verbose_name="Мойщик",
        on_delete=models.PROTECT,
        related_name="resource_blocks",
        blank=True,
        null=True,
    )
    starts_at = models.DateTimeField("Начало блокировки")
    ends_at = models.DateTimeField("Окончание блокировки")
    reason = models.CharField("Причина", max_length=255)
    created_at = models.DateTimeField("Создана", auto_now_add=True)

    def __str__(self):
        resource = self.wash_box or self.washer or self.wash_station
        return f"{resource}: {self.starts_at:%Y-%m-%d %H:%M}"

    def clean(self):
        errors = {}

        if self.starts_at and self.ends_at and self.starts_at >= self.ends_at:
            errors["ends_at"] = "Окончание блокировки должно быть позже начала."

        if (
            self.wash_box_id
            and self.wash_station_id
            and self.wash_box.wash_station_id != self.wash_station_id
        ):
            errors["wash_box"] = "Бокс должен относиться к выбранной станции."

        if errors:
            raise ValidationError(errors)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(ends_at__gt=models.F("starts_at")),
                name="resource_block_ends_after_start",
            ),
        ]
        indexes = [
            models.Index(
                fields=["wash_station", "starts_at", "ends_at"],
                name="block_station_time_idx",
            ),
            models.Index(
                fields=["wash_box", "starts_at", "ends_at"],
                name="block_box_time_idx",
            ),
            models.Index(
                fields=["washer", "starts_at", "ends_at"],
                name="block_washer_time_idx",
            ),
        ]
        verbose_name = "Блокировка ресурса"
        verbose_name_plural = "Блокировки ресурсов"


class NotificationOutbox(models.Model):
    """Transactional outbox for customer-facing notifications.

    Rows are created next to the domain change in the same transaction, so
    a notification cannot be lost or sent twice for the same booking
    transition. A real SMS/email provider integration consumes
    ``status="pending"`` rows and bumps them to ``sent`` or ``failed``;
    until that integration ships the rows accumulate so dev/QA can replay
    them via the ``process_notifications`` management command."""

    class Status(models.TextChoices):
        PENDING = "pending", "В очереди"
        SENT = "sent", "Отправлено"
        FAILED = "failed", "Ошибка"

    class Event(models.TextChoices):
        BOOKING_CREATED = "booking_created", "Запись создана"
        BOOKING_RESCHEDULED = "booking_rescheduled", "Запись перенесена"
        BOOKING_CANCELLED = "booking_cancelled", "Запись отменена"
        BOOKING_STATUS_CHANGED = "booking_status_changed", "Статус изменён"

    booking = models.ForeignKey(
        "Booking",
        verbose_name="Запись",
        on_delete=models.CASCADE,
        related_name="notification_events",
    )
    event = models.CharField("Событие", max_length=40, choices=Event.choices)
    status = models.CharField(
        "Статус",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    payload = models.JSONField("Полезная нагрузка", default=dict, blank=True)
    last_error = models.TextField("Последняя ошибка", blank=True)
    attempts = models.PositiveSmallIntegerField("Попыток", default=0)
    created_at = models.DateTimeField("Создано", auto_now_add=True)
    processed_at = models.DateTimeField("Отправлено", blank=True, null=True)

    def __str__(self):
        return f"{self.event} #{self.booking_id} [{self.status}]"

    class Meta:
        indexes = [
            models.Index(
                fields=["status", "created_at"],
                name="outbox_status_time_idx",
            ),
            models.Index(
                fields=["booking", "event"],
                name="outbox_booking_event_idx",
            ),
        ]
        ordering = ("created_at",)
        verbose_name = "Уведомление в outbox"
        verbose_name_plural = "Уведомления в outbox"


class AuditEvent(models.Model):
    """Audit trail for manager-level domain actions."""

    class Action(models.TextChoices):
        BOOKING_CREATED = "booking_created", "Запись создана"
        BOOKING_CANCELLED = "booking_cancelled", "Запись отменена"
        BOOKING_RESCHEDULED = "booking_rescheduled", "Запись перенесена"
        BOOKING_STATUS_CHANGED = "booking_status_changed", "Статус изменён"
        BOOKING_ASSIGNED = "booking_assigned", "Назначение обновлено"
        SHIFT_CREATED = "shift_created", "Смена создана"
        RESOURCE_BLOCK_CREATED = "resource_block_created", "Блокировка создана"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Автор",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="car_wash_audit_events",
    )
    action = models.CharField("Действие", max_length=40, choices=Action.choices)
    entity_type = models.CharField("Тип сущности", max_length=40)
    entity_id = models.PositiveIntegerField("ID сущности")
    context = models.JSONField("Контекст", default=dict, blank=True)
    created_at = models.DateTimeField("Время", auto_now_add=True)

    def __str__(self):
        return f"{self.action} {self.entity_type}#{self.entity_id}"

    class Meta:
        indexes = [
            models.Index(
                fields=["entity_type", "entity_id", "created_at"],
                name="audit_entity_time_idx",
            ),
            models.Index(
                fields=["actor", "created_at"],
                name="audit_actor_time_idx",
            ),
        ]
        ordering = ("-created_at",)
        verbose_name = "Аудит-событие"
        verbose_name_plural = "Аудит-события"
