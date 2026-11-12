"""
Stage 3 v2 Inference Pipeline: Single-Run and Streaming Prediction.

Provides:
  predict_status(readings):
    Takes a list of tuples (t_s, dist_cm, rain_adc, rain_digital) or DataFrame at 5s spacing.
    Returns per-step predicted status ('normal', 'warning', 'critical') and calibrated probabilities.

Features & Model:
  - Frozen Model:  models/lstm-stage3-v2-var2-20261014.1812.keras
  - Feature Scaler: models/scaler_stage3_v2_w36.pkl
  - Input: 8 features (dist_cm_filled, dist_missing, dist_sentinel, rain_adc,
                       rain_digital_high, dist_diff, dist_rolling_med_3, steps_since_last_valid_dist)
  - Window Length: 36 steps (180 s history)
  - Warm-Up Fix:   Left-pads with first row for the first 35 steps
  - Critical Multiplier: 1.10 (calibrated on validation split)
  - Distance Units: Centimetres (cm)

CLI usage:
  python infer_stage3_v2.py --input <path_to_csv> [--output <path_to_out_csv>]
"""
import argparse
import os
import sys
from typing import Any, Sequence, Union

import joblib
import numpy as np
import pandas as pd
from tensorflow import keras

_HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(_HERE, "models")

FROZEN_MODEL_PATH = os.path.join(MODELS_DIR, "lstm-stage3-v2-var2-20261014.1812.keras")
FROZEN_SCALER_PATH = os.path.join(MODELS_DIR, "scaler_stage3_v2_w36.pkl")

WINDOW_LEN = 36
LEADING_GAP_FILL = 12.3  # Empty beaker distance in cm
CRITICAL_MULTIPLIER = 1.10

CLASS_NAMES = ["normal", "warning", "critical"]
SCALED_FEATURE_INDICES = [0, 3, 5, 6, 7]

# Cached module-level model and scaler
_CACHED_MODEL = None
_CACHED_SCALER = None


def load_model_and_scaler(model_path: str = FROZEN_MODEL_PATH, scaler_path: str = FROZEN_SCALER_PATH):
    """Loads and caches the model and scaler."""
    global _CACHED_MODEL, _CACHED_SCALER

    if _CACHED_MODEL is None:
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found at: {model_path}")
        _CACHED_MODEL = keras.models.load_model(model_path)

    if _CACHED_SCALER is None:
        if not os.path.exists(scaler_path):
            raise FileNotFoundError(f"Scaler file not found at: {scaler_path}")
        _CACHED_SCALER = joblib.load(scaler_path)

    return _CACHED_MODEL, _CACHED_SCALER


def build_8_features_from_arrays(
    dist_raw: np.ndarray,
    rain_adc_raw: np.ndarray,
    rain_digital_raw: np.ndarray,
) -> np.ndarray:
    """
    Computes all 8 features exactly as during training:
      0: dist_cm_filled (causal forward fill, leading invalid = 12.3)
      1: dist_missing (1.0 if dist is NaN)
      2: dist_sentinel (1.0 if dist == -1.0)
      3: rain_adc (float32)
      4: rain_digital_high (1.0 if HIGH)
      5: dist_diff (first difference of dist_cm_filled, 0 at t=0)
      6: dist_rolling_med_3 (causal rolling median over last 3 steps)
      7: steps_since_last_valid_dist (consecutive invalid steps count, capped at 12)
    """
    n = len(dist_raw)

    dist_missing = np.isnan(dist_raw).astype(np.float32)
    dist_sentinel = (dist_raw == -1.0).astype(np.float32)

    # 1. Causal forward fill of dist_cm
    dist_filled = np.empty(n, dtype=np.float32)
    curr_val = LEADING_GAP_FILL
    for t in range(n):
        d = dist_raw[t]
        if not (np.isnan(d) or d == -1.0):
            curr_val = float(d)
        dist_filled[t] = curr_val

    # 2. Rain digital high flag
    rain_digital_high = np.zeros(n, dtype=np.float32)
    for t in range(n):
        val = rain_digital_raw[t]
        if val in ["HIGH", "high", "1", 1, True]:
            rain_digital_high[t] = 1.0

    # 3. Rain adc
    rain_adc = rain_adc_raw.astype(np.float32)

    # 4. First difference of dist_cm_filled
    dist_diff = np.zeros(n, dtype=np.float32)
    if n > 1:
        dist_diff[1:] = np.diff(dist_filled)

    # 5. Causal rolling median of dist_cm_filled over last 3 steps
    dist_rolling_med_3 = np.empty(n, dtype=np.float32)
    for t in range(n):
        start = max(0, t - 2)
        dist_rolling_med_3[t] = np.median(dist_filled[start : t + 1])

    # 6. Steps since last valid distance (capped at 12)
    steps_since_valid = np.zeros(n, dtype=np.float32)
    c = 0
    for t in range(n):
        d = dist_raw[t]
        if not (np.isnan(d) or d == -1.0):
            c = 0
        else:
            c = min(12, c + 1)
        steps_since_valid[t] = float(c)

    # Stack 8 features
    features = np.column_stack([
        dist_filled,
        dist_missing,
        dist_sentinel,
        rain_adc,
        rain_digital_high,
        dist_diff,
        dist_rolling_med_3,
        steps_since_valid,
    ]).astype(np.float32)

    return features


