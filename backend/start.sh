#!/usr/bin/env sh
# Production entrypoint (Railway). A real script file avoids Railway's
# start-command parsing quirks (inline `migrate && gunicorn` wedged startup
# and `$PORT` didn't expand). Port is fixed at 8080 to match the domain.
set -e
python manage.py migrate --noinput
exec gunicorn spocity.wsgi \
  --bind 0.0.0.0:8080 \
  --workers 2 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
