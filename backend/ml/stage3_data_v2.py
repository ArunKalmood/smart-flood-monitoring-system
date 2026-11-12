"""
Stage 3 v2 Data Pipeline: 8-Feature Windowing, Causal Forward-Fill, and Scaling.

Reads synthetic_flood_dataset.csv and extracts 8 per-step features:
  1. dist_cm_filled (causal forward fill, leading filled with 12.3)
  2. dist_missing (1 if dist_cm is NaN)
  3. dist_sentinel (1 if dist_cm == -1)
  4. rain_adc
  5. rain_digital_high (1 if rain_digital == HIGH)
  6. dist_diff (first difference of dist_cm_filled within event, 0 at t=0)
  7. dist_rolling_med_3 (causal rolling median of dist_cm_filled over last 3 steps)
  8. steps_since_last_valid_dist (steps since valid reading, capped at 12)

Supports both 24-step and 36-step window lengths selectable by argument.
Fits StandardScaler on TRAIN windows only and saves to models/scaler_stage3_v2.pkl.
"""
import argparse
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_CSV = os.path.join(_HERE, "data", "beaker_v2", "synthetic_flood_dataset.csv")
DEFAULT_SCALER_PATH = os.path.join(_HERE, "models", "scaler_stage3_v2.pkl")

DEFAULT_WINDOW_LEN = 24
HORIZON_STEPS = 6
MAX_ALLOWED_DT = 7.5
LEADING_GAP_FILL = 12.3

STATUS_MAP = {
    "normal": 0,
    "warning": 1,
    "critical": 2,
}

FEATURE_NAMES_V2 = [
    "dist_cm_filled",
    "dist_missing",
    "dist_sentinel",
    "rain_adc",
    "rain_digital_high",
    "dist_diff",
    "dist_rolling_med_3",
    "steps_since_last_valid_dist",
]

# Continuous feature indices scaled by StandardScaler:
# 0: dist_cm_filled, 3: rain_adc, 5: dist_diff, 6: dist_rolling_med_3, 7: steps_since_last_valid_dist
SCALED_FEATURE_INDICES_V2 = [0, 3, 5, 6, 7]


