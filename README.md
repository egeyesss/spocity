# Spocity

> Your Spotify listening history as a living 3D voxel city. Every artist you listen to becomes a building — heavy plays grow towers, neglected artists decay. Genre districts auto-zone your skyline. Powered by exponential-decay scoring with nightly recomputes.

**Live at**: [spocity.app](https://spocity.app) _(coming soon)_

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) · TypeScript · Tailwind · React Three Fiber |
| Backend | Django · Django REST Framework |
| Database | Postgres (Neon in prod, Docker locally) |
| Workers | Celery + Redis |
| Image storage | Cloudflare R2 |
| Hosting | Vercel (frontend) · Railway (backend + workers) |

---

## Local setup

### Prerequisites
- Docker + Docker Compose
- Node 20+
- Python 3.12+

### 1. Clone and install

```bash
git clone https://github.com/your-username/spocity.git
cd spocity
```

### 2. Environment variables

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

Fill in your Spotify credentials (client ID + secret from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)).

### 3. Run

```bash
docker compose up
```

- Frontend: http://127.0.0.1:3000
- Backend API: http://127.0.0.1:8000

---

## Architecture

_Diagram coming soon._

---

## Project structure

```
spocity/
├── frontend/       # Next.js app
├── backend/        # Django + Celery
├── docker-compose.yml
└── README.md
```
