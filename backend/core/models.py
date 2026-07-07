from datetime import timedelta

import requests as http
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


class User(AbstractUser):
    """
    Custom user model — always define this at project start so we can add
    fields later without painful data migrations.
    """
    pass


# Slugs that would shadow frontend routes if a display name collided with them.
RESERVED_SLUGS = {"me", "demo", "dev", "api", "admin", "login", "logout"}


def build_public_slug(display_name: str, spotify_user_id: str) -> str:
    """Derive a URL slug for a public city page from the Spotify display name.

    Deliberately minimal (no user-facing rename flow): slugify the display
    name, fall back to a spotify-id-derived handle when that yields nothing
    usable, and suffix -2/-3/… on collision.
    """
    base = slugify(display_name)[:30].strip("-")
    if len(base) < 3 or base in RESERVED_SLUGS:
        base = f"user-{slugify(spotify_user_id)[:12] or 'x'}"

    slug = base
    n = 2
    while SpotifyAccount.objects.filter(public_slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    return slug


class SpotifyTokenRefreshError(Exception):
    pass


class SpotifyAccount(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="spotify_account"
    )
    spotify_user_id = models.CharField(max_length=255, unique=True)
    display_name = models.CharField(max_length=255, blank=True)
    # URL handle for the public city page (spocity.app/<public_slug>).
    # Assigned once at first login; null only for rows created before the
    # public-pages feature (backfilled by migration).
    public_slug = models.SlugField(max_length=40, unique=True, null=True, blank=True)
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"{self.display_name} ({self.spotify_user_id})"

    def get_valid_access_token(self) -> str:
        """Return a valid access token, refreshing transparently if expired.

        Uses a 60-second buffer so tokens are refreshed before they expire
        rather than mid-request. Raises SpotifyTokenRefreshError if Spotify
        rejects the refresh — callers should treat this as a re-auth signal.
        """
        if timezone.now() < self.expires_at - timedelta(seconds=60):
            return self.access_token

        res = http.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
                "client_id": settings.SPOTIFY_CLIENT_ID,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )

        if not res.ok:
            raise SpotifyTokenRefreshError(
                f"Token refresh failed ({res.status_code}): {res.text}"
            )

        data = res.json()
        self.access_token = data["access_token"]
        self.expires_at = timezone.now() + timedelta(seconds=data["expires_in"])
        if "refresh_token" in data:
            self.refresh_token = data["refresh_token"]
        self.save(update_fields=["access_token", "refresh_token", "expires_at"])

        return self.access_token


class GenreBucket(models.Model):
    """One of the 10 genre districts in the city (plus 'other' overflow).

    Seeded via data migration. Color palette is a JSON list of hex strings
    used to tint voxel buildings in that district.
    """

    slug = models.SlugField(max_length=40, unique=True)
    label = models.CharField(max_length=80)
    color_palette = models.JSONField(default=list)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "slug"]

    def __str__(self):
        return self.label


class Artist(models.Model):
    """A Spotify artist. Shared across users (one row per Spotify artist id).

    primary_genre_bucket is the rollup result from the genre taxonomy mapper.
    A null value means rollup hasn't run yet; an 'other' value means rollup
    ran but no rule matched.
    """

    spotify_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    image_url = models.URLField(max_length=500, blank=True)
    genres = models.JSONField(default=list)
    # When a Last.fm tag lookup was last attempted for this artist. Lets the
    # batched genre-classification endpoint skip artists that were already
    # tried and legitimately have no tags (empty `genres` alone can't tell
    # "not tried yet" from "tried, nothing found").
    genres_checked_at = models.DateTimeField(null=True, blank=True)
    primary_genre_bucket = models.ForeignKey(
        GenreBucket,
        on_delete=models.SET_NULL,
        related_name="artists",
        null=True,
        blank=True,
    )

    def __str__(self):
        return self.name


class PlayHistory(models.Model):
    """A single play of a track by a user, sourced from Spotify's
    recently-played endpoint.

    The unique constraint on (user, played_at, track_id) prevents duplicate
    inserts when the recent-plays poller runs and Spotify still returns the
    same tracks. The (user, artist, played_at) index supports the per-artist
    decayed-score recompute in Week 3.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="play_history",
    )
    artist = models.ForeignKey(
        Artist, on_delete=models.CASCADE, related_name="plays"
    )
    track_id = models.CharField(max_length=64)
    played_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=["user", "artist", "played_at"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "played_at", "track_id"],
                name="unique_play_per_user_time_track",
            ),
        ]
        ordering = ["-played_at"]


class Tier(models.TextChoices):
    SHACK = "shack", "Shack"
    HOUSE = "house", "House"
    APARTMENT = "apartment", "Apartment"
    OFFICE = "office", "Office"
    SKYSCRAPER = "skyscraper", "Skyscraper"
    LANDMARK = "landmark", "Landmark"


class ArtistScore(models.Model):
    """The current decayed score + tier for a (user, artist) pair.

    One row per (user, artist). Recomputed nightly by the Celery beat task
    in Week 3. The TierEvent table records changes between recomputes.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="artist_scores",
    )
    artist = models.ForeignKey(
        Artist, on_delete=models.CASCADE, related_name="user_scores"
    )
    score = models.FloatField(default=0.0)
    tier = models.CharField(
        max_length=20, choices=Tier.choices, default=Tier.SHACK
    )
    # Hybrid C seed: the Day-1 tier-floor anchor (Shack=0, House=50,
    # Apartment=200, Skyscraper=1500) assigned at initial ingest based on
    # the artist's Spotify aggregate rank. Score = seed_score + observed
    # play count, no decay. See decisions.md §6.
    seed_score = models.FloatField(default=0.0)
    # When the seed was set. Retained from the original decay model for
    # potential future use (e.g., a v2 weathering signal); not load-bearing
    # under Hybrid C.
    seed_assigned_at = models.DateTimeField(null=True, blank=True)
    # Most recent play_at observed for this (user, artist). Drives the
    # Week 7 weathering visual — a Skyscraper unplayed for months gets
    # vines, but its tier doesn't change.
    last_played_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "artist"], name="unique_artist_score_per_user"
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-score"]),
        ]


class TierEvent(models.Model):
    """A recorded tier change for a (user, artist), captured by the nightly
    recompute. Consumed by the frontend's tier-change animation system in
    Week 7 — once an event has been animated, set `delivered_at` so it isn't
    replayed on the next visit.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tier_events",
    )
    artist = models.ForeignKey(
        Artist, on_delete=models.CASCADE, related_name="tier_events"
    )
    prev_tier = models.CharField(max_length=20, choices=Tier.choices)
    new_tier = models.CharField(max_length=20, choices=Tier.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "delivered_at"]),
        ]
        ordering = ["-created_at"]


class GenreUnmapped(models.Model):
    """Production feedback loop for the genre taxonomy.

    Every Spotify genre tag that didn't match any rollup rule gets logged
    here with a hit count. Periodically review this table and either add a
    new rule for the high-traffic unmatched tags or accept them as 'other'.
    """

    tag = models.CharField(max_length=120, unique=True)
    hit_count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-hit_count"]

    def __str__(self):
        return f"{self.tag} ({self.hit_count})"
