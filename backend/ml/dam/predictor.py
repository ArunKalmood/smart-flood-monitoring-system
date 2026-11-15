"""
DamPredictor
============
Loads the trained dam LSTM artifacts once and provides on-demand predictions
from the live rolling window maintained by DamLiveBuffer.

Design guarantees
-----------------
* Never raises an exception that would crash the API — all errors are caught
  and returned as structured dicts with `available=False`.
* Never fits or modifies the scaler — transform() only.
* Never writes to any file.
* Completely independent of the existing Stage 3/v2 LSTM models and scalers.
* Completely independent of the rule-based prediction pipeline.
* Predictions are labelled as EXPERIMENTAL / SIMULATED_DATA in every response.

Unit note
---------
  Buffer holds water_level_cm (centimetres).
  Scaler was fit on centimetre values.
  Model outputs are raw centimetre values (linear output activation).
  All thresholds below are in centimetres.

Dam water-level thresholds (centimetres)
-----------------------------------------
  Normal   : 0 – 5.0 cm
  Warning  : > 5.0 cm up to 7.5 cm
  Critical : > 7.5 cm
"""
import logging
import os
from datetime import timezone

import numpy as np

log = logging.getLogger(__name__)

# ── paths ─────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_MODELS_DIR = os.path.join(_HERE, "..", "..", "ml", "models", "dam")
_MODELS_DIR = os.path.normpath(_MODELS_DIR)

MODEL_PATH  = os.path.join(_MODELS_DIR, "dam_lstm_simulated_v1.keras")
SCALER_PATH = os.path.join(_MODELS_DIR, "dam_scaler.pkl")
META_PATH   = os.path.join(_MODELS_DIR, "dam_model_meta.json")

# ── thresholds (centimetres) ──────────────────────────────────────────────────
NORMAL_MAX_CM  = 5.0
WARNING_MAX_CM = 7.5

# ── trend stability band (centimetres) ───────────────────────────────────────
TREND_STABLE_DELTA_CM = 0.5

# ── module-level caches ───────────────────────────────────────────────────────
_model  = None   # tensorflow.keras.Model
_scaler = None   # sklearn MinMaxScaler
_meta   = None   # dict from dam_model_meta.json


def _load_artifacts() -> tuple[bool, str]:
    """
    Lazy-load model and scaler. Called on first prediction request.
    Returns (success: bool, error_message: str).
    """
    global _model, _scaler, _meta

    if _model is not None and _scaler is not None:
        return True, ""

    if not os.path.exists(MODEL_PATH):
        return False, (
            f"Dam LSTM model not found at {MODEL_PATH!r}. "
            "Run backend/ml/dam/train_dam_lstm.py first."
        )
    if not os.path.exists(SCALER_PATH):
        return False, (
            f"Dam scaler not found at {SCALER_PATH!r}. "
            "Run backend/ml/dam/train_dam_lstm.py first."
        )

    try:
        import joblib
        from tensorflow import keras

        log.info("DamPredictor: loading model from %s ...", MODEL_PATH)
        _model  = keras.models.load_model(MODEL_PATH)
        _scaler = joblib.load(SCALER_PATH)

        if os.path.exists(META_PATH):
            import json
            with open(META_PATH) as fh:
                _meta = json.load(fh)

        log.info("DamPredictor: model and scaler loaded successfully.")
        return True, ""
    except Exception as exc:
        log.error("DamPredictor: failed to load artifacts: %s", exc, exc_info=True)
        return False, f"Failed to load model artifacts: {exc}"


def _classify_risk(water_level_cm: float) -> str:
    """Apply dam thresholds to a water level in centimetres."""
    if water_level_cm > WARNING_MAX_CM:
        return "critical"
    if water_level_cm > NORMAL_MAX_CM:
        return "warning"
    return "normal"


def _compute_trend(current_cm: float, predicted_15min_cm: float) -> str:
    """Compare current and 15-min prediction to determine direction."""
    delta = predicted_15min_cm - current_cm
    if delta > TREND_STABLE_DELTA_CM:
        return "rising"
    if delta < -TREND_STABLE_DELTA_CM:
        return "falling"
    return "stable"


