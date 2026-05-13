"""Active-user detection.

The hourly poll task hits Spotify's /recently-played for every active user.
We don't want to wake every user up every hour — dormant users (no recent
login, no recent plays) get skipped entirely. This keeps our Spotify quota
healthy and Celery throughput predictable.

Definition (per the implementation plan):
    active = authenticated in the last 7 days OR played anything in last 24h.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone

from ..models import PlayHistory, User


LOGIN_WINDOW = timedelta(days=7)
PLAY_WINDOW = timedelta(hours=24)


def is_active(user: User, now: datetime | None = None) -> bool:
    """Cheap single-user check. Used in admin/debug paths; the periodic
    task uses `active_users()` for set-level work."""
    now = now or timezone.now()
    if user.last_login and user.last_login >= now - LOGIN_WINDOW:
        return True
    return PlayHistory.objects.filter(
        user=user, played_at__gte=now - PLAY_WINDOW
    ).exists()


def active_users(now: datetime | None = None) -> QuerySet[User]:
    """Return a QuerySet of users meeting the active definition.

    Uses an EXISTS subquery for the play-history side so we don't pull
    PlayHistory rows into Python just to count them.
    """
    now = now or timezone.now()
    recent_play = PlayHistory.objects.filter(
        user_id=OuterRef("pk"), played_at__gte=now - PLAY_WINDOW
    )
    return (
        User.objects.annotate(_recent_play_exists=Exists(recent_play))
        .filter(
            Q(last_login__gte=now - LOGIN_WINDOW)
            | Q(_recent_play_exists=True)
        )
    )
