"""1.5 — admin onboarding via single-use, hashed, expiring invites."""
from datetime import timedelta

from utils.timeutil import utc_now

from auth.invites import create_invite, hash_token
from models.admin import Admin, AdminRole
from models.admin_invite import AdminInvite


def _admin_payload(token, email="new.admin@example.com", **extra):
    return {"registration_token": token, "name": "New Admin", "email": email,
            "password": "Str0ng!pass", "confirm_password": "Str0ng!pass", **extra}


def test_old_four_digit_token_no_longer_works(client):
    assert client.post("/api/auth/verify-admin-token", json={"token": "1758"}).status_code == 400
    assert client.post("/api/auth/admin/register", json=_admin_payload("1758")).status_code == 400


def test_invite_token_is_long_and_stored_hashed(db):
    token, invite = create_invite(db, AdminRole.ANALYST)
    assert len(token) >= 32
    assert invite.token_hash == hash_token(token) != token


def test_verify_returns_invite_role(client, db):
    token, _ = create_invite(db, AdminRole.OPERATIONS)
    res = client.post("/api/auth/verify-admin-token", json={"token": token})
    assert res.status_code == 200
    assert res.json()["role"] == "operations"


def test_register_uses_invite_role_and_ignores_client_role(client, db):
    token, _ = create_invite(db, AdminRole.ANALYST)
    res = client.post("/api/auth/admin/register", json=_admin_payload(token, role="super_admin"))
    assert res.status_code == 201
    assert res.json()["admin"]["role"] == "analyst"


def test_admin_register_revalidates_token_server_side(client):
    """Skipping verify-admin-token and posting a made-up token fails."""
    res = client.post("/api/auth/admin/register", json=_admin_payload("x" * 43))
    assert res.status_code == 400


def test_invite_is_single_use(client, db):
    token, _ = create_invite(db, AdminRole.DISTRICT_ADMIN)
    assert client.post("/api/auth/admin/register", json=_admin_payload(token, "a1@example.com")).status_code == 201
    assert client.post("/api/auth/admin/register", json=_admin_payload(token, "a2@example.com")).status_code == 400
    assert client.post("/api/auth/verify-admin-token", json={"token": token}).status_code == 400
    assert db.query(Admin).count() == 1


def test_expired_invite_rejected(client, db):
    token, invite = create_invite(db, AdminRole.DISTRICT_ADMIN)
    invite.expires_at = utc_now() - timedelta(minutes=1)
    db.commit()
    assert client.post("/api/auth/admin/register", json=_admin_payload(token)).status_code == 400


def test_email_restricted_invite(client, db):
    token, _ = create_invite(db, AdminRole.DISTRICT_ADMIN, email="only.me@example.com")
    assert client.post("/api/auth/admin/register", json=_admin_payload(token, "other@example.com")).status_code == 400
    assert client.post("/api/auth/admin/register", json=_admin_payload(token, "only.me@example.com")).status_code == 201


def test_super_admin_creates_invite_via_api(client, db, headers_for):
    res = client.post("/api/auth/admin/invites", json={"role": "district_admin"}, headers=headers_for("super_admin"))
    assert res.status_code == 201
    token = res.json()["token"]
    assert client.post("/api/auth/admin/register", json=_admin_payload(token)).status_code == 201
    listed = client.get("/api/auth/admin/invites", headers=headers_for("super_admin")).json()
    assert listed[0]["status"] == "used" and "token" not in listed[0]
    assert db.query(AdminInvite).first().token_hash != token


def test_invite_endpoints_require_super_admin(client, headers_for):
    assert client.post("/api/auth/admin/invites", json={"role": "super_admin"}).status_code == 401
    for role in ["district_admin", "operations", "analyst", "government_authority", "public_user"]:
        h = headers_for(role)
        assert client.post("/api/auth/admin/invites", json={"role": "super_admin"}, headers=h).status_code == 403
        assert client.get("/api/auth/admin/invites", headers=h).status_code == 403
