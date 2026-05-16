from django.db import models
from django.utils.translation import gettext_lazy as _


class CarBrand(models.Model):
    """Марка авто"""
    name = models.CharField("Название", max_length=100)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Марка авто")
        verbose_name_plural = _("Марки авто")


class CarModel(models.Model):
    """Модель авто"""
    name = models.CharField("Название", max_length=100)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Модель авто")
        verbose_name_plural = _("Модели авто")


class CarType(models.Model):
    """Тип авто"""
    name = models.CharField("Название", max_length=100)
    description = models.TextField("Описание")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Тип авто")
        verbose_name_plural = _("Типы авто")


class CarDescription(models.Model):
    """Описание авто"""

    carType = models.ForeignKey(
        CarType, verbose_name="Тип авто", on_delete=models.CASCADE)
    сarBrand = models.ForeignKey(
        CarBrand, verbose_name="Марка авто", on_delete=models.CASCADE)
    сarModel = models.ForeignKey(
        CarModel, verbose_name="Модель авто", on_delete=models.CASCADE)

    class Meta:
        unique_together = (('carType', 'сarBrand', 'сarModel'),)
        verbose_name = _("Описание авто")
        verbose_name_plural = _("Описание авто")
