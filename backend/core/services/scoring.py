"""Hybrid C scoring — see [[decisions]] §6 in the project vault.

Score is cumulative and observational:

    score = seed_score (the Day-1 tier-floor anchor) + observed_play_count

No time decay in the score path. The Week 7 weathering visual reads
`ArtistScore.last_played_at` separately to fade old favorites visually,
but their score stays put. Honors the user's musical history.

Day-1 seeding rule:
    Spotify aggregate rank 1-3  → Skyscraper floor (1500)
    Spotify aggregate rank 4-10 → Apartment floor (200)
    Spotify aggregate rank 11-50 → House floor (50)
    Anyone not in any of the three time-range lists → Shack (0)

Aggregate rank = sum of (51 - position_1_indexed) across the three Spotify
time-range lists where the artist appears. Lower rank index = better
(rank 1 is best). Artists in all three lists outrank artists in just one.

Tier thresholds calibrated against Last.fm public listening stats:
    Shack       0 – 50
    House       50 – 200       (~2 months light steady listening)
    Apartment   200 – 600      (~6 months steady)
    Office      600 – 1500     (~1 year regular)
    Skyscraper  1500 – 4000    (~2 years steady or 6mo obsession)
    Landmark    4000+          (years of heavy listening; rare)

Landmark is intentionally hard to reach.
"""

from __future__ import annotations

from typing import Iterable

from ..models import Tier


POSITIONS_PER_RANGE = 50

# ── Tier-floor anchors (seed scores) ─────────────────────────────────────────
# These are the *starting* scores for a Day-1 seeded artist. They match the
# tier-threshold floors below by design, so a seeded Top-3 artist with zero
# observed plays sits exactly at the Skyscraper boundary.

SHACK_FLOOR = 0.0
HOUSE_FLOOR = 50.0
APARTMENT_FLOOR = 200.0
OFFICE_FLOOR = 600.0
SKYSCRAPER_FLOOR = 1500.0
LANDMARK_FLOOR = 4000.0

# ── Tier thresholds ──────────────────────────────────────────────────────────
# Score >= threshold and < next.threshold lands the artist in that tier.
TIER_THRESHOLDS: list[tuple[float, str]] = [
    (SHACK_FLOOR, Tier.SHACK),
    (HOUSE_FLOOR, Tier.HOUSE),
    (APARTMENT_FLOOR, Tier.APARTMENT),
    (OFFICE_FLOOR, Tier.OFFICE),
    (SKYSCRAPER_FLOOR, Tier.SKYSCRAPER),
    (LANDMARK_FLOOR, Tier.LANDMARK),
]


def collect_positions(
    top_lists: dict[str, Iterable[dict]],
) -> dict[str, dict[str, int | None]]:
    """Pivot Spotify's three top-artist responses into a per-artist
    position dict.

    Input:  {"short_term": [artist, artist, ...], ...}
    Output: {spotify_id: {"short_term": 0, "medium_term": None, ...}, ...}
    """
    positions: dict[str, dict[str, int | None]] = {}
    time_ranges = ("short_term", "medium_term", "long_term")
    for time_range, artists in top_lists.items():
        for idx, artist in enumerate(artists):
            spotify_id = artist["id"]
            positions.setdefault(
                spotify_id,
                {tr: None for tr in time_ranges},
            )
            positions[spotify_id][time_range] = idx
    return positions


def aggregate_weight(positions: dict[str, int | None]) -> float:
    """Per-artist ranking weight. Higher = better aggregate rank.

    weight = Σ_over_lists ( POSITIONS_PER_RANGE + 1 - rank_1_indexed )
           where rank_1_indexed = position + 1

    An artist at rank #1 in all three lists scores 50+50+50 = 150 — the
    theoretical max. An artist at rank #1 in only one list scores 50.
    Returns 0.0 if the artist appears in no list (caller treats this as
    Shack-tier).

    Callers sort artists by descending weight and assign 1-indexed ranks,
    then map those ranks through `seed_tier_floor()`.
    """
    weight = 0.0
    for pos in positions.values():
        if pos is None:
            continue
        rank_1 = pos + 1
        weight += POSITIONS_PER_RANGE + 1 - rank_1
    return weight


def rank_by_weight(
    positions_by_id: dict[str, dict[str, int | None]],
) -> dict[str, int]:
    """Given the pivoted positions for every artist, return a mapping
    `{spotify_id: rank}` with rank 1-indexed in descending weight order.

    Artists with `aggregate_weight() == 0` (in no list) are excluded.
    Ties in weight are broken by spotify_id (stable, arbitrary) so the
    output is deterministic.
    """
    weights = [
        (spotify_id, aggregate_weight(positions))
        for spotify_id, positions in positions_by_id.items()
        if aggregate_weight(positions) > 0
    ]
    weights.sort(key=lambda pair: (-pair[1], pair[0]))
    return {spotify_id: rank for rank, (spotify_id, _) in enumerate(weights, 1)}


def seed_tier_floor(rank: int | None) -> float:
    """Day-1 seed score for an artist at the given aggregate rank.

    rank 1-3   → Skyscraper floor
    rank 4-10  → Apartment floor
    rank 11-50 → House floor
    rank 51+   → Shack (0)
    rank None  → Shack (0)
    """
    if rank is None or rank > 50:
        return SHACK_FLOOR
    if rank <= 3:
        return SKYSCRAPER_FLOOR
    if rank <= 10:
        return APARTMENT_FLOOR
    return HOUSE_FLOOR


def score_to_tier(score: float) -> str:
    """Map a score to its tier. Highest threshold the score clears wins."""
    tier = Tier.SHACK
    for min_score, candidate in TIER_THRESHOLDS:
        if score >= min_score:
            tier = candidate
        else:
            break
    return tier
