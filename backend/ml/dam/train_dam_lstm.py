"""
Dam LSTM Training Script
========================
Trains a regression LSTM on simulated dam sensor data to predict future
water levels.

WARNING: This model is trained on SIMULATED data only.
         Do NOT claim real-world prediction accuracy from its outputs.
         Label all predictions as EXPERIMENTAL / SIMULATED in every UI.

Input dataset columns (required):
    timestamp              â€“ parseable datetime string (1-minute sampling assumed)
    water_level_cm         â€“ water level in centimetres  (feature 1)
    rain_detected          â€“ 0.0 or 1.0 rainfall flag    (feature 2)
    water_level_next_15min â€“ regression target: water level 15 min ahead (cm)
    water_level_next_30min â€“ regression target: water level 30 min ahead (cm)

Outputs (saved to backend/ml/models/dam/):
    dam_lstm_simulated_v1.keras   â€“ trained Keras model
    dam_scaler.pkl                â€“ fitted MinMaxScaler (inputs only)
    dam_model_meta.json           â€“ training metadata, metrics, thresholds

Usage:
    cd backend
    python ml/dam/train_dam_lstm.py
    python ml/dam/train_dam_lstm.py --csv ml/data/dam/my_dataset.csv
"""
import argparse
import json
import os
import sys
import warnings
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

warnings.filterwarnings("ignore", category=UserWarning)

# â”€â”€ paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(os.path.dirname(_HERE))   # backend/

DATA_DIR   = os.path.join(_BACKEND, "ml", "data", "dam")
MODELS_DIR = os.path.join(_BACKEND, "ml", "models", "dam")

DEFAULT_CSV_PRIORITY = os.path.join(DATA_DIR, "dam_lstm_dataset.csv")
DEFAULT_CSV_FALLBACK = os.path.join(DATA_DIR, "dam_simulated_dataset.csv")

MODEL_PATH  = os.path.join(MODELS_DIR, "dam_lstm_simulated_v1.keras")
SCALER_PATH = os.path.join(MODELS_DIR, "dam_scaler.pkl")
META_PATH   = os.path.join(MODELS_DIR, "dam_model_meta.json")

# â”€â”€ hyper-parameters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
WINDOW_LEN  = 60       # 60 one-minute steps = 60 minutes of history
N_FEATURES  = 2        # water_level_cm, rain_detected
N_OUTPUTS   = 2        # +15 min, +30 min
BATCH_SIZE  = 128
MAX_EPOCHS  = 100
PATIENCE    = 10
TRAIN_FRAC  = 0.70
VAL_FRAC    = 0.15
# TEST_FRAC  = remaining 0.15 â€” chronological, no shuffle

REQUIRED_COLS = ["timestamp", "water_level_cm", "rain_detected",
                 "water_level_next_15min", "water_level_next_30min"]
FEATURE_NAMES = ["water_level_cm", "rain_detected"]
TARGET_NAMES  = ["water_level_next_15min", "water_level_next_30min"]


# â”€â”€ data helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _locate_csv(explicit_path: str | None) -> str:
    if explicit_path:
        if not os.path.exists(explicit_path):
            raise FileNotFoundError(f"CSV not found: {explicit_path}")
        return explicit_path
    if os.path.exists(DEFAULT_CSV_PRIORITY):
        return DEFAULT_CSV_PRIORITY
    if os.path.exists(DEFAULT_CSV_FALLBACK):
        print(f"[INFO] Using fallback CSV: {DEFAULT_CSV_FALLBACK}")
        return DEFAULT_CSV_FALLBACK
    raise FileNotFoundError(
        f"No dataset found. Place a CSV in {DATA_DIR!r} with columns:\n"
        f"  {', '.join(REQUIRED_COLS)}"
    )


