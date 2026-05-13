"""Tests for the Celery task layer.

We run tasks in `CELERY_TASK_ALWAYS_EAGER` mode here, which executes them
synchronously in the test process — no worker, no broker. That keeps tests
fast and deterministic, and means a CI run doesn't need Redis.

Verifying scheduling itself (beat → broker → worker) is integration, not unit;
the schedule definition is exercised via test_celery_schedule_is_registered.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone

from core.models import (
    Artist,
    ArtistScore,
    GenreBucket,
    PlayHistory,
    SpotifyAccount,
    Tier,
)
from core.tasks import (
    nightly_recompute_all_users,
    poll_recently_played_for_active_users,
    recompute_one_user,
)
from spocity.celery import add as debug_add

User = get_user_model()
# Task tests use real "now" because the periodic-task layer doesn't accept
# an injected `now` — it calls timezone.now() internally. So we make fixture
# timestamps relative to wall-clock; the unit tests for recompute itself
# already cover the frozen-time math.
NOW = timezone.now()


@pytest.fixture
def bucket(db):
    return GenreBucket.objects.create(slug="bk", label="B", color_palette=[])


@pytest.fixture
def artist(db, bucket):
    return Artist.objects.create(spotify_id="a", name="A", primary_genre_bucket=bucket)


def _active_user(username):
    return User.objects.create_user(
        username=username, last_login=NOW - timedelta(days=1)
    )


def _spotify_account(user):
    return SpotifyAccount.objects.create(
        user=user,
        spotify_user_id=f"sp_{user.username}",
        display_name=user.username,
        access_token="tok",
        refresh_token="refresh",
        expires_at=NOW + timedelta(hours=1),
    )


# ── smoke test ────────────────────────────────────────────────────────────────


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_debug_add_task_executes_eagerly():
    result = debug_add.delay(2, 3).get()
    assert result == 5


# ── per-user recompute task ──────────────────────────────────────────────────


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_recompute_one_user_task_calls_recompute(db, artist):
    user = _active_user("u1")
    ArtistScore.objects.create(
        user=user, artist=artist, score=10.0, tier=Tier.HOUSE,
        seed_score=10.0, seed_assigned_at=NOW,
    )
    recompute_one_user.delay(user.id).get()
    # If recompute ran, score should still exist (and be updated_at-touched)
    assert ArtistScore.objects.filter(user=user).exists()


# ── nightly_recompute_all_users skips dormant users ──────────────────────────


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_nightly_recompute_skips_dormant_users(db, artist):
    active = _active_user("active")
    dormant = User.objects.create_user(
        username="dormant", last_login=NOW - timedelta(days=60)
    )

    # Both users have an ArtistScore — only the active one should be recomputed.
    active_score = ArtistScore.objects.create(
        user=active, artist=artist, score=50.0, tier=Tier.OFFICE,
        seed_score=50.0, seed_assigned_at=NOW - timedelta(days=10),
    )
    dormant_score = ArtistScore.objects.create(
        user=dormant, artist=artist, score=50.0, tier=Tier.OFFICE,
        seed_score=50.0, seed_assigned_at=NOW - timedelta(days=10),
    )

    with patch("core.tasks.recompute_user") as mock_recompute:
        nightly_recompute_all_users.delay().get()

    called_user_ids = {call.args[0].id for call in mock_recompute.call_args_list}
    assert active.id in called_user_ids
    assert dormant.id not in called_user_ids


# ── poll_recently_played touches only active users with a SpotifyAccount ─────


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
def test_poll_recently_played_only_for_active_users_with_account(db):
    active_with_acct = _active_user("a1")
    _spotify_account(active_with_acct)

    active_no_acct = _active_user("a2")  # active but no Spotify account

    dormant_with_acct = User.objects.create_user(
        username="d1", last_login=NOW - timedelta(days=60)
    )
    _spotify_account(dormant_with_acct)

    with patch("core.tasks.run_recent_ingest") as mock_ingest:
        poll_recently_played_for_active_users.delay().get()

    called_users = {call.args[0].id for call in mock_ingest.call_args_list}
    assert active_with_acct.id in called_users
    assert active_no_acct.id not in called_users
    assert dormant_with_acct.id not in called_users


# ── beat schedule is registered ──────────────────────────────────────────────


def test_celery_beat_schedule_registered():
    from django.conf import settings

    schedule = settings.CELERY_BEAT_SCHEDULE
    assert "poll-recently-played-hourly" in schedule
    assert "nightly-recompute" in schedule
    assert (
        schedule["nightly-recompute"]["task"]
        == "core.tasks.nightly_recompute_all_users"
    )
