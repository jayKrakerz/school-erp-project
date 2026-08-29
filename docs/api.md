# School ERP — Backend API (for the frontend team)

Single backend: `backend/server.py`. Multi-tenant — every authenticated request
is automatically scoped to the logged-in user's **school**; the frontend does not
send a school id, it's encoded in the session and resolved server-side.

## Base URL & auth

- **Dev:** requests go to `/api/...` (Vite proxies `/api` → `http://127.0.0.1:8080`).
- **Prod:** `https://<host>/api/...`.
- **Auth:** send `Authorization: Bearer <token>` on every protected call. The
  token is an **opaque string** from `login` / `register-institution` — store it
  and resend it as-is; do not parse it. Tokens expire (default 7 days).
- A `401` means the token is missing/expired/invalid → send the user back to login.
- The old `X-User-Role` / `X-Assigned-Class` headers are **ignored** — role and
  class come from the server-side user record. Stop sending them.
- All bodies are JSON; set `Content-Type: application/json`.

## Onboarding flow (the important sequence)

1. **New institution** → `POST /api/auth/register-institution` → returns `{ token, user, schoolCode }`. Store the token, show the user their **schoolCode** (they share it with staff). They're now logged in as ADMIN.
2. **Staff join** → `POST /api/auth/signup` with that `schoolCode` → account created `pending_activation` (no token, cannot log in yet).
3. **Admin activates** the pending staff → `POST /api/users/activate`.
4. **Everyone logs in** with email + password only → `POST /api/auth/login` (no school code needed; the server finds their school by email).

---

## Auth endpoints (public)

### POST `/api/auth/register-institution`
Create a new school + its first ADMIN.
```jsonc
// request
{ "institutionName": "Sunrise Academy", "adminName": "Jane Doe",
  "adminEmail": "jane@sunrise.com", "password": "secret123" }
// 201
{ "success": true, "token": "<opaque>", "schoolCode": "K7Q4ZB",
  "schoolId": "…", "user": { "email": "...", "name": "...", "role": "ADMIN", "schoolId": "…" } }
// 400 -> { "error": "Email already exists" }  (emails are globally unique)
```

### POST `/api/auth/signup`  (staff joining an existing school)
```jsonc
// request
{ "name": "Mr Teacher", "email": "t@sunrise.com", "password": "pw",
  "role": "TEACHER", "assignedClass": "BASIC 1", "schoolCode": "K7Q4ZB" }
// 201 -> { "success": true }   (status = pending_activation; cannot log in until activated)
// 400 -> { "error": "Invalid school code" } | { "error": "Email already exists" }
```
`role` is coerced to `TEACHER`/`ACCOUNTANT` (admins only come from register-institution).

### POST `/api/auth/login`
```jsonc
// request -> { "email": "jane@sunrise.com", "password": "secret123" }
// 200 -> { "success": true, "token": "<opaque>", "user": { email, name, role, assignedClass, schoolId, status } }
// 401 -> { "error": "Invalid credentials" }
// 403 -> { "error": "..." }   pending activation OR account locked (recovery pending)
```

### POST `/api/auth/forgot-password`
```jsonc
// request -> { "email": "..." }
// 200 -> { "success": true, "message": "..." }   (always 200, even for unknown emails)
```

### POST `/api/auth/logout-log`  *(auth)* — fire-and-forget on logout
`{ "email": "...", "name": "..." }` → `{ "success": true }`

---

## Data endpoints (auth required)

### GET `/api/data`
The whole dataset for the caller's school, already filtered. Response includes:
```jsonc
{
  "students": [...], "payments": [...], "reports": [...], "staff": [...],
  "expenditures": [...], "deleted": [...], "activity_log": [...], "users": [...],
  "schoolInfo": {...}, "feeConfig": {...}, "settings": {...}, "currency": "GH₵",
  "allClasses": [...], "departments": {...}, "feedingConfig": {...}, "reportTemplates": [...],
  "schoolId": "…", "schoolName": "...", "schoolCode": "K7Q4ZB"
}
```
For TEACHER/ACCOUNTANT-restricted roles: `students` is limited to the assigned
class, `payments`/`reports` follow, and admin-only collections (`users`, `staff`,
`deleted`, `activity_log`) come back empty. **User objects never include passwords.**

### Focused reads (auth)
| Method | Path | Returns |
|---|---|---|
| GET | `/api/students` | array of students (school + role scoped) |
| GET | `/api/payments` | array of payments |
| GET | `/api/student-report/<idOrSid>` | manual reports for one student |
| GET | `/api/report-templates` | this school's report templates |
| GET | `/api/departments` | this school's departments object |
| GET | `/api/expenditure` | this school's expenditures |
| GET | `/api/activity-log` | last 200 activity entries (newest first) |
| GET | `/api/auth/verify` | `{ success, user }` or 401 — use to validate a stored token on load |

### Writes (auth; ADMIN/ACCOUNTANT unless noted)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/data/<collection>/add` | one item `{...}` | Append; server stamps `schoolId` + `id` if missing. Send `X-Request-ID` for idempotency. 201. |
| POST | `/api/data/<collection>` | full array **or** config object | Record collections: replaces only this school's items. Config keys (`schoolInfo`, `feeConfig`, `settings`, `allClasses`, `departments`, `feedingConfig`, `currency`, `reportTemplates`, `attendance`): merged into this school's config. `users` is rejected. |
| POST | `/api/save-report` | report `{...}` | Create/update by `id` within the school. any role. |
| POST | `/api/expenditure` | `{ date, description, category, amount, approvedBy }` | Server assigns `id`/`schoolId`. `X-Request-ID` idempotent. |
| POST | `/api/upload-<asset>` | multipart file | e.g. `/api/upload-logo`. Stored at `/uploads/<schoolId>/...`; returns `{ url }` and saves it to `settings.<asset>Url`. |
| POST | `/api/users/activate` | `{ email, newPassword }` | **ADMIN** only; activates a pending user in the admin's own school. |
| DELETE | `/api/users/delete/<email>` | — | **ADMIN** only; same-school users; can't delete self. |
| DELETE | `/api/data/<collection>/<id>` (also `…/delete/<id>`) | — | Deletes by `id`/`sid` within the school. `users` rejected (use the route above). |

### SMS (per-school config; credentials may also be passed in the body)
`POST /api/send-sms` (Africa's Talking), `/api/send-sms-hubtel`, `/api/send-sms-arkesel` —
body `{ phone, message, ...providerKeys }` → `{ success, provider, data }`.

---

## Conventions
- Success: `2xx` with `{ "success": true, ... }`. Errors: `4xx/5xx` with `{ "error": "message" }` — surface `error` to the user.
- On any `401`, clear the session and redirect to login.
- Tenancy is transparent: never send a school id; the token carries it. On
  login/logout the frontend clears its cached collections so one school's data
  can't appear in another's session.
