from django import forms
from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import City, DateType, District, Washer, WashStation, TimeSheet


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    """Город"""


@admin.register(DateType)
class DateTypeAdmin(admin.ModelAdmin):
    """Тип дня"""


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):
    """Район"""


@admin.register(Washer)
class WasherAdmin(admin.ModelAdmin):
    """Мойщик"""


@admin.register(WashStation)
class WashStationAdmin(admin.ModelAdmin):
    """Станция мойки"""


@admin.register(TimeSheet)
class TimeSheetAdmin(admin.ModelAdmin):
    """Табель"""
