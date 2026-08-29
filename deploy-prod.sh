#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env with PA_USERNAME and PA_API_TOKEN" >&2
  exit 1
fi

set -a
source .env
set +a

: "${PA_USERNAME:?PA_USERNAME must be set}"
: "${PA_API_TOKEN:?PA_API_TOKEN must be set}"

echo "Backing up database..."
python3 backend/backup.py

echo "Uploading backend/server.py to PythonAnywhere..."
api="https://www.pythonanywhere.com/api/v0/user/${PA_USERNAME}"
curl --fail-with-body --silent --show-error \
  -H "Authorization: Token ${PA_API_TOKEN}" \
  -F "content=@backend/server.py;type=text/x-python" \
  "${api}/files/path/home/${PA_USERNAME}/backend/server.py"

echo "Installing PythonAnywhere WSGI bridge..."
curl --fail-with-body --silent --show-error \
  -H "Authorization: Token ${PA_API_TOKEN}" \
  -F "content=@backend/wsgi.py;type=text/x-python" \
  "${api}/files/path/var/www/${PA_USERNAME}_pythonanywhere_com_wsgi.py"

echo "Reloading PythonAnywhere web app..."
curl --fail-with-body --silent --show-error \
  -X POST \
  -H "Authorization: Token ${PA_API_TOKEN}" \
  "${api}/webapps/${PA_USERNAME}.pythonanywhere.com/reload/"

echo "Production backend source deployment complete: https://${PA_USERNAME}.pythonanywhere.com"
