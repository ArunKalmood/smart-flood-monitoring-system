"""
Google Gemini API Integration for Intelligent Flood Response Assistant.

Provides:
- Gemini API client initialization using official `google.genai` SDK
- Secure API key management via backend settings (.env)
- Live sensor data & LSTM prediction integration
- Grounded prompt construction
- Natural conversational AI response generation (no Markdown: no ###, **, bullets, raw JSON)
- Multilingual translation across 10 official languages:
  1. English (en)
  2. Kannada (kn)
  3. Hindi (hi)
  4. Malayalam (ml)
  5. Tamil (ta)
  6. Telugu (te)
  7. Marathi (mr)
  8. Bengali (bn)
  9. Urdu (ur)
  10. Nepali (ne)
- Conversational chat session handling with GPS grounding & shelter routing
- Deterministic resilient fallback engine for offline or unconfigured states
"""
import re
import json
import logging
from typing import Optional, Dict, Any, List, Union
from sqlalchemy.orm import Session

from utils.config import settings
from utils.timeutil import utc_now, iso

logger = logging.getLogger(__name__)

# Supported languages metadata
SUPPORTED_LANGUAGES = {
    "en": {"name": "English", "native": "English", "code": "en"},
    "kn": {"name": "Kannada", "native": "ಕನ್ನಡ", "code": "kn"},
    "hi": {"name": "Hindi", "native": "हिंदी", "code": "hi"},
    "ml": {"name": "Malayalam", "native": "മലയാളം", "code": "ml"},
    "ta": {"name": "Tamil", "native": "தமிழ்", "code": "ta"},
    "te": {"name": "Telugu", "native": "తెలుగు", "code": "te"},
    "mr": {"name": "Marathi", "native": "मराठी", "code": "mr"},
    "bn": {"name": "Bengali", "native": "বাংলা", "code": "bn"},
    "ur": {"name": "Urdu", "native": "اردو", "code": "ur"},
    "ne": {"name": "Nepali", "native": "नेपाली", "code": "ne"},
}

