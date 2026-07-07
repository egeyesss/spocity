# Assign public_slug to accounts created before the public-pages feature.
# Mirrors models.build_public_slug but inlined against historical models
# (data migrations can't call model methods that may drift).

from django.db import migrations
from django.utils.text import slugify

RESERVED_SLUGS = {"me", "demo", "dev", "api", "admin", "login", "logout"}


def backfill(apps, schema_editor):
    SpotifyAccount = apps.get_model("core", "SpotifyAccount")
    for account in SpotifyAccount.objects.filter(public_slug__isnull=True):
        base = slugify(account.display_name)[:30].strip("-")
        if len(base) < 3 or base in RESERVED_SLUGS:
            base = f"user-{slugify(account.spotify_user_id)[:12] or 'x'}"
        slug = base
        n = 2
        while (
            SpotifyAccount.objects.filter(public_slug=slug)
            .exclude(pk=account.pk)
            .exists()
        ):
            slug = f"{base}-{n}"
            n += 1
        account.public_slug = slug
        account.save(update_fields=["public_slug"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_artist_genres_checked_at_spotifyaccount_public_slug"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
