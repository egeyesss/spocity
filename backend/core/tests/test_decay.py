"""Tests for the (now-trivial) decay module.

The Hybrid C scoring pivot (decisions §6) gutted the decay function. We
keep the module as the single composition point for "score = seed + plays"
because callers want one well-named entry point, but the implementation
is intentionally a one-liner now. The decay weathering visual moved to
Week 7 (`last_played_at` field + R3F shader, not score math).

If a future change reintroduces time-decay, this is where to put it.
"""

from __future__ import annotations

import pytest

from core.services.decay import compute_score


def test_score_with_no_plays_equals_seed():
    assert compute_score(seed_score=200.0, play_count=0) == pytest.approx(200.0)


def test_each_play_adds_exactly_one():
    assert compute_score(seed_score=0.0, play_count=1) == pytest.approx(1.0)
    assert compute_score(seed_score=0.0, play_count=100) == pytest.approx(100.0)


def test_seed_floor_plus_plays_composes_cleanly():
    """A House-floor (50) seed with 200 observed plays = 250 — climbs into
    Apartment tier."""
    assert compute_score(seed_score=50.0, play_count=200) == pytest.approx(250.0)


def test_negative_inputs_clamped():
    """Defensive: a bad caller passing nonsense shouldn't poison the score."""
    assert compute_score(seed_score=0.0, play_count=-5) == pytest.approx(0.0)
    assert compute_score(seed_score=-10.0, play_count=10) == pytest.approx(10.0)


def test_score_is_pure_no_db(db):
    """The function must not touch the DB — same property as the old decay
    function, kept as a guardrail."""
    assert compute_score(seed_score=1500.0, play_count=2500) == 4000.0
