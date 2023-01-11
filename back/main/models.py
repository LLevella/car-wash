from django.db import models
from personal.models import Washer, WashStation
from customer.models import Customer


class Schedule(models.Model):
    """Расписание работы"""
    washer = models.ForeignKey(
        Washer, verbose_name="Мойщик", on_delete=models.PROTECT)
    washStation = models.ForeignKey(
        WashStation, verbose_name="Станция мойки", on_delete=models.PROTECT)
    customer = models.ForeignKey(
        Customer, verbose_name="Заказчик", on_delete=models.PROTECT)
    dateBegin = models.DateTimeField("Время начала")
    dateEnd = models.DateTimeField("Время окончания")
    cost = models.DecimalField(
        verbose_name="Стоимость", max_digits=12, decimal_places=2)
    downPayment = models.DecimalField(
        verbose_name="Предоплата", max_digits=12, decimal_places=2)
    residual = models.DecimalField(
        verbose_name="Остаток", max_digits=12, decimal_places=2)
    completed = models.BooleanField(verbose_name="Завершить", default=False)

    class Meta:
        verbose_name = "Расписание"
        verbose_name_plural = "Расписание"
