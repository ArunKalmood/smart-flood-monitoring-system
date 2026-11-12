"""
Idempotent schema migrations for changes made after the initial release.

`Base.metadata.create_all()` creates missing tables but never alters existing
ones, so each change is applied here when absent. Safe to run repeatedly; runs
on every app start and from scripts/migrate.py.
"""
from sqlalchemy import inspect, text

from utils.timeutil import UTCDateTime

# (table, column, SQL type incl. default, index: None | "index" | "unique")
NEW_COLUMNS = [
    ("sos_requests", "user_id", "INTEGER", "index"),
    ("sos_requests", "accepted_by_user_id", "INTEGER", "index"),
    ("feedback", "user_id", "INTEGER", "index"),
    ("sensors", "device_key_hash", "VARCHAR(64)", "unique"),
    # Every prediction stored before `source` existed came from the manual
    # "Run Prediction" endpoint (no live pipeline existed), so they are simulations.
    ("predictions", "source", "VARCHAR(20) NOT NULL DEFAULT 'simulation'", "index"),
    ("predictions", "score", "INTEGER", None),
    ("users", "notification_prefs", "JSON", None),
    ("admins", "notification_prefs", "JSON", None),
    ("admins", "language", "VARCHAR(10) DEFAULT 'en'", None),
    ("admins", "theme", "VARCHAR(10) DEFAULT 'light'", None),
    ("users", "google_sub", "VARCHAR(255)", "unique"),
    ("users", "auth_provider", "VARCHAR(20) NOT NULL DEFAULT 'local'", None),
    ("users", "tokens_valid_after", "TIMESTAMP", None),
]

# PostgreSQL native enum types and the members added after release.
POSTGRES_ENUM_ADDITIONS = {
    "sosstatus": ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    "volunteerstatus": ["SUSPENDED"],
}


def _add_columns(conn, inspector, applied):
    for table, column, sql_type, index in NEW_COLUMNS:
        if not inspector.has_table(table):
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column not in existing:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
            applied.append(f"{table}.{column}")
        if index:
            unique = "UNIQUE " if index == "unique" else ""
            conn.execute(text(f"CREATE {unique}INDEX IF NOT EXISTS ix_{table}_{column} ON {table} ({column})"))


def _postgres_enums(conn, applied):
    for type_name, members in POSTGRES_ENUM_ADDITIONS.items():
        existing = {row[0] for row in conn.execute(text(
            "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :t"),
            {"t": type_name})}
        if not existing:
            continue  # type not created (yet)
        for member in members:
            if member not in existing:
                conn.execute(text(f"ALTER TYPE {type_name} ADD VALUE '{member}'"))
                applied.append(f"enum {type_name}.{member}")


def _postgres_timestamptz(conn, inspector, metadata, applied):
    """Convert naive TIMESTAMP columns (stored as UTC) to TIMESTAMP WITH TIME ZONE."""
    for table in metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        naive = {c["name"] for c in inspector.get_columns(table.name)
                 if getattr(c["type"], "timezone", None) is False}
        for column in table.columns:
            if isinstance(column.type, UTCDateTime) and column.name in naive:
                conn.execute(text(
                    f"ALTER TABLE {table.name} ALTER COLUMN {column.name} "
                    f"TYPE TIMESTAMP WITH TIME ZONE USING {column.name} AT TIME ZONE 'UTC'"
                ))
                applied.append(f"{table.name}.{column.name} -> timestamptz")


def run_migrations(engine, metadata=None) -> list:
    """Apply any missing changes. Returns a list of what was applied."""
    if metadata is None:
        import models  # noqa: F401  (registers every table)
        from database.connection import Base
        metadata = Base.metadata
    applied = []
    inspector = inspect(engine)
    with engine.begin() as conn:
        _add_columns(conn, inspector, applied)
        if engine.dialect.name == "postgresql":
            _postgres_enums(conn, applied)
            _postgres_timestamptz(conn, inspect(conn), metadata, applied)
    return applied
