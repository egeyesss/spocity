# Spocity — Project Instructions

## Starting a Task

When the user says **"start task X in week Y"** (e.g., "start task 9 in week 1"):

1. Read `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/implementation-plan.md`
   — find the target week, identify task X by its position in the task list.
2. Read `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/implementation-log.md`
   — check which tasks are already done (✅) and any gotchas recorded under them.
3. Read the relevant code files in the repo (backend, frontend, docker-compose as needed)
   to understand current state before writing any code.
4. Brief the user: what the task is, what already exists that's relevant, then start
   developing with no further prompting needed.

After completing the task, mark it as done in the implementation log (`[x]`) and record
any gotchas or deviations under the task entry.

---

## Stack

- **Frontend**: Next.js 15 App Router + TypeScript + Tailwind (`frontend/`)
- **Backend**: Django 6 + Django REST Framework (`backend/`)
- **DB**: Postgres 16 (Docker service `db`, port 5433 on host)
- **Queue**: Redis 7 + Celery (added Week 3)
- **Auth**: Spotify OAuth 2.0 PKCE — Django session cookies, `credentials: "include"` on all fetches
- **Docker**: `docker compose up` starts everything; hot reload via `WATCHPACK_POLLING=true`

## Key Conventions

- SSR fetches use `API_URL=http://backend:8000` (Docker DNS); browser fetches use `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`
- All DRF views use `CsrfExemptSessionAuthentication` (see `backend/core/authentication.py`) — no per-view `@csrf_exempt` needed
- `fetchAPI()` in `frontend/lib/api.ts` is the single fetch wrapper — always use it, never raw `fetch`
- Feature branches always; never commit to `main` directly
- No "Co-Authored-By Claude" or AI mentions in commit messages

## Vault References

- Implementation plan: `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/implementation-plan.md`
- Implementation log: `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/implementation-log.md`
- Product brief: `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/product-brief.md`
- Decisions: `/Users/egeyesilyurt/Documents/Claude Code/projects/spocity/decisions.md`
