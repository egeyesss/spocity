"""Per-user score recompute under Hybrid C (see [[decisions]] §6).

Score is purely cumulative: `seed_score + count_of_PlayHistory_rows`. No
time math. The nightly recompute walks every ArtistScore for a user,
recounts plays from PlayHistory, recomputes the tier, emits TierEvents
on tier changes, and records `last_played_at` for the Week 7 weathering
visual.

Performance note: v1 is happy with O(scores) per user — we use one
GROUP BY query to get per-artist counts + MAX(played_at) in a single DB
round trip.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Count, Max

from ..models import ArtistScore, PlayHistory, TierEvent, User
from .decay import compute_score
from .scoring import score_to_tier

logger = logging.getLogger(__name__)


@dataclass
class RecomputeResult:
    scores_updated: int
    tier_events_created: int


def recompute_user(user: User) -> RecomputeResult:
    """Recompute every ArtistScore for a single user.

    For each (user, artist):
        1. Count PlayHistory rows + grab MAX(played_at).
        2. score = seed_score + count
        3. tier = score_to_tier(score)
        4. If tier changed, emit a TierEvent.
        5. Save score, tier, last_played_at.

    One GROUP BY query for play counts + max-played-at; one UPDATE per
    score. Whole loop in a transaction.
    """
    scores = list(
        ArtistScore.objects.filter(user=user).select_related("artist")
    )
    if not scores:
        return RecomputeResult(0, 0)

    artist_ids = [s.artist_id for s in scores]
    play_agg = (
        PlayHistory.objects.filter(user=user, artist_id__in=artist_ids)
        .values("artist_id")
        .annotate(n=Count("id"), last=Max("played_at"))
    )
    by_artist = {row["artist_id"]: row for row in play_agg}

    scores_updated = 0
    tier_events_created = 0

    with transaction.atomic():
        for score in scores:
            agg = by_artist.get(score.artist_id)
            play_count = agg["n"] if agg else 0
            last_played_at = agg["last"] if agg else None

            new_score = compute_score(
                seed_score=score.seed_score,
                play_count=play_count,
            )
            new_tier = score_to_tier(new_score)

            if new_tier != score.tier:
                TierEvent.objects.create(
                    user=user,
                    artist=score.artist,
                    prev_tier=score.tier,
                    new_tier=new_tier,
                )
                tier_events_created += 1

            score.score = new_score
            score.tier = new_tier
            score.last_played_at = last_played_at
            score.save(
                update_fields=[
                    "score", "tier", "last_played_at", "updated_at"
                ]
            )
            scores_updated += 1

    logger.info(
        "recompute_user user=%s scores_updated=%d tier_events=%d",
        user.pk, scores_updated, tier_events_created,
    )
    return RecomputeResult(
        scores_updated=scores_updated,
        tier_events_created=tier_events_created,
    )
