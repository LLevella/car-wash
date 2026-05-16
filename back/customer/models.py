from django.db import models
from django.contrib.auth.models import User
from django.utils.translation import gettext_lazy as _
from cars.models import CarType


class Car(models.Model):
    """Автомобиль"""
    number = models.CharField("Номер", max_length=100)
    carType = models.ForeignKey(
        CarType, verbose_name="Тип", on_delete=models.PROTECT)
    customer = models.ForeignKey(
        "Customer",
        verbose_name="Заказчик",
        on_delete=models.SET_NULL,
        related_name="cars",
        blank=True,
        null=True,
    )
    is_active = models.BooleanField("Активен", default=True)

    def __str__(self):
        return self.number

    class Meta:
        verbose_name = _("Автомобиль")
        verbose_name_plural = _("Автомобили")

class Customer(models.Model):
    """Заказчик"""
    user = models.OneToOneField(
        User,
        verbose_name="Пользователь",
        on_delete=models.SET_NULL,
        related_name="customer_profile",
        blank=True,
        null=True,
    )
    name = models.CharField("Имя", max_length=150)
    phoneNumber = models.CharField(
        "Номер телефона",
        max_length=100,
        null=False,
        unique=True,
    )
    car = models.ForeignKey(
        Car,
        verbose_name="Автомобиль",
        on_delete=models.SET_NULL,
        related_name="legacy_customers",
        blank=True,
        null=True,
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = _("Заказчик")
        verbose_name_plural = _("Заказчики")
