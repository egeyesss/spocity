"""Unit tests for SpotifyClient rate-limit + retry logic.

We mock `requests.get` rather than running a fake server — the contract
SpotifyClient cares about is "what does the requests library hand me back",
and mocking at that boundary keeps tests fast (no sockets) and focused.

`sleep` is injected so retry paths can be exercised without actually
pausing the test runner.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from core.models import SpotifyAccount, User
from core.services.spotify import (
    MAX_BACKOFF_SECONDS,
    SpotifyAPIError,
    SpotifyClient,
)


@pytest.fixture
def account(db):
    user = User.objects.create_user(username="testuser")
    return SpotifyAccount.objects.create(
        user=user,
        spotify_user_id="spotify_test_user",
        display_name="Test",
        access_token="valid-token",
        refresh_token="refresh-token",
        # Expire far in the future so get_valid_access_token short-circuits.
        expires_at=timezone.now() + timedelta(hours=2),
    )


def _make_response(status, *, json_body=None, headers=None, text=""):
    res = MagicMock()
    res.status_code = status
    res.ok = 200 <= status < 300
    res.headers = headers or {}
    res.text = text
    res.json.return_value = json_body or {}
    return res


def test_happy_path_returns_items(account):
    sleeps: list[float] = []
    client = SpotifyClient(account, sleep=lambda s: sleeps.append(s))
    success = _make_response(200, json_body={"items": [{"id": "a"}]})

    with patch("core.services.spotify.requests.get", return_value=success):
        result = client.get_top_artists(time_range="short_term")

    assert result == [{"id": "a"}]
    assert sleeps == []  # no retries on a clean 200


def test_429_respects_retry_after_then_succeeds(account):
    sleeps: list[float] = []
    client = SpotifyClient(account, sleep=lambda s: sleeps.append(s))

    rate_limited = _make_response(429, headers={"Retry-After": "3"})
    success = _make_response(200, json_body={"items": []})

    with patch(
        "core.services.spotify.requests.get",
        side_effect=[rate_limited, success],
    ):
        client.get_top_artists()

    assert sleeps == [3]


def test_429_with_retry_after_above_cap_raises(account):
    client = SpotifyClient(account, sleep=lambda s: None)
    huge = _make_response(
        429, headers={"Retry-After": str(MAX_BACKOFF_SECONDS + 1)}
    )

    with patch("core.services.spotify.requests.get", return_value=huge):
        with pytest.raises(SpotifyAPIError) as exc:
            client.get_top_artists()
    assert exc.value.status == 429


def test_5xx_retries_with_exponential_backoff_then_gives_up(account):
    sleeps: list[float] = []
    client = SpotifyClient(account, sleep=lambda s: sleeps.append(s))
    fail = _make_response(503)

    with patch("core.services.spotify.requests.get", return_value=fail):
        with pytest.raises(SpotifyAPIError):
            client.get_top_artists()

    # MAX_RETRIES = 3 → two sleeps before giving up on the third attempt.
    # Each sleep should be bounded by MAX_BACKOFF_SECONDS.
    assert len(sleeps) == 2
    for delay in sleeps:
        assert delay <= MAX_BACKOFF_SECONDS


def test_5xx_recovers_if_a_later_attempt_succeeds(account):
    sleeps: list[float] = []
    client = SpotifyClient(account, sleep=lambda s: sleeps.append(s))
    fail = _make_response(502)
    success = _make_response(200, json_body={"items": [{"id": "x"}]})

    with patch(
        "core.services.spotify.requests.get", side_effect=[fail, success]
    ):
        assert client.get_top_artists() == [{"id": "x"}]


def test_204_on_currently_playing_returns_none(account):
    client = SpotifyClient(account, sleep=lambda s: None)
    res = _make_response(204)

    with patch("core.services.spotify.requests.get", return_value=res):
        assert client.get_currently_playing() is None


def test_401_forces_token_refresh_then_retries(account):
    """A 401 mid-flight should trigger one refresh + one retry."""
    sleeps: list[float] = []
    client = SpotifyClient(account, sleep=lambda s: sleeps.append(s))

    unauthorized = _make_response(401)
    success = _make_response(200, json_body={"items": []})

    refresh_called = []

    def fake_refresh():
        refresh_called.append(True)
        account.access_token = "new-token"
        return "new-token"

    with patch.object(account, "get_valid_access_token", side_effect=fake_refresh):
        with patch(
            "core.services.spotify.requests.get",
            side_effect=[unauthorized, success],
        ):
            client.get_top_artists()

    # First call for the original request, second for the retry → 2 refreshes
    # invoked (the second after expiry was force-expired). Both succeed.
    assert len(refresh_called) == 2


def test_4xx_other_than_401_or_429_raises_immediately(account):
    client = SpotifyClient(account, sleep=lambda s: None)
    forbidden = _make_response(403, text="forbidden")

    with patch("core.services.spotify.requests.get", return_value=forbidden):
        with pytest.raises(SpotifyAPIError) as exc:
            client.get_top_artists()
    assert exc.value.status == 403


def test_invalid_time_range_raises_before_request(account):
    client = SpotifyClient(account, sleep=lambda s: None)
    with pytest.raises(ValueError):
        client.get_top_artists(time_range="bogus")
