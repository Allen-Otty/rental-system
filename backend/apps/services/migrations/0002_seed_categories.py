from django.db import migrations

CATS = [
    ("movers", "Movers", "Wasafirishaji wa mizigo", "truck"), ("cleaning", "Cleaning", "Usafi", "spark"), ("laundry", "Laundry", "Ufuaji nguo", "drop"),
    ("plumbing", "Plumbing", "Mafundi bomba", "tool"), ("electrical", "Electrical", "Mafundi umeme", "bolt"), ("painting", "Painting", "Wapaka rangi", "brush"),
    ("gas", "Gas delivery", "Gesi", "flame"), ("water", "Water delivery", "Maji", "drop"), ("food", "Food delivery", "Chakula", "bag"),
]


def seed(apps, schema_editor):
    Cat = apps.get_model("services", "ServiceCategory")
    for i, (slug, en, sw, icon) in enumerate(CATS):
        Cat.objects.get_or_create(slug=slug, defaults={"name_en": en, "name_sw": sw, "icon": icon, "sort": i})


class Migration(migrations.Migration):
    dependencies = [("services", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
