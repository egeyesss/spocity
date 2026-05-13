"""Tests for the per-user recompute pipeline.

The recompute is what makes the city *living* — every night, every
ArtistScore decays a bit; new plays bump certain artists; tier changes
fire TierEvent rows that the frontend animates on next visit.

Strategy here is to seed the DB at a *past* moment (so ages are meaningful)
and either freeze time at recompute or pass `now` explicitly. We pass `now`
explicitly because the recompute function takes it as a kwarg — no library
needed, easier to reason about than `freeze_time`.
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

NOW = datetime(2026, 5, 1, 12, 0, 0, tzinfo=dt_tz.utc)


@pytest.fixture
def user(db):
    return User.objects.create_user(username="alice")


@pytest.fixture
def other_genre_bucket(db):
    """Tests don't care about the rollup — just need an FK target."""
    return GenreBucket.objects.create(
        slug="other-test", label="Other Test", color_palette=[]
    )


@pytest.fixture
def artist(db, other_genre_bucket):
    return Artist.objects.create(
        spotify_id="art1",
        name="Test Artist",
        primary_genre_bucket=other_genre_bucket,
    )


def _make_score(user, artist, seed_score, seed_age_days, tier=Tier.SHACK):
    """Build an existing ArtistScore in a controlled state."""
    return ArtistScore.objects.create(
        user=user,
        artist=artist,
        score=seed_score,
        tier=tier,
        seed_score=seed_score,
        seed_assigned_at=NOW - timedelta(days=seed_age_days),
    )


def _make_plays(user, artist, ages_days):
    """Insert PlayHistory rows for a (user, artist) at the given ages."""
    for i, age in enumerate(ages_days):
        PlayHistory.objects.create(
            user=user,
            artist=artist,
            track_id=f"trk{i}",
            played_at=NOW - timedelta(days=age),
        )


# ── recompute updates the score in-place ─────────────────────────────────────


def test_recompute_with_no_plays_decays_seed(user, artist):
    """An artist with a 365d-old seed and zero plays should land at half
    its original seed score after one seed half-life."""
    _make_score(user, artist, seed_score=100.0, seed_age_days=365.0, tier=Tier.OFFICE)
    recompute_user(user, now=NOW)

    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score == pytest.approx(50.0)


def test_recompute_seed_age_zero_no_plays_keeps_seed(user, artist):
    _make_score(user, artist, seed_score=50.0, seed_age_days=0.0, tier=Tier.APARTMENT)
    recompute_user(user, now=NOW)

    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score == pytest.approx(50.0)


def test_recompute_adds_play_contributions(user, artist):
    """A fresh play should bump the score above the seed alone."""
    _make_score(user, artist, seed_score=20.0, seed_age_days=0.0, tier=Tier.HOUSE)
    _make_plays(user, artist, ages_days=[0.0, 1.0, 2.0])
    recompute_user(user, now=NOW)

    score = ArtistScore.objects.get(user=user, artist=artist)
    assert score.score > 20.0


# ── tier transitions create TierEvent rows ───────────────────────────────────


def test_tier_upgrade_creates_tier_event(user, artist):
    """If new score crosses a higher threshold, a TierEvent is recorded."""
    _make_score(user, artist, seed_score=5.0, seed_age_days=0.0, tier=Tier.SHACK)
    # 100 recent plays + a big seed should land in skyscraper/landmark range
    _make_plays(user, artist, ages_days=[0.0] * 100)
    _make_score_seed_then_save_high = None  # noqa — clarity

    # Bump seed too, separate from initial create
    s = ArtistScore.objects.get(user=user, artist=artist)
    s.seed_score = 100.0
    s.save(update_fields=["seed_score"])

    recompute_user(user, now=NOW)

    events = TierEvent.objects.filter(user=user, artist=artist)
    assert events.count() == 1
    event = events.first()
    assert event.prev_tier == Tier.SHACK
    assert event.new_tier != Tier.SHACK
    assert event.delivered_at is None


def test_tier_unchanged_no_event(user, artist):
    _make_score(user, artist, seed_score=5.0, seed_age_days=0.0, tier=Tier.SHACK)
    recompute_user(user, now=NOW)

    assert not TierEvent.objects.filter(user=user, artist=artist).exists()


def test_tier_downgrade_creates_tier_event(user, artist):
    """A stale seed with no plays should eventually downgrade."""
    # Big initial seed, very old (way past seed half-life)
    _make_score(
        user, artist, seed_score=100.0, seed_age_days=1500.0, tier=Tier.SKYSCRAPER
    )
    recompute_user(user, now=NOW)

    events = TierEvent.objects.filter(user=user, artist=artist)
    assert events.count() == 1
    event = events.first()
    assert event.prev_tier == Tier.SKYSCRAPER
    # Should drop several tiers
    score = ArtistScore.objects.get(user=user, artist=artist)
    assert event.new_tier == score.tier


# ── isolation: only the target user's scores are touched ─────────────────────


def test_recompute_only_touches_target_user(db, artist):
    alice = User.objects.create_user(username="alice")
    bob = User.objects.create_user(username="bob")

    _make_score(alice, artist, seed_score=10.0, seed_age_days=365.0, tier=Tier.HOUSE)
    bob_score = _make_score(
        bob, artist, seed_score=10.0, seed_age_days=365.0, tier=Tier.HOUSE
    )

    recompute_user(alice, now=NOW)

    bob_after = ArtistScore.objects.get(pk=bob_score.pk)
    # Bob's score must be untouched
    assert bob_after.score == pytest.approx(10.0)
    assert bob_after.tier == Tier.HOUSE


def test_recompute_idempotent_within_same_now(user, artist):
    """Running recompute twice with the same `now` should produce the same
    score and not create duplicate TierEvents."""
    _make_score(user, artist, seed_score=50.0, seed_age_days=90.0, tier=Tier.OFFICE)
    _make_plays(user, artist, ages_days=[0.0, 5.0, 10.0])

    recompute_user(user, now=NOW)
    score_1 = ArtistScore.objects.get(user=user, artist=artist).score
    events_1 = TierEvent.objects.filter(user=user, artist=artist).count()

    recompute_user(user, now=NOW)
    score_2 = ArtistScore.objects.get(user=user, artist=artist).score
    events_2 = TierEvent.objects.filter(user=user, artist=artist).count()

    assert score_1 == pytest.approx(score_2)
    assert events_1 == events_2


def test_recompute_handles_user_with_no_scores(user):
    """No ArtistScore rows = no work, no error."""
    recompute_user(user, now=NOW)  # should not raise
    assert not ArtistScore.objects.filter(user=user).exists()


def test_recompute_updates_updated_at(user, artist):
    _make_score(user, artist, seed_score=50.0, seed_age_days=10.0, tier=Tier.OFFICE)
    before = ArtistScore.objects.get(user=user, artist=artist).updated_at
    recompute_user(user, now=NOW)
    after = ArtistScore.objects.get(user=user, artist=artist).updated_at
    # auto_now triggers on save, so updated_at moves forward
    assert after >= before