def load_and_validate(csv_path: str) -> pd.DataFrame:
    """Load CSV, validate columns, sort chronologically, check sampling."""
    print(f"\n[1] Loading data from: {csv_path}")
    df = pd.read_csv(csv_path)

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {missing}\n"
            f"Required: {REQUIRED_COLS}"
        )

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    n_bad_ts = df["timestamp"].isna().sum()
    if n_bad_ts:
        print(f"  [WARN] Dropping {n_bad_ts} rows with unparseable timestamps.")
        df = df.dropna(subset=["timestamp"])

    df = df.sort_values("timestamp").reset_index(drop=True)

    # Coerce numeric; drop rows where features or targets are null/NaN
    for col in FEATURE_NAMES + TARGET_NAMES:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    n_before = len(df)
    df = df.dropna(subset=FEATURE_NAMES + TARGET_NAMES).reset_index(drop=True)
    n_dropped = n_before - len(df)
    if n_dropped:
        print(f"  [WARN] Dropped {n_dropped} rows with null feature/target values.")

    # Validate rain_detected is binary (0/1)
    unique_rain = df["rain_detected"].unique()
    invalid_rain = [v for v in unique_rain if v not in (0.0, 1.0, 0, 1)]
    if invalid_rain:
        print(f"  [WARN] rain_detected has unexpected values {invalid_rain}; "
              f"binarising (>0 â†’ 1.0).")
        df["rain_detected"] = (df["rain_detected"] > 0).astype(float)

    # Report approximate sampling interval
    if len(df) > 1:
        deltas = df["timestamp"].diff().dropna()
        median_delta = deltas.median()
        print(f"  Median sampling interval : {median_delta}")
        if abs(median_delta.total_seconds() - 60) > 10:
            print(f"  [WARN] Expected ~60-second intervals; got {median_delta}. "
                  f"Window of {WINDOW_LEN} steps covers "
                  f"~{int(median_delta.total_seconds() * WINDOW_LEN / 60)} minutes.")

    print(f"  Total valid rows         : {len(df):,}")
    print(f"  Date range               : {df['timestamp'].iloc[0]}  to  {df['timestamp'].iloc[-1]}")
    return df


