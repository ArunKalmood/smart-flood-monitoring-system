"""1.6 — sensor ingestion needs a per-device key; readings are range-checked."""
import pytest

from auth.device_keys import issue_device_key
from models.flood_data import FloodData
from models.sensor import Sensor


@pytest.fixture
def device(db):
    """(sensor, key) for a registered sensor with a device key."""
    sensor = Sensor(sensor_id="SN-001", name="Gauge 1", type="water_level", unit="m")
    key = issue_device_key(sensor)
    db.add(sensor)
    db.commit()
    return sensor, key


def _post(client, key=None, **reading):
    body = {"sensor_id": "SN-001", "water_level": 3.2, "humidity": 70, **reading}
    headers = {"X-Device-Key": key} if key is not None else {}
    return client.post("/api/sensors/data", json=body, headers=headers)


def test_valid_key_accepted(client, db, device):
    _, key = device
    res = _post(client, key)
    assert res.status_code == 200
    assert db.query(FloodData).count() == 1


def test_missing_key_rejected(client, db, device):
    assert _post(client).status_code == 401
    assert db.query(FloodData).count() == 0


def test_wrong_key_rejected(client, device):
    assert _post(client, "not-the-key").status_code == 401


def test_key_for_other_sensor_rejected(client, db, device):
    other = Sensor(sensor_id="SN-002", name="Gauge 2")
    other_key = issue_device_key(other)
    db.add(other)
    db.commit()
    assert _post(client, other_key).status_code == 401  # body says SN-001, key belongs to SN-002


def test_unknown_sensor_not_auto_registered(client, db, device):
    _, key = device
    res = client.post("/api/sensors/data", json={"sensor_id": "SN-FAKE"}, headers={"X-Device-Key": key})
    assert res.status_code == 401
    assert db.query(Sensor).filter(Sensor.sensor_id == "SN-FAKE").first() is None


def test_missing_key_checked_before_body_validation(client, device):
    """An unauthenticated caller learns nothing about validation rules."""
    assert _post(client, water_level=-5).status_code == 401


@pytest.mark.parametrize("field,value", [
    ("water_level", -0.1), ("water_level", 51), ("humidity", 101), ("humidity", -1),
    ("battery_level", 120), ("rainfall", -3), ("temperature", 99), ("latitude", 91), ("longitude", -181),
])
def test_out_of_range_readings_rejected(client, db, device, field, value):
    _, key = device
    assert _post(client, key, **{field: value}).status_code == 422
    assert db.query(FloodData).count() == 0


def test_register_sensor_returns_key_once_and_never_leaks_hash(client, headers_for):
    h = headers_for("operations")
    res = client.post("/api/sensors/admin/register-sensor", json={"sensor_id": "SN-NEW", "name": "New"}, headers=h)
    assert res.status_code == 201
    key = res.json()["device_key"]
    assert len(key) >= 32 and "device_key_hash" not in res.json()

    ok = client.post("/api/sensors/data", json={"sensor_id": "SN-NEW", "water_level": 1}, headers={"X-Device-Key": key})
    assert ok.status_code == 200

    for path in ["/api/sensors/", "/api/sensors/dashboard"]:
        assert "device_key_hash" not in client.get(path, headers=h).text
    assert "device_key_hash" not in client.get("/api/reports/generate/sensor", headers=h).text


def test_rotate_key_invalidates_old_key(client, device, headers_for):
    sensor, old_key = device
    res = client.post(f"/api/sensors/admin/{sensor.id}/rotate-key", headers=headers_for("super_admin"))
    new_key = res.json()["device_key"]
    assert _post(client, old_key).status_code == 401
    assert _post(client, new_key).status_code == 200


def test_sensor_telemetry_coordinates_saved_to_sensor(client, db, device, headers_for):
    sensor, key = device
    assert sensor.latitude is None and sensor.longitude is None
    res = _post(client, key, latitude=13.0827, longitude=80.2707)
    assert res.status_code == 200
    db.refresh(sensor)
    assert sensor.latitude == 13.0827 and sensor.longitude == 80.2707

    # Verify serialized sensor endpoint exposes coordinates and readings
    h = headers_for("public_user")
    item = client.get(f"/api/sensors/{sensor.id}", headers=h).json()
    assert item["latitude"] == 13.0827 and item["longitude"] == 80.2707
    assert item["water_level"] == 3.2
    assert item["is_stale"] is False


def test_missing_coordinates_does_not_overwrite_existing(client, db, device):
    sensor, key = device
    sensor.latitude = 12.34
    sensor.longitude = 56.78
    db.commit()

    # Reading without coordinates should not wipe existing location
    res = _post(client, key, water_level=4.0)
    assert res.status_code == 200
    db.refresh(sensor)
    assert sensor.latitude == 12.34 and sensor.longitude == 56.78


def test_partial_coordinates_rejected_with_422(client, device):
    _, key = device
    assert _post(client, key, latitude=13.08).status_code == 422
    assert _post(client, key, longitude=80.27).status_code == 422


def test_sensor_serialization_fallback_to_flood_data(client, db, headers_for):
    s = Sensor(sensor_id="SN-FALLBACK", name="Fallback Sensor", type="water_level")
    db.add(s)
    db.flush()
    db.add(FloodData(sensor_id=s.id, latitude=14.05, longitude=79.95, water_level=2.8, rainfall=15.0))
    db.commit()

    h = headers_for("public_user")
    item = client.get(f"/api/sensors/{s.id}", headers=h).json()
    assert item["latitude"] == 14.05 and item["longitude"] == 79.95
    assert item["water_level"] == 2.8 and item["rainfall"] == 15.0
