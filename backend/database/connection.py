from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from utils.config import settings

# SQLite doesn't support pool_size/max_overflow; PostgreSQL/MySQL do
_url = settings.DATABASE_URL
_is_sqlite = _url.startswith("sqlite")

_engine_kwargs = {"pool_pre_ping": True}
if not _is_sqlite:
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20
else:
    # Required for SQLite with multiple threads (FastAPI uses thread pool)
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(_url, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    import models  # noqa: F401  (registers every table on Base.metadata)
    from database.migrations import run_migrations
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
