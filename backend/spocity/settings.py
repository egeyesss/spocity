from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["127.0.0.1", "localhost"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "corsheaders",
    # local
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "spocity.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "spocity.wsgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "core.User"

# ── Django REST Framework ──────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.authentication.CsrfExemptSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# ── CORS ───────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=["http://127.0.0.1:3000", "http://localhost:3000"],
)
CORS_ALLOW_CREDENTIALS = True

# ── Sessions ───────────────────────────────────────────────────────────────────
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"

# ── Spotify ────────────────────────────────────────────────────────────────────
SPOTIFY_CLIENT_ID = env("SPOTIFY_CLIENT_ID", default="")
SPOTIFY_CLIENT_SECRET = env("SPOTIFY_CLIENT_SECRET", default="")
SPOTIFY_REDIRECT_URI = env(
    "SPOTIFY_REDIRECT_URI",
    default="http://127.0.0.1:3000/api/auth/callback/spotify",
)
# Tests flip this on via @override_settings so the SpotifyClient factory
# returns a fixture-backed stub instead of hitting the live API.
SPOTIFY_USE_STUB = env.bool("SPOTIFY_USE_STUB", default=False)

# ── Last.fm ────────────────────────────────────────────────────────────────────
# Spotify removed artist genres from /me/top/artists and /artists in late
# 2024, so we source genre tags from Last.fm instead. Free key from
# https://www.last.fm/api/account/create — anonymous reads only, no OAuth.
LASTFM_API_KEY = env("LASTFM_API_KEY", default="")
LASTFM_USE_STUB = env.bool("LASTFM_USE_STUB", default=False)

# ── Now-playing cache TTL ──────────────────────────────────────────────────────
# Spotify rate-limits /currently-playing aggressively; the frontend polls
# every 30s, so a matching backend cache TTL avoids 1:1 thrash.
NOW_PLAYING_CACHE_TTL = 25

# ── Celery / Redis ─────────────────────────────────────────────────────────────
# Broker and result backend both point at the `redis` service in docker-compose.
# In tests we run with CELERY_TASK_ALWAYS_EAGER so tasks execute synchronously
# in the test process — no worker needed.
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://redis:6379/0")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://redis:6379/0")
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
# When True, .delay() runs the task immediately in the calling process. Tests
# flip this on via @override_settings; not set by default in dev/prod.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_EAGER_PROPAGATES = True

# Beat schedule — periodic tasks. Defined here (rather than in tasks.py)
# so beat config lives next to other deployment settings.
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    "poll-recently-played-hourly": {
        "task": "core.tasks.poll_recently_played_for_active_users",
        # Top of every hour. Spotify's /recently-played returns the last 50
        # tracks, so hourly polling captures everything for any normal listener.
        "schedule": crontab(minute=0),
    },
    "nightly-recompute": {
        "task": "core.tasks.nightly_recompute_all_users",
        # 3am UTC — quiet hours for our likely user base; cheap to shift later.
        "schedule": crontab(hour=3, minute=0),
    },
}
