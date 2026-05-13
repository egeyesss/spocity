"""Tests for the Last.fm client (real + stub).

We mock `requests.get` at the module boundary, same pattern as
test_spotify_client. The stub is exercised through the ingest tests; here
we cover the real client's retry/error paths plus the tag-weight filter.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings

from core.services.lastfm import (
    LastfmAPIError,
    LastfmClient,
    StubLastfmClient,
)


def _response(status, *, json_body=None, headers=None, text=""):
    res = MagicMock()
    res.status_code = status
    res.ok = 200 <= status < 300
    res.headers = headers or {}
    res.text = text
    res.json.return_value = json_body or {}
    return res


@override_settings(LASTFM_API_KEY="fake-key")
def test_returns_tags_above_weight_threshold():
    client = LastfmClient(sleep=lambda s: None)
    body = {
        "toptags": {
            "tag": [
                {"name": "hip hop", "count": 100},
                {"name": "rap", "count": 80},
                {"name": "seen live", "count": 5},  # noise — dropped
                {"name": "favorite", "count": 1},  # noise — dropped
            ]
        }
    }
    with patch(
        "core.services.lastfm.requests.get", return_value=_response(200, json_body=body)
    ):
        tags = client.get_artist_tags("Drake")
    assert tags == ["hip hop", "rap"]


@override_settings(LASTFM_API_KEY="fake-key")
def test_api_level_error_in_200_body_raises():
    """Last.fm returns 200 with an 'error' key in the JSON for things like
    unknown artist or bad API key. Our client treats that as an error."""
    client = LastfmClient(sleep=lambda s: None)
    body = {"error": 6, "message": "The artist you supplied could not be found"}
    with patch(
        "core.services.lastfm.requests.get", return_value=_response(200, json_body=body)
    ):
        with pytest.raises(LastfmAPIError) as exc:
            client.get_artist_tags("Nonexistent Artist")
    assert exc.value.status == 6


@override_settings(LASTFM_API_KEY="fake-key")
def test_5xx_retries_then_succeeds():
    sleeps: list[float] = []
    client = LastfmClient(sleep=lambda s: sleeps.append(s))
    fail = _response(503)
    success = _response(200, json_body={"toptags": {"tag": []}})

    with patch(
        "core.services.lastfm.requests.get", side_effect=[fail, success]
    ):
        tags = client.get_artist_tags("Drake")

    assert tags == []
    assert len(sleeps) == 1


@override_settings(LASTFM_API_KEY="")
def test_missing_api_key_returns_empty_list_without_calling_api():
    """When LASTFM_API_KEY isn't configured, fall back gracefully rather
    than blowing up the entire ingest. The artist just lands in 'other'."""
    client = LastfmClient(sleep=lambda s: None)
    with patch("core.services.lastfm.requests.get") as mock_get:
        tags = client.get_artist_tags("Drake")
    assert tags == []
    mock_get.assert_not_called()


def test_stub_returns_fixture_tags():
    client = StubLastfmClient()
    assert "hip hop" in client.get_artist_tags("Drake")
    assert client.get_artist_tags("Nonexistent Artist") == []