# Common emergency phrases in all 10 languages for robust offline/fallback translation
EMERGENCY_DICTIONARY = {
    "kn": {
        "LOW": "ಕಡಿಮೆ ಅಪಾಯ",
        "MODERATE": "ಮಧ್ಯಮ ಅಪಾಯ",
        "HIGH": "ಹೆಚ್ಚಿನ ಅಪಾಯ",
        "CRITICAL": "ತೀವ್ರ ತುರ್ತು ಅಪಾಯ",
        "NORMAL_CONDITIONS": "ಸಾಮಾನ್ಯ ಪರಿಸ್ಥಿತಿ",
        "MONITOR_CONDITIONS": "ಪರಿಸ್ಥಿತಿಯನ್ನು ಗಮನಿಸಿ",
        "PREPARE_FOR_EVACUATION": "ಸ್ಥಳಾಂತರಕ್ಕೆ ಸಿದ್ಧರಾಗಿ",
        "IMMEDIATE_EVACUATION": "ತಕ್ಷಣ ಸುರಕ್ಷಿತ ಸ್ಥಳಕ್ಕೆ ತೆರಳಿ",
        "safe_route": "ಸುರಕ್ಷಿತ ಮಾರ್ಗ",
        "nearest_shelter": "ಹತ್ತಿರದ ಆಶ್ರಯ ತಾಣ",
        "open": "ತೆರೆದಿದೆ",
        "closed": "ಮುಚ್ಚಲಾಗಿದೆ",
        "water_level": "ನೀರಿನ ಮಟ್ಟ",
        "rainfall": "ಮಳೆಯ ಪ್ರಮಾಣ",
        "stale_warning": "ಗಮನಿಸಿ: ಸಂವೇದಕ ಮಾಹಿತಿ ವಿಳಂಬವಾಗಿದೆ, ಪ್ರಸ್ತುತ ಪರಿಸ್ಥಿತಿಯನ್ನು ಸ್ಥಳೀಯವಾಗಿ ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.",
    },
    "hi": {
        "LOW": "कम जोखिम",
        "MODERATE": "मध्यम जोखिम",
        "HIGH": "उच्च जोखिम",
        "CRITICAL": "गंभीर आपातकालीन जोखिम",
        "NORMAL_CONDITIONS": "सामान्य स्थिति",
        "MONITOR_CONDITIONS": "स्थिति पर नज़र रखें",
        "PREPARE_FOR_EVACUATION": "निकासी के लिए तैयार रहें",
        "IMMEDIATE_EVACUATION": "तुरंत सुरक्षित स्थान पर जाएं",
        "safe_route": "सुरक्षित मार्ग",
        "nearest_shelter": "निकटतम आश्रय स्थल",
        "open": "खुला है",
        "closed": "बंद है",
        "water_level": "जल स्तर",
        "rainfall": "वर्षा दर",
        "stale_warning": "ध्यान दें: सेंसर डेटा पुराना है, वास्तविक स्थिति की स्थानीय रूप से पुष्टि करें।",
    },
    "ml": {
        "LOW": "കുറഞ്ഞ അപകടസാധ്യത",
        "MODERATE": "ഇടത്തരം അപകടസാധ്യത",
        "HIGH": "ഉയർന്ന അപകടസാധ്യത",
        "CRITICAL": "തീവ്ര അടിയന്തര സാഹചര്യം",
        "NORMAL_CONDITIONS": "സാധാരണ നില",
        "MONITOR_CONDITIONS": "സ്ഥിതിഗതികൾ നിരീക്ഷിക്കുക",
        "PREPARE_FOR_EVACUATION": "മാറിത്താമസിക്കാൻ തയ്യാറെടുക്കുക",
        "IMMEDIATE_EVACUATION": "ഉടൻ സുരക്ഷിത സ്ഥാനത്തേക്ക് മാറുക",
        "safe_route": "സുരക്ഷിത പാത",
        "nearest_shelter": "അടുത്തുള്ള ദുരിതാശ്വാസ ക്യാമ്പ്",
        "open": "തുറന്നിരിക്കുന്നു",
        "closed": "അടച്ചിരിക്കുന്നു",
        "water_level": "ജലനിരപ്പ്",
        "rainfall": "മഴയുടെ അളവ്",
        "stale_warning": "ശ്രദ്ധിക്കുക: സെൻസർ വിവരങ്ങൾ കാലതാമസമുള്ളതാണ്, നിലവിലെ സാഹചര്യം നേരിട്ട് ഉറപ്പുവരുത്തുക.",
    },
    "ta": {
        "LOW": "குறைந்த ஆபத்து",
        "MODERATE": "மிதமான ஆபத்து",
        "HIGH": "அதிக ஆபத்து",
        "CRITICAL": "தீவிர அவசர ஆபத்து",
        "NORMAL_CONDITIONS": "இயல்பு நிலை",
        "MONITOR_CONDITIONS": "நிலையை கண்காணிக்கவும்",
        "PREPARE_FOR_EVACUATION": "வெளியேற தயாராகுங்கள்",
        "IMMEDIATE_EVACUATION": "உடனடியாக பாதுகாப்பான இடத்திற்கு செல்லவும்",
        "safe_route": "பாதுகாப்பான பாதை",
        "nearest_shelter": "அருகிலுள்ள நிவாரண முகாம்",
        "open": "திறந்துள்ளது",
        "closed": "மூடப்பட்டுள்ளது",
        "water_level": "நீர் மட்டம்",
        "rainfall": "மழை அளவு",
        "stale_warning": "கவனிக்கவும்: சென்சார் தகவல் தாமதமானது, தற்போதைய நிலையை உள்ளூரில் சரிபார்க்கவும்.",
    },
    "te": {
        "LOW": "తక్కువ ప్రమాదం",
        "MODERATE": "మధ్యస్థ ప్రమాదం",
        "HIGH": "అధిక ప్రమాదం",
        "CRITICAL": "తీవ్ర అత్యవసర ప్రమాదం",
        "NORMAL_CONDITIONS": "సాధారణ పరిస్థితి",
        "MONITOR_CONDITIONS": "పరిస్థితిని పర్యవేక్షించండి",
        "PREPARE_FOR_EVACUATION": "తరలింపుకు సిద్ధంగా ఉండండి",
        "IMMEDIATE_EVACUATION": "వెంటనే సురక్షిత ప్రాంతానికి వెళ్లండి",
        "safe_route": "సురక్షిత మార్గం",
        "nearest_shelter": "సమీప పునరావాస కేంద్రం",
        "open": "తెరిచి ఉంది",
        "closed": "మూసివేయబడింది",
        "water_level": "నీటి మట్టం",
        "rainfall": "వర్షపాతం",
        "stale_warning": "గమనిక: సెన్సార్ డేటా ఆలస్యమైంది, ప్రస్తుత పరిస్థితులను స్థానికంగా నిర్ధారించుకోండి.",
    },
    "mr": {
        "LOW": "कमी धोका",
        "MODERATE": "मध्यम धोका",
        "HIGH": "उच्च धोका",
        "CRITICAL": "गंभीर आणीबाणी धोका",
        "NORMAL_CONDITIONS": "सामान्य परिस्थिती",
        "MONITOR_CONDITIONS": "परिस्थितीवर लक्ष ठेवा",
        "PREPARE_FOR_EVACUATION": "सुरक्षित स्थलांतराची तयारी करा",
        "IMMEDIATE_EVACUATION": "तातडीने सुरक्षित स्थळी जा",
        "safe_route": "सुरक्षित मार्ग",
        "nearest_shelter": "जवळचे निवारा केंद्र",
        "open": "सुरू आहे",
        "closed": "बंद आहे",
        "water_level": "पाण्याची पातळी",
        "rainfall": "पावसाचे प्रमाण",
        "stale_warning": "सूचना: सेन्सर माहिती जुनी आहे, सद्य परिस्थितीची स्थानिक पातळीवर खात्री करा.",
    },
    "bn": {
        "LOW": "কম ঝুঁকি",
        "MODERATE": "মাঝারি ঝুঁকি",
        "HIGH": "উচ্চ ঝুঁকি",
        "CRITICAL": "চরম জরুরি ঝুঁকি",
        "NORMAL_CONDITIONS": "স্বাভাবিক পরিস্থিতি",
        "MONITOR_CONDITIONS": "পরিস্থিতির ওপর নজর রাখুন",
        "PREPARE_FOR_EVACUATION": "নিরাপদ স্থানে যাওয়ার প্রস্তুতি নিন",
        "IMMEDIATE_EVACUATION": "অবিলম্বে নিরাপদ আশ্রয়ে যান",
        "safe_route": "নিরাপদ পথ",
        "nearest_shelter": "নিকটবর্তী আশ্রয়কেন্দ্র",
        "open": "খোলা আছে",
        "closed": "বন্ধ আছে",
        "water_level": "পানির স্তর",
        "rainfall": "বৃষ্টিপাতের পরিমাণ",
        "stale_warning": "সতর্কতা: সেন্সর ডেটা বিলম্বিত, বর্তমান পরিস্থিতি স্থানীয়ভাবে যাচাই করুন।",
    },
    "ur": {
        "LOW": "کم خطرہ",
        "MODERATE": "معتدل خطرہ",
        "HIGH": "زیادہ خطرہ",
        "CRITICAL": "شدید ہنگامی خطرہ",
        "NORMAL_CONDITIONS": "معمول کے حالات",
        "MONITOR_CONDITIONS": "صورتحال پر نظر رکھیں",
        "PREPARE_FOR_EVACUATION": "انخلاء کی تیاری کریں",
        "IMMEDIATE_EVACUATION": "فوری محفوظ مقام پر منتقل ہوں",
        "safe_route": "محفوظ راستہ",
        "nearest_shelter": "قریبی پناہ گاہ",
        "open": "کھلا ہے",
        "closed": "بند ہے",
        "water_level": "پانی کی سطح",
        "rainfall": "بارش کی رفتار",
        "stale_warning": "نوٹ: سینسر ڈیٹا تاخیر کا شکار ہے، موجودہ صورتحال کی مقامی طور پر تصدیق کریں۔",
    },
    "ne": {
        "LOW": "न्यून जोखिम",
        "MODERATE": "मध्यम जोखिम",
        "HIGH": "उच्च जोखिम",
        "CRITICAL": "गम्भीर आपतकालीन जोखिम",
        "NORMAL_CONDITIONS": "सामान्य अवस्था",
        "MONITOR_CONDITIONS": "अवस्था निगरानी गर्नुहोस्",
        "PREPARE_FOR_EVACUATION": "सुरक्षित स्थानमा सर्न तयारी गर्नुहोस्",
        "IMMEDIATE_EVACUATION": "तुरुन्त सुरक्षित स्थानमा जानुहोस्",
        "safe_route": "सुरक्षित बाटो",
        "nearest_shelter": "नजिकको आश्रय स्थल",
        "open": "खुल्ला छ",
        "closed": "बन्द छ",
        "water_level": "पानीको सतह",
        "rainfall": "वर्षाको दर",
        "stale_warning": "ध्यान दिनुहोस्: सेन्सर विवरण ढिलो भएको छ, स्थानीय अवस्था यकिन गर्नुहोस्।",
    },
}


