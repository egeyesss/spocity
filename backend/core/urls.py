from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("auth/callback/", views.spotify_callback),
    path("auth/me/", views.me),
    path("auth/logout/", views.logout_view),
    path("ingest/initial/", views.initial_ingest),
    path("ingest/recent/", views.recent_ingest),
    path("now-playing/", views.now_playing),
]
