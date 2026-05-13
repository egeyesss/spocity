"""Per-user score recompute — the nightly heart of the scoring engine.

Pulls every ArtistScore row for a user, joins it with all their plays for
that artist, runs the decay function, writes back the new score+tier, and
emits a TierEvent row whenever the tier moves.

This is intentionally a plain Python function. The Celery task layer wraps
it; tests call it directly with an injected `now` so the math is
deterministic.

Performance note: v1 is happy with O(scores + plays) per user. Once we have
millions of plays per user this would want a windowed query (drop plays
older than a few half-lives — they contribute < 0.01 to the score). Not now.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from django.db import transaction
from django.utils import timezone

from ..models import ArtistScore, PlayHistory, TierEvent, User
from .decay import compute_decayed_score
from .scoring import score_to_tier

logger = logging.getLogger(__name__)


@dataclass
class RecomputeResult:
    scores_updated: int
    tier_events_created: int


def _age_days(then: datetime, now: datetime) -> float:
    """Days between `then` and `now`. Negative deltas are passed through —
    the decay function clamps them."""
    return (now - then).total_seconds() / 86400.0


def recompute_user(user: User, now: datetime | None = None) -> RecomputeResult:
    """Recompute every ArtistScore for a single user.

    For each (user, artist) score:
        1. Compute decayed score from seed + all plays.
        2. Map to a tier.
        3. If tier changed, emit a TierEvent.
        4. Save the new score/tier.

    Uses one query for scores, one for plays (bucketed in Python by
    artist_id), and one UPDATE per changed score. Wrapped in a
    transaction so a mid-loop failure rolls back cleanly.
    """
    now = now or timezone.now()

    scores: Iterable[ArtistScore] = ArtistScore.objects.filter(
        user=user
    ).select_related("artist")
    scores_list = list(scores)
    if not scores_list:
        return RecomputeResult(0, 0)

    artist_ids = [s.artist_id for s in scores_list]
    plays_by_artist: dict[int, list[datetime]] = {aid: [] for aid in artist_ids}
    for play in PlayHistory.objects.filter(
        user=user, artist_id__in=artist_ids
    ).only("artist_id", "played_at"):
        plays_by_artist[play.artist_id].append(play.played_at)

    scores_updated = 0
    tier_events_created = 0

    with transaction.atomic():
        for score in scores_list:
            seed_age = (
                _age_days(score.seed_assigned_at, now)
                if score.seed_assigned_at
                else 0.0
            )
            play_ages = [
                _age_days(played_at, now)
                for played_at in plays_by_artist[score.artist_id]
            ]

            new_score = compute_decayed_score(
                seed_score=score.seed_score,
                seed_age_days=seed_age,
                play_ages_days=play_ages,
                now=now,
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
            score.save(update_fields=["score", "tier", "updated_at"])
            scores_updated += 1

    logger.info(
        "recompute_user user=%s scores_updated=%d tier_events=%d",
        user.pk,
        scores_updated,
        tier_events_created,
    )
    return RecomputeResult(
        scores_updated=scores_updated,
        tier_events_created=tier_events_created,
    )
