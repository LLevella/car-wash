# Generated by Django 4.1.5 on 2023-01-11 10:11

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='schedule',
            name='completed',
            field=models.BooleanField(default=False, verbose_name='Завершить'),
        ),
    ]