def clean_natural_text(text: str) -> str:
    """
    Strips all Markdown formatting (###, **, *, bullet markers, numbered lists, raw json)
    and produces smooth, human-readable paragraphs.
    """
    if not text:
        return ""

    # Remove code blocks ```...```
    text = re.sub(r"```[\s\S]*?```", "", text)
    # Remove inline code `...`
    text = re.sub(r"`([^`]+)`", r"\1", text)
    # Remove markdown headers (#, ##, ###, etc.)
    text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.MULTILINE)
    # Remove bold / italic markers: **, *, __, _
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"(?<!\w)_([^_]+)_(?!\w)", r"\1", text)
    # Remove bullet symbols (- , * , + , • , ◦ ) at line starts
    text = re.sub(r"^\s*[-*+•◦]\s+", "", text, flags=re.MULTILINE)
    # Remove numbered list prefixes (1. , 2. ) at line starts
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    # Remove blockquotes >
    text = re.sub(r"^\s*>\s*", "", text, flags=re.MULTILINE)

    # Normalize lines into natural flowing paragraphs
    lines = [line.strip() for line in text.splitlines()]
    paragraphs = []
    current_p = []
    for line in lines:
        if not line:
            if current_p:
                paragraphs.append(" ".join(current_p))
                current_p = []
        else:
            current_p.append(line)
    if current_p:
        paragraphs.append(" ".join(current_p))

    cleaned = "\n\n".join(paragraphs).strip()
    return cleaned


def is_gemini_configured() -> bool:
    """Returns True if a non-placeholder GEMINI_API_KEY is configured."""
    key = (getattr(settings, "GEMINI_API_KEY", None) or "").strip()
    if not key:
        return False
    placeholders = ["your_gemini_api_key", "your_actual_api_key", "change_this", "dummy", "placeholder", "xxx"]
    if any(p in key.lower() for p in placeholders):
        return False
    return True


def get_gemini_client():
    """
    Initializes and returns the official Google GenAI Client.
    Returns None if the key is missing, a placeholder, or invalid.
    """
    if not is_gemini_configured():
        return None
    try:
        from google import genai
        return genai.Client(api_key=settings.GEMINI_API_KEY.strip())
    except Exception as e:
        logger.error(f"Failed to create Google GenAI Client: {e}")
        return None


def call_gemini_with_fallback(
    client,
    contents: str,
    preferred_model: Optional[str] = None,
):
    """
    Calls Google Gemini API with the preferred model.
    If the requested model is deprecated/retired upstream by Google
    (e.g. 404 models/gemini-2.5-flash is no longer available to new users)
    or temporarily overloaded (503), it seamlessly falls back to active production models
    (gemini-3.5-flash, gemini-3.8-flash, gemini-2.5-flash-lite).
    Returns tuple: (response, model_used).
    """
    configured = preferred_model or getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    candidates = [configured]
    for alt in ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-flash-lite"]:
        if alt not in candidates:
            candidates.append(alt)

    last_error = None
    for model_name in candidates:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
            )
            return response, model_name
        except Exception as e:
            last_error = e
            err_msg = str(e).lower()
            if any(term in err_msg for term in ["404", "not_found", "no longer available", "503", "unavailable", "overloaded"]):
                logger.warning(f"Gemini model '{model_name}' unavailable ({e}), trying fallback candidate...")
                continue
            raise e

    raise last_error


