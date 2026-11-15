"""
One-time setup: register the Arduino sensor and print its device key.

Run from the backend/ directory:

    python scripts/setup_arduino_sensor.py

The printed key must be pasted into serial_bridge.py (or kept safe).
Re-running rotates the key (old key stops working immediately).
"""
import argparse
import _bootstrap  # noqa: F401

from auth.device_keys import issue_device_key
from database.connection import SessionLocal, create_tables
from models.sensor import Sensor

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--sensor-id",   default="ARDUINO-001",        help="Unique sensor ID (default: ARDUINO-001)")
parser.add_argument("--name",        default="Arduino Flood Sensor", help="Human-readable name")
parser.add_argument("--type",        default="water_level",         help="Sensor type: water_level | rainfall | ...")
parser.add_argument("--location",    default="Field Station 1",     help="Location description")
parser.add_argument("--unit",        default="cm",                  help="Unit of measurement (default: cm)")
parser.add_argument("--latitude",    type=float, default=None)
parser.add_argument("--longitude",   type=float, default=None)
args = parser.parse_args()

create_tables()
db = SessionLocal()
try:
    sensor = db.query(Sensor).filter(Sensor.sensor_id == args.sensor_id).first()
    if sensor is None:
        sensor = Sensor(
            sensor_id=args.sensor_id,
            name=args.name,
            type=args.type,
            location=args.location,
            unit=args.unit,
            latitude=args.latitude,
            longitude=args.longitude,
        )
        db.add(sensor)
        print(f"[+] Created new sensor: {args.sensor_id}")
    else:
        # Update metadata and rotate key
        sensor.name     = args.name
        sensor.type     = args.type
        sensor.location = args.location
        sensor.unit     = args.unit
        if args.latitude is not None:
            sensor.latitude  = args.latitude
            sensor.longitude = args.longitude
        print(f"[~] Sensor already exists — rotating device key: {args.sensor_id}")

    key = issue_device_key(sensor)
    db.commit()
    print()
    print("=" * 60)
    print(f"  Sensor ID  : {sensor.sensor_id}")
    print(f"  Name       : {sensor.name}")
    print(f"  Type       : {sensor.type}")
    print(f"  Unit       : {sensor.unit}")
    print()
    print("  DEVICE KEY (shown once — paste into serial_bridge.py):")
    print()
    print(f"    {key}")
    print()
    print("=" * 60)
finally:
    db.close()
