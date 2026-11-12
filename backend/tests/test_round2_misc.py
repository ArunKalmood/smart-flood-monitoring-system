"""3.4 timestamps, 3.7 sensors, 3.9 notifications, 3.13 feedback, 3.18 volunteers/prefs, shared validation."""
from datetime import timedelta

import pytest
from sqlalchemy import text

from auth.device_keys import issue_device_key
from models.notification import Notification
from models.sensor import Sensor
from models.volunteer import Volunteer, VolunteerStatus
from utils.timeutil import utc_now


# ── 3.4 Timezone-aware serialization ──
def test_api_timestamps_have_utc_offset(client, headers_for):
    h = headers_for("public_user")
    sos = client.post("/api/sos/submit", data={"name": "Tz Test", "phone": "9876501234", "emergency_type": "flood"},
                      headers=h).json()
    assert sos["created_at"].endswith("+00:00")
    listed = client.get("/api/sos/", headers=h).json()["items"][0]
    assert listed["created_at"].endswith("+00:00")


def test_legacy_naive_rows_are_read_as_utc(client, db, headers_for):
    """Rows written before the change hold naive UTC text; they come back with +00:00."""
    _, h = None, headers_for("super_admin")
    db.execute(text("INSERT INTO sos_requests (name, phone, emergency_type, status, created_at) "
                    "VALUES ('Old Row', '9876543210', 'flood', 'PENDING', '2026-10-02 11:36:00.000000')"))
    db.commit()
    item = client.get("/api/sos/", headers=h).json()["items"][0]
    assert item["created_at"] == "2026-10-02T11:36:00+00:00"


# ── 3.7 Sensors ──
@pytest.fixture
def sensor(db):
    s = Sensor(sensor_id="SN-RAIN", name="Rain gauge", type="rainfall")
    key = issue_device_key(s)
    db.add(s)
    db.commit()
    return s, {"X-Device-Key": key}


def test_sensor_never_seen_is_offline_without_battery(client, sensor, headers_for):
    item = client.get("/api/sensors/", headers=headers_for("public_user")).json()[0]
    assert item["status"] == "offline"
    assert item["battery_level"] is None and item["unit"] is None and item["last_seen"] is None


def test_sensor_online_after_reading_and_offline_when_stale(client, db, sensor, headers_for):
    s, key = sensor
    h = headers_for("public_user")
    client.post("/api/sensors/data", json={"sensor_id": "SN-RAIN", "rainfall": 42.5, "water_level": 3.1,
                                           "battery_level": 77}, headers=key)
    item = client.get("/api/sensors/", headers=h).json()[0]
    assert item["status"] == "online"
    assert item["current_value"] == 42.5  # the rainfall reading, matching the sensor type
    assert item["battery_level"] == 77 and item["last_seen"].endswith("+00:00")

    s.last_seen = utc_now() - timedelta(days=20)
    db.commit()
    item = client.get("/api/sensors/", headers=h).json()[0]
    assert item["status"] == "offline"
    assert client.get("/api/dashboard/stats", headers=h).json()["sensors"]["online"] == 0


def test_dashboard_stats_use_real_readings_or_null(client, sensor, headers_for):
    h = headers_for("public_user")
    empty = client.get("/api/dashboard/stats", headers=h).json()
    assert empty["readings"]["water_level"] is None and empty["risk"] is None
    assert empty["water_level_change_24h"] is None

    client.post("/api/sensors/data", json={"sensor_id": "SN-RAIN", "water_level": 3.25, "rainfall": 10},
                headers=sensor[1])
    stats = client.get("/api/dashboard/stats", headers=h).json()
    assert stats["readings"]["water_level"]["value"] == 3.25
    assert stats["readings"]["recorded_at"].endswith("+00:00")


def test_water_trend_returns_iso_timestamps(client, sensor, headers_for):
    client.post("/api/sensors/data", json={"sensor_id": "SN-RAIN", "water_level": 2}, headers=sensor[1])
    rows = client.get("/api/dashboard/water-level-trend?hours=24", headers=headers_for("public_user")).json()
    assert len(rows) == 1 and rows[0]["recorded_at"].endswith("+00:00") and "time" not in rows[0]


# ── 3.9 Notifications ──
def test_notification_counts_are_consistent(client, db, make_account):
    user, h = make_account("public_user")
    for i, read in enumerate([False, False, True]):
        db.add(Notification(user_id=user.id, title=f"n{i}", message="m", is_read=read))
    db.commit()

    body = client.get("/api/notifications/", headers=h).json()
    assert (body["total"], body["unread_count"], len(body["notifications"])) == (3, 2, 3)
    unread_only = client.get("/api/notifications/?unread_only=true", headers=h).json()
    assert len(unread_only["notifications"]) == 2 and unread_only["total"] == 3

    first_unread = next(n for n in body["notifications"] if not n["is_read"])
    client.patch(f"/api/notifications/{first_unread['id']}/read", headers=h)
    assert client.get("/api/notifications/", headers=h).json()["unread_count"] == 1
    client.delete(f"/api/notifications/{first_unread['id']}", headers=h)
    body = client.get("/api/notifications/", headers=h).json()
    assert (body["total"], body["unread_count"]) == (2, 1)
    client.patch("/api/notifications/mark-all-read", headers=h)
    assert client.get("/api/notifications/", headers=h).json()["unread_count"] == 0


