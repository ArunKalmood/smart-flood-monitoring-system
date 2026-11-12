"""
Test fixtures. Every test runs against a fresh, throwaway SQLite database;
the dev database (floodmonitor.db) is never touched.
"""
import os
import sys
import tempfile

_TMP_DIR = tempfile.mkdtemp(prefix="floodmonitor-tests-")
# Must be set before the app (and its settings) are imported.
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_TMP_DIR, 'test.db')}"
os.environ["SECRET_KEY"] = "test-only-jwt-signing-value-0123456789abcdefghijklmnop"
os.environ["RATE_LIMIT_ENABLED"] = "true"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

import pytest
from fastapi.testclient import TestClient

from main import app
from auth.jwt_handler import create_access_token, create_refresh_token
from database.connection import Base, SessionLocal, engine
from database.migrations import run_migrations
from models.admin import Admin, AdminRole
from models.user import User, UserRole
from models.volunteer import Volunteer, VolunteerStatus
from utils.rate_limit import limiter

ADMIN_ROLE_NAMES = {r.value for r in AdminRole}


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    yield


@pytest.fixture(autouse=True)
def no_rate_limit():
    """Rate limiting is off by default in tests; tests/test_rate_limit.py turns it on."""
    limiter.reset()
    limiter.enabled = False
    yield
    limiter.enabled = False
    limiter.reset()


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


_counter = {"n": 0}


def _unique_email(prefix):
    _counter["n"] += 1
    return f"{prefix}.{_counter['n']}@example.com"


@pytest.fixture
def make_account(db):
    """
    make_account(role) -> (account, auth_headers)

    `role` is any user role (public_user, volunteer, government_authority, admin)
    or admin role (super_admin, district_admin, operations, analyst).
    Volunteers are approved unless approved=False.
    """
    def _make(role, approved=True, email=None):
        email = email or _unique_email(role)
        if role in ADMIN_ROLE_NAMES:
            acct = Admin(name=f"Test {role}", email=email, password_hash="x", role=AdminRole(role))
            user_type = "admin"
        else:
            acct = User(full_name=f"Test {role}", email=email, phone="9876543210",
                        password_hash="x", role=UserRole(role))
            user_type = "user"
            if role == "volunteer":
                db.add(Volunteer(full_name=acct.full_name, email=email, phone="9876543210",
                                 status=VolunteerStatus.APPROVED if approved else VolunteerStatus.PENDING))
        db.add(acct)
        db.commit()
        db.refresh(acct)
        token = create_access_token({"sub": str(acct.id), "user_type": user_type, "role": role})
        return acct, {"Authorization": f"Bearer {token}"}
    return _make


@pytest.fixture
def headers_for(make_account):
    """headers_for(role) -> auth headers for a new account with that role."""
    return lambda role, **kw: make_account(role, **kw)[1]


def refresh_headers(account, user_type="user"):
    token = create_refresh_token({"sub": str(account.id), "user_type": user_type})
    return {"Authorization": f"Bearer {token}"}
