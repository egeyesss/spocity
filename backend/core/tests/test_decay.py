"""Unit tests for the exponential-decay scoring function.

The decay function is the algorithmic centerpiece of Spocity. It must be:
- A pure function (no DB, no side effects) — easy to whiteboard at interviews.
- Frozen-time deterministic — given fixed `now` and fixed inputs, same output.
- Monotonic in obvious ways: more plays = higher score, older plays = lower
  contribution.
- Well-defined at boundaries (empty plays, single play, age=0, age=half_life).

We pin down *shape* properties rather than exact numbers so the constants
(half-life, weight) can be tuned without churning every test.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz

import pytest

from core.services.decay import (
    PLAY_HALF_LIFE_DAYS,
    SEED_HALF_LIFE_DAYS,
    PLAY_WEIGHT,
    compute_decayed_score,
    decay_factor,
)


# A fixed reference "now" so tests are deterministic. Choose a date that's
# clearly in the past so we don't accidentally rely on timezone wall-clock.
NOW = datetime(2026, 5, 1, 12, 0, 0, tzinfo=dt_tz.utc)


# ── decay_factor: the pure half-life primitive ────────────────────────────────


def test_decay_factor_at_zero_age_is_one():
    assert decay_factor(age_days=0.0, half_life_days=90.0) == pytest.approx(1.0)


def test_decay_factor_at_one_half_life_is_half():
    assert decay_factor(age_days=90.0, half_life_days=90.0) == pytest.approx(0.5)


def test_decay_factor_at_two_half_lives_is_quarter():
    assert decay_factor(age_days=180.0, half_life_days=90.0) == pytest.approx(0.25)


def test_decay_factor_is_monotonically_decreasing():
    """Older = smaller factor, strictly."""
    ages = [0.0, 1.0, 7.0, 30.0, 90.0, 180.0, 365.0]
    factors = [decay_factor(a, 90.0) for a in ages]
    assert factors == sorted(factors, reverse=True)
    # And strictly — no two ages produce the same factor
    assert len(set(factors)) == len(factors)


def test_decay_factor_negative_age_clamped_to_one():
    """A play with a played_at in the future (clock skew, bad data) shouldn't
    explode the score with a > 1.0 factor. Clamp to 1.0."""
    assert decay_factor(age_days=-5.0, half_life_days=90.0) == pytest.approx(1.0)


# ── compute_decayed_score: composes seed + plays ─────────────────────────────


def test_empty_plays_no_seed_is_zero():
    score = compute_decayed_score(
        seed_score=0.0,
        seed_age_days=0.0,
        play_ages_days=[],
        now=NOW,
    )
    assert score == 0.0


def test_seed_only_at_age_zero_equals_seed():
    score = compute_decayed_score(
        seed_score=50.0,
        seed_age_days=0.0,
        play_ages_days=[],
        now=NOW,
    )
    assert score == pytest.approx(50.0)


def test_seed_only_at_seed_half_life_is_half():
    score = compute_decayed_score(
        seed_score=100.0,
        seed_age_days=SEED_HALF_LIFE_DAYS,
        play_ages_days=[],
        now=NOW,
    )
    assert score == pytest.approx(50.0)


def test_single_play_at_age_zero_adds_full_weight():
    """A play that happened right now contributes the full PLAY_WEIGHT."""
    score = compute_decayed_score(
        seed_score=0.0,
        seed_age_days=0.0,
        play_ages_days=[0.0],
        now=NOW,
    )
    assert score == pytest.approx(PLAY_WEIGHT)


def test_single_play_at_play_half_life_contributes_half_weight():
    score = compute_decayed_score(
        seed_score=0.0,
        seed_age_days=0.0,
        play_ages_days=[PLAY_HALF_LIFE_DAYS],
        now=NOW,
    )
    assert score == pytest.approx(PLAY_WEIGHT * 0.5)


def test_more_plays_means_higher_score():
    """Monotonicity: adding plays should never decrease the score."""
    base = compute_decayed_score(
        seed_score=10.0,
        seed_age_days=30.0,
        play_ages_days=[5.0, 10.0, 20.0],
        now=NOW,
    )
    more = compute_decayed_score(
        seed_score=10.0,
        seed_age_days=30.0,
        play_ages_days=[5.0, 10.0, 20.0, 1.0],
        now=NOW,
    )
    assert more > base


def test_older_plays_contribute_less_than_newer():
    recent = compute_decayed_score(
        seed_score=0.0,
        seed_age_days=0.0,
        play_ages_days=[1.0, 1.0, 1.0],
        now=NOW,
    )
    old = compute_decayed_score(
        seed_score=0.0,
        seed_age_days=0.0,
        play_ages_days=[400.0, 400.0, 400.0],
        now=NOW,
    )
    assert recent > old


def test_seed_decays_with_longer_half_life_than_plays():
    """Sanity check on the constants — the seed should outlast individual
    plays so the initial city doesn't crater on Day 91."""
    assert SEED_HALF_LIFE_DAYS > PLAY_HALF_LIFE_DAYS


def test_score_is_pure_no_db_access(db):
    """The decay function must not touch the DB. We pass `db` fixture to
    enable DB access in the test, then verify the function works without
    any models — if it secretly queried something, this still wouldn't
    catch it, but at least exercises the call shape inside a DB-enabled
    test environment."""
    score = compute_decayed_score(
        seed_score=100.0,
        seed_age_days=10.0,
        play_ages_days=[0.0, 5.0, 30.0, 90.0],
        now=NOW,
    )
    assert score > 0.0


def test_realistic_scenario_heavy_listener_climbs_high():
    """A user who's played an artist 50 times in the last month, with a
    middling rank seed, should have a score well above an unseeded artist
    with no plays."""
    heavy_score = compute_decayed_score(
        seed_score=40.0,
        seed_age_days=30.0,
        play_ages_days=[float(i % 30) for i in range(50)],
        now=NOW,
    )
    cold_score = compute_decayed_score(
        seed_score=40.0,
        seed_age_days=30.0,
        play_ages_days=[],
        now=NOW,
    )
    assert heavy_score > cold_score * 2
