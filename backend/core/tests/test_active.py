"""Tests for active-user detection.

A user is "active" if either:
  - they have authenticated (`last_login`) in the last 7 days, OR
  - they have a PlayHistory row in the last 24 hours.

Used by the hourly poll task to skip dormant users entirely (saves
Spotify rate-limit budget and Celery throughput).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz

import pytest
from django.contrib.auth import get_user_model

from core.models import Artist, GenreBucket, PlayHistory
from core.services.active import active_users, is_active

User = get_user_model()
NOW = datetime(2026, 5, 1, 12, 0, 0, tzinfo=dt_tz.utc)


@pytest.fixture
def bucket(db):
    return GenreBucket.objects.create(slug="other-t", label="O", color_palette=[])


@pytest.fixture
def artist(db, bucket):
    return Artist.objects.create(
        spotify_id="a1", name="A", primary_genre_bucket=bucket
    )


def test_user_with_recent_login_is_active(db):
    u = User.objects.create_user(username="u", last_login=NOW - timedelta(days=3))
    assert is_active(u, now=NOW) is True


def test_user_with_old_login_no_plays_is_inactive(db):
    u = User.objects.create_user(username="u", last_login=NOW - timedelta(days=30))
    assert is_active(u, now=NOW) is False


def test_user_with_no_login_no_plays_is_inactive(db):
    u = User.objects.create_user(username="u")
    assert is_active(u, now=NOW) is False


def test_user_with_old_login_but_recent_play_is_active(db, artist):
    u = User.objects.create_user(username="u", last_login=NOW - timedelta(days=30))
    PlayHistory.objects.create(
        user=u, artist=artist, track_id="t1",
        played_at=NOW - timedelta(hours=6),
    )
    assert is_active(u, now=NOW) is True


def test_user_with_old_play_is_inactive(db, artist):
    u = User.objects.create_user(username="u", last_login=NOW - timedelta(days=30))
    PlayHistory.objects.create(
        user=u, artist=artist, track_id="t1",
        played_at=NOW - timedelta(days=2),
    )
    assert is_active(u, now=NOW) is False


def test_login_exactly_at_7_day_boundary_is_active(db):
    """Boundary check — within last 7 days is inclusive of exactly-7."""
    u = User.objects.create_user(
        username="u",
        last_login=NOW - timedelta(days=7) + timedelta(seconds=1),
    )
    assert is_active(u, now=NOW) is True


def test_active_users_queryset_filters_correctly(db, artist):
    active = User.objects.create_user(
        username="active", last_login=NOW - timedelta(days=2)
    )
    dormant = User.objects.create_user(
        username="dormant", last_login=NOW - timedelta(days=20)
    )
    # dormant_but_played has an old login but a recent play
    dbp = User.objects.create_user(
        username="dbp", last_login=NOW - timedelta(days=20)
    )
    PlayHistory.objects.create(
        user=dbp, artist=artist, track_id="t1",
        played_at=NOW - timedelta(hours=3),
    )

    result = list(active_users(now=NOW).values_list("username", flat=True))
    assert "active" in result
    assert "dbp" in result
    assert "dormant" not in result
