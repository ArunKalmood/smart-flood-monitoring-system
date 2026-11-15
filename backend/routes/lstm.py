"""
GET /api/lstm/predict
====================
Returns the current dam LSTM forecast from the live rolling buffer.

Design constraints
------------------
* This route is completely separate from the existing rule-based prediction
  pipeline (/api/predictions/*) and the Gemini AI pipeline (/api/ai/*).
* It never reads from or writes to the `predictions` table.
* It never touches FloodData directly.
* All state comes from ml.dam.live_buffer (in-memory) and
  ml.dam.predictor (lazy-loaded Keras model).
* Requires authentication — same as every other dashboard route.

Hardware calibration note
--------------------------
The existing ESP32 HC-SR04 firmware reports raw sensor-to-water echo
distance.  The LSTM was trained on water DEPTH (reference height 10.5 cm).
Until the hardware has been mounted, calibrated, and the depth conversion
confirmed, the predictor returns available=False with an explanatory
reason so the frontend can show "Waiting for calibrated live sensor data."
No predictions are suppressed silently.
"""
import logging

from fastapi import APIRouter, Depends

from auth.permissions import require_auth

log = logging.getLogger(__name__)

router = APIRouter(prefix="/lstm", tags=["LSTM Forecast"])


@router.get(
    "/predict",
    summary="Dam LSTM water-level forecast",
    response_description=(
        "Forecast dict. When available=True the prediction fields are present. "
        "When available=False only 'available', 'reason', 'minutes_in_buffer', "
        "and 'training_source' are returned."
    ),
)
async def get_lstm_prediction(current_user=Depends(require_auth)):
    """
    Return the current dam LSTM forecast.

    - **available=False** until 60 valid consecutive one-minute water-depth
      records have accumulated in the live buffer.
    - Predictions are labelled EXPERIMENTAL / SIMULATED_DATA in every
      response — they must never be presented as verified real-world warnings.
    - The existing live sensor dashboard and rule-based predictions are
      completely unaffected by this endpoint.
    """
    try:
        from ml.dam.predictor import get_dam_prediction
        result = get_dam_prediction()
        return result
    except Exception as exc:
        log.error("LSTM predict endpoint error: %s", exc, exc_info=True)
        return {
            "available": False,
            "reason": f"Internal predictor error: {exc}",
            "minutes_in_buffer": 0,
            "training_source": "SIMULATED",
        }


@router.get(
    "/status",
    summary="Dam LSTM model and buffer status",
    response_description="Status dict with model readiness and buffer fill level.",
)
async def get_lstm_status(current_user=Depends(require_auth)):
    """
    Return the buffer fill level and model readiness without running inference.
    Useful for a dashboard status indicator before the buffer is full.
    """
    try:
        from ml.dam.live_buffer import dam_buffer
        from ml.dam.predictor import MODEL_PATH, SCALER_PATH
        import os, json

        minutes = dam_buffer.minutes_available()
        model_exists  = os.path.exists(MODEL_PATH)
        scaler_exists = os.path.exists(SCALER_PATH)

        meta = {}
        meta_path = os.path.join(os.path.dirname(MODEL_PATH), "dam_model_meta.json")
        if os.path.exists(meta_path):
            with open(meta_path, encoding="utf-8") as fh:
                raw = json.load(fh)
            meta = {
                "training_source": raw.get("training_source", "SIMULATED"),
                "disclaimer":      raw.get("disclaimer", ""),
                "window_len":      raw.get("window_len", 60),
                "feature_names":   raw.get("feature_names", []),
                "thresholds_cm":   raw.get("thresholds_cm", {}),
                "test_metrics_lstm": raw.get("test_metrics_lstm", {}),
            }

        return {
            "model_file_exists":  model_exists,
            "scaler_file_exists": scaler_exists,
            "model_ready":        model_exists and scaler_exists,
            "minutes_in_buffer":  minutes,
            "window_required":    60,
            "buffer_ready":       minutes >= 60,
            "training_source":    "SIMULATED",
            "calibration_note": (
                "Hardware depth calibration pending. "
                "The buffer will only accept readings once the sensor is "
                "mounted and the depth conversion is confirmed."
            ),
            "meta": meta,
        }
    except Exception as exc:
        log.error("LSTM status endpoint error: %s", exc, exc_info=True)
        return {
            "model_ready":       False,
            "buffer_ready":      False,
            "minutes_in_buffer": 0,
            "training_source":   "SIMULATED",
            "error":             str(exc),
        }
