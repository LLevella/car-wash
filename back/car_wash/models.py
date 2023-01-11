from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from datetime import date
from cars.models import CarType
from personal.models import WashStation


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


class WashCoast (models.Model):
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
