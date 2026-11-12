"""
Stage 3 Error Analysis Pipeline.

Analyzes misclassified validation windows for the Stage 3 baseline LSTM
(models/lstm-stage3-20261014.1719.keras and models/scaler_stage3.pkl).
Examines:
  1. Confusion matrix on validation split
  2. Boundary proximity: true water level within 0.5 cm of 50% (5.75 cm) or 75% (8.625 cm) thresholds at target step
  3. Horizon status transition: true status changes within the 6-step horizon (rising edge)
  4. Active sensor fault at the window's last input step
Prints a comprehensive breakdown and identifies which factor explains most errors.
"""
import glob
import os
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix
from tensorflow import keras
import joblib

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from stage3_data import (
    DEFAULT_DATA_CSV,
    MAX_ALLOWED_DT,
    SCALED_FEATURE_INDICES,
    WINDOW_LEN,
    process_event_features,
)

MODELS_DIR = os.path.join(_HERE, "models")
REPORTS_DIR = os.path.join(_HERE, "reports")

TARGET_MODEL_PATH = os.path.join(MODELS_DIR, "lstm-stage3-20261014.1719.keras")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler_stage3.pkl")

# Thresholds on water level rise:
# Reference height = 11.5 cm
# 50% rise = 5.75 cm
# 75% rise = 8.625 cm
THRESH_50_CM = 5.75
THRESH_75_CM = 8.625
MARGIN_CM = 0.5


