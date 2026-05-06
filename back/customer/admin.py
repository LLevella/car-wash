from django.contrib import admin

from .models import Car, Customer


@admin.register(Car)
class CarAdmin(admin.ModelAdmin):
    list_display = ("number", "carType")
    list_filter = ("carType",)
    search_fields = ("number",)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "phoneNumber", "user", "car")
    search_fields = ("name", "phoneNumber", "user__username", "car__number")
