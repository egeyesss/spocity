"""Celery app config for Spocity.

`celery -A spocity worker` and `celery -A spocity beat` both find their app
through this module. The Django settings prefix (`CELERY_`) is read by
`config_from_object(... namespace="CELERY")`, so all Celery settings live
in `spocity/settings.py` next to everything else.
"""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "spocity.settings")

app = Celery("spocity")
app.config_from_object("django.conf:settings", namespace="CELERY")
# Auto-discover tasks.py in every installed app (currently just `core`).
app.autodiscover_tasks()


@app.task(name="spocity.debug_add")
def add(x: int, y: int) -> int:
    """Smoke-test task — `add.delay(2, 3).get()` should return 5 once
    a worker is running. Kept around as a "is Celery alive?" probe."""
    return x + y