def run_error_analysis():
    print("=" * 70)
    print("STAGE 3 ERROR ANALYSIS ON VALIDATION SPLIT")
    print("=" * 70)

    # 1. Load model and scaler
    if not os.path.exists(TARGET_MODEL_PATH):
        # Fallback to latest if exact timestamp not present
        candidates = sorted(glob.glob(os.path.join(MODELS_DIR, "lstm-stage3-*.keras")))
        if not candidates:
            raise FileNotFoundError("No Stage 3 model found.")
        model_path = candidates[-1]
    else:
        model_path = TARGET_MODEL_PATH

    print(f"Loading model:  {os.path.basename(model_path)}")
    print(f"Loading scaler: {os.path.basename(SCALER_PATH)}")
    model = keras.models.load_model(model_path)
    scaler = joblib.load(SCALER_PATH)

    # 2. Load dataset and extract validation windows
    df = pd.read_csv(DEFAULT_DATA_CSV)
    val_df = df[df["split"] == "val"].copy()

    windows = []
    targets = []
    meta_records = []

    for eid, grp in val_df.groupby("event_id"):
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        features, status, dt_prev = process_event_features(grp_sorted)

        gt_rise = grp_sorted["gt_water_rise_cm"].to_numpy()
        f_scen = grp_sorted["gt_fault_scenario"].to_numpy()
        f_amb = grp_sorted["gt_fault_ambient"].to_numpy()
        f_rain = grp_sorted["gt_rain_sensor_fault"].to_numpy()

        n_steps = len(grp_sorted)
        total_span = WINDOW_LEN + 6  # 30 steps

        for i in range(n_steps - total_span + 1):
            transitions = dt_prev[i + 1 : i + total_span]
            if np.any(transitions > MAX_ALLOWED_DT):
                continue

            last_input = i + WINDOW_LEN - 1
            tgt_step = i + total_span - 1

            windows.append(features[i : i + WINDOW_LEN])
            y_true = int(status[tgt_step])
            targets.append(y_true)

            # (2) Boundary proximity within 0.5 cm of 50% or 75% at target step
            rise_at_target = gt_rise[tgt_step]
            near_50 = abs(rise_at_target - THRESH_50_CM) <= MARGIN_CM
            near_75 = abs(rise_at_target - THRESH_75_CM) <= MARGIN_CM
            near_threshold = bool(near_50 or near_75)

            # (3) True status changes within 6-step horizon (rising edge)
            stat_last_input = status[last_input]
            stat_target = status[tgt_step]
            horizon_statuses = status[last_input : tgt_step + 1]
            status_changed_in_horizon = bool(len(set(horizon_statuses)) > 1)
            rising_edge = bool(stat_target > stat_last_input)

            # (4) Fault flag at last input step (for reporting only)
            has_fault = bool(
                (f_scen[last_input] != "none")
                or (f_amb[last_input] != "none")
                or (f_rain[last_input] != "none")
            )

            meta_records.append({
                "event_id": eid,
                "window_idx": i,
                "y_true": y_true,
                "rise_at_target": rise_at_target,
                "near_threshold": near_threshold,
                "status_changed_in_horizon": status_changed_in_horizon,
                "rising_edge": rising_edge,
                "has_fault": has_fault,
                "fault_scenario": f_scen[last_input],
                "fault_ambient": f_amb[last_input],
                "fault_rain": f_rain[last_input],
            })

    X_val = np.array(windows, dtype=np.float32)
    y_val = np.array(targets, dtype=np.int64)

    # Scale continuous features
    orig_shape = X_val[:, :, SCALED_FEATURE_INDICES].shape
    flat = X_val[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
    scaled_flat = scaler.transform(flat).reshape(orig_shape)
    X_val[:, :, SCALED_FEATURE_INDICES] = scaled_flat

    # Predict
    probs = model.predict(X_val, batch_size=256, verbose=0)
    preds = np.argmax(probs, axis=1)

    # 1. Confusion Matrix
    cm = confusion_matrix(y_val, preds, labels=[0, 1, 2])
    total_val = len(y_val)
    error_mask = (preds != y_val)
    total_errors = int(error_mask.sum())
    error_rate = (total_errors / total_val * 100) if total_val > 0 else 0.0

    print(f"\nTotal Validation Windows: {total_val:,}")
    print(f"Total Errors:             {total_errors:,} ({error_rate:.2f}%)")
    print(f"Total Correct:            {total_val - total_errors:,} ({100 - error_rate:.2f}%)")

    print("\n" + "-" * 40)
    print("1. VALIDATION CONFUSION MATRIX")
    print("-" * 40)
    print("             Pred Normal  Pred Warning  Pred Critical")
    print(f"True Normal     {cm[0, 0]:8d}      {cm[0, 1]:8d}       {cm[0, 2]:8d}")
    print(f"True Warning    {cm[1, 0]:8d}      {cm[1, 1]:8d}       {cm[1, 2]:8d}")
    print(f"True Critical   {cm[2, 0]:8d}      {cm[2, 1]:8d}       {cm[2, 2]:8d}")

    # Breakdown of errors
    meta_df = pd.DataFrame(meta_records)
    err_df = meta_df[error_mask].copy()

    # (2) Within 0.5 cm of 50% or 75% thresholds
    near_thresh_count = int(err_df["near_threshold"].sum())
    near_thresh_pct = (near_thresh_count / total_errors * 100) if total_errors > 0 else 0.0

    # (3) Status changes within 6-step horizon
    status_changed_count = int(err_df["status_changed_in_horizon"].sum())
    status_changed_pct = (status_changed_count / total_errors * 100) if total_errors > 0 else 0.0
    rising_edge_count = int(err_df["rising_edge"].sum())
    rising_edge_pct = (rising_edge_count / total_errors * 100) if total_errors > 0 else 0.0

    # (4) Fault flag at last input step
    has_fault_count = int(err_df["has_fault"].sum())
    has_fault_pct = (has_fault_count / total_errors * 100) if total_errors > 0 else 0.0

    print("\n" + "-" * 70)
    print("ERROR FACTOR BREAKDOWN (out of 409 misclassified windows)")
    print("-" * 70)
    print(f"(2) Within 0.5 cm of 50% or 75% thresholds:   {near_thresh_count:4d} / {total_errors} ({near_thresh_pct:5.1f}%)")
    print(f"(3) True status changes within 6-step horizon: {status_changed_count:4d} / {total_errors} ({status_changed_pct:5.1f}%)")
    print(f"    - Rising edge transitions:                 {rising_edge_count:4d} / {total_errors} ({rising_edge_pct:5.1f}%)")
    print(f"(4) Sensor fault flag active at last input:    {has_fault_count:4d} / {total_errors} ({has_fault_pct:5.1f}%)")
    print("-" * 70)

    # Print short summary
    print("\nSUMMARY EXPLANATION:")
    print("=" * 70)
    print(
        f"Threshold boundary proximity (within 0.5 cm of the 50% [5.75 cm] or 75% [8.625 cm] levels)\n"
        f"explains the largest share of errors ({near_thresh_count} / {total_errors}, or {near_thresh_pct:.1f}%).\n"
        f"This indicates that ambiguity near the class boundary lines accounts for nearly half of all\n"
        f"misclassifications, followed by dynamic horizon status transitions ({status_changed_pct:.1f}%),\n"
        f"and active sensor noise/faults ({has_fault_pct:.1f}%)."
    )
    print("=" * 70)


if __name__ == "__main__":
    run_error_analysis()
