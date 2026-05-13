"""Tests for the per-user recompute pipeline under Hybrid C.

Contract (post-pivot):
    score = seed_score + count of PlayHistory rows for (user, artist)
    tier  = score_to_tier(score)
    TierEvent emitted whenever tier changes between recomputes
    last_played_at recorded so Week 7 weathering visuals have data

No `now` parameter — score is purely a function of seeded value + play
count. Time math is gone from the score path. The Week 7 weathering
visual reads `last_played_at` separately.
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


@pytest.fixture
def user(db):
    return User.objects.create_user(username="alice")


@pytest.fixture
def other_bucket(db):
    return GenreBucket.objects.create(
        slug="other-test", label="Other Test", color_palette=[]
    )


@pytest.fixture
def artist(db, other_bucket):
    return Artist.objects.create(
        spotify_id="art1", name="Test Artist", primary_genre_bucket=other_bucket
    )


def _make_score(user, artist, seed_score, tier=Tier.SHACK):
    return ArtistScore.objects.create(
        user=user,
        artist=artist,
        score=seed_score,
        tier=tier,
        seed_score=seed_score,
    )


def _make_plays(user, artist, n, base_age_days=0.0):
    """Insert n PlayHistory rows for a (user, artist) at various ages."""
    now = datetime.now(dt_tz.utc)
    for i in range(n):
        PlayHistory.objects.create(
            user=user,
            artist=artist,
            track_id=f"trk{i}",
            played_at=now - timedelta(days=base_age_days, hours=i),
        )


# ── score = seed + play count ────────────────────────────────────────────────


def test_no_plays_score_equals_seed(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score == pytest.approx(HOUSE_FLOOR)


def test_each_play_adds_one_to_score(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _make_plays(user, artist, n=10)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score == pytest.approx(HOUSE_FLOOR + 10)


def test_old_plays_count_the_same_as_new_plays(user, artist):
    """The whole point of Hybrid C: a play from 2 years ago counts as
    much as a play yesterday."""
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _make_plays(user, artist, n=5, base_age_days=730)  # 2 years old
    _make_plays(user, artist, n=5, base_age_days=0)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score == pytest.approx(HOUSE_FLOOR + 10)


# ── tier transitions ─────────────────────────────────────────────────────────


def test_house_seed_plus_enough_plays_climbs_to_apartment(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    # House floor is 50, Apartment floor is 200 → need 150+ plays.
    _make_plays(user, artist, n=200)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.tier == Tier.APARTMENT
    events = TierEvent.objects.filter(user=user, artist=artist)
    assert events.count() == 1
    assert events.first().prev_tier == Tier.HOUSE
    assert events.first().new_tier == Tier.APARTMENT


def test_no_plays_no_tier_change_no_event(user, artist):
    _make_score(user, artist, seed_score=SKYSCRAPER_FLOOR, tier=Tier.SKYSCRAPER)
    recompute_user(user)
    assert not TierEvent.objects.filter(user=user, artist=artist).exists()


def test_seeded_skyscraper_stays_skyscraper_with_no_plays(user, artist):
    """The asymmetric floor anchoring per decisions §6: a Top-3 seed stays
    at Skyscraper forever if there are no plays. Fading-favorite signal is
    visual (Week 7), not numerical."""
    _make_score(user, artist, seed_score=SKYSCRAPER_FLOOR, tier=Tier.SKYSCRAPER)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.tier == Tier.SKYSCRAPER
    assert score.score == pytest.approx(SKYSCRAPER_FLOOR)


# ── last_played_at gets recorded for Week 7 weathering ──────────────────────


def test_last_played_at_recorded_when_plays_exist(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _make_plays(user, artist, n=3, base_age_days=10)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.last_played_at is not None


def test_last_played_at_is_max_of_play_history(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _make_plays(user, artist, n=2, base_age_days=200)
    _make_plays(user, artist, n=2, base_age_days=10)  # more recent
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    # Should match the most recent play (10 days ago, give or take seconds)
    age = datetime.now(dt_tz.utc) - score.last_played_at
    assert age < timedelta(days=11)


def test_no_plays_no_last_played_at(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    recompute_user(user)
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.last_played_at is None


# ── isolation & idempotency ──────────────────────────────────────────────────


def test_recompute_only_touches_target_user(db, artist):
    alice = User.objects.create_user(username="alice")
    bob = User.objects.create_user(username="bob")
    _make_score(alice, artist, seed_score=HOUSE_FLOOR)
    bob_score = _make_score(bob, artist, seed_score=HOUSE_FLOOR)
    _make_plays(alice, artist, n=5)

    recompute_user(alice)
    bob_after = ArtistScore.objects.get(pk=bob_score.pk)
    assert bob_after.score == pytest.approx(HOUSE_FLOOR)


def test_recompute_idempotent(user, artist):
    _make_score(user, artist, seed_score=HOUSE_FLOOR, tier=Tier.HOUSE)
    _make_plays(user, artist, n=200)

    recompute_user(user)
    score_1 = ArtistScore.objects.get(user=user, artist=artist).score
    events_1 = TierEvent.objects.filter(user=user, artist=artist).count()

    recompute_user(user)
    score_2 = ArtistScore.objects.get(user=user, artist=artist).score
    events_2 = TierEvent.objects.filter(user=user, artist=artist).count()

    assert score_1 == pytest.approx(score_2)
    assert events_1 == events_2 == 1


def test_recompute_handles_user_with_no_scores(user):
    recompute_user(user)
    assert not ArtistScore.objects.filter(user=user).exists()
