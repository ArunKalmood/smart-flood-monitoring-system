"""
Stage 3 Data Pipeline: Windowing, Causal Forward-Fill, and Scaling for LSTM.

Reads synthetic_flood_dataset.csv, extracts 24-step windows with a 6-step
prediction horizon for multi-class status forecasting (normal, warning, critical),
scales continuous features on the training set, and prepares arrays for model training.
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

_HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_CSV = os.path.join(_HERE, "data", "beaker_v2", "synthetic_flood_dataset.csv")
DEFAULT_SCALER_PATH = os.path.join(_HERE, "models", "scaler_stage3.pkl")

WINDOW_LEN = 24
HORIZON_STEPS = 6
TOTAL_SPAN = WINDOW_LEN + HORIZON_STEPS  # 30 steps
MAX_ALLOWED_DT = 7.5  # seconds
LEADING_GAP_FILL = 12.3  # cm

STATUS_MAP = {
    "normal": 0,
    "warning": 1,
    "critical": 2,
}

FEATURE_NAMES = [
    "dist_cm_filled",
    "dist_missing",
    "dist_sentinel",
    "rain_adc",
    "rain_digital_high",
]

# Indices of continuous features scaled by StandardScaler:
# 0: dist_cm_filled, 3: rain_adc
SCALED_FEATURE_INDICES = [0, 3]


def process_event_features(grp: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Extracts the 5 input features, target status, and dt_prev_s for a single event.
    Causally forward-fills dist_cm (-1 and NaN replaced by last valid; leading gaps filled with 12.3).
    """
    dist_raw = grp["dist_cm"].to_numpy(dtype=np.float64)
    rain_adc = grp["rain_adc"].to_numpy(dtype=np.float32)
    rain_digital = grp["rain_digital"].to_numpy()
    dt_prev = grp["dt_prev_s"].to_numpy(dtype=np.float64)
    status = grp["status"].map(STATUS_MAP).to_numpy(dtype=np.int64)

    # Indicator features
    dist_missing = np.isnan(dist_raw).astype(np.float32)
    dist_sentinel = (dist_raw == -1.0).astype(np.float32)

    # Causal forward fill for dist_cm
    dist_filled = np.empty(len(dist_raw), dtype=np.float32)
    curr_val = LEADING_GAP_FILL
    for t in range(len(dist_raw)):
        d = dist_raw[t]
        if not (np.isnan(d) or d == -1.0):
            curr_val = float(d)
        dist_filled[t] = curr_val

    # Digital rain indicator
    rain_digital_high = (rain_digital == "HIGH").astype(np.float32)

    features = np.column_stack([
        dist_filled,
        dist_missing,
        dist_sentinel,
        rain_adc,
        rain_digital_high,
    ]).astype(np.float32)

    return features, status, dt_prev


def build_windows_for_event(
    features: np.ndarray,
    status: np.ndarray,
    dt_prev: np.ndarray,
    window_len: int = WINDOW_LEN,
    horizon: int = HORIZON_STEPS,
    max_dt: float = MAX_ALLOWED_DT,
) -> tuple[list[np.ndarray], list[int]]:
    """
    Slices sliding windows of length window_len with target at window_len + horizon - 1.
    Skips any window where consecutive steps cross a gap (dt_prev_s > max_dt) or leave the event.
    """
    windows = []
    targets = []
    n_steps = len(features)
    total_span = window_len + horizon  # 30 steps

    for i in range(n_steps - total_span + 1):
        # The window spans indices i to i + total_span - 1.
        # Transitions between adjacent observations inside this sequence are at indices i+1 to i+total_span-1.
        transitions_dt = dt_prev[i + 1 : i + total_span]
        if np.any(transitions_dt > max_dt):
            continue

        x_window = features[i : i + window_len]
        y_target = int(status[i + window_len + horizon - 1])

        windows.append(x_window)
        targets.append(y_target)

    return windows, targets