# â”€â”€ window builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def build_windows(
    df: pd.DataFrame,
    window_len: int = WINDOW_LEN,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Sliding-window extraction.
    X: (N, window_len, 2)  â€” scaled inputs built later
    y: (N, 2)              â€” raw targets (cm, not scaled)
    """
    features = df[FEATURE_NAMES].values.astype(np.float32)
    targets  = df[TARGET_NAMES].values.astype(np.float32)
    n = len(df)

    X, y = [], []
    for i in range(n - window_len):
        X.append(features[i : i + window_len])
        y.append(targets[i + window_len - 1])  # target aligned to last step of window

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


# â”€â”€ metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """
    Compute MAE and RMSE for a (N, 2) prediction array.

    y_true, y_pred : shape (N, 2)  — column 0 = +15 min, column 1 = +30 min.
    All values must already be in the same unit (centimetres).

    np.mean(..., axis=0) returns a 2-element array — cannot be cast to float.
    Use axis=None for the scalar overall mean across both outputs and all samples.
    """
    # Validate shapes match before computing anything
    assert y_true.shape == y_pred.shape, (
        f"Shape mismatch: y_true {y_true.shape} vs y_pred {y_pred.shape}"
    )
    assert y_true.ndim == 2 and y_true.shape[1] == 2, (
        f"Expected shape (N, 2), got {y_true.shape}"
    )

    # Per-output metrics (operate on 1-D column slices — always scalar results)
    mae_15  = float(np.mean(np.abs(y_true[:, 0] - y_pred[:, 0])))
    mae_30  = float(np.mean(np.abs(y_true[:, 1] - y_pred[:, 1])))
    rmse_15 = float(np.sqrt(np.mean((y_true[:, 0] - y_pred[:, 0]) ** 2)))
    rmse_30 = float(np.sqrt(np.mean((y_true[:, 1] - y_pred[:, 1]) ** 2)))

    # Overall mean across both outputs: axis=None collapses all dimensions to scalar
    mae_overall  = float(np.mean(np.abs(y_true - y_pred)))            # axis=None
    rmse_overall = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))    # axis=None

    return {
        "mae_overall":   round(mae_overall,  4),
        "rmse_overall":  round(rmse_overall, 4),
        "mae_15min_cm":  round(mae_15,  4),
        "mae_30min_cm":  round(mae_30,  4),
        "rmse_15min_cm": round(rmse_15, 4),
        "rmse_30min_cm": round(rmse_30, 4),
    }


def persistence_baseline(X: np.ndarray, y_true: np.ndarray) -> dict:
    """Naive baseline: predict last known water_level_cm for both horizons."""
    last_wl = X[:, -1, 0]  # last step, feature index 0 = water_level_cm (pre-scale raw is used)
    y_base  = np.column_stack([last_wl, last_wl])
    return compute_metrics(y_true, y_base)


# â”€â”€ model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def build_model(input_shape: tuple) -> "keras.Sequential":  # type: ignore[name-defined]
    from tensorflow import keras
    from tensorflow.keras import layers

    model = keras.Sequential([
        layers.Input(shape=input_shape),
        layers.LSTM(64, return_sequences=True),
        layers.Dropout(0.2),
        layers.LSTM(32),
        layers.Dropout(0.2),
        layers.Dense(16, activation="relu"),
        layers.Dense(N_OUTPUTS, activation="linear"),
    ], name="dam_lstm_simulated_v1")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=1e-3),
        loss="mse",
        metrics=["mae"],
    )
    return model


# â”€â”€ main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def main(csv_path: str | None = None):
    print("=" * 70)
    print("DAM LSTM TRAINING  â€”  SIMULATED DATA ONLY")
    print("WARNING: Do NOT claim real-world accuracy from this model.")
    print("=" * 70)

    os.makedirs(MODELS_DIR, exist_ok=True)

    # 1. Load data
    csv_path = _locate_csv(csv_path)
    df = load_and_validate(csv_path)

    # 2. Chronological 70 / 15 / 15 split
    n = len(df)
    n_train = int(n * TRAIN_FRAC)
    n_val   = int(n * VAL_FRAC)
    # test gets whatever remains
    df_train = df.iloc[:n_train].reset_index(drop=True)
    df_val   = df.iloc[n_train : n_train + n_val].reset_index(drop=True)
    df_test  = df.iloc[n_train + n_val:].reset_index(drop=True)
    print(f"\n[2] Chronological split  (no shuffle):")
    print(f"    Train : {len(df_train):,} rows  ({TRAIN_FRAC*100:.0f}%)")
    print(f"    Val   : {len(df_val):,} rows  ({VAL_FRAC*100:.0f}%)")
    print(f"    Test  : {len(df_test):,} rows  ({(1-TRAIN_FRAC-VAL_FRAC)*100:.0f}%)")

    # 3. Build windows from each split
    print(f"\n[3] Building {WINDOW_LEN}-step sliding windows ...")
    X_train_raw, y_train = build_windows(df_train)
    X_val_raw,   y_val   = build_windows(df_val)
    X_test_raw,  y_test  = build_windows(df_test)
    print(f"    X_train: {X_train_raw.shape}  y_train: {y_train.shape}")
    print(f"    X_val  : {X_val_raw.shape}  y_val  : {y_val.shape}")
    print(f"    X_test : {X_test_raw.shape}  y_test : {y_test.shape}")

    if X_train_raw.shape[0] == 0:
        raise ValueError(
            "Training split produced zero windows. "
            f"Dataset has {n} rows; need at least {WINDOW_LEN + 1} rows in the "
            f"training split ({int((WINDOW_LEN + 1) / TRAIN_FRAC)} total rows minimum)."
        )

    # 4. Fit MinMaxScaler on TRAIN input windows only
    print("\n[4] Fitting MinMaxScaler on training windows (inputs only) ...")
    scaler = MinMaxScaler(feature_range=(0, 1))
    n_tr, w, f = X_train_raw.shape
    scaler.fit(X_train_raw.reshape(-1, f))          # fit on flat (N*60, 2) from train only
    joblib.dump(scaler, SCALER_PATH)
    print(f"    Scaler saved â†’ {SCALER_PATH}")
    print(f"    Feature mins : {scaler.data_min_}")
    print(f"    Feature maxs : {scaler.data_max_}")

    # Apply transform to all splits
    X_train = scaler.transform(X_train_raw.reshape(-1, f)).reshape(X_train_raw.shape)
    X_val   = scaler.transform(X_val_raw.reshape(-1, f)).reshape(X_val_raw.shape)
    X_test  = scaler.transform(X_test_raw.reshape(-1, f)).reshape(X_test_raw.shape)

    # 5. Build and train model
    print(f"\n[5] Building model ...")
    from tensorflow import keras

    keras.utils.set_random_seed(42)
    model = build_model((WINDOW_LEN, N_FEATURES))
    model.summary(print_fn=lambda x: print(f"    {x}"))

    early_stop = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=PATIENCE,
        restore_best_weights=True,
        verbose=1,
    )

    print(f"\n[6] Training (up to {MAX_EPOCHS} epochs, batch {BATCH_SIZE}) ...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=MAX_EPOCHS,
        batch_size=BATCH_SIZE,
        callbacks=[early_stop],
        verbose=1,
    )
    epochs_run = len(history.history["loss"])

    # 6. Save model
    model.save(MODEL_PATH)
    print(f"\n    Model saved â†’ {MODEL_PATH}")

    # 7. Evaluate: LSTM predictions
    print("\n[7] Evaluating on test set ...")
    y_pred_scaled = model.predict(X_test, verbose=0)
    # Targets are in raw cm â€” model outputs are also raw cm (linear activation, trained on raw targets)
    lstm_metrics = compute_metrics(y_test, y_pred_scaled)

    # 8. Persistence baseline (uses raw unscaled last water_level_cm)
    base_metrics = persistence_baseline(X_test_raw, y_test)

    # 9. Print results
    print("\n" + "=" * 70)
    print("TEST SET METRICS  (units: centimetres)")
    print("=" * 70)
    hdr = f"  {'Metric':<25} {'LSTM':>10}  {'Baseline':>10}  {'Improvement':>12}"
    print(hdr)
    print("  " + "-" * 60)
    for key, label in [
        ("mae_15min_cm",  "MAE  +15 min (cm)"),
        ("mae_30min_cm",  "MAE  +30 min (cm)"),
        ("rmse_15min_cm", "RMSE +15 min (cm)"),
        ("rmse_30min_cm", "RMSE +30 min (cm)"),
    ]:
        lstm_v = lstm_metrics[key]
        base_v = base_metrics[key]
        imprv  = base_v - lstm_v
        print(f"  {label:<25} {lstm_v:>10.4f}  {base_v:>10.4f}  {imprv:>+12.4f}")
    print("=" * 70)
    print("  Positive improvement = LSTM better than persistence baseline.")

    # 10. Save metadata
    meta = {
        "model_name":      "dam_lstm_simulated_v1.keras",
        "training_source": "SIMULATED",
        "disclaimer":      (
            "This model is trained on SIMULATED data only. "
            "Do NOT use for real-world safety decisions. "
            "Predictions must be labelled EXPERIMENTAL."
        ),
        "created_at":      datetime.utcnow().isoformat() + "Z",
        "csv_used":        os.path.basename(csv_path),
        "window_len":      WINDOW_LEN,
        "n_features":      N_FEATURES,
        "feature_names":   FEATURE_NAMES,
        "target_names":    TARGET_NAMES,
        "n_outputs":       N_OUTPUTS,
        "sampling_minutes": 1,
        "split": {
            "train_rows": int(len(df_train)),
            "val_rows":   int(len(df_val)),
            "test_rows":  int(len(df_test)),
            "train_windows": int(X_train.shape[0]),
            "val_windows":   int(X_val.shape[0]),
            "test_windows":  int(X_test.shape[0]),
        },
        "epochs_trained": int(epochs_run),
        "thresholds_cm": {
            "normal_max":  5.0,
            "warning_max": 7.5,
            "critical_above": 7.5,
        },
        "trend_stable_threshold_cm": 0.5,
        "db_water_level_unit": "metres",
        "buffer_unit":         "centimetres",
        "unit_conversion_note": (
            "DB stores water_level in metres. "
            "live_buffer.push() multiplies by 100 to convert to centimetres "
            "before storing in the rolling window."
        ),
        "test_metrics_lstm":     lstm_metrics,
        "test_metrics_baseline": base_metrics,
        "scaler": {
            "type":         "MinMaxScaler",
            "feature_range": [0, 1],
            "fit_on":       "training windows only",
            "data_min":     scaler.data_min_.tolist(),
            "data_max":     scaler.data_max_.tolist(),
        },
    }
    with open(META_PATH, "w") as fh:
        json.dump(meta, fh, indent=2)
    print(f"\n    Metadata saved â†’ {META_PATH}")
    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)
    print("REMINDER: This model is trained on SIMULATED data.")
    print("          Do NOT present its predictions as verified real-world warnings.")
    print("=" * 70)


# â”€â”€ CLI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Train the dam LSTM on simulated sensor data."
    )
    parser.add_argument(
        "--csv", type=str, default=None,
        help=(
            "Path to the input CSV file. "
            "Defaults to dam_lstm_dataset.csv (then dam_simulated_dataset.csv) "
            f"in {DATA_DIR!r}."
        ),
    )
    args = parser.parse_args()
    main(csv_path=args.csv)


