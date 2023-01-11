from django.db import models
from cars.models import CarType

class Car(models.Model):
    """Автомобиль"""
    number = models.CharField("Номер", max_length=100)
    carType = models.ForeignKey(
        CarType, verbose_name="Тип", on_delete=models.PROTECT)

    def __str__(self):
        return self.number

    class Meta:
        verbose_name = "Автомобиль"
        verbose_name_plural = "Автомобили"

class Customer(models.Model):
    """Заказчик"""
    name = models.CharField("Имя", max_length=150)
    phoneNumber = models.CharField("Номер телефона", max_length=100)
    car = models.ForeignKey(
        Car, verbose_name="Автомобиль", on_delete=models.PROTECT)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Заказчик"
        verbose_name_plural = "Заказчики"