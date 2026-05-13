"""Initial score seeding + tier assignment.

The Week 3 decay-based recompute replaces most of this, so the formula here
is intentionally simple and tunable. What it has to do well right now:
- Differentiate "all-time top-1" from "top-50 medium_term only".
- Land most users in a reasonable spread across the 6 tiers so the city
  looks varied on first paint (rather than every building being a Shack).

Formula:
    score = sum over time_ranges of weight * (51 - position_1_indexed) / 51

Top-1 short_term: 100. Top-50 short_term: ~2. Top-1 across all three:
~190. See the README in /core/services/ if any of these constants change.
"""

from __future__ import annotations

from typing import Iterable

from ..models import Tier

# Spotify's three time horizons. Short = ~4 weeks, medium = ~6 months,
# long = several years. Recent listening gets the loudest vote.
TIME_RANGE_WEIGHTS: dict[str, float] = {
    "short_term": 100.0,
    "medium_term": 60.0,
    "long_term": 30.0,
}

# Ordered ascending. Score >= min_score and < next.min_score lands here.
# Tuned so a user with one top-1 short-term artist and middling longs lands
# in the Skyscraper range, not Landmark — Landmark should feel rare.
TIER_THRESHOLDS: list[tuple[float, str]] = [
    (0.0, Tier.SHACK),
    (10.0, Tier.HOUSE),
    (25.0, Tier.APARTMENT),
    (50.0, Tier.OFFICE),
    (90.0, Tier.SKYSCRAPER),
    (140.0, Tier.LANDMARK),
]

POSITIONS_PER_RANGE = 50


def compute_seed_score(positions: dict[str, int | None]) -> float:
    """Compute the initial score for an artist given their rank position in
    each of Spotify's three top-artist time ranges.

    `positions` maps "short_term" / "medium_term" / "long_term" → 0-indexed
    rank (0 = top-1) or None if the artist isn't in that list.
    """
    total = 0.0
    for time_range, weight in TIME_RANGE_WEIGHTS.items():
        pos = positions.get(time_range)
        if pos is None:
            continue
        # 1-indexed position so top-1 doesn't max out at i=0 making the
        # formula brittle to off-by-one swaps.
        rank_1 = pos + 1
        total += weight * (POSITIONS_PER_RANGE + 1 - rank_1) / (
            POSITIONS_PER_RANGE + 1
        )
    return total


def score_to_tier(score: float) -> str:
    """Map a score to its tier. Uses descending walk so the highest
    threshold the score clears wins.
    """
    tier = Tier.SHACK
    for min_score, candidate in TIER_THRESHOLDS:
        if score >= min_score:
            tier = candidate
        else:
            break
    return tier


def collect_positions(
    top_lists: dict[str, Iterable[dict]],
) -> dict[str, dict[str, int | None]]:
    """Pivot Spotify's three top-artist responses into a per-artist position
    dict.

    Input: {"short_term": [artist1, artist2, ...], ...}
    Output: {spotify_id: {"short_term": 0, "medium_term": None, ...}, ...}

    Used by the initial-ingest endpoint to score every distinct artist
    across the three lists in one pass.
    """
    positions: dict[str, dict[str, int | None]] = {}
    for time_range, artists in top_lists.items():
        for idx, artist in enumerate(artists):
            spotify_id = artist["id"]
            positions.setdefault(
                spotify_id,
                {tr: None for tr in TIME_RANGE_WEIGHTS},
            )
            positions[spotify_id][time_range] = idx
    return positions