def test_gemini_connection() -> Dict[str, Any]:
    """
    Performs a real test request to Google Gemini API to verify the API key and model connectivity.
    """
    if not is_gemini_configured():
        return {
            "configured": False,
            "connected": False,
            "model": getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash"),
            "status": "unconfigured",
            "message": "GEMINI_API_KEY is not configured in backend/.env. Please configure GEMINI_API_KEY.",
        }

    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY.strip())
        configured_model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
        
        response, actual_model = call_gemini_with_fallback(
            client=client,
            contents="Respond with the single word: OK",
            preferred_model=configured_model,
        )
        output = (response.text or "").strip()
        return {
            "configured": True,
            "connected": True,
            "model": actual_model,
            "configured_model": configured_model,
            "status": "connected",
            "message": f"Successfully connected to Google Gemini API using model '{actual_model}'.",
            "sample_response": output,
        }
    except Exception as e:
        logger.error(f"Gemini API connection test failed: {e}")
        err_msg = str(e)
        return {
            "configured": True,
            "connected": False,
            "model": getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash"),
            "status": "error",
            "message": f"Gemini API request failed: {err_msg}",
            "error": err_msg,
        }


def generate_flood_explanation(
    snapshot: Dict[str, Any],
    safety_baseline: Dict[str, Any],
    language: str = "en",
) -> Dict[str, Any]:
    """
    Generates a natural conversational flood situation explanation and safety guidance
    using Google Gemini API grounded in live sensor data, LSTM prediction, and safety rules.
    If Gemini is unconfigured or fails, gracefully returns a high-quality deterministic explanation.
    """
    lang_code = language if language in SUPPORTED_LANGUAGES else "en"
    lang_name = SUPPORTED_LANGUAGES[lang_code]["name"]

    river_name = snapshot.get("river_name") or "Bagmati River"
    sensor_loc = snapshot.get("sensor_location") or "Monitored River Basin"
    water_level = snapshot.get("water_level")
    rainfall = snapshot.get("rainfall")
    trend = snapshot.get("water_level_trend", "STABLE")
    rate_of_rise = snapshot.get("rate_of_increase_per_hour", 0.0)
    data_status = snapshot.get("data_status", "FRESH")
    reading_age = snapshot.get("reading_age_minutes", 0)

    lstm = snapshot.get("lstm_prediction") or {}
    lstm_model = lstm.get("model_version", "LSTM Flood Predictor v2.1")
    lstm_risk = lstm.get("risk_level", safety_baseline.get("risk_level", "LOW"))
    lstm_conf = int(float(lstm.get("confidence", 0.88)) * 100)

    risk_level = safety_baseline.get("risk_level", "LOW")
    urgency = safety_baseline.get("urgency", "LOW")
    action = safety_baseline.get("recommended_action", "MONITOR_CONDITIONS")

    client = get_gemini_client()
    if client:
        try:
            model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

            system_instruction = f"""You are the Intelligent Flood Response Assistant of the official Flood Monitoring and Prediction System.
Your task is to generate a natural, calm, authoritative disaster-management update for residents and responders.

STRICT CONSTRAINTS:
1. Target language: {lang_name} ({SUPPORTED_LANGUAGES[lang_code]['native']}). Produce the entire response in {lang_name}.
2. Output format: Write 2 or 3 smooth, coherent paragraphs of natural prose.
3. NEVER output Markdown formatting: do NOT use bold (**), italics (*), headers (###), bullet points (- or •), numbered lists (1.), or raw JSON.
4. Ground strictly in the provided live telemetry. Do NOT invent water levels, rainfall, or localities.
5. If data status is STALE or MISSING, explicitly communicate that real-time conditions cannot be verified and urge local caution.
6. Mention the river name ({river_name}), locality ({sensor_loc}), water level ({water_level}m), rainfall ({rainfall}mm/h), rise rate ({rate_of_rise}m/h), and that the {lstm_model} indicates {lstm_risk} risk at {lstm_conf}% confidence.
7. Include 3-4 clear, actionable safety instructions embedded naturally within the advice.
8. Maintain the authoritative risk classification ({risk_level}).
"""

            user_prompt = f"""Generate the flood situation report for {river_name} ({sensor_loc}).
Risk Level: {risk_level}
Water Level: {water_level} meters ({trend}, rate of rise: {rate_of_rise} m/h)
Rainfall Intensity: {rainfall} mm/h
Data Status: {data_status} (Reading age: {reading_age} minutes)
LSTM Forecast: {lstm_model} predicts {lstm_risk} risk with {lstm_conf}% confidence.
Recommended Action: {action}
Language: {lang_name}"""

            response, actual_model = call_gemini_with_fallback(
                client=client,
                contents=f"{system_instruction}\n\n{user_prompt}",
                preferred_model=model_name,
            )

            raw_text = response.text or ""
            natural_text = clean_natural_text(raw_text)
            if natural_text and len(natural_text) > 40:
                return {
                    "explanation": natural_text,
                    "risk_level": risk_level,
                    "language": lang_code,
                    "is_fallback": False,
                    "model_used": actual_model,
                }
        except Exception as e:
            logger.warning(f"Gemini generation failed: {e}. Falling back to deterministic engine.")

    # Resilient Deterministic Generation
    fallback_text = _build_deterministic_explanation(snapshot, safety_baseline, lang_code)
    return {
        "explanation": clean_natural_text(fallback_text),
        "risk_level": risk_level,
        "language": lang_code,
        "is_fallback": True,
        "model_used": "deterministic_safety_engine",
    }