def get_dam_prediction() -> dict:
    """
    Generate a dam water-level forecast from the live rolling window.

    Returns
    -------
    dict with the following keys:

    When a prediction is available (available=True):
        available               : True
        current_water_level_cm  : float  — last measured value (real sensor reading)
        predicted_15min_cm      : float  — LSTM forecast +15 min
        predicted_30min_cm      : float  — LSTM forecast +30 min
        trend                   : "rising" | "falling" | "stable"
        forecast_risk           : "normal" | "warning" | "critical"
        current_risk            : "normal" | "warning" | "critical"
        prediction_timestamp    : ISO-8601 UTC string
        training_source         : "SIMULATED"
        experimental_disclaimer : str
        minutes_in_buffer       : int
        thresholds_cm           : dict
        model_name              : str

    When not available (available=False):
        available               : False
        reason                  : str  — human-readable explanation
        minutes_in_buffer       : int
        training_source         : "SIMULATED"
    """
    from datetime import datetime
    from ml.dam.live_buffer import dam_buffer

    # 1. Try to load artifacts (lazy, cached after first call)
    ok, err = _load_artifacts()
    if not ok:
        return {
            "available":        False,
            "reason":           err,
            "minutes_in_buffer": dam_buffer.minutes_available(),
            "training_source":  "SIMULATED",
        }

    # 2. Get rolling window from buffer
    window, is_ready, n_minutes, reason = dam_buffer.get_window()

    if not is_ready:
        return {
            "available":        False,
            "reason":           reason,
            "minutes_in_buffer": n_minutes,
            "training_source":  "SIMULATED",
        }

    # 3. Scale inputs — transform only, never fit
    try:
        n, w, f = 1, window.shape[0], window.shape[1]   # (1, 60, 2)
        scaled_flat = _scaler.transform(window.reshape(-1, f))
        X = scaled_flat.reshape(n, w, f).astype(np.float32)
    except Exception as exc:
        log.error("DamPredictor: scaling failed: %s", exc, exc_info=True)
        return {
            "available":        False,
            "reason":           f"Input scaling error: {exc}",
            "minutes_in_buffer": n_minutes,
            "training_source":  "SIMULATED",
        }

    # 4. Run inference
    try:
        y_pred = _model.predict(X, verbose=0)   # shape (1, 2) — raw cm values
    except Exception as exc:
        log.error("DamPredictor: inference failed: %s", exc, exc_info=True)
        return {
            "available":        False,
            "reason":           f"Model inference error: {exc}",
            "minutes_in_buffer": n_minutes,
            "training_source":  "SIMULATED",
        }

    pred_15 = float(y_pred[0, 0])
    pred_30 = float(y_pred[0, 1])

    # 5. Current water level = mean of the last bucket (most recent minute)
    # window[:, 0] = water_level_cm column; last row = most recent minute
    current_cm = float(window[-1, 0])

    # 6. Classify and trend
    forecast_risk = _classify_risk(pred_15)   # risk based on the nearer horizon
    current_risk  = _classify_risk(current_cm)
    trend         = _compute_trend(current_cm, pred_15)

    return {
        "available":               True,
        "current_water_level_cm":  round(current_cm, 3),
        "predicted_15min_cm":      round(pred_15, 3),
        "predicted_30min_cm":      round(pred_30, 3),
        "trend":                   trend,
        "forecast_risk":           forecast_risk,
        "current_risk":            current_risk,
        "prediction_timestamp":    datetime.now(timezone.utc).isoformat(),
        "training_source":         "SIMULATED",
        "experimental_disclaimer": (
            "This prediction is generated by a model trained on SIMULATED data only. "
            "It is EXPERIMENTAL and must NOT be used as a verified real-world flood warning."
        ),
        "minutes_in_buffer":       n_minutes,
        "thresholds_cm": {
            "normal_max_cm":  NORMAL_MAX_CM,
            "warning_max_cm": WARNING_MAX_CM,
        },
        "model_name": os.path.basename(MODEL_PATH),
    }
