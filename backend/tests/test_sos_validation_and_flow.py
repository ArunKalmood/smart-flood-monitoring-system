"""3.3 SOS validation and 3.12 status transitions with history."""
import pytest

from models.notification import Notification
from models.sos import SOS, SOSStatusHistory

VALID = {"name": "Asha Rao", "phone": "9876501234", "emergency_type": "flood",
         "latitude": "19.1", "longitude": "72.9", "description": "Water entering ground floor"}


def _submit(client, headers=None, files=None, **overrides):
    return client.post("/api/sos/submit", data={**VALID, **overrides}, headers=headers or {}, files=files)


@pytest.mark.parametrize("field,value", [
    ("phone", "abc"), ("phone", "12345"), ("phone", "5876501234"), ("phone", "+1 9876501234"),
    ("latitude", "999"), ("longitude", "999"), ("latitude", "-91"), ("longitude", "181"),
    ("emergency_type", "alien"), ("description", "x" * 1001), ("name", "A"),
])
def test_invalid_sos_rejected(client, db, headers_for, field, value):
    res = _submit(client, headers_for("public_user"), **{field: value})
    assert res.status_code == 422, res.text
    locs = [e["loc"] for e in res.json()["detail"]]
    assert ["body", field] in locs
    assert db.query(SOS).count() == 0


@pytest.mark.parametrize("phone", ["9876501234", "+919876501234", "+91 9876501234", "+91-9876501234"])
def test_valid_phone_formats(client, headers_for, phone):
    assert _submit(client, headers_for("public_user"), phone=phone).status_code == 201


def test_latitude_without_longitude_rejected(client, headers_for):
    assert _submit(client, headers_for("public_user"), longitude="").status_code == 422


def test_photo_must_be_an_image(client, headers_for):
    res = _submit(client, headers_for("public_user"), files={"photo": ("evil.exe", b"MZ...", "application/octet-stream")})
    assert res.status_code == 400


def test_photo_size_limit(client, headers_for):
    big = b"\xff\xd8" + b"0" * (5 * 1024 * 1024 + 10)
    res = _submit(client, headers_for("public_user"), files={"photo": ("big.jpg", big, "image/jpeg")})
    assert res.status_code == 413


@pytest.fixture
def pending_sos(client, make_account):
    owner, h = make_account("public_user")
    sos_id = _submit(client, h).json()["id"]
    return sos_id, owner, h


def _set(client, sos_id, status, headers, note=None):
    body = {"status": status} | ({"notes": note} if note else {})
    return client.patch(f"/api/sos/{sos_id}/status", json=body, headers=headers)


def test_full_status_flow_with_history(client, db, make_account, pending_sos):
    sos_id, _, _ = pending_sos
    admin, h = make_account("operations")
    for status in ["accepted", "in_progress", "rescued"]:
        res = _set(client, sos_id, status, h, note=f"now {status}")
        assert res.status_code == 200, res.text
        assert res.json()["status"] == status
        assert res.json()["last_change"]["changed_by"] == admin.name

    history = client.get(f"/api/sos/{sos_id}/history", headers=h).json()
    assert [(e["from_status"], e["to_status"]) for e in history] == [
        ("pending", "accepted"), ("accepted", "in_progress"), ("in_progress", "rescued")]
    assert all(e["changed_at"].endswith("+00:00") for e in history)
    assert history[1]["note"] == "now in_progress"


@pytest.mark.parametrize("path,bad", [
    (["accepted", "rescued"], "pending"),
    (["accepted", "rescued"], "accepted"),
    (["cancelled"], "accepted"),
    ([], "in_progress"),
])
def test_invalid_transitions_rejected(client, db, headers_for, pending_sos, path, bad):
    sos_id, _, _ = pending_sos
    h = headers_for("super_admin")
    for status in path:
        assert _set(client, sos_id, status, h).status_code == 200
    assert _set(client, sos_id, bad, h).status_code == 400
    assert db.query(SOSStatusHistory).count() == len(path)


def test_next_statuses_drive_the_buttons(client, headers_for, pending_sos):
    sos_id, _, owner_h = pending_sos
    staff = headers_for("government_authority")
    assert client.get(f"/api/sos/{sos_id}", headers=owner_h).json()["next_statuses"] == []
    assert client.get(f"/api/sos/{sos_id}", headers=staff).json()["next_statuses"] == ["accepted", "cancelled"]
    _set(client, sos_id, "accepted", staff)
    assert client.get(f"/api/sos/{sos_id}", headers=staff).json()["next_statuses"] == [
        "in_progress", "rescued", "resolved", "cancelled"]
    assert client.get(f"/api/sos/{sos_id}", headers=headers_for("analyst")).json()["next_statuses"] == []


def test_volunteer_sees_only_accept_on_pending(client, headers_for, pending_sos):
    sos_id, _, _ = pending_sos
    assert client.get(f"/api/sos/{sos_id}", headers=headers_for("volunteer")).json()["next_statuses"] == ["accepted"]


def test_status_change_notifies_submitter(client, db, headers_for, pending_sos):
    sos_id, owner, owner_h = pending_sos
    _set(client, sos_id, "accepted", headers_for("operations"))
    body = client.get("/api/notifications/", headers=owner_h).json()
    assert body["unread_count"] == 1 and body["total"] == 1
    assert body["notifications"][0]["type"] == "sos_update"


def test_status_change_respects_notification_preference(client, db, headers_for, pending_sos):
    sos_id, owner, owner_h = pending_sos
    prefs = {"flood_warnings": True, "sos_updates": False, "volunteer_updates": True,
             "weather_alerts": True, "system_messages": True}
    assert client.put("/api/users/profile", json={"notification_prefs": prefs}, headers=owner_h).status_code == 200
    _set(client, sos_id, "accepted", headers_for("operations"))
    assert db.query(Notification).count() == 0


def test_active_sos_definition_shared(client, headers_for, pending_sos):
    """Active = pending + accepted + in_progress, the same on the SOS page and the dashboard."""
    sos_id, _, owner_h = pending_sos
    staff = headers_for("super_admin")
    other = _submit(client, headers_for("public_user")).json()["id"]
    _set(client, sos_id, "accepted", staff)
    _set(client, sos_id, "in_progress", staff)
    _set(client, other, "cancelled", staff)

    assert client.get("/api/sos/stats", headers=staff).json()["active"] == 1
    assert client.get("/api/dashboard/stats", headers=staff).json()["active_sos"] == 1
    # The public owner only counts their own request.
    assert client.get("/api/dashboard/stats", headers=owner_h).json()["active_sos"] == 1
    assert client.get("/api/dashboard/stats", headers=headers_for("public_user")).json()["active_sos"] == 0
