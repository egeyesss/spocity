from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model — always define this at project start so we can add
    fields later without painful data migrations.
    """
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