def process_event_features_v2(grp: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Computes all 8 features, target status, and dt_prev_s for a single event.
    """
    dist_raw = grp["dist_cm"].to_numpy(dtype=np.float64)
    rain_adc = grp["rain_adc"].to_numpy(dtype=np.float32)
    rain_digital = grp["rain_digital"].to_numpy()
    dt_prev = grp["dt_prev_s"].to_numpy(dtype=np.float64)
    status = grp["status"].map(STATUS_MAP).to_numpy(dtype=np.int64)

    n = len(dist_raw)

    # 1. Indicators
    dist_missing = np.isnan(dist_raw).astype(np.float32)
    dist_sentinel = (dist_raw == -1.0).astype(np.float32)

    # 2. Causal forward fill of dist_cm
    dist_filled = np.empty(n, dtype=np.float32)
    curr_val = LEADING_GAP_FILL
    for t in range(n):
        d = dist_raw[t]
        if not (np.isnan(d) or d == -1.0):
            curr_val = float(d)
        dist_filled[t] = curr_val

    # 3. Rain digital high
    rain_digital_high = (rain_digital == "HIGH").astype(np.float32)

    # 4. First difference of dist_cm_filled (diff within event, 0 at t=0)
    dist_diff = np.zeros(n, dtype=np.float32)
    if n > 1:
        dist_diff[1:] = np.diff(dist_filled)

    # 5. Causal rolling median of dist_cm_filled over last 3 steps
    dist_rolling_med_3 = np.empty(n, dtype=np.float32)
    for t in range(n):
        start = max(0, t - 2)
        dist_rolling_med_3[t] = np.median(dist_filled[start : t + 1])

    # 6. Steps since last valid dist_cm (capped at 12)
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

    return features, status, dt_prev


def build_windows_v2(
    features: np.ndarray,
    status: np.ndarray,
    dt_prev: np.ndarray,
    window_len: int = DEFAULT_WINDOW_LEN,
    horizon: int = HORIZON_STEPS,
    max_dt: float = MAX_ALLOWED_DT,
) -> tuple[list[np.ndarray], list[int]]:
    """
    Slices sliding windows of length window_len with target at window_len + horizon - 1.
    Skips any window crossing a gap (dt_prev_s > max_dt) or leaving the event.
    """
    windows = []
    targets = []
    n_steps = len(features)
    total_span = window_len + horizon

    for i in range(n_steps - total_span + 1):
        transitions = dt_prev[i + 1 : i + total_span]
        if np.any(transitions > max_dt):
            continue

        x_window = features[i : i + window_len]
        y_target = int(status[i + total_span - 1])

        windows.append(x_window)
        targets.append(y_target)

    return windows, targets


def load_stage3_data_v2(
    csv_path: str = DEFAULT_DATA_CSV,
    window_len: int = DEFAULT_WINDOW_LEN,
    scaler_path: str = DEFAULT_SCALER_PATH,
    save_scaler: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, StandardScaler]:
    """
    Main ingestion pipeline for Stage 3 v2:
    1. Loads dataset and splits by event_id.
    2. Builds 8-feature windows of specified length (24 or 36) with 6-step horizon.
    3. Fits StandardScaler on continuous channels of TRAIN windows only.
    4. Saves scaler (if requested) and scales train, val, and test splits.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at: {csv_path}")

    df = pd.read_csv(csv_path)

    splits = {
        "train": {"X": [], "y": []},
        "val": {"X": [], "y": []},
        "test": {"X": [], "y": []},
    }

    for _, grp in df.groupby("event_id"):
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        split_name = grp_sorted["split"].iloc[0]

        features, status, dt_prev = process_event_features_v2(grp_sorted)
        w_list, t_list = build_windows_v2(features, status, dt_prev, window_len=window_len)

        if w_list:
            splits[split_name]["X"].extend(w_list)
            splits[split_name]["y"].extend(t_list)

    X_train = np.array(splits["train"]["X"], dtype=np.float32)
    y_train = np.array(splits["train"]["y"], dtype=np.int64)

    X_val = np.array(splits["val"]["X"], dtype=np.float32)
    y_val = np.array(splits["val"]["y"], dtype=np.int64)

    X_test = np.array(splits["test"]["X"], dtype=np.float32)
    y_test = np.array(splits["test"]["y"], dtype=np.int64)

    # Fit StandardScaler on TRAIN windows only
    scaler = StandardScaler()
    train_cont_2d = X_train[:, :, SCALED_FEATURE_INDICES_V2].reshape(-1, len(SCALED_FEATURE_INDICES_V2))
    scaler.fit(train_cont_2d)

    if save_scaler:
        os.makedirs(os.path.dirname(scaler_path), exist_ok=True)
        joblib.dump(scaler, scaler_path)

    # Transform all splits
    for arr in [X_train, X_val, X_test]:
        cont_2d = arr[:, :, SCALED_FEATURE_INDICES_V2].reshape(-1, len(SCALED_FEATURE_INDICES_V2))
        scaled_2d = scaler.transform(cont_2d)
        arr[:, :, SCALED_FEATURE_INDICES_V2] = scaled_2d.reshape(arr.shape[0], arr.shape[1], len(SCALED_FEATURE_INDICES_V2))

    return X_train, y_train, X_val, y_val, X_test, y_test, scaler


def main():
    parser = argparse.ArgumentParser(description="Stage 3 v2 Data Pipeline (8 features)")
    parser.add_argument("--window", type=int, default=24, choices=[24, 36],
                        help="Window length in steps (24 or 36)")
    args = parser.parse_args()

    wlen = args.window
    print("=" * 70)
    print(f"STAGE 3 v2 DATA PIPELINE (Window: {wlen} steps, 8 Features)")
    print("=" * 70)
    print(f"Features: {FEATURE_NAMES_V2}")
    print(f"Scaled feature indices: {SCALED_FEATURE_INDICES_V2}")

    X_train, y_train, X_val, y_val, X_test, y_test, scaler = load_stage3_data_v2(window_len=wlen)
    print(f"Scaler saved to: {DEFAULT_SCALER_PATH}")
    print(f"Scaler mean:  {scaler.mean_}")
    print(f"Scaler scale: {scaler.scale_}")

    for name, X, y in [("train", X_train, y_train), ("val", X_val, y_val), ("test", X_test, y_test)]:
        print(f"\n[{name.upper()} SPLIT]")
        print(f"  X shape: {X.shape}")
        print(f"  y shape: {y.shape}")
        unique, counts = np.unique(y, return_counts=True)
        counts_dict = dict(zip(unique, counts))
        total = len(y)
        for label_idx, label_name in [(0, "normal"), (1, "warning"), (2, "critical")]:
            c = counts_dict.get(label_idx, 0)
            pct = (c / total * 100) if total > 0 else 0.0
            print(f"    Class {label_idx} ({label_name:8s}): {c:6d} ({pct:6.2f}%)")


if __name__ == "__main__":
    main()
