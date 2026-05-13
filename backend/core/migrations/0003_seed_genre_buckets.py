from django.db import migrations

from core.genres import BUCKETS


def seed(apps, schema_editor):
    GenreBucket = apps.get_model("core", "GenreBucket")
    for slug, label, palette, order in BUCKETS:
        GenreBucket.objects.update_or_create(
            slug=slug,
            defaults={
                "label": label,
                "color_palette": palette,
                "sort_order": order,
            },
        )


def unseed(apps, schema_editor):
    GenreBucket = apps.get_model("core", "GenreBucket")
    GenreBucket.objects.filter(slug__in=[b[0] for b in BUCKETS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_genrebucket_genreunmapped_artist_artistscore_and_more"),
    ]

    operations = [
        migrations.RunPython(seed, reverse_code=unseed),
    ]
