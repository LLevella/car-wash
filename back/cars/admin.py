from django.contrib import admin
from .models import CarType, CarBrand, CarModel, CarDescription


@admin.register(CarType)
class CarTypeAdmin(admin.ModelAdmin):
    """Тип Авто"""


@admin.register(CarBrand)
class CarBrandAdmin(admin.ModelAdmin):
    """Тип Авто"""


@admin.register(CarModel)
class CarModelAdmin(admin.ModelAdmin):
    """Тип Авто"""


@admin.register(CarDescription)
class CarDescriptionAdmin(admin.ModelAdmin):
    """Тип Авто"""
