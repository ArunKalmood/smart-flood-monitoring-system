"""
Comprehensive tests for Gemini AI Intelligent Flood Risk Analysis and Evacuation Assistant.
Validates all 12 core requirements from Section 11:
1. Normal sensor readings
2. Gradually increasing water levels
3. Rapidly increasing water levels
4. Critical flood conditions (immediate emergency warning triggered)
5. Missing sensor readings
6. Stale sensor data (explicit uncertainty communicated)
7. Incorrect GPS coordinates validation
8. No nearby evacuation centres handling
9. Full or closed evacuation centres handling
10. Flooded or blocked road hazard detection
11. Gemini API timeout or failure graceful fallback
12. Offline fallback and emergency chatbot
"""
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock

from database.connection import SessionLocal
from models.sensor import Sensor, SensorStatus
from models.flood_data import FloodData
from models.evacuation_center import EvacuationCenter, CenterStatus, Alert
from models.user import User
from models.ai_analysis import AIAnalysisHistory
from utils.timeutil import utc_now
from services.ai_flood_service import (
    gather_sensor_snapshot,
    evaluate_deterministic_safety,
    analyze_flood_risk_with_gemini,
    get_latest_flood_status,
)
from services.evacuation_service import (
    get_nearby_verified_shelters,
    recommend_safe_evacuation_route,
    is_valid_lat_lng,
    haversine_distance_km,
)
from services.gemini_service import (
    chat_emergency_assistant,
    _generate_grounded_fallback_response,
    clean_natural_text,
)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


