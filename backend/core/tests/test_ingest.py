"""Integration tests for the Spotify ingest pipeline.

These run with SPOTIFY_USE_STUB=True so `get_client()` returns a fixture-
backed StubSpotifyClient instead of hitting the real API. The ingest code
under test is identical to what runs in production — only the I/O boundary
swaps.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from core.models import (
    Artist,
    ArtistScore,
    GenreUnmapped,
    PlayHistory,
    SpotifyAccount,
    Tier,
    User,
)
from core.services.ingest import run_initial_ingest, run_recent_ingest


@pytest.fixture
def user_with_account(db):
    user = User.objects.create_user(username="ingest_test_user")
    SpotifyAccount.objects.create(
        user=user,
        spotify_user_id="ingest_test_spotify_id",
        display_name="Ingest Test",
        access_token="dummy",
        refresh_token="dummy",
        expires_at=timezone.now() + timedelta(hours=2),
    )
    return user


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_initial_ingest_creates_artists_with_correct_buckets(user_with_account):
    result = run_initial_ingest(user_with_account)

    # 6 distinct artists across the 3 fixture lists (drake, taylor, phoebe,
    # unknown, kendrick, radiohead)
    assert result.artists_upserted == 6
    assert result.scores_created == 6
    assert result.scores_updated == 0

    drake = Artist.objects.get(spotify_id="artist_drake")
    taylor = Artist.objects.get(spotify_id="artist_taylor")
    phoebe = Artist.objects.get(spotify_id="artist_phoebe")
    radiohead = Artist.objects.get(spotify_id="artist_radiohead")
    unknown = Artist.objects.get(spotify_id="artist_unknown")

    assert drake.primary_genre_bucket.slug == "hip-hop"
    assert taylor.primary_genre_bucket.slug == "pop"
    assert phoebe.primary_genre_bucket.slug == "folk-singer-songwriter"
    assert radiohead.primary_genre_bucket.slug == "rock"
    assert unknown.primary_genre_bucket.slug == "other"


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_initial_ingest_seeds_scores_and_tiers(user_with_account):
    run_initial_ingest(user_with_account)

    # Drake is top-1 short_term + top-1 medium_term — should be high tier
    drake_score = ArtistScore.objects.get(
        user=user_with_account, artist__spotify_id="artist_drake"
    )
    assert drake_score.score > 0
    assert drake_score.tier in {Tier.SKYSCRAPER, Tier.LANDMARK}

    # Artists appearing in only one list at lower ranks should be lower-tier
    radiohead_score = ArtistScore.objects.get(
        user=user_with_account, artist__spotify_id="artist_radiohead"
    )
    assert radiohead_score.score < drake_score.score


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_initial_ingest_is_idempotent(user_with_account):
    first = run_initial_ingest(user_with_account)
    second = run_initial_ingest(user_with_account)

    # Same artist count, but scores were updated not created the second time
    assert first.artists_upserted == second.artists_upserted
    assert second.scores_created == 0
    assert second.scores_updated == first.scores_created
    # No duplicate Artist rows
    assert Artist.objects.count() == first.artists_upserted


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_initial_ingest_logs_unmapped_genre_tags(user_with_account):
    run_initial_ingest(user_with_account)

    # "totally-made-up-microgenre" hit no rule
    assert GenreUnmapped.objects.filter(
        tag="totally-made-up-microgenre"
    ).exists()


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_recent_ingest_inserts_play_history(user_with_account):
    # Need artists upserted first so /recently-played can FK to them
    run_initial_ingest(user_with_account)

    result = run_recent_ingest(user_with_account)
    assert result.plays_inserted == 3
    assert result.plays_skipped_dupes == 0
    assert PlayHistory.objects.filter(user=user_with_account).count() == 3


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_recent_ingest_dedup_via_unique_constraint(user_with_account):
    run_initial_ingest(user_with_account)
    run_recent_ingest(user_with_account)

    # Running again — same fixture, same played_at values → all dupes
    result = run_recent_ingest(user_with_account)
    assert result.plays_inserted == 0
    assert result.plays_skipped_dupes == 3
    assert PlayHistory.objects.filter(user=user_with_account).count() == 3


@override_settings(SPOTIFY_USE_STUB=True)
@pytest.mark.django_db
def test_recent_ingest_creates_missing_artist_from_minimal_payload(
    user_with_account,
):
    """If /recently-played returns a track from an artist we haven't seen
    via /top-artists yet, the ingest should still upsert that artist (with
    an empty genres list — rollup will run on the next initial-ingest)."""
    # Skip initial ingest — so /recently-played sees artists we haven't
    # seen before.
    result = run_recent_ingest(user_with_account)

    assert result.plays_inserted == 3
    assert result.artists_upserted == 3
    # All three should exist with empty genre rollup → 'other' bucket
    drake = Artist.objects.get(spotify_id="artist_drake")
    assert drake.primary_genre_bucket.slug == "other"
    assert drake.genres == []