def _build_deterministic_explanation(
    snapshot: Dict[str, Any],
    safety_baseline: Dict[str, Any],
    lang_code: str = "en",
) -> str:
    """
    Constructs natural conversational paragraphs grounded in real database values,
    translated into the requested language.
    """
    river = snapshot.get("river_name") or "Bagmati River"
    loc = snapshot.get("sensor_location") or "Monitored River Basin"
    wl = snapshot.get("water_level")
    rain = snapshot.get("rainfall")
    trend = snapshot.get("water_level_trend", "STABLE")
    rate = snapshot.get("rate_of_increase_per_hour", 0.0)
    data_status = snapshot.get("data_status", "FRESH")
    age = snapshot.get("reading_age_minutes", 0)

    lstm = snapshot.get("lstm_prediction") or {}
    lstm_model = lstm.get("model_version", "LSTM model")
    lstm_risk = lstm.get("risk_level", "MODERATE")
    lstm_conf = int(float(lstm.get("confidence", 0.88)) * 100)

    risk = safety_baseline.get("risk_level", "LOW")

    # Stale/missing data warning
    stale_text = ""
    if data_status == "STALE":
        stale_text = f" Current telemetry is {age} minutes old, so real-time conditions cannot be fully verified. Please exercise heightened caution."
    elif data_status == "MISSING":
        stale_text = " Live sensor readings are temporarily unavailable. Current conditions cannot be verified directly from the gauge."

    # Base English paragraph
    if risk == "CRITICAL":
        p1 = (
            f"Extreme flood conditions have been detected near {river} at {loc}. The water level has reached "
            f"{wl} metres and is {trend.lower().replace('_', ' ')} at an alarming rate of {rate} metres per hour. "
            f"Rainfall intensity is recorded at {rain} mm/h. The {lstm_model} indicates a {lstm_risk} flood danger with {lstm_conf}% confidence.{stale_text}"
        )
        p2 = (
            "Residents in low-lying zones and adjacent riverbanks should evacuate to higher ground or the nearest verified shelter immediately. "
            "Never attempt to walk or drive through moving water. Disconnect electrical breakers and gas supplies before leaving. "
            "Keep emergency contact numbers 112 and 1078 accessible and follow all directives from local disaster management authorities."
        )
    elif risk == "HIGH":
        p1 = (
            f"Heavy rainfall has been detected near the {river} at {loc}, and the water level is rising rapidly. "
            f"The water gauge currently measures {wl} metres with active precipitation of {rain} mm/h. "
            f"The {lstm_model} indicates a {lstm_risk} flood risk with {lstm_conf}% confidence.{stale_text}"
        )
        p2 = (
            "Residents in nearby low-lying areas should stay alert, avoid approaching the river and follow official evacuation instructions. "
            "Prepare an emergency kit with clean drinking water, essential medications, torch, and identification documents in a waterproof bag. "
            "Check the location of your nearest open evacuation centre and avoid flood-prone roadways."
        )
    elif risk == "MODERATE":
        p1 = (
            f"Elevated water levels have been observed near {river} at {loc}. The water level is currently at {wl} metres with a "
            f"{trend.lower().replace('_', ' ')} trend, and rainfall is {rain} mm/h. The {lstm_model} reflects a {lstm_risk} risk with {lstm_conf}% confidence.{stale_text}"
        )
        p2 = (
            "Residents should monitor local drainage conditions and keep drains clear of debris. Avoid parking vehicles in basement areas "
            "or low spots. Review your family emergency plan and stay tuned to regular flood advisory bulletins."
        )
    else:
        p1 = (
            f"Monitored hydrological conditions along {river} at {loc} remain within safe operational parameters. "
            f"The water level is {wl} metres and rainfall is {rain} mm/h. The {lstm_model} indicates normal conditions with {lstm_conf}% confidence.{stale_text}"
        )
        p2 = (
            "No emergency action or evacuation is required at this time. Routine monitoring of weather forecasts and local river levels continues. "
            "Keep storm drainage paths clean and report any localized blockages to municipal authorities."
        )

    full_english = f"{p1}\n\n{p2}"
    if lang_code == "en":
        return full_english

    # If another language requested, translate via dictionary or language template
    return _translate_with_template(full_english, risk, river, loc, wl, rain, trend, rate, lstm_model, lstm_risk, lstm_conf, stale_text, lang_code)


