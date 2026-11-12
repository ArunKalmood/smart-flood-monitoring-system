"""1.1 — public registration cannot grant elevated roles."""
import pytest

from models.user import User


def _payload(email, **extra):
    return {
        "full_name": "Asha Rao", "email": email, "phone": "9876543210",
        "password": "Str0ng!pass", "confirm_password": "Str0ng!pass", **extra,
    }


@pytest.mark.parametrize("role", ["admin", "government_authority", "super_admin", "district_admin", "anything"])
def test_register_rejects_elevated_role(client, db, role):
    email = f"esc.{role}@example.com"
    res = client.post("/api/auth/register", json=_payload(email, role=role))
    assert res.status_code == 422
    assert db.query(User).filter(User.email == email).first() is None


@pytest.mark.parametrize("role", ["public_user", "volunteer"])
def test_register_allows_self_assignable_roles(client, role):
    res = client.post("/api/auth/register", json=_payload(f"ok.{role}@example.com", role=role))
    assert res.status_code == 201
    assert res.json()["user"]["role"] == role


def test_register_defaults_to_public_user(client):
    res = client.post("/api/auth/register", json=_payload("default@example.com"))
    assert res.status_code == 201
    assert res.json()["user"]["role"] == "public_user"


def test_unapproved_volunteer_has_no_volunteer_powers(client, make_account):
    """A self-registered volunteer acts as public_user until their volunteer record is approved."""
    _, headers = make_account("volunteer", approved=False)
    assert client.patch("/api/sos/1/status", json={"status": "accepted"}, headers=headers).status_code == 403


def test_legacy_admin_user_role_grants_nothing(client, headers_for):
    """users.role = 'admin' (created by the old open registration) is not an admin."""
    headers = headers_for("admin")
    assert client.get("/api/volunteers/", headers=headers).status_code == 403
    assert client.delete("/api/evacuation-centers/1", headers=headers).status_code == 403


def test_super_admin_can_promote_user_to_government(client, make_account, headers_for):
    user, _ = make_account("public_user")
    res = client.patch(f"/api/users/admin/{user.id}/role", json={"role": "government_authority"},
                       headers=headers_for("super_admin"))
    assert res.status_code == 200
    assert res.json()["role"] == "government_authority"


@pytest.mark.parametrize("role", ["district_admin", "government_authority", "public_user"])
def test_only_super_admin_can_change_roles(client, make_account, headers_for, role):
    user, _ = make_account("public_user")
    res = client.patch(f"/api/users/admin/{user.id}/role", json={"role": "government_authority"},
                       headers=headers_for(role))
    assert res.status_code == 403


def test_role_change_cannot_assign_legacy_admin(client, make_account, headers_for):
    user, _ = make_account("public_user")
    res = client.patch(f"/api/users/admin/{user.id}/role", json={"role": "admin"},
                       headers=headers_for("super_admin"))
    assert res.status_code == 400