def load_stage3_data(
    csv_path: str = DEFAULT_DATA_CSV,
    scaler_path: str = DEFAULT_SCALER_PATH,
    save_scaler: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, StandardScaler]:
    """
    Main ingestion pipeline:
    1. Loads dataset and splits by event_id according to the 'split' column.
    2. Builds 24-step windows and 6-step horizon targets.
    3. Fits StandardScaler on dist_cm_filled and rain_adc on train windows only.
    4. Saves scaler and transforms train, val, and test splits.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at: {csv_path}")

    # Read dataset without touching any gt_ or fw_ columns for inputs
    df = pd.read_csv(csv_path)

    splits = {
        "train": {"X": [], "y": []},
        "val": {"X": [], "y": []},
        "test": {"X": [], "y": []},
    }

    # Group by event_id, sorted by t_event_s
    for _, grp in df.groupby("event_id"):
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        split_name = grp_sorted["split"].iloc[0]

        features, status, dt_prev = process_event_features(grp_sorted)
        w_list, t_list = build_windows_for_event(features, status, dt_prev)

        if w_list:
            splits[split_name]["X"].extend(w_list)
            splits[split_name]["y"].extend(t_list)

    # Convert to numpy arrays
    X_train = np.array(splits["train"]["X"], dtype=np.float32)
    y_train = np.array(splits["train"]["y"], dtype=np.int64)

    X_val = np.array(splits["val"]["X"], dtype=np.float32)
    y_val = np.array(splits["val"]["y"], dtype=np.int64)

    X_test = np.array(splits["test"]["X"], dtype=np.float32)
    y_test = np.array(splits["test"]["y"], dtype=np.int64)

    # Fit StandardScaler on dist_cm_filled (idx 0) and rain_adc (idx 3) using TRAIN windows only
    scaler = StandardScaler()
    train_continuous_2d = X_train[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
    scaler.fit(train_continuous_2d)

    if save_scaler:
        os.makedirs(os.path.dirname(scaler_path), exist_ok=True)
        joblib.dump(scaler, scaler_path)

    # Apply scaler to train, val, and test
    for arr in [X_train, X_val, X_test]:
        cont_2d = arr[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
        scaled_cont_2d = scaler.transform(cont_2d)
        arr[:, :, SCALED_FEATURE_INDICES] = scaled_cont_2d.reshape(arr.shape[0], arr.shape[1], len(SCALED_FEATURE_INDICES))

    return X_train, y_train, X_val, y_val, X_test, y_test, scaler


if __name__ == "__main__":
    X_train, y_train, X_val, y_val, X_test, y_test, scaler = load_stage3_data()

    print("=" * 65)
    print("STAGE 3 DATA PIPELINE RESULTS")
    print("=" * 65)
    print(f"Features: {FEATURE_NAMES}")
    print(f"Scaled continuous feature indices: {SCALED_FEATURE_INDICES}")
    print(f"Scaler saved to: {DEFAULT_SCALER_PATH}")
    print(f"Scaler mean:  {scaler.mean_}")
    print(f"Scaler scale: {scaler.scale_}")
    print("-" * 65)

    for name, X, y in [("train", X_train, y_train), ("val", X_val, y_val), ("test", X_test, y_test)]:
        print(f"\n[{name.upper()} SPLIT]")
        print(f"  X shape: {X.shape}")
        print(f"  y shape: {y.shape}")
        unique, counts = np.unique(y, return_counts=True)
        counts_dict = dict(zip(unique, counts))
        total = len(y)
        print("  Class counts:")
        for label_idx, label_name in [(0, "normal"), (1, "warning"), (2, "critical")]:
            c = counts_dict.get(label_idx, 0)
            pct = (c / total * 100) if total > 0 else 0.0
            print(f"    Class {label_idx} ({label_name:8s}): {c:6d} ({pct:6.2f}%)")
        print(f"  Total windows: {total:6d}")

    print("=" * 65)
