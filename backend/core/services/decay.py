"""Score composition — formerly decay, now a one-liner under Hybrid C.

The decay-based scoring approach (PLAY_HALF_LIFE = 90d, SEED_HALF_LIFE =
365d) was replaced after live data showed it over-punished historical
favorites. See [[decisions]] §6 for the full reasoning.

The fading-favorite signal moved out of score math entirely — Week 7
will read `ArtistScore.last_played_at` and weather buildings visually
without touching their tier.

The module is kept as the canonical composition point so any future
return to time-aware scoring has a single edit site.
"""

from __future__ import annotations


def compute_score(seed_score: float, play_count: int) -> float:
    """Return the artist's current score.

    Hybrid C: `score = seed_score + play_count`. Every observed play adds
    exactly 1.0. Negative inputs clamp to 0 so a bad caller can't poison
    the score.
    """
    return max(seed_score, 0.0) + max(play_count, 0)
