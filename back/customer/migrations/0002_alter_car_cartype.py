# Generated by Django 4.1.5 on 2023-01-11 11:49

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('cars', '0001_initial'),
        ('customer', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='car',
            name='carType',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='cars.cartype', verbose_name='Тип'),
        ),
    ]
