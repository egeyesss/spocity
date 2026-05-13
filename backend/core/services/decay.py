"""Exponential-decay scoring — the algorithmic heart of Spocity.

A pure function. No DB, no Django, no time-of-day awareness. Given the
artist's seed score (with its age) and a list of play ages, returns the
current decayed score.

    score = seed_score * 2^(-seed_age / SEED_HALF_LIFE)
          + sum_over_plays( PLAY_WEIGHT * 2^(-age / PLAY_HALF_LIFE) )

Why two half-lives:
    - PLAY_HALF_LIFE (90d) — recent listening dominates the city. An artist
      you binge for a month and then forget should slowly fade out.
    - SEED_HALF_LIFE (365d) — the initial rank seed from /top-artists holds
      the city up on Day 1 (when there are no plays yet) and gradually
      yields to real plays over the first year.

These constants live here because the decay function is the only consumer.
If you tune them, update the docstring AND the test_decay.py reference
values. The tier thresholds (tier_threshold table) live in scoring.py so
both the seed and the decayed paths agree on tier boundaries.
"""

from __future__ import annotations

from datetime import datetime
from typing import Iterable


# Half-life for an individual play. After 90 days, one play contributes
# half a "weight". After 180 days, a quarter. Tuned so a month of heavy
# listening lifts you a tier and stale plays don't anchor you forever.
PLAY_HALF_LIFE_DAYS: float = 90.0

# Half-life for the rank seed. Longer than play half-life so the city
# doesn't crater for users who don't actively play music after signup —
# but short enough that after a year, real listening dominates.
SEED_HALF_LIFE_DAYS: float = 365.0

# Per-play contribution before decay. Room to weight by track duration
# in v2, but v1 treats every play equally.
PLAY_WEIGHT: float = 1.0


def decay_factor(age_days: float, half_life_days: float) -> float:
    """Return 2^(-age / half_life), clamped to [0, 1].

    Pure. Negative ages (clock skew, bad input) clamp to 1.0 rather than
    producing a > 1.0 multiplier that could over-inflate a score.
    """
    if age_days <= 0.0:
        return 1.0
    return 2.0 ** (-age_days / half_life_days)


def compute_decayed_score(
    seed_score: float,
    seed_age_days: float,
    play_ages_days: Iterable[float],
    now: datetime | None = None,  # noqa: ARG001 — accepted for caller symmetry
) -> float:
    """Combine the decayed seed with decayed play contributions.

    `seed_score` is the initial rank-seed (from `compute_seed_score`),
    `seed_age_days` is days since that seed was assigned.
    `play_ages_days` is an iterable of per-play ages in days. The caller
    is responsible for converting `played_at` → age relative to `now`.

    `now` is unused by the pure function (the caller computes ages) but
    accepted in the signature so callers can pass their frozen time for
    documentation. This keeps the function purely arithmetic and trivial
    to whiteboard.
    """
    seed_contribution = seed_score * decay_factor(
        seed_age_days, SEED_HALF_LIFE_DAYS
    )
    plays_contribution = sum(
        PLAY_WEIGHT * decay_factor(age, PLAY_HALF_LIFE_DAYS)
        for age in play_ages_days
    )
    return seed_contribution + plays_contribution
