"""Unit tests for the Hybrid C scoring model.

Contract:
- `aggregate_rank(positions)` — turn an artist's positions across the three
  Spotify time-range lists into a single rank index (lower = better).
- `seed_tier_floor(aggregate_rank)` — map aggregate rank to a tier-floor:
    rank 1-3 → Skyscraper floor (1500)
    rank 4-10 → Apartment floor (200)
    rank 11-50 → House floor (50)
    rank 51+ / None → Shack floor (0)
- `score_to_tier(score)` — observed-play units now (Landmark = 4000+).
- `collect_positions(...)` unchanged from Week 2 (pivot the three Spotify
  responses into a per-artist position dict).

The decay-based seed-score formula is GONE. Day-1 seed = tier floor of the
seeded tier, set once at initial ingest. Going forward, score = seed + plays.
"""

from __future__ import annotations

import pytest

from core.models import Tier
from core.services.scoring import (
    HOUSE_FLOOR,
    APARTMENT_FLOOR,
    SKYSCRAPER_FLOOR,
    TIER_THRESHOLDS,
    aggregate_weight,
    collect_positions,
    rank_by_weight,
    score_to_tier,
    seed_tier_floor,
)


def _pos(short=None, medium=None, long=None):
    return {"short_term": short, "medium_term": medium, "long_term": long}


# ── aggregate_weight (higher = better) ────────────────────────────────────────


def test_aggregate_weight_artist_in_no_list_is_zero():
    assert aggregate_weight(_pos()) == 0.0


def test_aggregate_weight_top_1_everywhere_beats_top_1_one_list():
    """Appearing in all three lists at high rank beats appearing in just one."""
    triple = aggregate_weight(_pos(short=0, medium=0, long=0))
    single = aggregate_weight(_pos(short=0))
    assert triple > single


def test_aggregate_weight_monotonic_within_single_list():
    """If only short_term is populated, weight strictly decreases with position."""
    weights = [aggregate_weight(_pos(short=i)) for i in range(50)]
    assert weights == sorted(weights, reverse=True)


def test_aggregate_weight_top_1_short_only_beats_top_50_short_only():
    assert aggregate_weight(_pos(short=0)) > aggregate_weight(_pos(short=49))


def test_rank_by_weight_assigns_1_indexed_ranks():
    """Three artists, distinct weights — ranks 1, 2, 3 by descending weight."""
    positions = {
        "triple_top": _pos(short=0, medium=0, long=0),  # weight 150
        "single_top": _pos(short=0),                     # weight 50
        "mid_short": _pos(short=24),                     # weight 26
    }
    ranks = rank_by_weight(positions)
    assert ranks == {"triple_top": 1, "single_top": 2, "mid_short": 3}


def test_rank_by_weight_excludes_unranked_artists():
    positions = {
        "in_list": _pos(short=0),
        "not_in_any": _pos(),
    }
    ranks = rank_by_weight(positions)
    assert ranks == {"in_list": 1}
    assert "not_in_any" not in ranks


# ── seed_tier_floor ──────────────────────────────────────────────────────────


def test_seed_tier_floor_none_means_shack():
    assert seed_tier_floor(None) == 0.0


def test_seed_tier_floor_rank_1_through_3_is_skyscraper():
    for rank in (1, 2, 3):
        assert seed_tier_floor(rank) == SKYSCRAPER_FLOOR == 1500.0


def test_seed_tier_floor_rank_4_through_10_is_apartment():
    for rank in (4, 5, 10):
        assert seed_tier_floor(rank) == APARTMENT_FLOOR == 200.0


def test_seed_tier_floor_rank_11_through_50_is_house():
    for rank in (11, 25, 50):
        assert seed_tier_floor(rank) == HOUSE_FLOOR == 50.0


def test_seed_tier_floor_rank_51_plus_is_shack():
    for rank in (51, 100, 1000):
        assert seed_tier_floor(rank) == 0.0


def test_floor_for_seeded_tier_matches_score_to_tier():
    """A seeded artist sitting exactly on their floor should map back to the
    same tier — the floor is the tier boundary, by design."""
    assert score_to_tier(SKYSCRAPER_FLOOR) == Tier.SKYSCRAPER
    assert score_to_tier(APARTMENT_FLOOR) == Tier.APARTMENT
    assert score_to_tier(HOUSE_FLOOR) == Tier.HOUSE
    assert score_to_tier(0.0) == Tier.SHACK


# ── score_to_tier (rescaled to play-count units) ─────────────────────────────


def test_score_to_tier_walks_thresholds():
    """Each threshold's lower bound lands in that tier."""
    for min_score, expected_tier in TIER_THRESHOLDS:
        assert score_to_tier(min_score) == expected_tier
    assert score_to_tier(-1.0) == Tier.SHACK


def test_score_to_tier_landmark_only_at_4000_plus():
    """Landmark must feel rare — calibrated for years of heavy listening."""
    assert score_to_tier(3999.0) != Tier.LANDMARK
    assert score_to_tier(4000.0) == Tier.LANDMARK
    assert score_to_tier(50_000.0) == Tier.LANDMARK


def test_score_to_tier_just_below_skyscraper_is_office():
    assert score_to_tier(1499.0) == Tier.OFFICE
    assert score_to_tier(1500.0) == Tier.SKYSCRAPER


def test_score_to_tier_no_decay_a_seeded_artist_with_plays_only_climbs():
    """The score-tier mapping should mean: more plays → equal or higher tier,
    never lower. Pure cumulative."""
    # Apartment-seeded artist plus 500 plays clears Office floor (600).
    assert score_to_tier(APARTMENT_FLOOR + 500) == Tier.OFFICE


# ── collect_positions: unchanged from Week 2 ─────────────────────────────────


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


# ── Day-1 city distribution (the demo): top 3 / 10 / 50 = sky / apt / house ──


def test_seeding_a_full_top_list_produces_expected_tier_distribution():
    """Simulate the initial ingest output: 50 artists ranked 1-50 should
    distribute 3 Skyscrapers, 7 Apartments, 40 Houses."""
    sky = apt = house = shack = 0
    for rank in range(1, 51):
        floor = seed_tier_floor(rank)
        tier = score_to_tier(floor)
        if tier == Tier.SKYSCRAPER:
            sky += 1
        elif tier == Tier.APARTMENT:
            apt += 1
        elif tier == Tier.HOUSE:
            house += 1
        else:
            shack += 1
    assert (sky, apt, house, shack) == (3, 7, 40, 0)
