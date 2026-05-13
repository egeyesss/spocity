"""Tests for GET /api/me/city/ — the single data endpoint the frontend
uses to render a user's city.

Returns:
    {
      "artists": [
        {spotify_id, name, image_url, tier, score, seed_score,
         primary_genre_bucket, last_played_at}
      ],
      "buckets": [{slug, label, color_palette, sort_order}, ...]
    }

Scoped to `request.user`. Anonymous → 401.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_tz

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from core.models import Artist, ArtistScore, GenreBucket, Tier

User = get_user_model()


@pytest.fixture
def buckets(db):
    """The migration seeds the real bucket list; tests use distinct slugs
    to avoid the unique-constraint collision."""
    return {
        "pop": GenreBucket.objects.create(
            slug="t-pop", label="Pop", color_palette=["#ff0", "#fa0"], sort_order=1
        ),
        "hip": GenreBucket.objects.create(
            slug="t-hip-hop", label="Hip-Hop", color_palette=["#0ff"], sort_order=2
        ),
    }


@pytest.fixture
def user(db):
    return User.objects.create_user(username="u", password="p")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="other", password="p")


def _score(user, artist, tier, score, last_played=None, seed=0.0):
    return ArtistScore.objects.create(
        user=user, artist=artist,
        score=score, seed_score=seed, tier=tier,
        last_played_at=last_played,
    )


def test_anonymous_blocked(client):
    res = client.get("/api/me/city/")
    assert res.status_code in (401, 403)


def test_returns_empty_lists_for_user_with_no_data(client, user):
    client.force_login(user)
    res = client.get("/api/me/city/")
    assert res.status_code == 200
    body = res.json()
    assert body["artists"] == []
    # Buckets are always returned so the frontend has palettes even before
    # the user has been ingested.
    assert isinstance(body["buckets"], list)


def test_returns_artists_for_authed_user(client, user, buckets):
    drake = Artist.objects.create(
        spotify_id="drake", name="Drake",
        image_url="https://img/drake.jpg",
        primary_genre_bucket=buckets["hip"],
    )
    last_played = datetime(2026, 5, 1, 12, 0, tzinfo=dt_tz.utc)
    _score(user, drake, Tier.SKYSCRAPER, 1500.0, last_played=last_played, seed=1500.0)

    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    assert len(body["artists"]) == 1
    artist = body["artists"][0]
    assert artist["spotify_id"] == "drake"
    assert artist["name"] == "Drake"
    assert artist["tier"] == Tier.SKYSCRAPER
    assert artist["score"] == 1500.0
    assert artist["seed_score"] == 1500.0
    assert artist["primary_genre_bucket"] == "t-hip-hop"
    assert artist["image_url"] == "https://img/drake.jpg"
    assert artist["last_played_at"].startswith("2026-05-01")


def test_does_not_leak_other_users_data(client, user, other_user, buckets):
    """Critical privacy property — one user's scores must not appear in
    another user's city payload."""
    artist = Artist.objects.create(
        spotify_id="a1", name="Shared Artist",
        primary_genre_bucket=buckets["pop"],
    )
    _score(user, artist, Tier.HOUSE, 50.0)
    _score(other_user, artist, Tier.LANDMARK, 9999.0)

    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    assert len(body["artists"]) == 1
    assert body["artists"][0]["score"] == 50.0  # not 9999


def test_artists_sorted_by_score_desc(client, user, buckets):
    """Stable ordering for deterministic frontend layout (Week 5 packs
    buildings tightest at district centers based on this order)."""
    a = Artist.objects.create(spotify_id="a", name="A", primary_genre_bucket=buckets["pop"])
    b = Artist.objects.create(spotify_id="b", name="B", primary_genre_bucket=buckets["pop"])
    c = Artist.objects.create(spotify_id="c", name="C", primary_genre_bucket=buckets["pop"])
    _score(user, a, Tier.HOUSE, 100.0)
    _score(user, b, Tier.SKYSCRAPER, 2000.0)
    _score(user, c, Tier.APARTMENT, 400.0)

    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    names = [a["name"] for a in body["artists"]]
    assert names == ["B", "C", "A"]


def test_buckets_payload_includes_all_districts(client, user, buckets):
    """Frontend needs the full bucket list even before user ingestion so
    district layout and colors are stable."""
    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    slugs = {b["slug"] for b in body["buckets"]}
    assert "t-pop" in slugs and "t-hip-hop" in slugs


def test_buckets_payload_includes_color_palette(client, user, buckets):
    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    pop = next(b for b in body["buckets"] if b["slug"] == "t-pop")
    assert pop["color_palette"] == ["#ff0", "#fa0"]
    assert pop["label"] == "Pop"


def test_artist_with_null_bucket_falls_back_to_other(client, user, buckets):
    """A pathological state — artist without a bucket FK shouldn't crash
    the endpoint. Treat as null on the wire; frontend can render as 'other'."""
    artist = Artist.objects.create(
        spotify_id="nogenre", name="Unknown", primary_genre_bucket=None
    )
    _score(user, artist, Tier.SHACK, 0.0)

    client.force_login(user)
    res = client.get("/api/me/city/")
    body = res.json()

    assert body["artists"][0]["primary_genre_bucket"] is None
