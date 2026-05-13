"""Celery tasks.

Two periodic tasks make the city alive:

    poll_recently_played_for_active_users  (hourly)
        Walks active users with a SpotifyAccount, pulls /recently-played for
        each, dedupes via the PlayHistory unique constraint. Skips dormant
        users entirely (saves quota + worker time).

    nightly_recompute_all_users  (3am UTC)
        Walks active users and runs `recompute_user` for each — re-decays
        every ArtistScore, fires TierEvents on any tier change.

Plus a per-user manual task (`recompute_one_user`) that the staff-only
admin endpoint enqueues. Useful for debugging from the Django shell too.

All three swallow per-user exceptions and log them, so one bad user can't
take the whole task down.
"""

from __future__ import annotations

import logging

from celery import shared_task

from .models import SpotifyAccount, User
from .services.active import active_users
from .services.ingest import run_recent_ingest
from .services.recompute import recompute_user

logger = logging.getLogger(__name__)


@shared_task(name="core.tasks.recompute_one_user")
def recompute_one_user(user_id: int) -> dict:
    """Manual single-user recompute. Used by the admin endpoint."""
    user = User.objects.get(pk=user_id)
    result = recompute_user(user)
    return {
        "user_id": user_id,
        "scores_updated": result.scores_updated,
        "tier_events_created": result.tier_events_created,
    }


@shared_task(name="core.tasks.nightly_recompute_all_users")
def nightly_recompute_all_users() -> dict:
    """Walk all active users, recompute scores. One bad user is logged, not
    fatal — the loop keeps going."""
    users_processed = 0
    failed = 0
    for user in active_users():
        try:
            recompute_user(user)
            users_processed += 1
        except Exception:
            logger.exception("nightly_recompute failed for user_id=%s", user.pk)
            failed += 1
    logger.info(
        "nightly_recompute_all_users users_processed=%d failed=%d",
        users_processed,
        failed,
    )
    return {"users_processed": users_processed, "failed": failed}


@shared_task(name="core.tasks.poll_recently_played_for_active_users")
def poll_recently_played_for_active_users() -> dict:
    """Hourly: pull /recently-played for every active user with a Spotify
    account. The DB unique constraint on PlayHistory dedupes; we don't
    track a high-water mark."""
    users_polled = 0
    plays_inserted = 0
    failed = 0
    # Restrict to users with a SpotifyAccount — otherwise the ingest call
    # would explode on a missing related object.
    qs = active_users().filter(spotify_account__isnull=False).select_related(
        "spotify_account"
    )
    for user in qs:
        try:
            result = run_recent_ingest(user)
            plays_inserted += result.plays_inserted
            users_polled += 1
        except Exception:
            logger.exception(
                "poll_recently_played failed for user_id=%s", user.pk
            )
            failed += 1
    logger.info(
        "poll_recently_played users_polled=%d plays_inserted=%d failed=%d",
        users_polled,
        plays_inserted,
        failed,
    )
    return {
        "users_polled": users_polled,
        "plays_inserted": plays_inserted,
        "failed": failed,
    }
