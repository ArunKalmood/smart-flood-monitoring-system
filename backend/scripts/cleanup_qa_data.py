"""
Remove QA/test records and duplicated demo rows from the database.

    venv/bin/python scripts/cleanup_qa_data.py          # show what would be removed, then ask
    venv/bin/python scripts/cleanup_qa_data.py --yes    # remove without asking

Everything is listed before anything is deleted, and it all runs in one
transaction. Audit-log entries are kept (the audit trail is append-only).
"""
import argparse

import _bootstrap  # noqa: F401

from sqlalchemy import or_

from database.connection import SessionLocal, create_tables
from models.admin import Admin
from models.admin_invite import AdminInvite
from models.evacuation_center import Alert, EvacuationCenter, Resource
from models.feedback import Feedback
from models.flood_data import Prediction
from models.notification import Notification
from models.sensor import Sensor
from models.sos import SOS, SOSStatusHistory
from models.user import User

QA_USER_EMAILS = [
    "qa.tester1@example.com", "qa.retest1@example.com", "qa.role.admin@example.com",
    "qa.role.government_authority@example.com", "qa.role2.admin@example.com",
]
QA_ADMIN_EMAILS = ["qa.admin1@example.com"]
SEED_NOTIFICATION_TITLES = ["Test Alert"]
SEED_CENTER_NAMES = ["Test Empty Lat Lng Center"]


def duplicates(db, model, key_column):
    """Every row whose key value already appeared on a lower id (keeps the first of each)."""
    seen, dupes = set(), []
    for row in db.query(model).order_by(model.id).all():
        key = getattr(row, key_column)
        if key in seen:
            dupes.append(row)
        seen.add(key)
    return dupes


def build_plan(db):
    users = db.query(User).filter(User.email.in_(QA_USER_EMAILS)).all()
    admins = db.query(Admin).filter(Admin.email.in_(QA_ADMIN_EMAILS)).all()
    user_ids = [u.id for u in users]
    admin_ids = [a.id for a in admins]

    sos = db.query(SOS).filter(or_(SOS.name.contains("QA TEST"), SOS.name.contains("QA RETEST"))).all()
    sos_ids = [s.id for s in sos]
    notifications = db.query(Notification).filter(or_(
        Notification.title.in_(SEED_NOTIFICATION_TITLES),
        Notification.user_id.in_(user_ids),
        Notification.admin_id.in_(admin_ids),
    )).all()

    return [
        ("QA user accounts", users, lambda u: f"user #{u.id} {u.email} ({u.role.value})"),
        ("QA admin accounts", admins, lambda a: f"admin #{a.id} {a.email} ({a.role.value})"),
        ("QA SOS requests", sos, lambda s: f"SOS #{s.id} '{s.name}' phone={s.phone!r} lat/lng={s.latitude},{s.longitude}"),
        ("Status history of those SOS",
         db.query(SOSStatusHistory).filter(SOSStatusHistory.sos_id.in_(sos_ids)).all(),
         lambda h: f"history #{h.id} SOS #{h.sos_id} {h.from_status}->{h.to_status}"),
        ("QA feedback", db.query(Feedback).filter(Feedback.title.contains("QA TEST")).all(),
         lambda f: f"feedback #{f.id} '{f.title}'"),
        ("Simulated (manual what-if) predictions", db.query(Prediction).filter(Prediction.source == "simulation").all(),
         lambda p: f"prediction #{p.id} {p.risk_level} at {p.predicted_at:%Y-%m-%d %H:%M} UTC"),
        ("Seed / QA notifications", notifications,
         lambda n: f"notification #{n.id} '{n.title}' user={n.user_id} admin={n.admin_id}"),
        ("Seed evacuation centers", db.query(EvacuationCenter).filter(EvacuationCenter.name.in_(SEED_CENTER_NAMES)).all(),
         lambda c: f"center #{c.id} '{c.name}'"),
        ("Duplicate evacuation centers (first kept)", duplicates(db, EvacuationCenter, "name"),
         lambda c: f"center #{c.id} '{c.name}'"),
        ("Duplicate feedback (first kept)", duplicates(db, Feedback, "title"),
         lambda f: f"feedback #{f.id} '{f.title}'"),
        ("Duplicate resources (first kept)", duplicates(db, Resource, "name"),
         lambda r: f"resource #{r.id} '{r.name}'"),
        ("Duplicate alerts (first kept)", duplicates(db, Alert, "title"),
         lambda a: f"alert #{a.id} '{a.title}'"),
    ], user_ids, admin_ids


def unique_rows(plan):
    """Rows can match more than one rule (e.g. a QA SOS that is also a duplicate)."""
    seen, rows = set(), []
    for _, items, _ in plan:
        for row in items:
            key = (type(row).__name__, row.id)
            if key not in seen:
                seen.add(key)
                rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="delete without asking")
    args = parser.parse_args()

    create_tables()  # make sure migrations (e.g. predictions.source) have run
    db = SessionLocal()
    try:
        plan, user_ids, admin_ids = build_plan(db)
        rows = unique_rows(plan)
        never_seen = db.query(Sensor).filter(Sensor.last_seen.is_(None), Sensor.battery_level.isnot(None)).all()

        for title, items, describe in plan:
            print(f"\n{title}: {len(items)}")
            for row in items:
                print(f"  - {describe(row)}")
        print(f"\nSensors that never reported but show a battery level (will be cleared): {len(never_seen)}")
        for s in never_seen:
            print(f"  - {s.sensor_id} battery={s.battery_level}")
        kept_links = (db.query(SOS).filter(or_(SOS.user_id.in_(user_ids), SOS.accepted_by_user_id.in_(user_ids)))
                      .filter(SOS.id.notin_([r.id for r in rows if isinstance(r, SOS)])).count())
        print(f"\nOther SOS/feedback rows linked to removed users have the link cleared ({kept_links} SOS).")

        if not rows and not never_seen:
            print("\nNothing to clean up.")
            return
        if not args.yes and input(f"\nDelete {len(rows)} rows and clear {len(never_seen)} battery values? [y/N] ").strip().lower() != "y":
            print("Aborted. Nothing was changed.")
            return

        # Detach rows that stay from accounts that go.
        db.query(SOS).filter(SOS.user_id.in_(user_ids)).update({SOS.user_id: None}, synchronize_session=False)
        db.query(SOS).filter(SOS.accepted_by_user_id.in_(user_ids)).update(
            {SOS.accepted_by_user_id: None}, synchronize_session=False)
        db.query(Feedback).filter(Feedback.user_id.in_(user_ids)).update({Feedback.user_id: None}, synchronize_session=False)
        db.query(AdminInvite).filter(AdminInvite.used_by_admin_id.in_(admin_ids)).update(
            {AdminInvite.used_by_admin_id: None}, synchronize_session=False)
        db.query(AdminInvite).filter(AdminInvite.created_by_admin_id.in_(admin_ids)).update(
            {AdminInvite.created_by_admin_id: None}, synchronize_session=False)
        for sensor in never_seen:
            sensor.battery_level = None

        # Children before parents.
        order = [SOSStatusHistory, Notification, Prediction, Feedback, SOS, EvacuationCenter, Resource, Alert, User, Admin]
        for model in order:
            for row in rows:
                if isinstance(row, model):
                    db.delete(row)
            db.flush()
        db.commit()
        print(f"Done. Deleted {len(rows)} rows, cleared {len(never_seen)} battery values.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
