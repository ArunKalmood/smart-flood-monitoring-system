"""
Apply schema migrations (new tables + new columns). Idempotent; also runs on app start.

    venv/bin/python scripts/migrate.py
"""
import _bootstrap  # noqa: F401

from database.connection import Base, engine
from database.migrations import run_migrations
import models  # noqa: F401  (registers all tables)

Base.metadata.create_all(bind=engine)
applied = run_migrations(engine)
print("Added columns: " + ", ".join(applied) if applied else "Schema already up to date.")
