# Backend Security & Reliability Audit — `backend/server.py`

**Date:** 2026-06-04
**Reviewed file:** `backend/server.py` (stdlib `http.server`, threaded)
**Method:** Full read of the handler + live verification of the high-impact issues
against the running instance on port 8080.

Severity legend: 🔴 critical · 🟠 high · 🟡 medium

---

## Remediation status (updated 2026-06-04)

| # | Issue | Status |
|---|-------|--------|
| 1 | Forgeable tokens → auth bypass | ✅ Fixed — HMAC-signed, expiring tokens; role/class derived server-side only |
| 2 | Unrestricted writes to any collection | ✅ Fixed — ADMIN/ACCOUNTANT gate on `/api/data/*`; `users` blocked from generic path |
| 3 | Non-atomic save + destructive fallback | ✅ Fixed — temp-file + `os.replace`; corrupt file preserved, never overwritten |
| 4 | Read-modify-write race | ✅ Fixed — `mutate_data()` holds the lock across load→mutate→save |
| 5 | Hardcoded secrets | ✅ Fixed — SMS keys & admin key read from env (no committed defaults for SMS); `data 2.json` untracked |
| 6 | Plaintext passwords / leaked in responses | ✅ Fixed — scrypt hashing + migration; passwords stripped from all responses |
| 7 | Forgot-password lockout DoS | ⚠️ Not changed — current "lock-then-admin-reset" flow is intended product behavior; needs a product decision (out-of-band recovery token) before changing |
| 8 | `verify` falls back to first user | ✅ Fixed — returns 401 when token resolves to no user |
| 9 | Path traversal in file serving | ✅ Fixed — `_safe_join()` confines paths to the base dir |
| 10 | Robustness/perf cleanup | ◑ Partial — request-size cap, Content-Length guard, dead code, debug prints, upload role check **done**; full-file-read caching & CORS tightening **still open** |

**New environment variables** (see `backend/server.py`):

| Var | Purpose | Default |
|-----|---------|---------|
| `SESSION_SECRET` | HMAC key for session tokens. **Set this in production** or tokens reset every restart. | ephemeral random |
| `TOKEN_TTL_SECONDS` | Session token lifetime | `604800` (7 days) |
| `ADMIN_SIGNUP_KEY` | Secret to self-register as ADMIN | `Zymera@15` (dev only — override!) |
| `MAX_REQUEST_BYTES` | Max POST body size | `26214400` (25 MB) |
| `AT_API_KEY` / `ARKESEL_API_KEY` | SMS provider keys | empty (must be set to send SMS) |

**Still requires manual action (cannot be done from code):**
- **Rotate the exposed secrets.** The old API keys and passwords were committed
  and remain in **git history** even though `data 2.json` is now untracked.
  Rotate the Africa's Talking / Arkesel keys and have users reset passwords.
  Optionally scrub history with `git filter-repo`.
- **Set `SESSION_SECRET`** in the production environment.

---

## 🔴 1. Forgeable tokens → full auth bypass & privilege escalation

**Where:** `server.py:67`, `check_auth()` `:80-97`, `get_request_role()` `:99-110`

The auth "token" is the hardcoded constant `AUTH_TOKEN = "TSA-SECURE-ACCESS-2026"`,
issued as `TSA-SECURE-ACCESS-2026:<email>`. `check_auth()` accepts **any** value
that starts with that constant — no signature, no secret, no expiry. The constant
is in source control and is returned on every successful login.

`get_request_role()` then derives the caller's role from the **email embedded in
the attacker-supplied token**, and falls back to the client-supplied
`X-User-Role` header. So the client fully controls its own identity and role.

**Verified (no login performed):**
```bash
curl http://localhost:8080/api/data \
  -H "Authorization: Bearer TSA-SECURE-ACCESS-2026:samuel15appiah@gmail.com"
# → HTTP 200, full admin dataset

curl http://localhost:8080/api/data \
  -H "Authorization: Bearer TSA-SECURE-ACCESS-2026" -H "X-User-Role: ADMIN"
# → HTTP 200
```

**Impact:** Anyone who can reach the server has full admin access. Role-based
filtering provides no protection.

**Fix direction:** Issue signed, opaque, expiring session tokens (e.g. HMAC-signed
or random tokens stored server-side mapped to a user). Derive role **only** from
the server-side user record for the authenticated session — never from request
headers. Remove the `X-User-Role` / `X-Assigned-Class` trust path.

---

## 🔴 2. Unauthenticated-equivalent write to any collection (incl. `users`)

**Where:** `POST /api/data/<collection>` `:494-512`; `DELETE /api/data/<collection>/<id>` `:735-755`

These endpoints call `check_auth()` but perform **no role check**. Combined with
issue #1, any caller can replace or delete any collection.

**Verified:** a forged *teacher* token successfully wrote to the data store
(`POST /api/data/__pentest_marker` → `{"success": true}`; marker later removed).

**Impact:** `POST /api/data/users` with a crafted array → wipe/replace all
accounts → instant takeover or lockout of the entire school. Same exposure for
students, payments, reports, fee config, etc.

**Fix direction:** Gate all `/api/data/*` writes and deletes behind a real ADMIN
(and where appropriate ACCOUNTANT) check derived from the server-side session.
Consider an allowlist of writable collections and reject `users` via this generic
path entirely.

