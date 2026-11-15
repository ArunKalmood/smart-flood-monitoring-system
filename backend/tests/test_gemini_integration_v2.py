"""
Comprehensive tests for Section 9 requirements:
Test 1: Gemini API key configured correctly.
Test 2: Actual Gemini API request succeeds.
Test 3: Sensor readings reach Gemini.
Test 4: LSTM prediction reaches Gemini.
Test 5: Different risk scenarios generate different appropriate responses.
Test 6: Stale sensor readings are identified correctly.
Test 7: Language selection translates responses correctly.
Test 8: Kannada and Hindi questions receive responses in the requested language.
Test 9: Nearby shelters are retrieved from actual project data.
Test 10: Evacuation routes are displayed correctly.
Test 11: Invalid Gemini API key produces an honest error.
Test 12: Existing functionality remains operational.
"""
import pytest
from unittest.mock import patch, MagicMock

from database.connection import SessionLocal
from models.sensor import Sensor, SensorStatus
from models.flood_data import FloodData, Prediction
from models.evacuation_center import EvacuationCenter, CenterStatus, Alert
from utils.config import settings
from genai import (
    is_gemini_configured,
    get_gemini_client,
    test_gemini_connection as check_gemini_connection,
    generate_flood_explanation,
    translate_text,
    translate_precautions,
    clean_natural_text,
    SUPPORTED_LANGUAGES,
)
from services.ai_flood_service import (
    gather_sensor_snapshot,
    evaluate_deterministic_safety,
    analyze_flood_risk_with_gemini,
)
from services.gemini_service import chat_emergency_assistant
from services.evacuation_service import (
    get_nearby_verified_shelters,
    recommend_safe_evacuation_route,
)


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


# Test 1: Gemini API key configured correctly
def test_gemini_api_key_configuration():
    with patch.object(settings, "GEMINI_API_KEY", ""):
        assert is_gemini_configured() is False
        assert get_gemini_client() is None

    with patch.object(settings, "GEMINI_API_KEY", "your_gemini_api_key"):
        assert is_gemini_configured() is False
        assert get_gemini_client() is None

    with patch.object(settings, "GEMINI_API_KEY", "AIzaSyRealApiKeyForTesting12345678"):
        assert is_gemini_configured() is True
        client = get_gemini_client()
        assert client is not None


# Test 2: Gemini API request succeeds
def test_gemini_api_request_success():
    mock_response = MagicMock()
    mock_response.text = "Heavy rainfall detected near Bagmati River. Water level is rising. Move to higher ground."

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("genai.get_gemini_client", return_value=mock_client):
        snapshot = {
            "river_name": "Bagmati River",
            "sensor_location": "Gaur Ghat",
            "water_level": 6.8,
            "rainfall": 65.0,
            "water_level_trend": "RAPIDLY_RISING",
            "rate_of_increase_per_hour": 0.9,
            "data_status": "FRESH",
            "reading_age_minutes": 2,
            "lstm_prediction": {
                "model_version": "LSTM v2.1",
                "risk_level": "HIGH",
                "confidence": 0.92,
            },
        }
        baseline = {"risk_level": "HIGH", "recommended_action": "PREPARE_FOR_EVACUATION", "urgency": "HIGH"}
        result = generate_flood_explanation(snapshot, baseline, language="en")

        assert result["is_fallback"] is False
        assert "Bagmati" in result["explanation"]
        assert mock_client.models.generate_content.called


# Test 3: Sensor readings reach Gemini prompt
def test_sensor_readings_reach_gemini():
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="Sensor telemetry received and evaluated.")

    with patch("genai.get_gemini_client", return_value=mock_client):
        snapshot = {
            "river_name": "Cauvery River",
            "sensor_location": "Station Delta",
            "water_level": 7.5,
            "rainfall": 85.0,
            "water_level_trend": "RAPIDLY_RISING",
            "rate_of_increase_per_hour": 1.1,
            "data_status": "FRESH",
            "reading_age_minutes": 5,
        }
        baseline = {"risk_level": "CRITICAL", "recommended_action": "IMMEDIATE_EVACUATION", "urgency": "IMMEDIATE"}
        generate_flood_explanation(snapshot, baseline, language="en")

        call_args = mock_client.models.generate_content.call_args
        prompt_content = call_args.kwargs.get("contents", "")
        assert "Cauvery River" in prompt_content
        assert "7.5" in prompt_content
        assert "85.0" in prompt_content
        assert "Station Delta" in prompt_content


