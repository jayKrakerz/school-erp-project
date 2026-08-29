# Deployment — single backend (`backend/server.py`)

As of the multi-tenant work, **`backend/server.py` is the one and only backend.**
The old Flask app has been retired to `backend/legacy/flask_app.py` (kept for
reference, not run). `server.py` now has every endpoint the frontend uses, is
security-hardened, and is multi-tenant (per-school data isolation).

## What runs

- **Backend:** `python backend/server.py` — a Python standard-library HTTP server
  (no pip dependencies). Listens on `$PORT` (default 8080), binds `0.0.0.0`.
- **Frontend:** Vite build (`npm run build` in `frontend/`) served as static files.
  In dev, `npm run dev` proxies `/api` → `127.0.0.1:8080`.

## Required environment variables (production)

| Var | Why | Notes |
|-----|-----|-------|
| `SESSION_SECRET` | Signs session tokens | **Must be set**, or every session is invalidated on each restart. Use a long random value. |
| `PORT` | Listen port | Defaults to 8080. |
| `TOKEN_TTL_SECONDS` | Session lifetime | Default 604800 (7 days). |
| `MAX_REQUEST_BYTES` | Upload/body cap | Default 25 MB. |
| `AT_API_KEY` / `ARKESEL_API_KEY` / `HUBTEL_*` | SMS providers | Only needed if sending SMS; no committed defaults. |

`ADMIN_SIGNUP_KEY` is no longer used for onboarding (institution registration is
open self-service). It can be removed.

## First boot / migration

On startup `server.py` runs `migrate_schools()` **once** (idempotent): it converts
a legacy flat `data.json` into the multi-tenant shape — moving config under
`data['schools']['default']` and tagging existing records/users with
`schoolId='default'`. It prints the generated **default school code**; share it
with any existing-school staff who need to self-register. Re-running is a no-op
once `data['schools']` exists.

## PythonAnywhere (current prod host) — important

PythonAnywhere serves **WSGI** apps; the retired Flask app fit that model.
`server.py` is a standalone `http.server`, **not** WSGI, so it cannot be wired to
PA's WSGI file directly. Options:

1. **Always-on task** (paid PA feature): run `python backend/server.py` as an
   always-on task on an internal port, and point the web app / a reverse proxy at
   it. Simplest faithful switch.
2. **Move hosts** to a platform that runs a process directly (Railway, Render,
   Fly, a VM). The included `Procfile` (`web: python backend/server.py`) already
   targets that model.
3. **WSGI shim** (more work): wrap `server.py`'s routing in a small WSGI adapter
   so PA can serve it without a long-running process.

Until one of these is done, **production still runs the old Flask app** and will
not have multi-tenancy or the security fixes. Coordinate the cutover and migrate
the production `data.json` with the same `migrate_schools()` routine.

## Data & secrets hygiene

- `data.json` (and `tenants`/backups) are git-ignored — they hold real data and
  password hashes.
- Rotate any secrets that were previously committed (old SMS keys, the old
  `Zymera@15` key) — they remain in git history. See `docs/backend-security-audit.md`.