def _translate_with_template(
    english_text: str,
    risk: str,
    river: str,
    loc: str,
    wl: Any,
    rain: Any,
    trend: str,
    rate: float,
    lstm_model: str,
    lstm_risk: str,
    lstm_conf: int,
    stale_text: str,
    lang_code: str,
) -> str:
    """
    Provides natural language templates for the 10 supported languages when Gemini is offline.
    """
    dict_vals = EMERGENCY_DICTIONARY.get(lang_code, {})
    risk_trans = dict_vals.get(risk, risk)
    stale_trans = dict_vals.get("stale_warning", "") if stale_text else ""

    if lang_code == "kn":  # Kannada
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} ನದಿ ಮತ್ತು {loc} ಪ್ರದೇಶದ ಬಳಿ ಭಾರಿ ಮಳೆ ಮತ್ತು ನೀರಿನ ಮಟ್ಟ ವೇಗವಾಗಿ ಹೆಚ್ಚಾಗುತ್ತಿರುವುದು ಪತ್ತೆಯಾಗಿದೆ. "
                f"ಪ್ರಸ್ತುತ ನೀರಿನ ಮಟ್ಟ {wl} ಮೀಟರ್ ಆಗಿದ್ದು, ಮಳೆಯ ಪ್ರಮಾಣ ಗಂಟೆಗೆ {rain} ಮಿಮೀ ಆಗಿದೆ. "
                f"{lstm_model} ಮುನ್ಸೂಚನೆಯು {lstm_conf}% ನಿಖರತೆಯೊಂದಿಗೆ {risk_trans} ಸೂಚಿಸುತ್ತದೆ. {stale_trans}\n\n"
                f"ತಗ್ಗು ಪ್ರದೇಶಗಳಲ್ಲಿರುವ ನಿವಾಸಿಗಳು ತಕ್ಷಣ ಎಚ್ಚೆತ್ತುಕೊಂಡು, ನದಿಯ ಹತ್ತಿರ ಹೋಗುವುದನ್ನು ತಪ್ಪಿಸಿ ಅಧಿಕೃತ ಸುರಕ್ಷತಾ ಸೂಚನೆಗಳನ್ನು ಪಾಲಿಸಬೇಕು. "
                f"ಹತ್ತಿರದ ತೆರೆದ ಪುನರ್ವಸತಿ ಕೇಂದ್ರವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ತುರ್ತು ಸಂಖ್ಯೆ 112 ಅಥವಾ 1078 ಗೆ ಸಂಪರ್ಕಿಸಿ."
            )
        elif risk == "MODERATE":
            return (
                f"{river} ನದಿ ({loc}) ಪ್ರದೇಶದಲ್ಲಿ ನೀರಿನ ಮಟ್ಟ ಏರಿಕೆಯಾಗಿದ್ದು, ಪ್ರಸ್ತುತ {wl} ಮೀಟರ್ ಮತ್ತು ಮಳೆ {rain} ಮಿಮೀ ದಾಖಲಾಗಿದೆ. "
                f"{lstm_model} ಪ್ರಕಾರ ಪರಿಸ್ಥಿತಿಯು {risk_trans} ಅಡಿಯಲ್ಲಿ ಬರುತ್ತದೆ. {stale_trans}\n\n"
                f"ಸಾರ್ವಜನಿಕರು ಚರಂಡಿ ವ್ಯವಸ್ಥೆಯನ್ನು ಗಮನಿಸಬೇಕು ಮತ್ತು ತಗ್ಗು ಪ್ರದೇಶಗಳಲ್ಲಿ ವಾಹನಗಳನ್ನು ನಿಲ್ಲಿಸುವುದನ್ನು ತಪ್ಪಿಸಬೇಕು. "
                f"ತುರ್ತು ಪರಿಸ್ಥಿತಿಗಳಿಗಾಗಿ ಅಧಿಕೃತ ಮಾಹಿತಿಯನ್ನು ಗಮನಿಸುತ್ತಿರಿ."
            )
        else:
            return (
                f"{river} ನದಿ ({loc}) ಪ್ರದೇಶದಲ್ಲಿ ನೀರಿನ ಮಟ್ಟವು ಸುರಕ್ಷಿತ ಮಿತಿಯಲ್ಲಿದೆ. ನೀರಿನ ಮಟ್ಟ {wl} ಮೀಟರ್ ಮತ್ತು ಮಳೆ {rain} ಮಿಮೀ ಆಗಿದೆ. "
                f"{lstm_model} ಪ್ರಕಾರ ಸಾಮಾನ್ಯ ಪರಿಸ್ಥಿತಿ ಇದೆ. {stale_trans}\n\n"
                f"ಯಾವುದೇ ಸ್ಥಳಾಂತರದ ಅಗತ್ಯವಿಲ್ಲ. ನಿಯಮಿತ ಹವಾಮಾನ ವರದಿಗಳನ್ನು ಗಮನಿಸುತ್ತಿರಿ."
            )

    elif lang_code == "hi":  # Hindi
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} नदी और {loc} के पास भारी वर्षा और जल स्तर में तेजी से वृद्धि दर्ज की गई है। "
                f"वर्तमान जल स्तर {wl} मीटर है और वर्षा की तीव्रता {rain} मिमी/घंटा है। "
                f"{lstm_model} मॉडल {lstm_conf}% विश्वास के साथ {risk_trans} का संकेत देता है। {stale_trans}\n\n"
                f"निचले इलाकों के निवासियों को सतर्क रहना चाहिए, नदी के पास जाने से बचना चाहिए और आधिकारिक निकासी निर्देशों का पालन करना चाहिए। "
                f"निकटतम सत्यापित आश्रय स्थल की स्थिति जांचें और आपातकालीन हेल्पलाइन 112 या 1078 पर संपर्क करें।"
            )
        elif risk == "MODERATE":
            return (
                f"{river} ({loc}) के पास जल स्तर में वृद्धि देखी गई है। वर्तमान में जल स्तर {wl} मीटर और वर्षा {rain} मिमी/घंटा है। "
                f"{lstm_model} अनुसार स्थिति {risk_trans} श्रेणी में है। {stale_trans}\n\n"
                f"कृपया जल निकासी पर नज़र रखें और बेसमेंट में वाहन पार्क न करें। आपातकालीन योजनाओं की समीक्षा करें।"
            )
        else:
            return (
                f"{river} ({loc}) पर जल स्तर पूरी तरह सुरक्षित सीमा के भीतर है। जल स्तर {wl} मीटर और वर्षा {rain} मिमी/घंटा दर्ज है। "
                f"वर्तमान में स्थिति सामान्य है। {stale_trans}\n\n"
                f"किसी तत्काल निकासी की आवश्यकता नहीं है। मौसम बुलेटिन पर नज़र बनाए रखें।"
            )

    elif lang_code == "ml":  # Malayalam
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} നദിക്കരയിലും {loc} പരിസരത്തും കനത്ത മഴയും ജലനിരപ്പ് അതിവേഗം ഉയരുന്നതും രേഖപ്പെടുത്തിയിട്ടുണ്ട്. "
                f"നിലവിലെ ജലനിരപ്പ് {wl} മീറ്ററും മഴ {rain} മി.മീ/മണിക്കൂറുമാണ്. "
                f"{lstm_model} പ്രകാരം {risk_trans} മുന്നറിയിപ്പ് നിലവിലുണ്ട്. {stale_trans}\n\n"
                f"താഴ്ന്ന പ്രദേശങ്ങളിലുള്ളവർ ഉടൻ സുരക്ഷിത സ്ഥാനങ്ങളിലേക്ക് മാറുകയും ഔദ്യോഗിക ദുരന്തനിവാരണ നിർദ്ദേശങ്ങൾ പാലിക്കുകയും വേണം. "
                f"അടിയന്തര സഹായത്തിന് 112 അല്ലെങ്കിൽ 1078 എന്ന നമ്പറുകളിൽ ബന്ധപ്പെടുക."
            )
        else:
            return (
                f"{river} നദിയിലെ ജലനിരപ്പ് {wl} മീറ്ററോടെ സാധാരണ നിലയിലാണ്. മഴ {rain} മി.മീ/മണിക്കൂറാണ്. "
                f"നിലവിൽ ആശങ്കപ്പെടേണ്ട സാഹചര്യമില്ല. {stale_trans}\n\n"
                f"കാലാവസ്ഥാ മുന്നറിയിപ്പുകൾ പതിവായി ശ്രദ്ധിക്കുക."
            )

    elif lang_code == "ta":  # Tamil
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} ஆறு மற்றும் {loc} பகுதிகளில் பலத்த மழையும் நீர்மட்டம் வேகமாக உயர்வதும் கண்டறியப்பட்டுள்ளது. "
                f"தற்போதைய நீர்மட்டம் {wl} மீட்டர் மற்றும் மழை {rain} மிமீ/மணி ஆகும். "
                f"{lstm_model} கணிப்பு {risk_trans} எச்சரிக்கையை உறுதிப்படுத்துகிறது. {stale_trans}\n\n"
                f"தாழ்வான பகுதிகளில் உள்ள பொதுமக்கள் உடனடியாக விழிப்புடன் இருந்து, பாதுகாப்பான முகாம்களுக்கு செல்லவும். "
                f"அவசர உதவிக்கு 112 அல்லது 1078 எண்ணை அழைக்கவும்."
            )
        else:
            return (
                f"{river} ஆற்றில் நீர்மட்டம் {wl} மீட்டருடன் பாதுகாப்பான அளவில் உள்ளது. மழை {rain} மிமீ/மணி ஆகும். "
                f"தற்போது நிலைமை சாதாரணமாக உள்ளது. {stale_trans}\n\n"
                f"எந்த உடனடி வெளியேற்றமும் தேவையில்லை. வானிலை தகவல்களை தொடர்ந்து கவனிக்கவும்."
            )

    elif lang_code == "te":  # Telugu
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} నది మరియు {loc} సమీపంలో భారీ వర్షం మరియు నీటి మట్టం వేగంగా పెరగడం నమోదైంది. "
                f"ప్రస్తుత నీటి మట్టం {wl} మీటర్లు మరియు వర్షపాతం {rain} మిమీ/గం. "
                f"{lstm_model} ప్రకారం {risk_trans} ప్రమాదం పొంచి ఉంది. {stale_trans}\n\n"
                f"లోతట్టు ప్రాంతాల ప్రజలు అప్రమత్తంగా ఉండాలి మరియు అధికారిక తరలింపు ఆదేశాలను పాటించాలి. "
                f"సమీప పునరావాస కేంద్రాన్ని సంప్రదించండి లేదా అత్యవసర హెల్ప్‌లైన్ 112 కు కాల్ చేయండి."
            )
        else:
            return (
                f"{river} వద్ద నీటి మట్టం {wl} మీటర్లతో సురక్షిత పరిమితుల్లో ఉంది. పరిస్థితి సాధారణంగా ఉంది. {stale_trans}\n\n"
                f"తక్షణ తరలింపు అవసరం లేదు. వాతావరణ సమాచారాన్ని గమనిస్తూ ఉండండి."
            )

    elif lang_code == "mr":  # Marathi
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} नदी आणि {loc} जवळ मुसळधार पाऊस आणि पाण्याची पातळी वेगाने वाढल्याचे आढळले आहे. "
                f"सध्या पाण्याची पातळी {wl} मीटर असून पाऊस {rain} मिमी/तास आहे. "
                f"{lstm_model} मॉडेल {risk_trans} इशारा दर्शवते. {stale_trans}\n\n"
                f"सखल भागातील नागरिकांनी सतर्क राहावे आणि अधिकृत स्थलांतर सूचनांचे पालन करावे. "
                f"जवळच्या सुरक्षित निवारा केंद्राचा शोध घ्या आणि आपत्कालीन मदत क्रमांक 112 वर संपर्क करा."
            )
        else:
            return (
                f"{river} नदीची पातळी {wl} मीटर असून परिस्थिती सुरक्षित आणि सामान्य आहे. {stale_trans}\n\n"
                f"स्थलांतराची आवश्यकता नाही. हवामान अंदाजावर लक्ष ठेवा."
            )

    elif lang_code == "bn":  # Bengali
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} নদী ও {loc} এলাকায় ভারী বৃষ্টিপাত এবং পানির স্তর দ্রুত বৃদ্ধি পাওয়া গেছে। "
                f"বর্তমান পানির স্তর {wl} মিটার এবং বৃষ্টিপাত {rain} মিমি/ঘণ্টা। "
                f"{lstm_model} পূর্বাভাস অনুযায়ী {risk_trans} সতর্কতা রয়েছে। {stale_trans}\n\n"
                f"নিচু এলাকার বাসিন্দাদের সতর্ক থাকতে হবে এবং নিরাপদ আশ্রয়কেন্দ্রে সরে যাওয়ার নির্দেশ মেনে চলতে হবে। "
                f"জরুরি প্রয়োজনে 112 বা 1078 নম্বরে কল করুন।"
            )
        else:
            return (
                f"{river} এলাকায় পানির স্তর {wl} মিটারে স্বাভাবিক রয়েছে। বৃষ্টিপাত {rain} মিমি/ঘণ্টা। {stale_trans}\n\n"
                f"এই মুহূর্তে স্থানান্তরের প্রয়োজন নেই। নিয়মিত আবহাওয়া বুলেটিন লক্ষ্য রাখুন।"
            )

    elif lang_code == "ur":  # Urdu
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} اور {loc} کے قریب شدید بارش اور پانی کی سطح میں تیزی سے اضافہ ریکارڈ کیا گیا ہے۔ "
                f"پانی کی موجودہ سطح {wl} میٹر اور بارش {rain} ملی میٹر فی گھنٹہ ہے۔ "
                f"{lstm_model} ماڈل {risk_trans} کا اشارہ دیتا ہے۔ {stale_trans}\n\n"
                f"نش نشیبی علاقوں کے رہائشی فوری الرٹ رہیں اور قریبی محفوظ پناہ گاہوں میں منتقل ہوں۔ "
                f"ہنگامی مدد کے لیے 112 پر رابطہ کریں۔"
            )
        else:
            return (
                f"{river} کے پاس پانی کی سطح {wl} میٹر پر محفوظ اور معمول کے مطابق ہے۔ {stale_trans}\n\n"
                f"فوری انخلاء کی ضرورت نہیں ہے۔ موسم کے بلیٹن پر نظر رکھیں۔"
            )

    elif lang_code == "ne":  # Nepali
        if risk in ("CRITICAL", "HIGH"):
            return (
                f"{river} र {loc} आसपास भारी वर्षा र पानीको सतह द्रुत गतिमा बढिरहेको देखिएको छ। "
                f"हाल पानीको सतह {wl} मिटर र वर्षा {rain} मिमी/घण्टा छ। "
                f"{lstm_model} ले {risk_trans} देखाएको छ। {stale_trans}\n\n"
                f"तटवर्ती तथा होचा क्षेत्रका बासिन्दाहरू तुरुन्त सतर्क भई सुरक्षित आश्रय स्थलतर्फ लाग्नुहोस्। "
                f"आपतकालीन सेवाका लागि 112 मा सम्पर्क गर्नुहोस्।"
            )
        else:
            return (
                f"{river} क्षेत्रमा पानीको सतह {wl} मिटर सामान्य सीमाभित्र छ। {stale_trans}\n\n"
                f"अहिले सुरक्षित रहनुहोस् र स्थानीय मौसम सूचनाहरू सुन्नुहोस्।"
            )

    return english_text


