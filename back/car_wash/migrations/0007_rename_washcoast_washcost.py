from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("car_wash", "0006_create_role_groups"),
    ]

    operations = [
        migrations.RenameModel(
            old_name="WashCoast",
            new_name="WashCost",
        ),
    ]
