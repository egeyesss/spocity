"""Staff-only admin endpoints: manual recompute trigger.

Used to verify the decay function works against real production data
without waiting for the 3am beat job. Authn=Django session, authz=
is_staff flag — only superusers/staff can call it.
"""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

from core.models import Artist, ArtistScore, GenreBucket, Tier

User = get_user_model()


@pytest.fixture
def staff(db):
    return User.objects.create_user(
        username="staff", password="p", is_staff=True
    )


@pytest.fixture
def regular(db):
    return User.objects.create_user(username="reg", password="p")


@pytest.fixture
def target(db):
    return User.objects.create_user(username="target")


@pytest.fixture
def artist(db):
    bucket = GenreBucket.objects.create(slug="bk", label="B", color_palette=[])
    return Artist.objects.create(spotify_id="a", name="A", primary_genre_bucket=bucket)


def test_anonymous_blocked(client, target):
    res = client.post(f"/api/admin/recompute/{target.id}/")
    assert res.status_code in (401, 403)


def test_non_staff_blocked(client, regular, target):
    client.force_login(regular)
    res = client.post(f"/api/admin/recompute/{target.id}/")
    assert res.status_code == 403


def test_staff_can_trigger_recompute(client, staff, target, artist):
    ArtistScore.objects.create(
        user=target, artist=artist, score=10.0, tier=Tier.HOUSE,
        seed_score=10.0, seed_assigned_at=None,
    )
    client.force_login(staff)
    res = client.post(f"/api/admin/recompute/{target.id}/")
    assert res.status_code == 200
    body = res.json()
    assert body["scores_updated"] == 1


def test_staff_recompute_unknown_user_returns_404(client, staff):
    client.force_login(staff)
    res = client.post("/api/admin/recompute/99999/")
    assert res.status_code == 404
