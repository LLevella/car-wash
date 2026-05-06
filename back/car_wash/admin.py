from django.contrib import admin

from .models import (
    Booking,
    BookingAssignment,
    DownPayment,
    ResourceBlock,
    WashBox,
    WashCoast,
    WashDuration,
    WasherShift,
    WashType,
)


@admin.register(WashType)
class WashTypeAdmin(admin.ModelAdmin):
    """Тип мойки"""
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(WashDuration)
class WashDurationAdmin(admin.ModelAdmin):
    """Длительность мойки"""
    list_display = ("carType", "washType", "washStation", "duration")
    list_filter = ("washStation", "washType", "carType")


@admin.register(WashCoast)
class WashCoastAdmin(admin.ModelAdmin):
    """Стоимость мойки"""
    list_display = ("carType", "washType", "washStation", "cost")
    list_filter = ("washStation", "washType", "carType")


@admin.register(DownPayment)
class DownPaymentAdmin(admin.ModelAdmin):
    """Процент предоплаты"""
    list_display = ("washStation", "rate")
    list_filter = ("washStation",)


@admin.register(WashBox)
class WashBoxAdmin(admin.ModelAdmin):
    """Бокс мойки"""
    list_display = ("name", "wash_station", "is_active")
    list_filter = ("wash_station", "is_active")
    search_fields = ("name", "wash_station__name")


@admin.register(WasherShift)
class WasherShiftAdmin(admin.ModelAdmin):
    """Смена мойщика"""
    list_display = ("washer", "wash_station", "starts_at", "ends_at", "is_active")
    list_filter = ("wash_station", "is_active", "starts_at")
    search_fields = ("washer__name", "washer__surname", "wash_station__name")


class BookingAssignmentInline(admin.TabularInline):
    model = BookingAssignment
    extra = 1


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    """Запись на мойку"""
    inlines = (BookingAssignmentInline,)
    list_display = (
        "customer",
        "wash_station",
        "wash_box",
        "wash_type",
        "starts_at",
        "ends_at",
        "status",
        "cost",
    )
    list_filter = ("wash_station", "wash_box", "wash_type", "status", "starts_at")
    search_fields = (
        "customer__name",
        "customer__phoneNumber",
        "car__number",
        "wash_box__name",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(BookingAssignment)
class BookingAssignmentAdmin(admin.ModelAdmin):
    """Назначение мойщика"""
    list_display = ("booking", "washer", "role")
    list_filter = ("role", "washer")
    search_fields = ("washer__name", "washer__surname", "booking__customer__name")


@admin.register(ResourceBlock)
class ResourceBlockAdmin(admin.ModelAdmin):
    """Блокировка ресурса"""
    list_display = (
        "wash_station",
        "wash_box",
        "washer",
        "starts_at",
        "ends_at",
        "reason",
    )
    list_filter = ("wash_station", "wash_box", "washer", "starts_at")
    search_fields = ("reason", "wash_box__name", "washer__name", "washer__surname")
    readonly_fields = ("created_at",)