---

## 🔴 3. Non-atomic saves + destructive fallback → permanent data loss

**Where:** `load_data()` `:42-55`, `save_data()` `:57-65`

- `save_data()` writes directly into `data.json`. A crash — or a **full disk
  mid-write** (which this machine hit during this session) — leaves the file
  truncated/corrupt.
- `load_data()` swallows *all* errors and returns `DEFAULT_DATA`
  (`except Exception: return DEFAULT_DATA`, `:54-55`). The **next save then
  overwrites the corrupt file with the 2-student default set**, permanently
  destroying the real database.

**Impact:** Silent, total data loss. Live risk given the near-full disk.

**Fix direction:** Write to a temp file in the same dir, `fsync`, then
`os.replace()` (atomic). On load failure, do **not** fall back to defaults over a
file that exists — back the bad file up and refuse to overwrite, or raise.

---

## 🔴 4. Read-modify-write race under threading

**Where:** every handler that does `load_data()` → mutate → `save_data()`;
server is `ThreadingMixIn` `:760-769`

`DATA_LOCK` only guards each individual file read and each individual file write —
**not** the load→modify→save critical section. Concurrent writes (e.g. a signup
and a save-report at the same time) lose updates. The recent "merge dictionary
updates" commit patched one symptom; the underlying TOCTOU remains.
(`backend/test_concurrency.py` exists, so this is a known pain point.)

**Fix direction:** Hold a single lock around the whole read-modify-write, or move
to a real store. At minimum, expose a `with DATA_LOCK:` critical section that wraps
load+mutate+save for mutating endpoints.

---

## 🟠 5. Hardcoded live secrets in source

**Where:** `:559` (Africa's Talking API key `atsk_…`), `:655` (Arkesel key),
`:307` (admin signup key `Zymera@15`)

Real-looking provider API keys are committed. The admin signup key `Zymera@15` is
**also a real user's password** (same secret reused). Anyone reading the repo can
self-register as ADMIN via `/api/auth/signup` or spend SMS credits.

**Fix direction:** Move all secrets to environment variables with no committed
defaults. Rotate the exposed keys. Use a distinct, high-entropy admin
registration secret (or remove self-service admin signup entirely).

---

## 🟠 6. Plaintext passwords, returned to clients

**Where:** `:22`, login response `:369-377`, `/api/data` `:155`, `/api/auth/verify` `:240`

Passwords are stored in cleartext in `data.json` and echoed back to the client in
the login response, in the full `/api/data` payload, and in `verify`.

**Fix direction:** Hash with a slow KDF (bcrypt/scrypt/argon2 — `hashlib.scrypt`
is in the stdlib). Never include password fields in any API response.

---

## 🟠 7. Account-lockout DoS via forgot-password

**Where:** `/api/auth/forgot-password` `:387-420`; lock check in login `:355-367`

`forgot-password` immediately sets `password_recovery_requested=True`, locking the
account with no verification. The lock is checked *before* password validation in
login. So any unauthenticated caller can lock out any user by email, and only an
admin can unlock them.

**Fix direction:** Don't lock on request. Use a time-limited recovery token sent
out-of-band; never change account state purely from an unauthenticated email
submission.

---

## 🟠 8. `/api/auth/verify` falls back to the first user

**Where:** `:234-235`

If the token's email matches no user, `verify` returns `users[0]` (typically the
admin) as the authenticated user.

**Fix direction:** Return 401 when the token does not resolve to a real user.

---

## 🟡 9. Path-traversal risk in file serving

**Where:** `/uploads/` `:246-247`, static serving `:263`

`os.path.join(UPLOADS_DIR, <unsanitized path>)` can escape the directory. A quick
`../` probe returned 404 (client/path normalization), so **not confirmed
exploitable as-is**, but there is no traversal guard.

**Fix direction:** Resolve the final real path and verify it is contained within
`UPLOADS_DIR` / `DIST_DIR` (`os.path.realpath` + `commonpath` check) before
serving.

---

## 🟡 10. Robustness / correctness / performance

- **No request-size limit** (`:283`): `rfile.read(Content-Length)` reads any
  claimed size into memory; reports embed base64 images (why `data.json` is
  ~6.7 MB).
- **Unguarded `int(Content-Length)`** (`:282`): a malformed header throws an
  unhandled `ValueError` → 500.
- **Full-file read+serialize per request** (`load_data` on every call): every
  `GET /api/data` re-reads and re-serializes ~6.7 MB; every write rewrites + fsyncs
  the whole file. No caching.
- **Dead/unreachable code** after `return` at `:592-595`.
- **Uploads** (`:514-541`): no role check; always saved as `uploaded_{type}.png`
  regardless of real type; bare `except` swallows errors.
- **Debug `print()` statements** throughout (`:52, 371, 379, 685, 693, …`) leak
  emails and login outcomes to logs.
- **CORS wildcard** `Access-Control-Allow-Origin: *` (`:71`) on all endpoints.

---

## Suggested fix order

1. **#3 atomic saves + non-destructive load** — protects the freshly-connected real
   data; low-risk, self-contained. *(starting here)*
2. **#1 + #2** real session auth + role enforcement on writes — the core exposure.
3. **#5 / #6** secrets to env + password hashing.
4. **#7, #8, #9** and the #10 cleanup items.
