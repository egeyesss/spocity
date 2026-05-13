from dataclasses import asdict
from datetime import timedelta

import requests as http
from django.conf import settings
from django.contrib.auth import login, logout
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from .models import (
    ArtistScore,
    GenreBucket,
    SpotifyAccount,
    SpotifyTokenRefreshError,
    User,
)
from .services.ingest import run_initial_ingest, run_recent_ingest
from .services.recompute import recompute_user
from .services.spotify import SpotifyAPIError, get_client


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


@api_view(["POST"])
@permission_classes([AllowAny])
def spotify_callback(request):
    code = request.data.get("code")
    code_verifier = request.data.get("code_verifier")

    if not code or not code_verifier:
        return Response(
            {"error": "Missing code or code_verifier"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token_res = http.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
            "client_id": settings.SPOTIFY_CLIENT_ID,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )

    if not token_res.ok:
        return Response(
            {"error": "Token exchange failed", "detail": token_res.text},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tokens = token_res.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]
    expires_at = timezone.now() + timedelta(seconds=tokens["expires_in"])

    profile_res = http.get(
        "https://api.spotify.com/v1/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )

    if not profile_res.ok:
        return Response(
            {"error": "Failed to fetch Spotify profile"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    profile = profile_res.json()
    spotify_user_id = profile["id"]
    display_name = profile.get("display_name") or spotify_user_id
    email = profile.get("email", "")

    user, _ = User.objects.get_or_create(
        username=spotify_user_id,
        defaults={"email": email},
    )

    SpotifyAccount.objects.update_or_create(
        user=user,
        defaults={
            "spotify_user_id": spotify_user_id,
            "display_name": display_name,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
        },
    )

    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session.save()

    return Response({"display_name": display_name, "session_key": request.session.session_key})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    spotify = request.user.spotify_account
    return Response({
        "display_name": spotify.display_name,
        "spotify_user_id": spotify.spotify_user_id,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"detail": "Logged out."})


# ── Spotify ingest endpoints ──────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def initial_ingest(request):
    """Pull top artists across all three time ranges, upsert them, seed
    ArtistScores. Safe to call multiple times — idempotent."""
    try:
        result = run_initial_ingest(request.user)
    except SpotifyTokenRefreshError:
        return Response(
            {"error": "spotify_reauth_required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except SpotifyAPIError as exc:
        return Response(
            {"error": "spotify_api_error", "detail": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response(asdict(result))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recent_ingest(request):
    """Pull /recently-played (last 50 tracks) and insert PlayHistory rows.
    Week 3 promotes this to a Celery beat task; manual trigger for now."""
    try:
        result = run_recent_ingest(request.user)
    except SpotifyTokenRefreshError:
        return Response(
            {"error": "spotify_reauth_required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except SpotifyAPIError as exc:
        return Response(
            {"error": "spotify_api_error", "detail": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response(asdict(result))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def now_playing(request):
    """Return what the user is currently listening to, or null if nothing.

    Cached per-user for NOW_PLAYING_CACHE_TTL seconds so the frontend's 30s
    polling interval doesn't hammer Spotify (their /currently-playing
    endpoint has tight rate limits compared to the rest of the API).
    """
    cache_key = f"now_playing:{request.user.id}"
    cached = cache.get(cache_key)
    if cached is not None:
        # Cache stores either the payload dict or the sentinel "__none__".
        return Response(None if cached == "__none__" else cached)

    try:
        client = get_client(request.user.spotify_account)
        data = client.get_currently_playing()
    except SpotifyTokenRefreshError:
        return Response(
            {"error": "spotify_reauth_required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except SpotifyAPIError as exc:
        return Response(
            {"error": "spotify_api_error", "detail": str(exc)},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if not data or not data.get("item"):
        cache.set(cache_key, "__none__", settings.NOW_PLAYING_CACHE_TTL)
        return Response(None)

    item = data["item"]
    artists = item.get("artists") or []
    album = item.get("album") or {}
    album_images = album.get("images") or []

    payload = {
        "track_id": item.get("id"),
        "track_name": item.get("name"),
        "artist_spotify_id": artists[0]["id"] if artists else None,
        "artist_name": artists[0]["name"] if artists else None,
        "album_image": album_images[0]["url"] if album_images else None,
        "progress_ms": data.get("progress_ms"),
        "duration_ms": item.get("duration_ms"),
        "is_playing": data.get("is_playing", False),
    }
    cache.set(cache_key, payload, settings.NOW_PLAYING_CACHE_TTL)
    return Response(payload)


# ── City data ─────────────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_city(request):
    """Return everything the frontend needs to render the requesting
    user's city in one round trip.

    Shape:
        {
          "artists": [
            { spotify_id, name, image_url, tier, score, seed_score,
              primary_genre_bucket, last_played_at }
          ],
          "buckets": [
            { slug, label, color_palette, sort_order }
          ]
        }

    Artists sorted by score descending so the frontend can lay buildings
    out tightest at district centers without re-sorting (Week 5 layout).
    """
    scores = (
        ArtistScore.objects
        .filter(user=request.user)
        .select_related("artist", "artist__primary_genre_bucket")
        .order_by("-score", "artist__name")
    )
    artists_payload = [
        {
            "spotify_id": s.artist.spotify_id,
            "name": s.artist.name,
            "image_url": s.artist.image_url,
            "tier": s.tier,
            "score": s.score,
            "seed_score": s.seed_score,
            "primary_genre_bucket": (
                s.artist.primary_genre_bucket.slug
                if s.artist.primary_genre_bucket_id else None
            ),
            "last_played_at": (
                s.last_played_at.isoformat() if s.last_played_at else None
            ),
        }
        for s in scores
    ]

    buckets_payload = [
        {
            "slug": b.slug,
            "label": b.label,
            "color_palette": b.color_palette,
            "sort_order": b.sort_order,
        }
        for b in GenreBucket.objects.all()
    ]

    return Response({"artists": artists_payload, "buckets": buckets_payload})


# ── Admin / staff-only endpoints ──────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_recompute(request, user_id: int):
    """Force-run the nightly recompute for a single user. Staff only.

    Used to verify scoring changes against real DB state without waiting
    for the 3am beat job. Synchronous — returns the recompute summary
    inline.
    """
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(
            {"error": "user_not_found"}, status=status.HTTP_404_NOT_FOUND
        )
    result = recompute_user(target)
    return Response(
        {
            "user_id": user_id,
            "scores_updated": result.scores_updated,
            "tier_events_created": result.tier_events_created,
        }
    )

