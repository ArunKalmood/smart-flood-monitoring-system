"""3.2 — what-if simulations never change the live risk."""
import pytest
from sqlalchemy import create_engine, text

from auth.device_keys import issue_device_key
from database.migrations import run_migrations
from models.flood_data import Prediction
from models.sensor import Sensor

DANGER_INPUTS = {"water_level": 14, "rainfall": 190, "temperature": 30, "humidity": 95, "river_flow": 4}
SAFE_INPUTS = {"water_level": 1, "rainfall": 0, "temperature": 25, "humidity": 40}


@pytest.fixture
def device(db):
    sensor = Sensor(sensor_id="SN-LIVE", name="Live gauge", type="water_level", unit="m")
    key = issue_device_key(sensor)
    db.add(sensor)
    db.commit()
    return {"X-Device-Key": key}


def _risk(client, headers):
    return client.get("/api/dashboard/stats", headers=headers).json()["risk"]


def test_simulation_is_saved_as_simulation(client, db, headers_for):
    res = client.post("/api/predictions/predict", json=DANGER_INPUTS, headers=headers_for("public_user"))
    assert res.status_code == 200
    assert res.json()["risk_level"] == "danger" and res.json()["source"] == "simulation"
    assert db.query(Prediction).one().source == "simulation"


def test_simulation_does_not_create_live_risk(client, headers_for):
    h = headers_for("public_user")
    client.post("/api/predictions/predict", json=DANGER_INPUTS, headers=h)
    assert _risk(client, h) is None
    assert client.get("/api/public/summary").json()["risk"] is None


def test_simulation_does_not_change_existing_live_risk(client, device, headers_for):
    h = headers_for("public_user")
    client.post("/api/sensors/data", json={"sensor_id": "SN-LIVE", "water_level": 1.0, "humidity": 40}, headers=device)
    live = _risk(client, h)
    assert live["level"] == "safe"

    client.post("/api/predictions/predict", json=DANGER_INPUTS, headers=h)
    assert _risk(client, h) == live
    assert client.get("/api/public/summary").json()["risk"]["level"] == "safe"

    client.post("/api/predictions/predict", json=SAFE_INPUTS, headers=h)
    assert _risk(client, h) == live


def test_sensor_reading_creates_live_prediction(client, db, device, headers_for):
    res = client.post("/api/sensors/data", json={"sensor_id": "SN-LIVE", "water_level": 9.0, "rainfall": 120},
                      headers=device)
    assert res.json()["risk_level"] == "danger"
    assert db.query(Prediction).one().source == "live"
    assert _risk(client, headers_for("public_user"))["level"] == "danger"


def test_history_stats_and_daily_default_to_live(client, device, headers_for):
    h = headers_for("analyst")
    client.post("/api/predictions/predict", json=DANGER_INPUTS, headers=h)
    client.post("/api/sensors/data", json={"sensor_id": "SN-LIVE", "water_level": 1.0}, headers=device)
    assert [p["source"] for p in client.get("/api/predictions/history", headers=h).json()] == ["live"]
    stats = client.get("/api/predictions/stats", headers=h).json()
    assert stats["total"] == 1 and stats["safe"] == 1 and stats["danger"] == 0
    assert set(stats["model_info"]["feature_weights"]) == {"water_level", "rainfall", "humidity", "temperature", "river_flow"}
    daily = client.get("/api/predictions/daily?days=14&utc_offset_minutes=330", headers=h).json()
    assert len(daily) == 14 and sum(d["safe"] for d in daily) == 1


def test_river_flow_affects_prediction(client, headers_for):
    h = headers_for("public_user")
    base = {"water_level": 6, "rainfall": 0, "temperature": 25, "humidity": 50}
    low = client.post("/api/predictions/predict", json={**base, "river_flow": 0.5}, headers=h).json()
    high = client.post("/api/predictions/predict", json={**base, "river_flow": 3.5}, headers=h).json()
    assert high["score"] == low["score"] + 10
    assert high["features"]["river_flow"] == 3.5


def test_simulation_inputs_are_range_checked(client, headers_for):
    res = client.post("/api/predictions/predict", json={**SAFE_INPUTS, "humidity": 150}, headers=headers_for("public_user"))
    assert res.status_code == 422


def test_migration_marks_old_predictions_as_simulation(tmp_path):
    """Rows that existed before the `source` column are all manual runs → 'simulation'."""
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE predictions (id INTEGER PRIMARY KEY, risk_level VARCHAR(20), predicted_at DATETIME)"))
        conn.execute(text("INSERT INTO predictions (risk_level, predicted_at) VALUES ('danger', '2026-10-02 11:38:43')"))
    applied = run_migrations(engine)
    assert "predictions.source" in applied
    with engine.connect() as conn:
        assert conn.execute(text("SELECT source FROM predictions")).scalar() == "simulation"
    assert "predictions.source" not in run_migrations(engine)  # idempotent
