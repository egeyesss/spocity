from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("auth/callback/", views.spotify_callback),  # called by Next.js callback route
    path("auth/me/", views.me),                      # called by frontend to check session
]
