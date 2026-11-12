"""1.3 / 1.4 — list endpoints only return what each role may see; PII masked where not needed."""
from models.sos import SOS


def _submit_sos(client, headers=None, name="Caller"):
    form = {"name": name, "phone": "9876501234", "emergency_type": "flood", "latitude": "19.1", "longitude": "72.9"}
    res = client.post("/api/sos/submit", data=form, headers=headers or {})
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_sos_submit_links_user_from_token(client, db, make_account):
    user, headers = make_account("public_user")
    sos_id = _submit_sos(client, headers)
    assert db.get(SOS, sos_id).user_id == user.id


def test_sos_submit_ignores_client_supplied_user_id(client, db, make_account):
    user, headers = make_account("public_user")
    form = {"name": "Xavier", "phone": "9876501234", "emergency_type": "flood", "user_id": "999"}
    sos_id = client.post("/api/sos/submit", data=form, headers=headers).json()["id"]
    assert db.get(SOS, sos_id).user_id == user.id


def test_public_user_sees_only_own_sos(client, headers_for):
    alice, bob = headers_for("public_user"), headers_for("public_user")
    mine = _submit_sos(client, alice, "Alice")
    theirs = _submit_sos(client, bob, "Bob")

    items = client.get("/api/sos/", headers=alice).json()["items"]
    assert [i["id"] for i in items] == [mine]
    assert [m["id"] for m in client.get("/api/sos/map-data", headers=alice).json()] == [mine]
    assert client.get("/api/sos/stats", headers=alice).json()["total"] == 1
    assert client.get(f"/api/sos/{theirs}", headers=alice).status_code == 404
    assert items[0]["phone"] == "9876501234"  # own record is not masked


def test_staff_see_all_sos(client, headers_for):
    _submit_sos(client, headers_for("public_user"))
    _submit_sos(client, headers_for("public_user"))
    for role in ["government_authority", "super_admin", "operations"]:
        assert client.get("/api/sos/", headers=headers_for(role)).json()["total"] == 2


def test_analyst_sees_masked_phones(client, headers_for):
    _submit_sos(client, headers_for("public_user"))
    item = client.get("/api/sos/", headers=headers_for("analyst")).json()["items"][0]
    assert item["phone"] == "98XXXXXX34"
    assert client.get("/api/sos/map-data", headers=headers_for("analyst")).json()[0]["phone"] == "98XXXXXX34"


def test_volunteer_scope_and_accept_flow(client, db, make_account, headers_for):
    owner = headers_for("public_user")
    open_id = _submit_sos(client, owner)
    taken_id = _submit_sos(client, owner)
    vol_a, h_a = make_account("volunteer")
    _, h_b = make_account("volunteer")

    # A accepts one request; it leaves B's view, but stays in A's.
    assert client.patch(f"/api/sos/{taken_id}/status", json={"status": "accepted"}, headers=h_a).status_code == 200
    assert db.get(SOS, taken_id).accepted_by_user_id == vol_a.id
    ids_a = {i["id"] for i in client.get("/api/sos/", headers=h_a).json()["items"]}
    ids_b = {i["id"] for i in client.get("/api/sos/", headers=h_b).json()["items"]}
    assert ids_a == {open_id, taken_id}
    assert ids_b == {open_id}

    # B cannot touch A's request; A can progress it.
    assert client.patch(f"/api/sos/{taken_id}/status", json={"status": "rescued"}, headers=h_b).status_code == 404
    assert client.patch(f"/api/sos/{taken_id}/status", json={"status": "rescued"}, headers=h_a).status_code == 200


def test_pending_cannot_jump_to_rescued(client, headers_for):
    """pending → rescued is not a valid transition for anyone (must be accepted first)."""
    sos_id = _submit_sos(client, headers_for("public_user"))
    for role in ["volunteer", "super_admin"]:
        res = client.patch(f"/api/sos/{sos_id}/status", json={"status": "rescued"}, headers=headers_for(role))
        assert res.status_code == 400, role


def _submit_feedback(client, headers, anonymous=False):
    form = {"title": "Drain", "category": "infrastructure", "description": "Blocked drain on 4th street",
            "is_anonymous": str(anonymous).lower(), "user_id": "999"}
    res = client.post("/api/feedback/submit", data=form, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def test_feedback_linked_from_token_and_scoped(client, db, make_account, headers_for):
    user, alice = make_account("public_user")
    bob = headers_for("public_user")
    mine = _submit_feedback(client, alice)
    _submit_feedback(client, bob)
    assert mine["user_id"] == user.id

    assert [i["id"] for i in client.get("/api/feedback/", headers=alice).json()["items"]] == [mine["id"]]
    assert client.get("/api/feedback/stats/summary", headers=alice).json()["total"] == 1
    assert client.get("/api/feedback/", headers=headers_for("government_authority")).json()["total"] == 2


def test_anonymous_feedback_not_linked(client, headers_for):
    assert _submit_feedback(client, headers_for("public_user"), anonymous=True)["user_id"] is None


def test_volunteer_list_masks_contact_for_analyst(client, db, headers_for):
    from models.volunteer import Volunteer
    db.add(Volunteer(full_name="V", email="v@example.com", phone="9988776655", blood_group="O+"))
    db.commit()
    analyst_item = client.get("/api/volunteers/", headers=headers_for("analyst")).json()["items"][0]
    gov_item = client.get("/api/volunteers/", headers=headers_for("government_authority")).json()["items"][0]
    assert analyst_item["phone"] == "99XXXXXX55" and analyst_item["blood_group"] is None
    assert gov_item["phone"] == "9988776655" and gov_item["blood_group"] == "O+"
