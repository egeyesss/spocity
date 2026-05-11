# Spocity

> Your Spotify listening history as a living 3D voxel city. Every artist you listen to becomes a building — heavy plays grow towers, neglected artists decay. Genre districts auto-zone your skyline. Powered by exponential-decay scoring with nightly recomputes.

**Live at**: [spocity.app](https://spocity.app) _(coming soon — Week 8)_

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind · React Three Fiber |
| Backend | Django 6 · Django REST Framework |
| Database | Postgres 16 (Neon in prod, Docker locally) |
| Workers | Celery + Redis (added Week 3) |
| Image storage | Cloudflare R2 (added Week 6) |
| Hosting | Vercel (frontend) · Railway (backend + workers) |

---

## Local development

### Prerequisites

Only **Docker Desktop** is required. Python and Node do not need to be installed locally — everything runs inside containers.

### 1. Clone

```bash
git clone https://github.com/egeyesss/spocity.git
cd spocity
```

### 2. Spotify Developer App

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app (or open the existing one).
2. Under **Redirect URIs**, add:
   - `http://127.0.0.1:3000/api/auth/callback/spotify` (dev)
   - `https://spocity.app/api/auth/callback/spotify` (prod — add early so you don't have to touch this again)
3. Note your **Client ID** and **Client Secret**.

> **Gotcha**: Spotify no longer accepts `localhost` as a redirect URI. Use `127.0.0.1` everywhere.

### 3. Environment variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Fill in `backend/.env`:
```
SECRET_KEY=<any long random string>
SPOTIFY_CLIENT_ID=<from dashboard>
SPOTIFY_CLIENT_SECRET=<from dashboard>
```

Fill in `frontend/.env.local`:
```
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=<same client ID>
```

Everything else can stay as the example defaults for local dev.

### 4. First run

```bash
docker compose up --build
```

On first run, apply Django migrations:

```bash
docker compose exec backend python manage.py migrate
```

- Frontend: http://127.0.0.1:3000
- Backend API: http://127.0.0.1:8000/api/

### 5. Subsequent runs

```bash
docker compose up
```

Hot reload is enabled for both services. Next.js uses polling (`WATCHPACK_POLLING=true`) so file changes are picked up inside Docker on Mac/Windows.

---

## Useful commands

```bash
# Django management
docker compose exec backend python manage.py <command>

# Open a Django shell
docker compose exec backend python manage.py shell

# Run backend tests
docker compose exec backend python manage.py test

# Tail backend logs only
docker compose logs -f backend
```

---

## Project structure

```
spocity/
├── frontend/               # Next.js 15 App Router
│   ├── app/
│   │   ├── page.tsx        # Landing page
│   │   ├── me/             # Authenticated city view
│   │   └── api/auth/       # OAuth login + callback routes
│   └── lib/
│       ├── api.ts          # fetchAPI() wrapper (all backend calls go here)
│       └── auth-context.tsx # AuthProvider + useAuth() hook
├── backend/
│   ├── core/               # Main Django app
│   │   ├── models.py       # User, SpotifyAccount (+ token refresh logic)
│   │   ├── views.py        # health, spotify_callback, me, logout
│   │   ├── urls.py
│   │   └── authentication.py  # CsrfExemptSessionAuthentication
│   └── spocity/            # Django project config
│       └── settings.py
├── docker-compose.yml
└── README.md
```

---

## Key gotchas

- **Postgres port**: mapped to `5433` on the host (not 5432) to avoid conflicts with a local Postgres install. Connect with `psql -h 127.0.0.1 -p 5433 -U spocity`.
- **Spotify redirect URI**: must be `127.0.0.1`, not `localhost`.
- **SSR vs browser URLs**: the frontend uses two env vars — `API_URL` (Docker-internal, used by server-side fetches) and `NEXT_PUBLIC_API_URL` (host-accessible, used by browser fetches).
- **HMR in Docker**: WebSocket hot-reload doesn't work inside Docker. File changes are picked up via polling — the page reloads but you may need to refresh manually.

---

## Architecture

```
Browser
  │
  ├─ GET /  →  Next.js (Vercel)
  ├─ GET /me  →  Next.js SSR  →  Django /api/auth/me/  (session cookie)
  └─ client fetches  →  Django REST API (127.0.0.1:8000 in dev)

Django
  ├─ core/   Auth, Spotify OAuth, user data
  └─ (Week 3) Celery worker + beat  →  Redis  →  nightly score recompute

Postgres  ←  Django ORM
```

_Full Mermaid diagram added in Week 8._
