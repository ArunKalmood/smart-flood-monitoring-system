"""
1.2 / 1.3 — every protected endpoint: 401 without a token, 403 for roles
outside the permission matrix (checked *before* any lookup), success for
allowed roles.
"""
import pytest

from auth.permissions import ALL_ROLES, PERMISSIONS
from models.evacuation_center import Alert, EvacuationCenter, Resource
from models.feedback import Feedback
from models.sensor import Sensor
from models.sos import SOS
from models.volunteer import Volunteer

CENTER = {"name": "School Shelter", "capacity": 100, "latitude": 19.07, "longitude": 72.87}
RESOURCE = {"name": "Boat A", "type": "boat", "quantity_total": 2, "quantity_available": 2}
ALERT = {"title": "Heavy rain", "message": "Stay indoors", "severity": "high"}
SENSOR = {"sensor_id": "SN-NEW-1", "name": "New gauge"}

# (method, path template, json body, permission)
ROLE_GATED = [
    ("PATCH",  "/api/sos/{sos}/status",                  {"status": "accepted"},     "sos.update_status"),
    ("GET",    "/api/dashboard/sos-summary",             None,                       "sos.view_all"),
    ("PATCH",  "/api/feedback/{feedback}",               {"status": "under_review"}, "feedback.manage"),
    ("GET",    "/api/genai/analyze-feedback",            None,                       "feedback.view_all"),
    ("POST",   "/api/genai/analyze-feedback/{feedback}", None,                       "feedback.manage"),
    ("GET",    "/api/volunteers/",                       None,                       "volunteers.view"),
    ("GET",    "/api/volunteers/stats",                  None,                       "volunteers.view"),
    ("GET",    "/api/volunteers/{volunteer}",            None,                       "volunteers.view"),
    ("PATCH",  "/api/volunteers/{volunteer}/status?status=approved", None,           "volunteers.approve"),
    ("POST",   "/api/evacuation-centers/",               CENTER,                     "evacuation.manage"),
    ("PUT",    "/api/evacuation-centers/{center}",       CENTER,                     "evacuation.manage"),
    ("DELETE", "/api/evacuation-centers/{center}",       None,                       "evacuation.manage"),
    ("GET",    "/api/resources/",                        None,                       "resources.view"),
    ("POST",   "/api/resources/",                        RESOURCE,                   "resources.manage"),
    ("PUT",    "/api/resources/{resource}",              RESOURCE,                   "resources.manage"),
    ("DELETE", "/api/resources/{resource}",              None,                       "resources.manage"),
    ("POST",   "/api/alerts/",                           ALERT,                      "alerts.manage"),
    ("PATCH",  "/api/alerts/{alert}/deactivate",         None,                       "alerts.manage"),
    ("GET",    "/api/reports/generate/sos",              None,                       "reports.view"),
    ("GET",    "/api/reports/summary",                   None,                       "reports.view"),
    ("POST",   "/api/sensors/admin/register-sensor",     SENSOR,                     "sensors.manage"),
    ("POST",   "/api/sensors/admin/{sensor}/rotate-key", None,                       "sensors.manage"),
    ("GET",    "/api/users/admin/all-users",             None,                       "users.view_all"),
    ("GET",    "/api/audit/",                            None,                       "audit.view"),
]

# Any authenticated role may call these (results are scoped where they contain personal data).
AUTH_ONLY = [
    ("GET",  "/api/sos/", None), ("GET", "/api/sos/map-data", None), ("GET", "/api/sos/stats", None),
    ("GET",  "/api/feedback/", None), ("GET", "/api/feedback/stats/summary", None),
    ("GET",  "/api/dashboard/stats", None), ("GET", "/api/dashboard/water-level-trend", None),
    ("GET",  "/api/dashboard/recent-alerts", None),
    ("GET",  "/api/predictions/latest", None), ("GET", "/api/predictions/history", None),
    ("GET",  "/api/predictions/stats", None),
    ("POST", "/api/predictions/predict", {"water_level": 2, "rainfall": 5, "temperature": 25, "humidity": 60}),
    ("GET",  "/api/sensors/", None), ("GET", "/api/sensors/dashboard", None),
    ("GET",  "/api/sensors/data/history", None), ("GET", "/api/sensors/{sensor}", None),
    ("GET",  "/api/evacuation-centers/", None), ("GET", "/api/evacuation-centers/map-data", None),
    ("GET",  "/api/alerts/", None), ("GET", "/api/genai/flood-summary", None),
    ("GET",  "/api/notifications/", None),
]