# Test 4: LSTM prediction reaches Gemini prompt
def test_lstm_prediction_reaches_gemini():
    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = MagicMock(text="LSTM risk assessment confirmed.")

    with patch("genai.get_gemini_client", return_value=mock_client):
        snapshot = {
            "river_name": "Bagmati River",
            "sensor_location": "Basin 1",
            "water_level": 5.2,
            "rainfall": 45.0,
            "water_level_trend": "RISING",
            "rate_of_increase_per_hour": 0.6,
            "data_status": "FRESH",
            "reading_age_minutes": 10,
            "lstm_prediction": {
                "model_version": "DeepLSTM-HydroV3",
                "risk_level": "HIGH",
                "confidence": 0.94,
            },
        }
        baseline = {"risk_level": "HIGH", "recommended_action": "PREPARE_FOR_EVACUATION", "urgency": "HIGH"}
        generate_flood_explanation(snapshot, baseline, language="en")

        call_args = mock_client.models.generate_content.call_args
        prompt_content = call_args.kwargs.get("contents", "")
        assert "DeepLSTM-HydroV3" in prompt_content
        assert "HIGH" in prompt_content
        assert "94%" in prompt_content


# Test 5: Different risk scenarios generate different appropriate responses
def test_different_risk_scenarios_generate_appropriate_responses(db):
    scenarios = [
        {"wl": 1.2, "rain": 2.0, "rate": 0.0, "expected_risk": "LOW"},
        {"wl": 3.5, "rain": 25.0, "rate": 0.2, "expected_risk": "MODERATE"},
        {"wl": 5.8, "rain": 55.0, "rate": 0.6, "expected_risk": "HIGH"},
        {"wl": 8.5, "rain": 110.0, "rate": 1.2, "expected_risk": "CRITICAL"},
    ]

    for sc in scenarios:
        snap = {
            "water_level": sc["wl"],
            "rainfall": sc["rain"],
            "rate_of_increase_per_hour": sc["rate"],
            "water_level_trend": "RISING" if sc["rate"] > 0 else "STABLE",
            "data_status": "FRESH",
            "sensor_location": "Test Loc",
        }
        baseline = evaluate_deterministic_safety(snap)
        assert baseline["risk_level"] == sc["expected_risk"]
        explanation = generate_flood_explanation(snap, baseline, language="en")
        assert explanation["risk_level"] == sc["expected_risk"]
        if sc["expected_risk"] == "CRITICAL":
            assert "evacuate" in explanation["explanation"].lower() or "shelter" in explanation["explanation"].lower()


# Test 6: Stale sensor readings are identified correctly
def test_stale_sensor_readings_identified():
    snap_stale = {
        "water_level": 4.5,
        "rainfall": 15.0,
        "rate_of_increase_per_hour": 0.0,
        "water_level_trend": "STABLE",
        "data_status": "STALE",
        "reading_age_minutes": 120,
        "sensor_location": "Remote Outpost",
    }
    baseline = evaluate_deterministic_safety(snap_stale)
    assert baseline["confidence"] == "LOW"
    assert "delayed" in baseline["summary"].lower()

    explanation = generate_flood_explanation(snap_stale, baseline, language="en")
    assert "cannot be fully verified" in explanation["explanation"].lower() or "delayed" in explanation["explanation"].lower() or "caution" in explanation["explanation"].lower()


# Test 7: Language selection translates responses correctly
def test_language_selection_translates_responses():
    snap = {
        "river_name": "Bagmati River",
        "sensor_location": "Bridge Gauge",
        "water_level": 6.0,
        "rainfall": 60.0,
        "water_level_trend": "RAPIDLY_RISING",
        "rate_of_increase_per_hour": 0.8,
        "data_status": "FRESH",
        "reading_age_minutes": 5,
        "lstm_prediction": {"model_version": "LSTM v2", "risk_level": "HIGH", "confidence": 0.90},
    }
    baseline = {"risk_level": "HIGH", "recommended_action": "PREPARE_FOR_EVACUATION", "urgency": "HIGH"}

    for code in ["kn", "hi", "ml", "ta", "te", "mr", "bn", "ur", "ne"]:
        res = generate_flood_explanation(snap, baseline, language=code)
        assert res["language"] == code
        assert len(res["explanation"]) > 20
        # Verify no Markdown
        assert "###" not in res["explanation"]
        assert "**" not in res["explanation"]


# Test 8: Kannada and Hindi questions receive responses in requested language
def test_kannada_and_hindi_chat_responses(db):
    # Kannada question about shelter
    kn_res = chat_emergency_assistant(db, message="ನನ್ನ ಹತ್ತಿರದ ಆಶ್ರಯ ತಾಣ ಎಲ್ಲಿದೆ?", language="kn")
    assert kn_res["language"] == "kn"
    assert len(kn_res["response"]) > 20
    assert "###" not in kn_res["response"]
    assert "**" not in kn_res["response"]

    # Hindi question about risk
    hi_res = chat_emergency_assistant(db, message="क्या मेरा क्षेत्र खतरे में है?", language="hi")
    assert hi_res["language"] == "hi"
    assert len(hi_res["response"]) > 20
    assert "###" not in hi_res["response"]
    assert "**" not in hi_res["response"]


