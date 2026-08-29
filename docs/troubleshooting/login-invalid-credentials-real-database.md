# Fix: "Invalid credentials" on login — backend running on default data

**Date:** 2026-06-04
**Area:** Backend (`backend/server.py`), local data file

## Symptom

Logging in at http://localhost:3001 with the known admin credentials returned an
**"Invalid credentials"** alert in the browser, even though the credentials were correct.

## Root cause

There were actually **two separate things** going on:

1. **The backend was running on built-in default data, not the real database.**
   - `backend/server.py` reads its database from a file named `data.json`
     (`DATA_FILE = os.path.join(os.path.dirname(__file__), 'data.json')`).
   - That file did **not exist**. The real database was sitting in
     `backend/data 2.json` — the ` 2` suffix is macOS's automatic
     "duplicate file" rename, which silently disconnected the real data.
   - With no `data.json` present, the server fell back to `DEFAULT_DATA`,
     which contains only a single account (`admin@school.com / password123`)
     and none of the school's real users/students.

2. **The browser login failure was a separate red herring.**
   - Testing the default credentials directly against the API succeeded:
     ```
     POST /api/auth/login {"email":"admin@school.com","password":"password123"} → HTTP 200
     ```
   - So the in-browser "Invalid credentials" was caused by the **Brave password
     manager autofilling a saved (wrong) password** over the field, not by the
     backend.

## How it was diagnosed

```bash
# Confirmed only the duplicate existed, no data.json
ls -la backend/data*.json
#   data 2.json   (no data.json)

# Listed the real users living in the duplicate
python3 -c "import json; d=json.load(open('backend/data 2.json')); \
  print([u['email'] for u in d['users']])"
# → 8 real accounts (admin, samuel15appiah, kwesi, teachers, ...)

# Proved the backend itself accepted valid creds (so login logic was fine)
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.com","password":"password123"}' -w "\nHTTP %{http_code}\n"
# → {"success": true, ...} HTTP 200
```

## The fix

Connect the real database by giving the server the file it actually reads, then
restart it:

```bash
cd backend
cp "data 2.json" data.json          # put the real DB where the server expects it
# restart backend
lsof -ti:8080 | xargs kill -9        # stop the old instance
PORT=8080 python3 backend/server.py  # start fresh (loads data.json)
```

Verified after restart:

```bash
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"samuel15appiah@gmail.com","password":"Zymera@15"}' -w "\nHTTP %{http_code}\n"
# → {"success": true, ...} HTTP 200
```

For the browser side: clear the autofilled password and type it manually, or use
a Private/Incognito window so the password manager doesn't override the field.

---

# Fix #2: "Invalid credentials" again — Vite proxy hitting IPv6, backend on IPv4

**Date:** 2026-06-04 (same session, after the data-file fix above)

## Symptom

Login still failed with the same **"Invalid credentials"** alert. But the
browser DevTools **Network** tab told the real story: the `/api/auth/login`
request returned **HTTP 500**, not 401 — initiated from `App.jsx`.

A 500 (not 401) means this was **not** a credentials problem. The frontend just
shows a generic "Invalid credentials" message for any non-success response.

## Root cause

The frontend could not reach the backend at all:

- `frontend/vite.config.js` proxied `/api` to `http://localhost:8080`.
- On macOS, `localhost` resolves to **IPv6 `::1` first**.
- The Python backend binds to `0.0.0.0` (`server.py`), which is **IPv4 only** —
  it never listens on `::1`.
- So every proxied API call hit `::1:8080` → **ECONNREFUSED** → Vite turned that
  into an **HTTP 500** → React showed "Invalid credentials".

This is why a direct request to the IPv4 address worked but the browser never
could.

## How it was diagnosed

```bash
# Direct to backend over IPv4 → works
curl -s -X POST http://127.0.0.1:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.com","password":"password123"}' -w "\nHTTP %{http_code}\n"
# → {"success": true, ...} HTTP 200

# Through the Vite proxy (port 3001) → fails
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.com","password":"password123"}' -w "\nHTTP %{http_code}\n"
# → HTTP 500

# The Vite dev-server log showed the smoking gun:
#   [vite] http proxy error: /api/auth/login
#   Error: connect ECONNREFUSED ::1:8080
```

## The fix

Force the proxy to IPv4 in `frontend/vite.config.js` (both `/api` and
`/uploads/` targets):

```diff
-        target: 'http://localhost:8080',
+        target: 'http://127.0.0.1:8080',
```

Vite config changes require a dev-server restart:

```bash
lsof -ti:3001 | xargs kill -9
cd frontend && npm run dev
```

Verified after restart:

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@school.com","password":"password123"}' -w "\nHTTP %{http_code}\n"
# → {"success": true, ...} HTTP 200
```

## Key takeaway

When the login alert says "Invalid credentials," **check the Network tab status
code first**: a `401` is a real bad-password; a `500` (or proxy error) means the
request never reached the backend — look at the proxy/network layer, not the
password. `localhost` vs `127.0.0.1` IPv6/IPv4 mismatch is a common culprit on
macOS.

---

## Follow-ups worth doing

- **Don't rely on a manually-copied `data.json`.** Decide on a single canonical
  data file and remove the stray `data 2.json` to avoid future confusion.
- **Ensure `data.json` is git-ignored** — it contains real user data and
  plaintext passwords.
- **Passwords are stored in plaintext** and echoed back in the login response.
  This should be hashed and stripped from API responses.
- **Fix the `Procfile`**, which points at `server/server.py` while the file is
  actually at `backend/server.py`.