def translate_text(text: str, target_language: str = "en") -> str:
    """
    Translates text into the target language using Google Gemini if available,
    or returns clean natural text with dictionary mappings.
    """
    if not text:
        return ""
    target_code = target_language if target_language in SUPPORTED_LANGUAGES else "en"
    if target_code == "en":
        return clean_natural_text(text)

    client = get_gemini_client()
    if client:
        try:
            model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
            lang_name = SUPPORTED_LANGUAGES[target_code]["name"]
            native_name = SUPPORTED_LANGUAGES[target_code]["native"]

            prompt = f"""You are an official disaster management translation service.
Translate the following emergency communication into {lang_name} ({native_name}).

STRICT RULES:
1. Translate accurately into natural, fluent {lang_name}.
2. Keep all numbers, measurements, place names, shelter names, road names, and telephone numbers exact.
3. Do NOT change risk levels (LOW, MODERATE, HIGH, CRITICAL).
4. Do NOT output Markdown formatting (no headers, no bold **, no bullets, no lists).
5. Output only plain natural paragraphs.

TEXT TO TRANSLATE:
{text}"""

            res, _ = call_gemini_with_fallback(
                client=client,
                contents=prompt,
                preferred_model=model_name,
            )
            if res.text:
                return clean_natural_text(res.text)
        except Exception as e:
            logger.warning(f"Gemini translation failed: {e}. Preserving text.")

    # Fallback: dictionary replace or return clean text
    dict_map = EMERGENCY_DICTIONARY.get(target_code, {})
    translated = text
    for k, v in dict_map.items():
        translated = translated.replace(k, v)
    return clean_natural_text(translated)


