from datetime import timedelta

import requests as http
from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Custom user model — always define this at project start so we can add
    fields later without painful data migrations.
    """
    pass


class SpotifyTokenRefreshError(Exception):
    pass


class SpotifyAccount(models.Model):
    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="spotify_account"
    )
    spotify_user_id = models.CharField(max_length=255, unique=True)
    display_name = models.CharField(max_length=255, blank=True)
    access_token = models.TextField()
    refresh_token = models.TextField()
    expires_at = models.DateTimeField()

    def __str__(self):
        return f"{self.display_name} ({self.spotify_user_id})"

    def get_valid_access_token(self) -> str:
        """Return a valid access token, refreshing transparently if expired.

        Uses a 60-second buffer so tokens are refreshed before they expire
        rather than mid-request. Raises SpotifyTokenRefreshError if Spotify
        rejects the refresh — callers should treat this as a re-auth signal.
        """
        if timezone.now() < self.expires_at - timedelta(seconds=60):
            return self.access_token

        res = http.post(
            "https://accounts.spotify.com/api/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": self.refresh_token,
                "client_id": settings.SPOTIFY_CLIENT_ID,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=10,
        )

        if not res.ok:
            raise SpotifyTokenRefreshError(
                f"Token refresh failed ({res.status_code}): {res.text}"
            )

        data = res.json()
        self.access_token = data["access_token"]
        self.expires_at = timezone.now() + timedelta(seconds=data["expires_in"])
        # Spotify may rotate the refresh token — always store the latest one.
        if "refresh_token" in data:
            self.refresh_token = data["refresh_token"]
        self.save(update_fields=["access_token", "refresh_token", "expires_at"])

        return self.access_token
