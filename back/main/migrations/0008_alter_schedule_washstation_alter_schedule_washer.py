# Generated by Django 4.1.5 on 2023-01-11 12:36

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('personal', '0001_initial'),
        ('main', '0007_alter_schedule_options'),
    ]

    operations = [
        migrations.AlterField(
            model_name='schedule',
            name='washStation',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='personal.washstation', verbose_name='Станция мойки'),
        ),
        migrations.AlterField(
            model_name='schedule',
            name='washer',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to='personal.washer', verbose_name='Мойщик'),
        ),
    ]