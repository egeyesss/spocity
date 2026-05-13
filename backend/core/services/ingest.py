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

from .. import genres as genre_rollup
from ..models import (
    Artist,
    ArtistScore,
    GenreBucket,
    PlayHistory,
    SpotifyAccount,
    User,
)
from .scoring import collect_positions, compute_seed_score, score_to_tier
from .spotify import BaseSpotifyClient, get_client

logger = logging.getLogger(__name__)

TIME_RANGES = ("short_term", "medium_term", "long_term")


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
) -> tuple[Artist, bool]:
    """Upsert one Spotify artist payload into the Artist table.

    Returns (artist, created). Unmapped genre tags are appended to
    `unmapped_collector` so the caller can flush them in one DB call.
    """
    spotify_id = spotify_data["id"]
    genres = spotify_data.get("genres", []) or []
    images = spotify_data.get("images") or []
    image_url = images[0]["url"] if images else ""

    bucket_slug, unmapped = genre_rollup.classify(genres)
    unmapped_collector.extend(unmapped)

    artist, created = Artist.objects.update_or_create(
        spotify_id=spotify_id,
        defaults={
            "name": spotify_data.get("name", "")[:255],
            "image_url": image_url[:500],
            "genres": genres,
            "primary_genre_bucket": bucket_lookup.get(bucket_slug),
        },
    )
    return artist, created


def run_initial_ingest(
    user: User, client: BaseSpotifyClient | None = None
) -> InitialIngestResult:
    """Fetch top artists across all three time ranges, upsert them, seed
    ArtistScores.

    Idempotent — running it twice in a row is safe; the second run just
    refreshes the same data.
    """
    account: SpotifyAccount = user.spotify_account
    client = client or get_client(account)

    top_lists: dict[str, list[dict]] = {}
    for tr in TIME_RANGES:
        top_lists[tr] = client.get_top_artists(time_range=tr, limit=50)

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
            artist, _ = _upsert_artist(item, bucket_lookup, unmapped_tags)
            artist_by_spotify_id[spotify_id] = artist

    # Pass 2: compute per-artist seed score from rank positions.
    positions = collect_positions(top_lists)
    scores_created = 0
    scores_updated = 0

    with transaction.atomic():
        for spotify_id, pos in positions.items():
            artist = artist_by_spotify_id[spotify_id]
            score = compute_seed_score(pos)
            tier = score_to_tier(score)
            _, created = ArtistScore.objects.update_or_create(
                user=user,
                artist=artist,
                defaults={"score": score, "tier": tier},
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
    user: User, client: BaseSpotifyClient | None = None
) -> RecentIngestResult:
    """Fetch /recently-played (last 50 tracks) and insert PlayHistory rows.

    Spotify guarantees ascending uniqueness of `played_at` per user, so the
    DB constraint on (user, played_at, track_id) is what makes this safe to
    run on a tight schedule without bookkeeping.
    """
    account: SpotifyAccount = user.spotify_account
    client = client or get_client(account)

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
                        "genres": [],  # rollup runs on initial-ingest
                        "images": [],
                    },
                    bucket_lookup,
                    unmapped_tags,
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


def _parse_iso(value: str) -> datetime:
    """Spotify uses ISO-8601 with a trailing 'Z'. Python's datetime.fromisoformat
    handles the offset form natively from 3.11+; the .replace fallback covers
    older shapes.
    """
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value)
