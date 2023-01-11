from django import forms
from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import WashType, WashDuration, WashCoast, DownPayment


@admin.register(WashType)
class WashTypeAdmin(admin.ModelAdmin):
    """Тип мойки"""


@admin.register(WashDuration)
class WashDurationAdmin(admin.ModelAdmin):
    """Длительность мойки"""


@admin.register(WashCoast)
class WashCoastAdmin(admin.ModelAdmin):
    """Стоимость мойки"""


@admin.register(DownPayment)
class DownPaymentAdmin(admin.ModelAdmin):
    """Процент предоплаты"""
