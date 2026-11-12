import time
from datetime import timedelta
from unittest.mock import patch
import pytest

from auth.jwt_handler import create_access_token, create_refresh_token, verify_password, verify_refresh_token
from models.admin import Admin, AdminRole
from models.audit_log import AuditLog
from models.user import User, UserRole
from utils.config import settings
from utils.timeutil import utc_now


def _mock_google_token(
    sub="google-sub-123",
    email="citizen@example.com",
    name="Test Citizen",
    picture="https://example.com/pic.jpg",
    email_verified=True,
):
    return {
        "sub": sub,
        "email": email,
        "name": name,
        "picture": picture,
        "email_verified": email_verified,
        "aud": "mock-client-id",
        "iss": "https://accounts.google.com",
    }


@pytest.fixture
def with_google_client_id(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "mock-google-client-id.apps.googleusercontent.com")


# ── Configuration & Token Verification Guards ──

def test_google_auth_missing_client_id_returns_503(client, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    res = client.post("/api/auth/google", json={"credential": "some-token"})
    assert res.status_code == 503
    assert "Google Sign-In is not configured" in res.json()["detail"]


def test_google_auth_invalid_token_returns_401(client, with_google_client_id):
    with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Token expired")):
        res = client.post("/api/auth/google", json={"credential": "expired-token"})
        assert res.status_code == 401
        assert "Invalid Google token" in res.json()["detail"]


def test_google_auth_missing_sub_returns_401(client, with_google_client_id):
    claims = _mock_google_token(sub="")
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 401
        assert "missing sub" in res.json()["detail"]


def test_google_auth_missing_email_returns_400(client, with_google_client_id):
    claims = _mock_google_token()
    claims["email"] = ""
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 400
        assert "does not provide an email address" in res.json()["detail"]


def test_google_auth_unverified_email_returns_400(client, with_google_client_id):
    claims = _mock_google_token(email_verified=False)
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 400
        assert "Google email is not verified" in res.json()["detail"]


# ── Admin Account Collision ──

def test_google_auth_rejects_admin_email(client, db, with_google_client_id):
    admin = Admin(
        name="Super Admin",
        email="admin@example.com",
        password_hash="some-hash",
        role=AdminRole.SUPER_ADMIN,
    )
    db.add(admin)
    db.commit()

    claims = _mock_google_token(email="ADMIN@example.com")  # case-insensitive check
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 400
        assert "registered to an administrator account" in res.json()["detail"]


# ── New User Registration ──

def test_google_auth_registers_new_user(client, db, with_google_client_id):
    claims = _mock_google_token(
        sub="g-sub-999",
        email="New.Citizen@example.com",
        name="New Citizen",
        picture="https://example.com/avatar.jpg",
    )
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 200
        body = res.json()
        assert "access_token" in body
        assert "refresh_token" in body
        user_info = body["user"]
        assert user_info["email"] == "new.citizen@example.com"
        assert user_info["full_name"] == "New Citizen"
        assert user_info["phone"] == ""
        assert user_info["is_verified"] is True
        assert user_info["auth_provider"] == "google"
        # Ensure security fields are not leaked in serialization
        assert "google_sub" not in user_info
        assert "tokens_valid_after" not in user_info

        # Verify DB state
        user = db.query(User).filter(User.google_sub == "g-sub-999").first()
        assert user is not None
        assert user.email == "new.citizen@example.com"
        assert user.phone == ""
        assert user.profile_photo == "https://example.com/avatar.jpg"
        assert user.auth_provider == "google"

        # Verify audit log
        audit = db.query(AuditLog).filter(AuditLog.action == "USER_REGISTER_GOOGLE").first()
        assert audit is not None
        assert audit.actor_id == user.id


def test_google_auth_new_user_name_fallback_to_email_prefix(client, db, with_google_client_id):
    claims = _mock_google_token(sub="g-sub-noname", email="noname.user@example.com", name="")
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 200
        assert res.json()["user"]["full_name"] == "noname.user"


# ── Returning Google User (Sub Match) ──

def test_google_auth_returning_user_sub_match(client, db, with_google_client_id):
    user = User(
        full_name="Returning User",
        email="returning@example.com",
        phone="",
        password_hash="dummy-hash",
        google_sub="g-sub-existing",
        auth_provider="google",
        is_verified=True,
        profile_photo=None,
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()

    claims = _mock_google_token(
        sub="g-sub-existing",
        email="returning@example.com",
        picture="https://example.com/new-pic.png",
    )
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 200
        db.refresh(user)
        assert user.profile_photo == "https://example.com/new-pic.png"
        assert user.last_login is not None


def test_google_auth_deactivated_user_rejected(client, db, with_google_client_id):
    user = User(
        full_name="Inactive User",
        email="inactive@example.com",
        phone="",
        password_hash="dummy-hash",
        google_sub="g-sub-inactive",
        auth_provider="google",
        is_active=False,
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()

    claims = _mock_google_token(sub="g-sub-inactive", email="inactive@example.com")
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 403
        assert "deactivated" in res.json()["detail"].lower()


# ── Account Linking & Token Revocation ──

def test_google_auth_link_local_account_and_revoke_tokens(client, db, with_google_client_id):
    from auth.jwt_handler import hash_password

    original_pw = "OldSecurePassword123!"
    user = User(
        full_name="Local User",
        email="local.citizen@example.com",
        phone="9876543210",
        password_hash=hash_password(original_pw),
        auth_provider="local",
        is_verified=False,
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Issue access and refresh tokens BEFORE linking (with iat before linking time)
    before_time = utc_now() - timedelta(seconds=10)
    with patch("auth.jwt_handler.utc_now", return_value=before_time):
        old_access = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
        old_refresh = create_refresh_token({"sub": str(user.id), "user_type": "user"})

    # Verify old access token works before linking
    res_before = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_access}"})
    assert res_before.status_code == 200

    # Perform Google Sign-In with matching email (mixed case)
    claims = _mock_google_token(
        sub="g-sub-link-1",
        email="LOCAL.CITIZEN@example.com",
        name="Local User Google",
        picture="https://example.com/avatar.jpg",
    )
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 200
        new_tokens = res.json()
        new_access = new_tokens["access_token"]
        new_refresh = new_tokens["refresh_token"]

    db.refresh(user)
    assert user.auth_provider == "google"
    assert user.google_sub == "g-sub-link-1"
    assert user.is_verified is True
    assert user.profile_photo == "https://example.com/avatar.jpg"
    assert user.tokens_valid_after is not None

    # Verify old password is replaced and invalid
    assert not verify_password(original_pw, user.password_hash)

    # Verify old access token is REJECTED (401)
    res_old = client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_access}"})
    assert res_old.status_code == 401

    # Verify old refresh token is REJECTED
    assert verify_refresh_token(old_refresh, db) is None

    # Verify new access token WORKS (200)
    res_new = client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert res_new.status_code == 200

    # Verify new refresh token is VALID
    assert verify_refresh_token(new_refresh, db) is not None

    # Verify audit log
    audit = db.query(AuditLog).filter(
        AuditLog.action == "USER_GOOGLE_LINKED",
        AuditLog.actor_id == user.id
    ).first()
    assert audit is not None


def test_google_auth_rejects_different_google_sub_for_same_email(client, db, with_google_client_id):
    user = User(
        full_name="Google Citizen",
        email="citizen.sub@example.com",
        phone="",
        password_hash="dummy-hash",
        google_sub="g-sub-original",
        auth_provider="google",
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()

    claims = _mock_google_token(sub="g-sub-different", email="citizen.sub@example.com")
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=claims):
        res = client.post("/api/auth/google", json={"credential": "mock-token"})
        assert res.status_code == 400
        assert "different Google account" in res.json()["detail"]


# ── Password & Change-Password Guards ──

def test_google_user_cannot_login_with_password(client, db):
    user = User(
        full_name="Google User",
        email="google.user@example.com",
        phone="",
        password_hash="some-hash",
        google_sub="g-sub-pw",
        auth_provider="google",
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()

    res = client.post("/api/auth/login", json={"email": "google.user@example.com", "password": "AnyPassword123!"})
    assert res.status_code == 400
    assert "registered with Google" in res.json()["detail"]


def test_google_user_cannot_change_password(client, db):
    user = User(
        full_name="Google User",
        email="change.pw@example.com",
        phone="",
        password_hash="some-hash",
        google_sub="g-sub-cpw",
        auth_provider="google",
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    res = client.post(
        "/api/auth/change-password",
        json={"current_password": "CurrentPassword123!", "new_password": "NewPassword123!"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "registered with Google" in res.json()["detail"]


# ── Profile Update: Phone Handling ──

def test_google_user_profile_update_blank_phone(client, db):
    user = User(
        full_name="Google Citizen",
        email="profile.test@example.com",
        phone="",
        password_hash="hash",
        google_sub="g-sub-prof",
        auth_provider="google",
        role=UserRole.PUBLIC,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "user_type": "user", "role": user.role.value})
    headers = {"Authorization": f"Bearer {token}"}

    # Updating with empty string / None for phone should convert to "" and succeed
    res = client.put(
        "/api/users/profile",
        json={"full_name": "Updated Citizen Name", "phone": ""},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Updated Citizen Name"
    assert data["phone"] == ""
    assert data["auth_provider"] == "google"

    db.refresh(user)
    assert user.phone == ""
