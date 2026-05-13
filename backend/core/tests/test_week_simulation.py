"""Integration test: a user listens, the city grows.

Under Hybrid C, the city grows monotonically with observed plays. There's
no decay path to test anymore — the test instead validates the *full*
ingest → recompute → tier-event flow against realistic listening patterns.
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
from core.services.scoring import (
    APARTMENT_FLOOR,
    HOUSE_FLOOR,
    SKYSCRAPER_FLOOR,
)

User = get_user_model()
NOW = datetime.now(dt_tz.utc)


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
    return {
        "seeded_sky": Artist.objects.create(
            spotify_id="sky", name="Day-1 Favorite",
            primary_genre_bucket=buckets["pop"],
        ),
        "seeded_house": Artist.objects.create(
            spotify_id="hse", name="Day-1 Top-50",
            primary_genre_bucket=buckets["rock"],
        ),
        "cold_pick": Artist.objects.create(
            spotify_id="cld", name="New Discovery",
            primary_genre_bucket=buckets["pop"],
        ),
    }


def _seed(user, artist, score, tier):
    ArtistScore.objects.create(
        user=user, artist=artist,
        score=score, tier=tier, seed_score=score,
    )


def _plays(user, artist, n):
    for i in range(n):
        PlayHistory.objects.create(
            user=user, artist=artist,
            track_id=f"{artist.spotify_id}-{i}",
            played_at=NOW - timedelta(hours=i),
        )


def test_seeded_favorite_stays_seeded_cold_pick_can_climb_to_match(user, artists):
    """A user signs up with a Top-3 favorite (seeded at Skyscraper) and a
    Top-50 favorite (seeded at House). They then discover a new artist and
    play it heavily. Under Hybrid C:
        - The seeded favorites keep their Day-1 tiers (no decay).
        - The cold pick can climb based purely on observed plays.
    """
    _seed(user, artists["seeded_sky"], score=SKYSCRAPER_FLOOR, tier=Tier.SKYSCRAPER)
    _seed(user, artists["seeded_house"], score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _seed(user, artists["cold_pick"], score=0.0, tier=Tier.SHACK)

    # User binges the cold pick: 250 plays across recent weeks.
    _plays(user, artists["cold_pick"], n=250)
    # User also keeps light contact with the seeded house artist (10 plays).
    _plays(user, artists["seeded_house"], n=10)
    # User does NOT play the seeded sky artist at all (Laufey scenario).

    result = recompute_user(user)
    assert result.scores_updated == 3

    sky = ArtistScore.objects.get(user=user, artist=artists["seeded_sky"])
    hse = ArtistScore.objects.get(user=user, artist=artists["seeded_house"])
    cld = ArtistScore.objects.get(user=user, artist=artists["cold_pick"])

    # Skyscraper-seeded favorite stays Skyscraper despite zero recent plays.
    assert sky.tier == Tier.SKYSCRAPER
    assert sky.score == pytest.approx(SKYSCRAPER_FLOOR)

    # Cold pick climbs to Apartment (250 plays clears the 200 floor).
    assert cld.tier == Tier.APARTMENT
    assert cld.score == pytest.approx(250.0)

    # Seeded House gets +10 plays but still in House (next floor is 200).
    assert hse.tier == Tier.HOUSE
    assert hse.score == pytest.approx(HOUSE_FLOOR + 10)

    # Tier-event recorded for the cold pick's climb.
    events = TierEvent.objects.filter(user=user, artist=artists["cold_pick"])
    assert events.count() == 1
    assert events.first().prev_tier == Tier.SHACK
    assert events.first().new_tier == Tier.APARTMENT


def test_a_very_heavy_listener_can_reach_landmark(user, artists):
    """Landmark is 4000 plays. A binger doing 50 plays/day for 80 days
    gets there. Validates the threshold isn't unreachable."""
    _seed(user, artists["cold_pick"], score=0.0, tier=Tier.SHACK)
    _plays(user, artists["cold_pick"], n=4000)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artists["cold_pick"])
    assert score.tier == Tier.LANDMARK
