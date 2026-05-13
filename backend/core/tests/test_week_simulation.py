"""Integration test: simulate a week of activity, assert an artist climbs
a tier.

This is the test that proves the whole scoring pipeline hangs together —
not just the decay function in isolation, not just the recompute, but the
realistic flow:

    Day 0: initial ingest seeds a user's top artists at their starting tiers.
    Days 1-7: user plays one specific artist heavily (say, 5 plays per day).
    Day 8: recompute → the heavily-played artist climbs at least one tier
    and a TierEvent is recorded.

We sidestep the actual Spotify API by writing ArtistScore + PlayHistory
rows directly with controlled timestamps, then call recompute_user with an
injected `now`.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz

import pytest
from django.contrib.auth import get_user_model

from core.models import (
    Artist,
    ArtistScore,
    GenreBucket,
    PlayHistory,
    Tier,
    TierEvent,
)
from core.services.recompute import recompute_user

User = get_user_model()

DAY_0 = datetime(2026, 5, 1, 12, 0, 0, tzinfo=dt_tz.utc)
DAY_8 = DAY_0 + timedelta(days=8)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="listener")


@pytest.fixture
def buckets(db):
    return {
        "pop": GenreBucket.objects.create(slug="pop-t", label="Pop", color_palette=[]),
        "rock": GenreBucket.objects.create(slug="rock-t", label="Rock", color_palette=[]),
    }


@pytest.fixture
def artists(db, buckets):
    """Three artists: one heavy listener, one steady, one dormant."""
    return {
        "heavy": Artist.objects.create(
            spotify_id="heavy", name="Heavy Hitter",
            primary_genre_bucket=buckets["pop"],
        ),
        "steady": Artist.objects.create(
            spotify_id="steady", name="Steady Plays",
            primary_genre_bucket=buckets["rock"],
        ),
        "dormant": Artist.objects.create(
            spotify_id="dormant", name="Old Favorite",
            primary_genre_bucket=buckets["pop"],
        ),
    }


def _seed_score(user, artist, seed, tier):
    ArtistScore.objects.create(
        user=user,
        artist=artist,
        score=seed,
        tier=tier,
        seed_score=seed,
        seed_assigned_at=DAY_0,
    )


def _plays(user, artist, played_at_list):
    for i, played_at in enumerate(played_at_list):
        PlayHistory.objects.create(
            user=user,
            artist=artist,
            track_id=f"{artist.spotify_id}-{i}",
            played_at=played_at,
        )


def test_week_of_heavy_listening_climbs_a_tier(user, artists):
    """The full pipeline: seed three artists, play one heavily, recompute,
    assert the heavy artist moved up at least one tier."""
    # Day 0 — initial seeding.
    _seed_score(user, artists["heavy"], seed=8.0, tier=Tier.SHACK)
    _seed_score(user, artists["steady"], seed=8.0, tier=Tier.SHACK)
    _seed_score(user, artists["dormant"], seed=8.0, tier=Tier.SHACK)

    # Days 1-7 — listener plays "heavy" 5 times per day.
    heavy_plays = []
    for day in range(1, 8):
        for hour in (8, 11, 14, 17, 20):
            heavy_plays.append(
                DAY_0 + timedelta(days=day, hours=hour)
            )
    _plays(user, artists["heavy"], heavy_plays)

    # Steady gets one play a day.
    _plays(
        user,
        artists["steady"],
        [DAY_0 + timedelta(days=d, hours=12) for d in range(1, 8)],
    )

    # Dormant gets zero plays.

    # Day 8 — nightly recompute fires.
    result = recompute_user(user, now=DAY_8)
    assert result.scores_updated == 3

    heavy_score = ArtistScore.objects.get(user=user, artist=artists["heavy"])
    steady_score = ArtistScore.objects.get(user=user, artist=artists["steady"])
    dormant_score = ArtistScore.objects.get(user=user, artist=artists["dormant"])

    # Property 1: heavy has the highest score.
    assert heavy_score.score > steady_score.score > dormant_score.score

    # Property 2: heavy climbed at least one tier above its starting Shack.
    assert heavy_score.tier != Tier.SHACK
    # Property 3: a TierEvent was recorded for the climb.
    events = TierEvent.objects.filter(user=user, artist=artists["heavy"])
    assert events.count() == 1
    event = events.first()
    assert event.prev_tier == Tier.SHACK
    assert event.new_tier == heavy_score.tier
    assert event.delivered_at is None  # still pending animation


def test_dormant_artist_after_long_gap_eventually_downgrades(user, artists):
    """An artist seeded at a high tier with no plays for a long time should
    decay below the seed. Sanity-check on the cycle: a high seed with no
    plays must not stay at landmark forever."""
    far_future = DAY_0 + timedelta(days=400)
    _seed_score(user, artists["dormant"], seed=120.0, tier=Tier.LANDMARK)
    recompute_user(user, now=far_future)

    score = ArtistScore.objects.get(user=user, artist=artists["dormant"])
    # After more than one seed half-life with no plays, score should be
    # under the original seed
    assert score.score < 120.0
    assert score.tier != Tier.LANDMARK
