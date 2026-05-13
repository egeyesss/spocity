"""Unit tests for the seed-score formula and tier assignment.

The formula is intentionally tunable, so tests pin down *shape* properties
(monotonicity, ordering of fixed reference points) rather than exact
numerical values that'd churn whenever weights change.
"""

from __future__ import annotations

import pytest

from core.models import Tier
from core.services.scoring import (
    TIER_THRESHOLDS,
    collect_positions,
    compute_seed_score,
    score_to_tier,
)


def _pos(short=None, medium=None, long=None):
    return {"short_term": short, "medium_term": medium, "long_term": long}


def test_score_is_zero_when_artist_in_no_list():
    assert compute_seed_score(_pos()) == 0.0


def test_top_1_in_all_three_lists_outscores_top_50():
    top1 = compute_seed_score(_pos(short=0, medium=0, long=0))
    top50 = compute_seed_score(_pos(short=49, medium=49, long=49))
    assert top1 > top50


def test_short_term_outweighs_long_term():
    """Recent listening should beat all-time on the seed — this is the
    decision that lets a freshly-obsessed artist land in a tall building."""
    short_only = compute_seed_score(_pos(short=0))
    long_only = compute_seed_score(_pos(long=0))
    assert short_only > long_only


def test_score_is_monotonic_in_rank():
    """Higher rank (lower index) must produce higher score within a list."""
    scores = [compute_seed_score(_pos(short=i)) for i in range(50)]
    assert scores == sorted(scores, reverse=True)


def test_score_to_tier_walks_thresholds():
    # Each threshold's lower bound should land in that tier
    for min_score, expected_tier in TIER_THRESHOLDS:
        assert score_to_tier(min_score) == expected_tier
    # Below the bottom (shouldn't happen with our formula but defensive)
    assert score_to_tier(-1.0) == Tier.SHACK


def test_score_to_tier_landmark_for_huge_scores():
    assert score_to_tier(10_000.0) == Tier.LANDMARK


def test_top_1_short_only_lands_in_skyscraper_or_higher():
    """A frequently-cited reference point: someone's single most-listened
    artist this month should never be a Shack."""
    score = compute_seed_score(_pos(short=0))
    tier = score_to_tier(score)
    assert tier in {Tier.SKYSCRAPER, Tier.LANDMARK}


def test_top_1_everywhere_is_landmark():
    score = compute_seed_score(_pos(short=0, medium=0, long=0))
    assert score_to_tier(score) == Tier.LANDMARK


def test_collect_positions_pivots_three_lists():
    top_lists = {
        "short_term": [{"id": "a"}, {"id": "b"}],
        "medium_term": [{"id": "b"}, {"id": "c"}],
        "long_term": [{"id": "c"}],
    }
    positions = collect_positions(top_lists)
    assert positions["a"] == {
        "short_term": 0,
        "medium_term": None,
        "long_term": None,
    }
    assert positions["b"] == {
        "short_term": 1,
        "medium_term": 0,
        "long_term": None,
    }
    assert positions["c"] == {
        "short_term": None,
        "medium_term": 1,
        "long_term": 0,
    }