@pytest.fixture
def seeded(db):
    """One of each resource, owned by nobody in particular. Returns ids for path templates."""
    rows = {
        "sos": SOS(name="Ravi", phone="9123456780", emergency_type="flood", latitude=19.0, longitude=72.8),
        "feedback": Feedback(title="Drain blocked", category="infrastructure", description="..."),
        "volunteer": Volunteer(full_name="Vol", email="vol.seed@example.com", phone="9000000001"),
        "center": EvacuationCenter(name="Hall", capacity=50),
        "resource": Resource(name="Boat", type="boat"),
        "alert": Alert(title="Rain", message="Heavy rain"),
        "sensor": Sensor(sensor_id="SN-SEED-1", name="Seed gauge"),
    }
    db.add_all(rows.values())
    db.commit()
    return {k: v.id for k, v in rows.items()}


def _call(client, method, path, body, headers=None):
    return client.request(method, path, json=body, headers=headers or {})


def _gated_cases():
    for method, path, body, perm in ROLE_GATED:
        for role in sorted(ALL_ROLES):
            yield pytest.param(method, path, body, role, role in PERMISSIONS[perm],
                               id=f"{method} {path} as {role}")


@pytest.mark.parametrize("method,path,body,perm", ROLE_GATED, ids=[f"{m} {p}" for m, p, _, _ in ROLE_GATED])
def test_role_gated_requires_token(client, seeded, method, path, body, perm):
    assert _call(client, method, path.format(**seeded), body).status_code == 401


@pytest.mark.parametrize("method,path,body,role,allowed", list(_gated_cases()))
def test_role_gated_enforces_matrix(client, seeded, headers_for, method, path, body, role, allowed):
    res = _call(client, method, path.format(**seeded), body, headers_for(role))
    if allowed:
        assert res.status_code in (200, 201), res.text
    else:
        assert res.status_code == 403, res.text


@pytest.mark.parametrize("method,path,body,perm", ROLE_GATED, ids=[f"{m} {p}" for m, p, _, _ in ROLE_GATED])
def test_forbidden_beats_not_found(client, headers_for, method, path, body, perm):
    """A public_user gets 403 even for ids that don't exist (role check runs before lookup)."""
    ids = {k: 999999 for k in ("sos", "feedback", "volunteer", "center", "resource", "alert", "sensor")}
    if "public_user" not in PERMISSIONS[perm]:
        assert _call(client, method, path.format(**ids), body, headers_for("public_user")).status_code == 403


@pytest.mark.parametrize("method,path,body", AUTH_ONLY, ids=[f"{m} {p}" for m, p, _ in AUTH_ONLY])
def test_auth_only_endpoints(client, seeded, headers_for, method, path, body):
    path = path.format(**seeded)
    assert _call(client, method, path, body).status_code == 401
    assert _call(client, method, path, body, headers_for("public_user")).status_code in (200, 201)


def test_permission_matrix_pinned():
    """The matrix from the bug-fix brief; changing a role's access should be a deliberate edit here too."""
    admins = {"super_admin", "district_admin", "operations", "analyst"}
    expect = {
        "sos.submit":         ALL_ROLES,
        "sos.view_all":       {"government_authority"} | admins,
        "sos.update_status":  {"volunteer", "government_authority"} | admins - {"analyst"},
        "volunteers.approve": {"government_authority", "super_admin", "district_admin"},
        "evacuation.manage":  {"government_authority"} | admins - {"analyst"},
        "resources.manage":   {"government_authority"} | admins - {"analyst"},
        "reports.view":       {"government_authority"} | admins,
    }
    for perm, roles in expect.items():
        assert set(PERMISSIONS[perm]) == set(roles), perm
    for perm, roles in PERMISSIONS.items():
        if perm != "sos.submit":
            assert "public_user" not in roles, perm
