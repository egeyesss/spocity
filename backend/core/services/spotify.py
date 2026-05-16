"""Spotify Web API client.

Two implementations behind the same interface:

- `SpotifyClient`: the real client. Hits api.spotify.com, transparently
  refreshes the user's access token, respects rate limits (Retry-After +
  exponential backoff on 5xx), and surfaces errors as exceptions.

- `StubSpotifyClient`: returns canned fixtures from `core/tests/fixtures/`.
  Selected when `settings.SPOTIFY_USE_STUB` is true (set in tests). Lets the
  CI suite run without real Spotify credentials and without flaky network.

Use the `get_client(account)` factory rather than instantiating directly —
it keeps the swap point in one place.
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

from ..models import SpotifyAccount, SpotifyTokenRefreshError

logger = logging.getLogger(__name__)

API_BASE = "https://api.spotify.com/v1"
DEFAULT_TIMEOUT = 10
MAX_RETRIES = 3
MAX_BACKOFF_SECONDS = 30


class SpotifyAPIError(Exception):
    """Non-recoverable Spotify API failure (4xx other than 401/429, or
    too many retries on 5xx). Callers should treat as a hard failure."""

    def __init__(self, status: int, message: str):
        self.status = status
        super().__init__(f"Spotify API error {status}: {message}")


class BaseSpotifyClient:
    """Interface contract. Both real and stub clients implement this."""

    def get_top_artists(
        self, time_range: str = "medium_term", limit: int = 50
    ) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_recently_played(self, limit: int = 50) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_currently_playing(self) -> dict[str, Any] | None:
        raise NotImplementedError


class SpotifyClient(BaseSpotifyClient):
    """Real Spotify Web API client tied to a SpotifyAccount."""

    def __init__(self, account: SpotifyAccount, *, sleep=time.sleep):
        self.account = account
        # injectable for tests so retry logic can be exercised without
        # actually pausing the test runner
        self._sleep = sleep

    # ── public surface ────────────────────────────────────────────────────

    def get_top_artists(
        self, time_range: str = "medium_term", limit: int = 50
    ) -> list[dict[str, Any]]:
        if time_range not in {"short_term", "medium_term", "long_term"}:
            raise ValueError(f"invalid time_range: {time_range}")

        # Spotify caps `limit` at 50 per request. For limit > 50 we page with
        # `offset` (max 10000) and stop early once a short page or a null
        # `next` tells us there's no more data for this time range.
        items: list[dict[str, Any]] = []
        offset = 0
        while len(items) < limit:
            want = min(50, limit - len(items))
            data = self._get(
                "/me/top/artists",
                params={
                    "time_range": time_range,
                    "limit": want,
                    "offset": offset,
                },
            )
            batch = data.get("items", [])
            items.extend(batch)
            if len(batch) < want or not data.get("next"):
                break
            offset += len(batch)
        return items[:limit]

    def get_recently_played(self, limit: int = 50) -> list[dict[str, Any]]:
        data = self._get(
            "/me/player/recently-played", params={"limit": limit}
        )
        return data.get("items", [])

    def get_currently_playing(self) -> dict[str, Any] | None:
        # 204 No Content means nothing is currently playing; surface as None.
        return self._get("/me/player/currently-playing", allow_204=True)

    # ── internals ─────────────────────────────────────────────────────────

    def _get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        allow_204: bool = False,
    ) -> Any:
        url = f"{API_BASE}{path}"
        attempt = 0
        refreshed_once = False

        while True:
            attempt += 1
            token = self.account.get_valid_access_token()
            res = requests.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
                timeout=DEFAULT_TIMEOUT,
            )

            if res.status_code == 204 and allow_204:
                return None

            if res.ok:
                return res.json()

            # 401: token rejected mid-flight (race vs the 60s refresh buffer,
            # or Spotify revoked). Force one refresh and retry once.
            if res.status_code == 401 and not refreshed_once:
                refreshed_once = True
                self.account.expires_at = self.account.expires_at.replace(
                    year=2000
                )  # force the refresh path on next get_valid_access_token
                continue

            # 429: rate limited. Respect Retry-After but cap so a buggy
            # response can't hang a worker for hours.
            if res.status_code == 429:
                retry_after = self._parse_retry_after(res)
                if retry_after > MAX_BACKOFF_SECONDS:
                    raise SpotifyAPIError(
                        429,
                        f"Retry-After {retry_after}s exceeds cap {MAX_BACKOFF_SECONDS}s",
                    )
                logger.warning(
                    "Spotify 429 on %s, sleeping %ss", path, retry_after
                )
                self._sleep(retry_after)
                continue

            # 5xx: transient. Exponential backoff with jitter.
            if 500 <= res.status_code < 600 and attempt < MAX_RETRIES:
                delay = min(2 ** attempt + random.random(), MAX_BACKOFF_SECONDS)
                logger.warning(
                    "Spotify %s on %s, attempt %s/%s, sleeping %.1fs",
                    res.status_code,
                    path,
                    attempt,
                    MAX_RETRIES,
                    delay,
                )
                self._sleep(delay)
                continue

            raise SpotifyAPIError(res.status_code, res.text[:500])

    @staticmethod
    def _parse_retry_after(res: requests.Response) -> int:
        try:
            return int(res.headers.get("Retry-After", "1"))
        except (TypeError, ValueError):
            return 1


# ── Stub implementation for tests ─────────────────────────────────────────

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


class StubSpotifyClient(BaseSpotifyClient):
    """Returns canned fixture data. Used when SPOTIFY_USE_STUB is true.

    Fixtures live at `core/tests/fixtures/<name>.json` and mirror real
    Spotify response shapes — so tests exercise the same parsing code paths
    as production.
    """

    def __init__(self, account: SpotifyAccount):
        self.account = account

    def get_top_artists(
        self, time_range: str = "medium_term", limit: int = 50
    ) -> list[dict[str, Any]]:
        data = self._load(f"top_artists_{time_range}")
        return data.get("items", [])[:limit]

    def get_recently_played(self, limit: int = 50) -> list[dict[str, Any]]:
        data = self._load("recently_played")
        return data.get("items", [])[:limit]

    def get_currently_playing(self) -> dict[str, Any] | None:
        data = self._load("currently_playing")
        # Treat an empty object as "not playing" so fixtures can opt out.
        return data or None

    @staticmethod
    def _load(name: str) -> dict[str, Any]:
        path = FIXTURES_DIR / f"{name}.json"
        if not path.exists():
            return {}
        with path.open() as f:
            return json.load(f)


def get_client(account: SpotifyAccount) -> BaseSpotifyClient:
    """Factory: returns the stub client in tests, real client in prod.

    Single swap point. Production code should always go through this rather
    than instantiating SpotifyClient directly, so tests can flip the flag
    once and have it apply everywhere.
    """
    if getattr(settings, "SPOTIFY_USE_STUB", False):
        return StubSpotifyClient(account)
    return SpotifyClient(account)


__all__ = [
    "BaseSpotifyClient",
    "SpotifyClient",
    "StubSpotifyClient",
    "SpotifyAPIError",
    "SpotifyTokenRefreshError",
    "get_client",
]