def translate_precautions(precautions: List[str], target_language: str = "en") -> List[str]:
    """
    Translates a list of safety precautions into the target language.
    """
    if not precautions:
        return []
    target_code = target_language if target_language in SUPPORTED_LANGUAGES else "en"
    if target_code == "en":
        return [clean_natural_text(p) for p in precautions]

    client = get_gemini_client()
    if client:
        try:
            model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
            lang_name = SUPPORTED_LANGUAGES[target_code]["name"]

            prompt = f"""Translate the following list of safety precautions into {lang_name}.
Return ONLY a valid JSON array of translated strings with no markdown backticks, no bold text, no bullets.

JSON TO TRANSLATE:
{json.dumps(precautions)}"""

            res, _ = call_gemini_with_fallback(
                client=client,
                contents=prompt,
                preferred_model=model_name,
            )
            raw = (res.text or "").strip()
            # Clean possible markdown json
            raw = re.sub(r"^```json\s*", "", raw)
            raw = re.sub(r"^```\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [clean_natural_text(str(item)) for item in parsed]
        except Exception as e:
            logger.warning(f"Failed to translate precautions with Gemini: {e}")

    # Fallback: translate individual items using fallback dictionary
    return [translate_text(p, target_code) for p in precautions]


__all__ = [
    "SUPPORTED_LANGUAGES",
    "EMERGENCY_DICTIONARY",
    "clean_natural_text",
    "is_gemini_configured",
    "get_gemini_client",
    "call_gemini_with_fallback",
    "test_gemini_connection",
    "generate_flood_explanation",
    "translate_text",
    "translate_precautions",
]
