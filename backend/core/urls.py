from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("auth/callback/", views.spotify_callback),
    path("auth/me/", views.me),
    path("auth/logout/", views.logout_view),
    path("ingest/initial/", views.initial_ingest),
    path("ingest/recent/", views.recent_ingest),
    path("ingest/genres/", views.genre_ingest),
    path("now-playing/", views.now_playing),
    path("me/city/", views.me_city),
    path("demo-city/", views.demo_city),
    path("city/<slug:slug>/", views.public_city),
    path("city/<slug:slug>/now-playing/", views.public_now_playing),
    path("admin/recompute/<int:user_id>/", views.admin_recompute),
]
