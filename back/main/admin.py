from django import forms
from django.contrib import admin
from django.utils.safestring import mark_safe

from .models import Schedule


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    """Расписание"""
    readonly_fields = ["cost", "downPayment", "residual"]