def predict_status(
    readings: Union[Sequence[Sequence[Any]], pd.DataFrame],
    model: keras.Model = None,
    scaler: Any = None,
    crit_multiplier: float = CRITICAL_MULTIPLIER,
) -> list[dict]:
    """
    Predicts hazard status for each step in a sequential run.

    Parameters:
      readings: List of tuples (t_s, dist_cm, rain_adc, rain_digital)
                or a pandas DataFrame with columns ['t_s', 'dist_cm', 'rain_adc', 'rain_digital'].
      model: Optional pre-loaded Keras model.
      scaler: Optional pre-loaded StandardScaler.
      crit_multiplier: Critical-class probability multiplier (default 1.10).

    Returns:
      List of dicts, each with:
        - step: integer index (0-based)
        - t_s: timestamp in seconds
        - status: 'normal' | 'warning' | 'critical'
        - prob_normal: calibrated probability for normal
        - prob_warning: calibrated probability for warning
        - prob_critical: calibrated probability for critical
        - dist_cm_filled: forward-filled distance used for inference
    """
    if model is None or scaler is None:
        model, scaler = load_model_and_scaler()

    # Parse input into arrays
    if isinstance(readings, pd.DataFrame):
        t_arr = readings["t_s"].to_numpy(dtype=np.float64)
        dist_raw = readings["dist_cm"].to_numpy(dtype=np.float64)
        rain_adc_raw = readings["rain_adc"].to_numpy(dtype=np.float32)
        rain_digital_raw = readings["rain_digital"].to_numpy()
    else:
        readings_list = list(readings)
        if not readings_list:
            return []
        t_arr = np.array([r[0] for r in readings_list], dtype=np.float64)
        dist_raw = np.array([float(r[1]) if r[1] is not None and not pd.isna(r[1]) else np.nan for r in readings_list], dtype=np.float64)
        rain_adc_raw = np.array([float(r[2]) for r in readings_list], dtype=np.float32)
        rain_digital_raw = np.array([r[3] for r in readings_list])

    n_steps = len(dist_raw)
    if n_steps == 0:
        return []

    # 1. Compute 8 features
    features = build_8_features_from_arrays(dist_raw, rain_adc_raw, rain_digital_raw)

    # 2. Build 36-step windows with warm-up left-padding
    windows = []
    for k in range(n_steps):
        if k < WINDOW_LEN - 1:
            pad_len = WINDOW_LEN - 1 - k
            pad_block = np.tile(features[0:1], (pad_len, 1))
            win = np.vstack([pad_block, features[0 : k + 1]])
        else:
            win = features[k - WINDOW_LEN + 1 : k + 1]
        windows.append(win)

    windows_arr = np.array(windows, dtype=np.float32)

    # 3. Scale continuous channels [0, 3, 5, 6, 7]
    orig_shape = windows_arr[:, :, SCALED_FEATURE_INDICES].shape
    flat_cont = windows_arr[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
    scaled_flat = scaler.transform(flat_cont).reshape(orig_shape)
    windows_arr[:, :, SCALED_FEATURE_INDICES] = scaled_flat

    # 4. Predict probabilities
    raw_probs = model.predict(windows_arr, batch_size=256, verbose=0)

    # 5. Apply critical multiplier calibration & re-normalize
    adj_probs = raw_probs.copy()
    adj_probs[:, 2] *= crit_multiplier
    adj_probs = adj_probs / np.sum(adj_probs, axis=1, keepdims=True)

    pred_classes = np.argmax(adj_probs, axis=1)

    # 6. Format output records
    results = []
    for k in range(n_steps):
        c_idx = int(pred_classes[k])
        results.append({
            "step": k,
            "t_s": float(t_arr[k]),
            "status": CLASS_NAMES[c_idx],
            "probabilities": {
                "normal": float(round(adj_probs[k, 0], 4)),
                "warning": float(round(adj_probs[k, 1], 4)),
                "critical": float(round(adj_probs[k, 2], 4)),
            },
            "probs": [
                float(round(adj_probs[k, 0], 4)),
                float(round(adj_probs[k, 1], 4)),
                float(round(adj_probs[k, 2], 4)),
            ],
            "prob_normal": float(round(adj_probs[k, 0], 4)),
            "prob_warning": float(round(adj_probs[k, 1], 4)),
            "prob_critical": float(round(adj_probs[k, 2], 4)),
            "dist_cm_filled": float(round(features[k, 0], 2)),
        })

    return results


def main():
    parser = argparse.ArgumentParser(description="Run Stage 3 v2 inference on a recorded sensor run CSV")
    parser.add_argument("--input", "-i", type=str, required=True, help="Path to input CSV (must have t_s, dist_cm, rain_adc, rain_digital)")
    parser.add_argument("--output", "-o", type=str, default=None, help="Optional output CSV path")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: input file '{args.input}' not found.")
        sys.exit(1)

    print(f"Loading input run from: {args.input}")
    df = pd.read_csv(args.input)

    required_cols = ["t_s", "dist_cm", "rain_adc", "rain_digital"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required column '{col}' in input CSV. Required: {required_cols}")

    print(f"Loaded {len(df)} time steps. Running predict_status...")
    preds = predict_status(df)

    pred_df = pd.DataFrame(preds)
    out_df = pd.concat([df.reset_index(drop=True), pred_df[["status", "prob_normal", "prob_warning", "prob_critical"]]], axis=1)

    out_path = args.output
    if out_path is None:
        base, ext = os.path.splitext(args.input)
        out_path = f"{base}_predictions{ext}"

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    out_df.to_csv(out_path, index=False)
    print(f"Predictions saved to: {out_path}")

    # Summary
    status_counts = out_df["status"].value_counts().to_dict()
    print("\nPrediction Summary:")
    for s in CLASS_NAMES:
        print(f"  {s:8s}: {status_counts.get(s, 0):4d} steps ({status_counts.get(s, 0) / len(out_df) * 100:5.1f}%)")


if __name__ == "__main__":
    main()
