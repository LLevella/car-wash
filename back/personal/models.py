from django.db import models
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.utils.translation import gettext_lazy as _
from datetime import date


class Washer(models.Model):
    """Мойщик"""
    name = models.CharField("Имя", max_length=150)
    surname = models.CharField("Фамилия", max_length=150)

    def __str__(self):
        return f'{self.name} {self.surname}'

    class Meta:
        verbose_name = _("Мойщик")
        verbose_name_plural = _("Мойщики")


class City(models.Model):
    """Город"""
    name = models.CharField("Название", max_length=100)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Город")
        verbose_name_plural = _("Города")


class District(models.Model):
    """Район"""
    name = models.CharField("Название", max_length=100)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Район")
        verbose_name_plural = _("Районы")


class WashStation(models.Model):
    """Станция мойки"""
    name = models.CharField("Название", max_length=100)
    city = models.ForeignKey(
        City, verbose_name="Город", on_delete=models.PROTECT)
    district = models.ForeignKey(
        District, verbose_name="Район", on_delete=models.PROTECT)
    address = models.CharField("Адрес", max_length=200)

    class Meta:
        verbose_name = _("Станция мойки")
        verbose_name_plural = _("Станции мойки")


class DateType(models.Model):
    """Тип дня"""
    name = models.CharField("Название", max_length=100)
    duration = models.PositiveSmallIntegerField("Длительность дня, часов", validators=[
                                                MinValueValidator(0), MaxValueValidator(24)])
    description = models.TextField("Описание")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Тип дня")
        verbose_name_plural = _("Типы дня")


class TimeSheet(models.Model):
    """Табель учета рабочего времени"""
    washer = models.ForeignKey(
        Washer, verbose_name="Мойщик", on_delete=models.PROTECT)
    washStation = models.ForeignKey(
        WashStation, verbose_name="Станция мойки", on_delete=models.PROTECT)
    dateBegin = models.DateField("Дата начала", default=date.today)
    dateEnd = models.DateField("Дата окончания", default=date.today)
    dateType = models.ForeignKey(
        DateType, verbose_name="тип дня", on_delete=models.PROTECT)

    class Meta:
        verbose_name = _("Табель учета рабочего времени")
        verbose_name_plural = _("Учет рабочего времен")