def test_notifications_older_than_account_are_hidden(client, db, make_account):
    """Orphans from a deleted account whose id was reused must not show up."""
    user, h = make_account("public_user")
    db.add(Notification(user_id=user.id, title="Test Alert", message="old",
                        created_at=user.created_at - timedelta(days=20)))
    db.commit()
    body = client.get("/api/notifications/", headers=h).json()
    assert (body["total"], body["unread_count"], body["notifications"]) == (0, 0, [])


# ── 3.13 Feedback linked to the account ──
def test_feedback_uses_account_identity(client, make_account, headers_for):
    user, h = make_account("public_user")
    res = client.post("/api/feedback/submit", headers=h, data={
        "title": "Drain blocked", "category": "infrastructure", "description": "Blocked drain near school",
        "user_name": "Someone Else", "user_email": "spoof@example.com"})
    assert res.status_code == 201
    fb = res.json()
    assert fb["user_id"] == user.id and fb["user_name"] == user.full_name and fb["user_email"] == user.email
    staff_item = client.get("/api/feedback/", headers=headers_for("government_authority")).json()["items"][0]
    assert staff_item["submitted_by"] == user.full_name


def test_feedback_category_validated(client, headers_for):
    res = client.post("/api/feedback/submit", headers=headers_for("public_user"),
                      data={"title": "Hello", "category": "Drainage", "description": "Some description"})
    assert res.status_code == 422


# ── 3.18 Volunteers: suspend / reinstate ──
def test_volunteer_suspend_and_reinstate(client, db, make_account, headers_for):
    vol_user, vol_h = make_account("volunteer")
    v = db.query(Volunteer).filter(Volunteer.email == vol_user.email).one()
    admin = headers_for("district_admin")

    assert client.patch(f"/api/volunteers/{v.id}/status?status=suspended", headers=admin).status_code == 200
    # Suspended volunteers lose volunteer powers immediately.
    assert client.patch("/api/sos/1/status", json={"status": "accepted"}, headers=vol_h).status_code == 403
    assert client.patch(f"/api/volunteers/{v.id}/status?status=approved", headers=admin).status_code == 200
    db.refresh(v)
    assert v.status == VolunteerStatus.APPROVED


def test_volunteer_invalid_transition(client, db, headers_for):
    v = Volunteer(full_name="P", email="p@example.com", phone="9876543210")
    db.add(v)
    db.commit()
    res = client.patch(f"/api/volunteers/{v.id}/status?status=suspended", headers=headers_for("super_admin"))
    assert res.status_code == 400


def test_volunteer_register_validates_phone_and_skills(client):
    base = {"full_name": "Ravi K", "email": "ravi@example.com", "phone": "9876543210", "skills": ["rescue"]}
    assert client.post("/api/volunteers/register", json={**base, "phone": "abc"}).status_code == 422
    assert client.post("/api/volunteers/register", json={**base, "skills": ["flying"]}).status_code == 422
    assert client.post("/api/volunteers/register", json=base).status_code == 201


# ── Shared password policy / profile prefs ──
@pytest.mark.parametrize("password", ["short1!", "alllowercase1!", "ALLUPPER1!", "NoDigits!!", "NoSpecial12"])
def test_password_policy_on_register_and_change(client, make_account, password):
    payload = {"full_name": "Asha", "email": "asha@example.com", "phone": "9876543210",
               "password": password, "confirm_password": password}
    assert client.post("/api/auth/register", json=payload).status_code == 422
    _, h = make_account("public_user")
    res = client.post("/api/auth/change-password", json={"current_password": "x", "new_password": password}, headers=h)
    assert res.status_code == 422


def test_notification_prefs_round_trip(client, headers_for):
    h = headers_for("district_admin")
    prefs = client.get("/api/users/profile", headers=h).json()["notification_prefs"]
    assert all(prefs.values())
    prefs["weather_alerts"] = False
    saved = client.put("/api/users/profile", json={"notification_prefs": prefs, "language": "hi"}, headers=h).json()
    assert saved["notification_prefs"]["weather_alerts"] is False and saved["language"] == "hi"
    assert client.get("/api/auth/me", headers=h).json()["notification_prefs"]["weather_alerts"] is False


def test_profile_cannot_change_role_or_email(client, make_account):
    user, h = make_account("public_user")
    res = client.put("/api/users/profile", json={"role": "government_authority", "email": "x@example.com"}, headers=h)
    assert res.status_code == 200
    assert res.json()["role"] == "public_user" and res.json()["email"] == user.email


# ── Public summary (3.5) ──
def test_public_summary_shape(client, db, sensor):
    client.post("/api/sensors/data", json={"sensor_id": "SN-RAIN", "water_level": 2.5}, headers=sensor[1])
    body = client.get("/api/public/summary").json()
    assert set(body) == {"sensors", "risk", "latest_reading", "alerts", "sos", "shelters", "volunteers"}
    assert body["latest_reading"]["water_level"] == 2.5
    assert body["latest_reading"]["recorded_at"].endswith("+00:00")
    assert body["risk"]["predicted_at"].endswith("+00:00")
    assert body["sensors"] == {"total": 1, "online": 1}