# Test 1: Normal sensor readings
def test_normal_sensor_readings(db):
    snapshot = {
        "water_level": 1.5,
        "rainfall": 5.0,
        "rate_of_increase_per_hour": 0.02,
        "data_status": "FRESH",
        "sensor_location": "Basin A",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "STABLE",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["risk_level"] == "LOW"
    assert result["urgency"] == "LOW"
    assert result["evacuation_required"] is False
    assert result["recommended_action"] == "NORMAL_CONDITIONS"


# Test 2: Gradually increasing water levels
def test_gradually_increasing_water_levels(db):
    snapshot = {
        "water_level": 3.8,
        "rainfall": 25.0,
        "rate_of_increase_per_hour": 0.25,
        "data_status": "FRESH",
        "sensor_location": "Basin B",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "RISING",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["risk_level"] == "MODERATE"
    assert result["recommended_action"] == "MONITOR_CONDITIONS"
    assert result["evacuation_required"] is False


# Test 3: Rapidly increasing water levels
def test_rapidly_increasing_water_levels(db):
    snapshot = {
        "water_level": 5.8,
        "rainfall": 60.0,
        "rate_of_increase_per_hour": 0.75,
        "data_status": "FRESH",
        "sensor_location": "Basin C",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "RAPIDLY_RISING",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["risk_level"] == "HIGH"
    assert result["urgency"] == "HIGH"
    assert result["recommended_action"] == "PREPARE_FOR_EVACUATION"
    assert "evacuation" in result["user_message"].lower() or "warning" in result["user_message"].lower()


# Test 4: Critical flood conditions (immediate emergency warning triggered)
def test_critical_flood_conditions(db):
    snapshot = {
        "water_level": 8.6,
        "rainfall": 120.0,
        "rate_of_increase_per_hour": 1.2,
        "data_status": "FRESH",
        "sensor_location": "Basin D",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "RAPIDLY_RISING",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["risk_level"] == "CRITICAL"
    assert result["urgency"] == "IMMEDIATE"
    assert result["evacuation_required"] is True
    assert result["recommended_action"] == "IMMEDIATE_EVACUATION"
    assert "CRITICAL FLOOD WARNING" in result["user_message"]


# Test 5: Missing sensor readings
def test_missing_sensor_readings(db):
    snapshot = {
        "water_level": None,
        "rainfall": None,
        "rate_of_increase_per_hour": 0.0,
        "data_status": "MISSING",
        "sensor_location": "Unreachable Basin",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "UNKNOWN",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["confidence"] == "LOW"
    assert "unavailable" in result["summary"].lower() or "missing" in result["reasoning"].lower()


# Test 6: Stale sensor data (explicit uncertainty communicated)
def test_stale_sensor_data_communicates_uncertainty(db):
    snapshot = {
        "water_level": 4.0,
        "rainfall": 10.0,
        "rate_of_increase_per_hour": 0.0,
        "data_status": "STALE",
        "reading_age_minutes": 180,
        "sensor_location": "Delayed Station",
        "sensor_malfunction_suspected": False,
        "water_level_trend": "STABLE",
    }
    result = evaluate_deterministic_safety(snapshot)
    assert result["confidence"] == "LOW"
    assert "delayed" in result["summary"].lower() or "delayed" in result["user_message"].lower()


# Test 7: Incorrect GPS coordinates validation
def test_gps_coordinate_validation():
    assert is_valid_lat_lng(13.0827, 80.2707) is True
    assert is_valid_lat_lng(0.0, 0.0) is True
    assert is_valid_lat_lng(91.0, 80.0) is False   # Latitude > 90
    assert is_valid_lat_lng(-95.0, 80.0) is False  # Latitude < -90
    assert is_valid_lat_lng(13.0, 185.0) is False  # Longitude > 180
    assert is_valid_lat_lng("abc", 80.0) is False
    assert is_valid_lat_lng(None, None) is False

    # Evacuation search with invalid coords
    db_mock = MagicMock()
    res = get_nearby_verified_shelters(db_mock, 95.0, 80.0)
    assert "error" in res


# Test 8: No nearby evacuation centres handling
def test_no_nearby_evacuation_centres(db):
    # Query point in middle of Indian Ocean where no shelters exist
    res = get_nearby_verified_shelters(db, -10.0, 70.0, radius_km=10.0)
    assert res["total_found"] == 0
    assert res["nearest_shelter"] is None
    assert len(res["emergency_contacts"]) > 0


# Test 9: Full or closed evacuation centres handling (never recommend unverified or closed)
def test_full_or_closed_evacuation_centres_filtered(db):
    # Create test centers: one closed, one full, one open with capacity
    closed_c = EvacuationCenter(
        name="Closed Test Shelter",
        latitude=13.10,
        longitude=80.20,
        capacity=100,
        current_occupancy=20,
        status=CenterStatus.CLOSED,
    )
    full_c = EvacuationCenter(
        name="Full Test Shelter",
        latitude=13.11,
        longitude=80.21,
        capacity=100,
        current_occupancy=100,
        status=CenterStatus.OPEN,
    )
    open_c = EvacuationCenter(
        name="Open Verified Shelter",
        latitude=13.12,
        longitude=80.22,
        capacity=200,
        current_occupancy=50,
        status=CenterStatus.OPEN,
    )
    db.add_all([closed_c, full_c, open_c])
    db.commit()

    try:
        shelters = get_nearby_verified_shelters(db, 13.10, 80.20, radius_km=20.0)
        names = [s["name"] for s in ([shelters["nearest_shelter"]] + shelters["alternative_shelters"]) if s]
        assert "Closed Test Shelter" not in names
        assert "Full Test Shelter" not in names
        assert "Open Verified Shelter" in names
    finally:
        db.delete(closed_c)
        db.delete(full_c)
        db.delete(open_c)
        db.commit()


# Test 10: Flooded or blocked road hazard detection
def test_road_hazard_detection(db):
    # Create a center and an active danger alert in between
    shelter = EvacuationCenter(
        name="Destination Shelter",
        latitude=13.10,
        longitude=80.20,
        capacity=100,
        current_occupancy=10,
        status=CenterStatus.OPEN,
    )
    hazard_alert = Alert(
        title="Submerged Road Hazard",
        message="Bridge underwater",
        severity="critical",
        latitude=13.05,
        longitude=80.20,
        radius_km=2.0,
        is_active=True,
    )
    db.add_all([shelter, hazard_alert])
    db.commit()

    try:
        # Route passing right through 13.05, 80.20
        res = recommend_safe_evacuation_route(db, 13.00, 80.20, shelter.id, avoid_hazards=True)
        assert res["safety_status"] in ("UNSAFE", "CAUTION", "UNVERIFIED_SAFETY")
        assert len(res["hazards_detected"]) >= 1
    finally:
        db.delete(shelter)
        db.delete(hazard_alert)
        db.commit()


# Test 11: Gemini API timeout or failure graceful fallback
def test_gemini_api_timeout_fallback(db):
    with patch("utils.config.settings.GEMINI_API_KEY", "dummy-api-key"):
        with patch("google.genai.Client", side_effect=Exception("API Timeout or Network Down")):
            res = analyze_flood_risk_with_gemini(db, force_refresh=True)
            assert res is not None
            assert res["is_fallback"] is True
            assert res["risk_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
            assert len(res["safety_precautions"]) > 0


# Test 12: Offline emergency assistant responses
def test_offline_emergency_assistant_grounding(db):
    grounding = {
        "current_risk_level": "HIGH",
        "water_level_m": 6.2,
        "trend": "RAPIDLY_RISING",
        "sensor_location": "River Bridge",
        "nearest_shelter": {
            "name": "Central Safe School",
            "address": "4th Street",
            "distance_km": 2.4,
            "available_spots": 85,
            "status": "open",
            "contact_number": "112",
        },
    }

    # Query 1: Nearest shelter
    resp_shelter = _generate_grounded_fallback_response("where is the nearest evacuation shelter?", grounding, 13.0, 80.0)
    assert "Central Safe School" in resp_shelter
    assert "2.4 km" in resp_shelter

    # Query 2: What to pack
    resp_pack = _generate_grounded_fallback_response("what should I carry during evacuation?", grounding, 13.0, 80.0)
    assert "waterproof" in resp_pack.lower()
    assert "medications" in resp_pack.lower()

    # Query 3: Water entering house
    resp_house = _generate_grounded_fallback_response("water is entering my house what should I do?", grounding, 13.0, 80.0)
    assert "electrical" in resp_house.lower()
    assert "breaker" in resp_house.lower() or "highest" in resp_house.lower()


# Test 13: Clean natural human-readable text stripping Markdown
def test_clean_natural_text_removes_markdown():
    raw_markdown = (
        "### ⚠️ Flood Warning!\n\n"
        "Heavy rainfall has been detected near the **Bagmati River**.\n\n"
        "- Water level is *rising rapidly*.\n"
        "- 1. Move away from rivers and storm drains.\n"
        "- 2. Proceed to nearest safe shelter.\n\n"
        "> Emergency hotline: 112\n"
        "```json\n{\"risk\": \"HIGH\"}\n```"
    )
    cleaned = clean_natural_text(raw_markdown)
    assert "###" not in cleaned
    assert "**" not in cleaned
    assert "```" not in cleaned
    assert "{" not in cleaned
    assert "- " not in cleaned
    assert "Bagmati River" in cleaned
    assert "112" in cleaned


# Test 14: All 8 standard conversational questions return natural prose without markdown
def test_conversational_questions_return_clean_prose(db):
    grounding = {
        "current_risk_level": "HIGH",
        "water_level_m": 6.5,
        "rainfall_mmh": 65.0,
        "trend": "RAPIDLY_RISING",
        "river_name": "Bagmati River",
        "sensor_location": "Bagmati River Basin",
        "affected_localities": ["Bagmati River Basin lowlands", "River North Sector"],
        "lstm_prediction": {
            "model_version": "LSTM Flood Predictor v2.1",
            "risk_level": "HIGH",
            "confidence": 0.92,
        },
        "nearest_shelter": {
            "id": 1,
            "name": "Community Safe Haven",
            "address": "12 River Road",
            "distance_km": 1.8,
            "available_spots": 120,
            "status": "open",
            "contact_number": "112",
        },
        "alternative_shelters": [
            {
                "id": 2,
                "name": "North School Relief Camp",
                "address": "45 North Avenue",
                "distance_km": 3.5,
                "available_spots": 50,
            }
        ],
    }

    questions = [
        "Is my location currently at risk?",
        "Which nearby areas are affected?",
        "Where should I go to stay safe?",
        "What is the nearest evacuation centre?",
        "Show me the safest available route.",
        "Is the road near the river safe?",
        "Are there alternative evacuation centres?",
        "What precautions should I take?",
    ]

    for q in questions:
        raw = _generate_grounded_fallback_response(q, grounding, 13.08, 80.27)
        cleaned = clean_natural_text(raw)
        assert len(cleaned) > 20
        # Check no Markdown symbols remain
        assert "###" not in cleaned
        assert "**" not in cleaned
        assert "```" not in cleaned
        assert not cleaned.startswith("- ")
        assert "\n- " not in cleaned
        assert "\n• " not in cleaned


# Test 15: chat_emergency_assistant payload structure with shelter and route
def test_chat_emergency_assistant_payload(db):
    res = chat_emergency_assistant(
        db=db,
        message="Where should I go to stay safe?",
        user_lat=13.0827,
        user_lng=80.2707,
    )
    assert "response" in res
    assert "nearest_shelter" in res
    assert "alternative_shelters" in res
    assert "recommended_route" in res
    assert "affected_localities" in res
    assert "grounding" in res
    # Assert response is clean text
    assert "###" not in res["response"]
    assert "**" not in res["response"]

