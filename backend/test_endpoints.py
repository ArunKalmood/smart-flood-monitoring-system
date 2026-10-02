import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main import app
from database.connection import SessionLocal, Base, engine
from models import User, Admin, Volunteer, Sensor, FloodData, Prediction, SOS, Feedback, Notification, EvacuationCenter, Resource, Alert

client = TestClient(app)

# Clean up database for clean test run
db = SessionLocal()
db.query(User).delete()
db.query(Admin).delete()
db.commit()

print("Registering normal user...")
user_data = {
    "full_name": "Test User",
    "email": "user@example.com",
    "phone": "+1234567890",
    "password": "password123",
    "confirm_password": "password123",
    "address": "123 Main St",
    "city": "Test City",
    "state": "Test State",
    "pin_code": "123456",
    "role": "public_user"
}
response = client.post("/api/auth/register", json=user_data)
user_token = response.json().get("access_token")
user_headers = {"Authorization": f"Bearer {user_token}"}

print("Querying report endpoint with user...")
response = client.get("/api/reports/generate/flood", headers=user_headers)
print("Report generate Status:", response.status_code)
if response.status_code == 200:
    print("Report JSON:", response.json())
else:
    print("Report generate Failed:", response.status_code, response.text)

# Clean up
db.query(User).delete()
db.commit()
db.close()
