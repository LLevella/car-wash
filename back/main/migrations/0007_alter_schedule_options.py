# Generated by Django 4.1.5 on 2023-01-11 10:38

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0006_alter_schedule_options'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='schedule',
            options={'verbose_name': 'Расписание', 'verbose_name_plural': 'Расписание'},
        ),
    ]
