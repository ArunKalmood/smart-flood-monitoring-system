"""Section 4 — scripts/cleanup_qa_data.py removes exactly the QA/seed rows."""
import os
import sys

from models.evacuation_center import EvacuationCenter
from models.feedback import Feedback
from models.flood_data import Prediction
from models.notification import Notification
from models.sensor import Sensor
from models.sos import SOS
from models.user import User, UserRole

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import cleanup_qa_data  # noqa: E402


def test_cleanup_removes_qa_rows_and_keeps_real_ones(db, monkeypatch):
    real = User(full_name="Real Person", email="real@example.com", phone="9876543210", password_hash="x",
                role=UserRole.PUBLIC)
    qa = User(full_name="QA", email="qa.retest1@example.com", phone="9876543210", password_hash="x",
              role=UserRole.PUBLIC)
    db.add_all([real, qa])
    db.flush()
    db.add_all([
        SOS(name="QA RETEST - ignore", phone="abc", emergency_type="rescue", user_id=qa.id),
        SOS(name="Real caller", phone="9876543210", emergency_type="flood", user_id=real.id),
        Feedback(title="QA TEST - ignore", category="general", description="x"),
        Feedback(title="Blocked storm drain", category="infrastructure", description="x"),
        Feedback(title="Blocked storm drain", category="infrastructure", description="x"),
        Prediction(risk_level="danger", source="simulation"),
        Prediction(risk_level="safe", source="live"),
        Notification(user_id=qa.id, title="Test Alert", message="x"),
        EvacuationCenter(name="Community Center Shelter"),
        EvacuationCenter(name="Community Center Shelter"),
        EvacuationCenter(name="Test Empty Lat Lng Center"),
        Sensor(sensor_id="SN-NEVER", name="Never seen", battery_level=100.0),
    ])
    db.commit()

    monkeypatch.setattr(sys, "argv", ["cleanup_qa_data.py", "--yes"])
    cleanup_qa_data.main()
    db.expire_all()

    assert [u.email for u in db.query(User).all()] == ["real@example.com"]
    assert [s.name for s in db.query(SOS).all()] == ["Real caller"]
    assert [f.title for f in db.query(Feedback).all()] == ["Blocked storm drain"]
    assert [p.source for p in db.query(Prediction).all()] == ["live"]
    assert db.query(Notification).count() == 0
    assert [c.name for c in db.query(EvacuationCenter).all()] == ["Community Center Shelter"]
    assert db.query(Sensor).one().battery_level is None
