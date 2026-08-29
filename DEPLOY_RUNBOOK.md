# School ERP Deployment Runbook

`backend/server.py` is the only supported backend entry point. The legacy
`backend/flask_app.py` files remain for reference but are not run or deployed.

## Local Development

Requirements: Node.js 20+ and Python 3.10+.

```bash
npm ci
npm run server
npm run dev
```

The backend runs on `http://127.0.0.1:8081`. The frontend runs on Vite's
configured port `3001` and proxies `/api` and `/uploads/` to the backend. Set
`VITE_PROXY_TARGET` only when a different local backend URL is required.

Run the same backend checks used by CI:

```bash
python3 -m py_compile backend/server.py
python3 -c "import backend.server"
python3 -m unittest backend.tests.server_foundation_tests
npm run build
```

## Production Configuration

Configure production values in the hosting providers, not in this repository.
No secret values are required at frontend build time.

- `VITE_BACKEND_URL`: public production API base, normally ending in `/api`.
  Configure it in the Vercel production environment. If omitted, the frontend
  uses relative `/api` URLs, which requires a same-origin API proxy outside this
  repository.
- `SESSION_SECRET`: required backend secret for stable signed sessions.
- `ALLOWED_DOMAINS` and `ALLOWED_ORIGINS`: production host and frontend origin.
- `PORT`: assigned by process-based hosts. Local scripts set it to `8081`.
- SMS and SMTP variables are optional and only needed for those integrations.

Back up persistent data before deployment:

```bash
python3 backend/backup.py
```

## Continuous Integration

Pull requests and pushes to `main` perform deterministic `npm ci` installation,
build the root frontend, compile and import `backend/server.py`, and run
`backend.tests.server_foundation_tests`. Every check is blocking.

Pushes to `main` then:

1. Upload `backend/server.py` and install `backend/wsgi.py` as the
   PythonAnywhere WSGI entrypoint, then reload the web app.
2. Build and deploy the root Vercel project using its production environment.
3. Verify that the PythonAnywhere login endpoint returns the expected response.

The workflow uses the existing `PA_USERNAME`, `PA_API_TOKEN`, `VERCEL_TOKEN`,
`VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` GitHub secrets. It does not provide or
generate application secrets.

## PythonAnywhere WSGI

`backend/wsgi.py` is the supported PythonAnywhere bridge. CI installs it at
`/var/www/$PA_USERNAME_pythonanywhere_com_wsgi.py`; it imports the same
`backend/server.py` used locally and adapts WSGI requests to `APIHandler`.
Set `PA_BACKEND_PATH` only if the backend is installed outside
`/home/$PA_USERNAME/backend`.

## Vercel SPA

The supported Vercel project root is the repository root. Root `vercel.json`
builds to `frontend/dist` and rewrites non-file routes to `/index.html` for SPA
navigation. `backend/vercel.json` is retained only as a marker that the backend
directory is not a Vercel application.

## Rollback

1. Revert the failed commit with `git revert <commit>` and push `main`.
2. Let the blocking CI checks and deployment jobs complete.
3. Restore `backend/data.json` from the latest verified backup only if the data
   itself was damaged.
