from datetime import timedelta

import requests as http
from django.conf import settings
from django.contrib.auth import login, logout
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import SpotifyAccount, User


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

