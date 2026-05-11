from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("auth/callback/", views.spotify_callback),
    path("auth/me/", views.me),
    path("auth/logout/", views.logout_view),
]