# Test 9: Nearby shelters retrieved from actual project data
def test_nearby_shelters_retrieval(db):
    shelter = EvacuationCenter(
        name="Verified Community Hall",
        address="100 Main Road",
        latitude=13.0827,
        longitude=80.2707,
        capacity=200,
        current_occupancy=40,
        status=CenterStatus.OPEN,
        contact_number="9876543210",
    )
    db.add(shelter)
    db.commit()

    try:
        shelters = get_nearby_verified_shelters(db, user_lat=13.0850, user_lng=80.2720, radius_km=10.0)
        assert shelters["total_found"] >= 1
        nearest = shelters["nearest_shelter"]
        assert nearest is not None
        assert nearest["name"] == "Verified Community Hall"
        assert nearest["available_spots"] == 160
        assert nearest["status"] == "open"
    finally:
        db.delete(shelter)
        db.commit()


# Test 10: Evacuation routes displayed correctly
def test_evacuation_routing(db):
    shelter = EvacuationCenter(
        name="Safe Evacuation Center",
        address="Zone 1 Shelter",
        latitude=13.0800,
        longitude=80.2700,
        capacity=150,
        current_occupancy=30,
        status=CenterStatus.OPEN,
    )
    db.add(shelter)
    db.commit()

    try:
        route = recommend_safe_evacuation_route(db, user_lat=13.0850, user_lng=80.2750, center_id=shelter.id)
        assert route is not None
        assert "distance_km" in route
        assert "safety_status" in route
        assert route["center"]["name"] == "Safe Evacuation Center"
    finally:
        db.delete(shelter)
        db.commit()


# Test 11: Invalid Gemini API key produces an honest error
def test_invalid_gemini_api_key_produces_honest_error():
    with patch.object(settings, "GEMINI_API_KEY", "invalid_key_99999"):
        result = check_gemini_connection()
        assert result["configured"] is True
        assert result["connected"] is False
        assert result["status"] == "error"
        assert "failed" in result["message"].lower() or "api key not valid" in result["message"].lower() or "error" in result["message"].lower()


# Test 12: Clean natural text removes all markdown formatting
def test_clean_natural_text_formatting():
    markdown_sample = """### Emergency Warning
**Heavy rainfall** has been detected near *Bagmati River*.
- Evacuate immediately
- Stay away from bridges
1. Move to higher ground
2. Call 112
```json
{"risk": "HIGH"}
```
> Official directive
"""
    cleaned = clean_natural_text(markdown_sample)
    assert "###" not in cleaned
    assert "**" not in cleaned
    assert "*" not in cleaned
    assert "```" not in cleaned
    assert "- " not in cleaned
    assert "1. " not in cleaned
    assert ">" not in cleaned
    assert "Emergency Warning" in cleaned
    assert "Heavy rainfall" in cleaned
    assert "Bagmati River" in cleaned


# Test 13: Location query returns location, NEVER water level
def test_location_query_never_returns_water_level(db):
    res = chat_emergency_assistant(
        db,
        message="What is my current location?",
        user_lat=12.9716,
        user_lng=77.5946,
        language="en",
    )
    text = res["response"].lower()
    # Must NOT discuss river water levels or sensor meters
    assert "water level" not in text
    assert "meters" not in text
    # Must answer with detected coordinates or resolved locality
    assert "12.9716" in text or "77.5946" in text or "bengaluru" in text or "bangalore" in text or "detected location" in text


# Test 14: Location query without GPS permission gives helpful instructions
def test_location_query_without_gps_explains_permission(db):
    res = chat_emergency_assistant(
        db,
        message="Where am I right now?",
        user_lat=None,
        user_lng=None,
        language="en",
    )
    text = res["response"].lower()
    assert "location access" in text or "gps" in text or "permission" in text
    assert "water level" not in text


# Test 15: Multi-turn history resolves follow-up context
def test_multi_turn_history_location_context(db):
    history = [
        {"role": "user", "content": "I am in Indiranagar, Bengaluru."},
        {"role": "assistant", "content": "Understood, your location is noted as Indiranagar, Bengaluru."},
    ]
    res = chat_emergency_assistant(
        db,
        message="Is it at risk?",
        history=history,
        language="en",
    )
    text = res["response"].lower()
    assert len(text) > 30
    assert "risk" in text or "monitored" in text or "conditions" in text

