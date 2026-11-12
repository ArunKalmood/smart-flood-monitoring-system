"""
Issue (or rotate) the X-Device-Key for a sensor and print it once.

    venv/bin/python scripts/provision_device_key.py SN-001
    venv/bin/python scripts/provision_device_key.py SN-NEW-01 --create --name "River gauge 1" --type water_level --unit m
    venv/bin/python scripts/provision_device_key.py --list

Flash the printed key into the device firmware as DEVICE_KEY. Rotating a key
invalidates the old one immediately.
"""
import argparse

import _bootstrap  # noqa: F401

from auth.device_keys import issue_device_key
from database.connection import SessionLocal, create_tables
from models.sensor import Sensor

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("sensor_id", nargs="?", help="The sensor's sensor_id string, e.g. SN-001")
parser.add_argument("--list", action="store_true", help="List sensors and whether they have a key")
parser.add_argument("--create", action="store_true", help="Create the sensor if it does not exist")
parser.add_argument("--name")
parser.add_argument("--type", default="water_level")
parser.add_argument("--unit")
args = parser.parse_args()

create_tables()
db = SessionLocal()
try:
    if args.list or not args.sensor_id:
        for s in db.query(Sensor).order_by(Sensor.id).all():
            print(f"  #{s.id:<4} {s.sensor_id:<20} {s.name:<30} key={'yes' if s.device_key_hash else 'NO'}")
        raise SystemExit(0)

    sensor = db.query(Sensor).filter(Sensor.sensor_id == args.sensor_id).first()
    if sensor is None:
        if not args.create:
            raise SystemExit(f"No sensor '{args.sensor_id}'. Re-run with --create to register it.")
        sensor = Sensor(sensor_id=args.sensor_id, name=args.name or f"Sensor {args.sensor_id}",
                        type=args.type, unit=args.unit)
        db.add(sensor)
    key = issue_device_key(sensor)
    db.commit()
    print(f"Device key for {sensor.sensor_id} (shown once):\n\n  {key}\n")
finally:
    db.close()
