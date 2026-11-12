"""Token hardening, notification ownership, public summary, rate limiting, config."""
import pytest
from pydantic import ValidationError

from auth.jwt_handler import hash_password
from models.notification import Notification
from models.user import User, UserRole
from utils.config import Settings
from utils.rate_limit import limiter
from tests.conftest import refresh_headers


# ── Tokens ──
def test_refresh_token_cannot_be_used_as_access_token(client, make_account):
    user, _ = make_account("public_user")
    assert client.get("/api/sos/", headers=refresh_headers(user)).status_code == 401


def test_deactivated_account_token_rejected(client, db, make_account):
    user, headers = make_account("government_authority")
    user.is_active = False
    db.commit()
    assert client.get("/api/sos/", headers=headers).status_code == 401


def test_forged_token_rejected(client):
    from jose import jwt
    forged = jwt.encode({"sub": "1", "user_type": "admin", "role": "super_admin", "type": "access"},
                        "change-this-super-secret-key-in-production", algorithm="HS256")
    assert client.get("/api/audit/", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


@pytest.mark.parametrize("secret", ["", "short", "your-super-secret-key-change-this-in-production",
                                    "change-this-super-secret-key-in-production"])
def test_weak_secret_key_refused(secret):
    with pytest.raises(ValidationError):
        Settings(SECRET_KEY=secret)


# ── Notifications ──
def test_cannot_read_or_delete_others_notifications(client, db, make_account):
    alice, h_alice = make_account("public_user")
    _, h_bob = make_account("public_user")
    n = Notification(user_id=alice.id, title="Hi", message="Only for Alice")
    db.add(n)
    db.commit()
    assert client.patch(f"/api/notifications/{n.id}/read", headers=h_bob).status_code == 404
    assert client.delete(f"/api/notifications/{n.id}", headers=h_bob).status_code == 404
    db.refresh(n)
    assert n.is_read is False
    assert client.patch(f"/api/notifications/{n.id}/read", headers=h_alice).status_code == 200


# ── Public summary ──
def test_public_summary_is_anonymous_and_has_no_pii(client):
    client.post("/api/sos/submit", data={"name": "Secret Name", "phone": "9876501234", "emergency_type": "flood",
                                         "latitude": "19.123", "longitude": "72.456"})
    res = client.get("/api/public/summary")
    assert res.status_code == 200
    body = res.text
    assert res.json()["sos"]["active"] == 1
    for leaked in ["Secret Name", "9876501234", "19.123", "72.456", "email", "phone"]:
        assert leaked not in body


# ── Rate limiting ──
@pytest.fixture
def rate_limited():
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.enabled = False


@pytest.mark.parametrize("path,body", [
    ("/api/auth/login", {"email": "x@example.com", "password": "wrong"}),
    ("/api/auth/admin/login", {"email": "x@example.com", "password": "wrong"}),
    ("/api/auth/verify-admin-token", {"token": "guess"}),
    ("/api/auth/admin/register", {"registration_token": "guess", "name": "Guess", "email": "x@example.com",
                                  "password": "Str0ng!pass", "confirm_password": "Str0ng!pass"}),
])
def test_auth_endpoints_rate_limited(client, rate_limited, path, body):
    codes = [client.post(path, json=body).status_code for _ in range(6)]
    assert 429 not in codes[:5]
    assert codes[5] == 429


def test_rate_limit_blocks_correct_password_too(client, db, rate_limited):
    db.add(User(full_name="U", email="u@example.com", phone="9876543210",
                password_hash=hash_password("Right!pass1"), role=UserRole.PUBLIC))
    db.commit()
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "u@example.com", "password": "wrong"})
    res = client.post("/api/auth/login", json={"email": "u@example.com", "password": "Right!pass1"})
    assert res.status_code == 429
    assert "detail" in res.json()
