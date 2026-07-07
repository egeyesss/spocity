"""Spotify → DB ingest pipeline.

Two entry points called from the API views:

- `run_initial_ingest(user)`: on first login (and on manual /api/ingest/initial
  POSTs), pulls the user's top-50 artists across short/medium/long term,
  upserts Artist rows (with genre rollup), and seeds ArtistScore + initial
  tier per (user, artist) pair.

- `run_recent_ingest(user)`: pulls /recently-played (last 50 tracks), inserts
  PlayHistory rows. Dedup is handled by the model's unique constraint on
  (user, played_at, track_id) — we let the DB reject dupes rather than
  pre-checking, which is both correct and faster on the happy path.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from .. import genres as genre_rollup
from ..models import (
    Artist,
    ArtistScore,
    GenreBucket,
    PlayHistory,
    SpotifyAccount,
    User,
)
from . import lastfm
from .scoring import (
    collect_positions,
    rank_by_weight,
    score_to_tier,
    seed_tier_floor,
)
from .spotify import BaseSpotifyClient, get_client

logger = logging.getLogger(__name__)

TIME_RANGES = ("short_term", "medium_term", "long_term")

# How many top artists to pull per time range. Spotify pages this internally
# (50/request); the union across the three ranges is what fills the city.
TOP_ARTISTS_LIMIT = 100


@dataclass
class InitialIngestResult:
    artists_upserted: int
    scores_created: int
    scores_updated: int
    unmapped_tags_logged: int


@dataclass
class RecentIngestResult:
    plays_inserted: int
    plays_skipped_dupes: int
    artists_upserted: int


def _bucket_lookup() -> dict[str, GenreBucket]:
    """Cache buckets by slug for the duration of one ingest call. Cheap
    (11 rows) but worth not re-querying per artist."""
    return {b.slug: b for b in GenreBucket.objects.all()}


def _upsert_artist(
    spotify_data: dict[str, Any],
    bucket_lookup: dict[str, GenreBucket],
    unmapped_collector: list[str],
    lastfm_client: lastfm.BaseLastfmClient | None = None,
) -> tuple[Artist, bool]:
    """Upsert one Spotify artist payload into the Artist table.

    Spotify removed the `genres` field from its artist objects in late 2024.
    When Spotify gives us nothing, we fall back to Last.fm's user-submitted
    tags so the rollup still has something to classify. The DB stores
    whatever source actually produced data — the classifier doesn't care.

    Returns (artist, created). Unmapped genre tags are appended to
    `unmapped_collector` so the caller can flush them in one DB call.
    """
    spotify_id = spotify_data["id"]
    name = spotify_data.get("name", "")
    genres = spotify_data.get("genres") or []
    images = spotify_data.get("images") or []
    image_url = images[0]["url"] if images else ""

    # Artist rows are global — if a previous ingest (any user) already
    # resolved genres for this artist, reuse them instead of re-asking
    # Last.fm. This is what makes ingest fast for overlapping taste.
    if not genres:
        stored = (
            Artist.objects.filter(spotify_id=spotify_id)
            .values_list("genres", flat=True)
            .first()
        )
        if stored:
            genres = stored

    checked_at = None
    if not genres and lastfm_client is not None and name:
        try:
            genres = lastfm_client.get_artist_tags(name)
        except lastfm.LastfmAPIError:
            logger.exception("Last.fm lookup failed for %s", name)
            genres = []
        checked_at = timezone.now()

    bucket_slug, unmapped = genre_rollup.classify(genres)
    unmapped_collector.extend(unmapped)

    defaults: dict[str, Any] = {
        "name": name[:255],
        "image_url": image_url[:500],
        "genres": genres,
        "primary_genre_bucket": bucket_lookup.get(bucket_slug),
    }
    if checked_at is not None:
        defaults["genres_checked_at"] = checked_at

    artist, created = Artist.objects.update_or_create(
        spotify_id=spotify_id,
        defaults=defaults,
    )
    return artist, created


def run_initial_ingest(
    user: User,
    client: BaseSpotifyClient | None = None,
    lastfm_client: lastfm.BaseLastfmClient | None = None,
    fetch_genres: bool = True,
) -> InitialIngestResult:
    """Fetch top artists across all three time ranges, upsert them, seed
    ArtistScores.

    Idempotent — running it twice in a row is safe; the second run just
    refreshes the same data.

    With `fetch_genres=False`, unknown artists are upserted without Last.fm
    lookups (they land in "other" until classified). One sequential Last.fm
    call per artist makes a cold ingest take ~a minute; the API view runs
    this fast path and the frontend then drives `run_genre_fill` in batches
    with a progress indicator.
    """
    account: SpotifyAccount = user.spotify_account
    client = client or get_client(account)
    if lastfm_client is None and fetch_genres:
        lastfm_client = lastfm.get_client()

    top_lists: dict[str, list[dict]] = {}
    for tr in TIME_RANGES:
        top_lists[tr] = client.get_top_artists(
            time_range=tr, limit=TOP_ARTISTS_LIMIT
        )

    bucket_lookup = _bucket_lookup()
    unmapped_tags: list[str] = []
    artist_by_spotify_id: dict[str, Artist] = {}

    # Pass 1: upsert every distinct artist we saw across the three lists.
    seen_ids: set[str] = set()
    for tr, items in top_lists.items():
        for item in items:
            spotify_id = item["id"]
            if spotify_id in seen_ids:
                continue
            seen_ids.add(spotify_id)
            artist, _ = _upsert_artist(
                item, bucket_lookup, unmapped_tags, lastfm_client
            )
            artist_by_spotify_id[spotify_id] = artist

    # Pass 2: compute per-artist seed score from aggregate rank.
    # Sort all artists by aggregate weight (across the three time-range
    # lists), assign 1-indexed ranks, then map rank → tier-floor anchor.
    positions = collect_positions(top_lists)
    ranks = rank_by_weight(positions)
    scores_created = 0
    scores_updated = 0

    seeded_at = timezone.now()
    with transaction.atomic():
        for spotify_id in positions:
            artist = artist_by_spotify_id[spotify_id]
            rank = ranks.get(spotify_id)  # None if not in any list (shouldn't happen here)
            seed = seed_tier_floor(rank)
            tier = score_to_tier(seed)
            # Preserve existing seeds when an ArtistScore already exists —
            # re-running initial-ingest must NOT reset a user's grown
            # buildings back to Day-1 values.
            _, created = ArtistScore.objects.get_or_create(
                user=user,
                artist=artist,
                defaults={
                    "score": seed,
                    "tier": tier,
                    "seed_score": seed,
                    "seed_assigned_at": seeded_at,
                },
            )
            if created:
                scores_created += 1
            else:
                scores_updated += 1

    # Flush unmapped tags after the main work so a logging hiccup can't
    # roll back the actual ingest.
    if unmapped_tags:
        try:
            genre_rollup.log_unmapped(unmapped_tags)
        except Exception:
            logger.exception("Failed to log unmapped genre tags")

    return InitialIngestResult(
        artists_upserted=len(artist_by_spotify_id),
        scores_created=scores_created,
        scores_updated=scores_updated,
        unmapped_tags_logged=len(unmapped_tags),
    )


def run_recent_ingest(
    user: User,
    client: BaseSpotifyClient | None = None,
    lastfm_client: lastfm.BaseLastfmClient | None = None,
) -> RecentIngestResult:
    """Fetch /recently-played (last 50 tracks) and insert PlayHistory rows.

    Spotify guarantees ascending uniqueness of `played_at` per user, so the
    DB constraint on (user, played_at, track_id) is what makes this safe to
    run on a tight schedule without bookkeeping.
    """
    account: SpotifyAccount = user.spotify_account
    client = client or get_client(account)
    lastfm_client = lastfm_client or lastfm.get_client()

    items = client.get_recently_played(limit=50)
    bucket_lookup = _bucket_lookup()
    unmapped_tags: list[str] = []
    plays_inserted = 0
    plays_skipped = 0
    artists_upserted = 0
    artist_cache: dict[str, Artist] = {}

    for item in items:
        track = item.get("track") or {}
        track_id = track.get("id")
        played_at_raw = item.get("played_at")
        artists = track.get("artists") or []
        if not (track_id and played_at_raw and artists):
            continue

        # Take only the primary artist — secondary artists on features
        # would inflate play counts (one play = one artist, by design).
        primary = artists[0]
        spotify_id = primary["id"]
        played_at = _parse_iso(played_at_raw)

        artist = artist_cache.get(spotify_id)
        if artist is None:
            # /recently-played only returns minimal artist objects (no
            # genres) — try the local DB first; only upsert from the
            # minimal payload if we haven't seen this artist before.
            existing = Artist.objects.filter(spotify_id=spotify_id).first()
            if existing:
                artist = existing
            else:
                artist, _ = _upsert_artist(
                    {
                        "id": spotify_id,
                        "name": primary.get("name", ""),
                        "genres": [],
                        "images": [],
                    },
                    bucket_lookup,
                    unmapped_tags,
                    lastfm_client,
                )
                artists_upserted += 1
            artist_cache[spotify_id] = artist

        try:
            with transaction.atomic():
                PlayHistory.objects.create(
                    user=user,
                    artist=artist,
                    track_id=track_id,
                    played_at=played_at,
                )
                plays_inserted += 1
        except IntegrityError:
            # Already inserted on a previous poll — expected, not an error.
            plays_skipped += 1

    if unmapped_tags:
        try:
            genre_rollup.log_unmapped(unmapped_tags)
        except Exception:
            logger.exception("Failed to log unmapped genre tags")

    return RecentIngestResult(
        plays_inserted=plays_inserted,
        plays_skipped_dupes=plays_skipped,
        artists_upserted=artists_upserted,
    )


@dataclass
class GenreFillResult:
    classified: int
    remaining: int


def run_genre_fill(
    user: User,
    budget: int = 25,
    lastfm_client: lastfm.BaseLastfmClient | None = None,
) -> GenreFillResult:
    """Classify up to `budget` of the user's still-untagged artists via
    Last.fm.

    Complements the fast (no-Last.fm) initial ingest: the frontend calls
    this in a loop, showing progress from `remaining`, until it hits zero.
    Artists whose lookup finds no tags are stamped `genres_checked_at` so
    they don't get retried forever — they just stay in "other".
    """
    lastfm_client = lastfm_client or lastfm.get_client()
    bucket_lookup = _bucket_lookup()
    unmapped_tags: list[str] = []

    pending = Artist.objects.filter(
        user_scores__user=user,
        genres=[],
        genres_checked_at__isnull=True,
    ).order_by("id")

    classified = 0
    for artist in pending[:budget]:
        genres: list[str] = []
        if artist.name:
            try:
                genres = lastfm_client.get_artist_tags(artist.name)
            except lastfm.LastfmAPIError:
                logger.exception("Last.fm lookup failed for %s", artist.name)

        bucket_slug, unmapped = genre_rollup.classify(genres)
        unmapped_tags.extend(unmapped)

        artist.genres = genres
        artist.primary_genre_bucket = bucket_lookup.get(bucket_slug)
        artist.genres_checked_at = timezone.now()
        artist.save(
            update_fields=["genres", "primary_genre_bucket", "genres_checked_at"]
        )
        classified += 1

    if unmapped_tags:
        try:
            genre_rollup.log_unmapped(unmapped_tags)
        except Exception:
            logger.exception("Failed to log unmapped genre tags")

    remaining = Artist.objects.filter(
        user_scores__user=user,
        genres=[],
        genres_checked_at__isnull=True,
    ).count()

    return GenreFillResult(classified=classified, remaining=remaining)


def _parse_iso(value: str) -> datetime:
    """Spotify uses ISO-8601 with a trailing 'Z'. Python's datetime.fromisoformat
    handles the offset form natively from 3.11+; the .replace fallback covers
    older shapes.
    """
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
