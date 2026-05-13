"""Last.fm artist-tag client.

Spotify removed the `genres` field from its public artist objects in late
2024, which breaks Spocity's genre-district feature outright. Last.fm
exposes user-submitted tags for any artist via `artist.getTopTags` and
those tags feed the same `classify()` taxonomy — so the rollup story
survives intact, just sourced elsewhere.

Tag quality from Last.fm is often *better* than what Spotify used to
return: user-generated tags tend to be specific ("shoegaze", "neo-soul",
"lo-fi r&b") rather than label-curated marketing genres.

Same stub/real split as `spotify.py` — `get_client()` returns the real
client in prod, a fixture-backed stub in tests.
"""

from __future__ import annotations

import json
import logging
import random
import time
from pathlib import Path
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = "https://ws.audioscrobbler.com/2.0/"
DEFAULT_TIMEOUT = 10
MAX_RETRIES = 3
MAX_BACKOFF_SECONDS = 30
# Tag-weight floor: Last.fm tags carry a 0-100 "count" representing how
# many users applied them. We drop everything below this so noise tags
# ("seen live", "favorite", "male vocalist") don't pollute the classifier.
MIN_TAG_WEIGHT = 10


class LastfmAPIError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(f"Last.fm API error {status}: {message}")


class BaseLastfmClient:
    def get_artist_tags(self, mbid_or_name: str, by: str = "name") -> list[str]:
        raise NotImplementedError


class LastfmClient(BaseLastfmClient):
    """Real Last.fm client. Anonymous reads — only needs the API key.

    Last.fm has generous rate limits (5 requests/sec sustained) but still
    benefits from polite backoff on 5xx. They don't send Retry-After, so
    on 429 we fall back to the exponential-backoff path.
    """

    def __init__(self, *, sleep=time.sleep):
        self._sleep = sleep
        self.api_key = settings.LASTFM_API_KEY

    def get_artist_tags(self, mbid_or_name: str, by: str = "name") -> list[str]:
        """Fetch user-submitted tags for one artist.

        `by` is either "name" or "mbid" (MusicBrainz ID). We always use
        "name" — Spotify doesn't expose MBIDs and Last.fm's name lookup
        is forgiving (case-insensitive, handles common variants).
        """
        if not self.api_key:
            logger.warning("LASTFM_API_KEY is unset; returning no tags")
            return []

        params: dict[str, Any] = {
            "method": "artist.getTopTags",
            "api_key": self.api_key,
            "format": "json",
            "autocorrect": "1",
        }
        params["artist" if by == "name" else "mbid"] = mbid_or_name

        data = self._get(params)
        tags_block = data.get("toptags", {}).get("tag", [])
        # Last.fm returns weighted tags; drop low-weight noise.
        return [
            t["name"]
            for t in tags_block
            if int(t.get("count", 0)) >= MIN_TAG_WEIGHT
        ]

    def _get(self, params: dict[str, Any]) -> dict[str, Any]:
        attempt = 0
        while True:
            attempt += 1
            res = requests.get(API_BASE, params=params, timeout=DEFAULT_TIMEOUT)

            if res.ok:
                data = res.json()
                # Last.fm signals API-level errors with a JSON body that
                # has an "error" key even when the HTTP status is 200.
                if isinstance(data, dict) and "error" in data:
                    raise LastfmAPIError(
                        data["error"], data.get("message", "")
                    )
                return data

            if (429 == res.status_code or 500 <= res.status_code < 600) and (
                attempt < MAX_RETRIES
            ):
                delay = min(2 ** attempt + random.random(), MAX_BACKOFF_SECONDS)
                logger.warning(
                    "Last.fm %s, attempt %s/%s, sleeping %.1fs",
                    res.status_code,
                    attempt,
                    MAX_RETRIES,
                    delay,
                )
                self._sleep(delay)
                continue

            raise LastfmAPIError(res.status_code, res.text[:500])


# ── Stub implementation for tests ─────────────────────────────────────────

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


class StubLastfmClient(BaseLastfmClient):
    """Reads `core/tests/fixtures/lastfm_tags.json`: a flat
    {artist_name: [tag, tag, ...]} mapping. Returns [] for unknown names."""

    def __init__(self):
        path = FIXTURES_DIR / "lastfm_tags.json"
        if path.exists():
            with path.open() as f:
                self._tags = json.load(f)
        else:
            self._tags = {}

    def get_artist_tags(self, mbid_or_name: str, by: str = "name") -> list[str]:
        return self._tags.get(mbid_or_name, [])


def get_client() -> BaseLastfmClient:
    if getattr(settings, "LASTFM_USE_STUB", False):
        return StubLastfmClient()
    return LastfmClient()


__all__ = [
    "BaseLastfmClient",
    "LastfmClient",
    "StubLastfmClient",
    "LastfmAPIError",
    "get_client",
]
