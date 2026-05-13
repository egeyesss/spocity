"""Import the Celery app at Django startup so the `@shared_task` decorator
in core/tasks.py finds the app instance to register against."""

from .celery import app as celery_app

__all__ = ("celery_app",)
