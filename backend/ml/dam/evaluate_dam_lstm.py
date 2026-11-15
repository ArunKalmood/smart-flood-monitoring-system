"""
Dam LSTM Evaluation Script
==========================
Loads the already-trained dam_lstm_simulated_v1.keras model and evaluates it
on the held-out test set. Does NOT retrain.

What this script does
---------------------
1.  Loads the saved model and scaler from ml/models/dam/.
2.  Loads the same CSV used for training (dam_lstm_dataset.csv).
3.  Reproduces the identical 70/15/15 chronological split.
4.  Builds test-set windows (X_test, y_test) using the same build_windows() logic.
5.  Applies the saved scaler to X_test inputs (transform only, never fit).
6.  Runs model.predict() on the scaled test windows.
7.  Verifies shapes: y_test (N,2) and y_pred (N,2) must match exactly.
8.  Computes per-output MAE and RMSE in centimetres.
9.  Computes the persistence baseline (last measured water level = prediction).
10. Prints the comparison table.
11. Saves dam_model_meta.json with actual metrics.

Unit note
---------
  Targets in the CSV are in centimetres.
  Model outputs are in centimetres (linear activation, trained on raw cm targets).
  No inverse-scaler step is needed on outputs — only inputs were scaled.

Run from backend/ directory:
    python ml/dam/evaluate_dam_lstm.py
"""
import json
import os
import sys

import joblib
import numpy as np
import pandas as pd

# ── make ml.dam importable ────────────────────────────────────────────────────
_HERE    = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from ml.dam.train_dam_lstm import (
    WINDOW_LEN, N_FEATURES, N_OUTPUTS,
    TRAIN_FRAC, VAL_FRAC,
    FEATURE_NAMES, TARGET_NAMES, REQUIRED_COLS,
    MODELS_DIR, META_PATH, MODEL_PATH, SCALER_PATH,
    DEFAULT_CSV_PRIORITY, DEFAULT_CSV_FALLBACK,
    load_and_validate, build_windows, compute_metrics, persistence_baseline,
)


def main():
    print("=" * 70)
    print("DAM LSTM EVALUATION  --  SIMULATED DATA ONLY")
    print("WARNING: Metrics are on simulated data. Not real-world accuracy.")
    print("=" * 70)

    # ── 1. Verify model artifacts exist ──────────────────────────────────────
    for path, label in [(MODEL_PATH, "model"), (SCALER_PATH, "scaler")]:
        if not os.path.exists(path):
            print(f"\n[ERROR] {label} not found at: {path}")
            print("        Run train_dam_lstm.py first to produce the model artifacts.")
            sys.exit(1)

    # ── 2. Load model and scaler ──────────────────────────────────────────────
    print("\n[1] Loading saved artifacts ...")
    from tensorflow import keras
    model  = keras.models.load_model(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    print(f"    Model  : {MODEL_PATH}")
    print(f"    Scaler : {SCALER_PATH}")
    print(f"    Scaler data_min_ : {scaler.data_min_}")
    print(f"    Scaler data_max_ : {scaler.data_max_}")
    model.summary(print_fn=lambda x: print(f"    {x}"))

    # ── 3. Load and validate CSV ──────────────────────────────────────────────
    if os.path.exists(DEFAULT_CSV_PRIORITY):
        csv_path = DEFAULT_CSV_PRIORITY
    elif os.path.exists(DEFAULT_CSV_FALLBACK):
        csv_path = DEFAULT_CSV_FALLBACK
    else:
        print(f"\n[ERROR] No CSV found in {os.path.dirname(DEFAULT_CSV_PRIORITY)}")
        sys.exit(1)

    df = load_and_validate(csv_path)

    # ── 4. Reproduce identical chronological split ────────────────────────────
    n       = len(df)
    n_train = int(n * TRAIN_FRAC)
    n_val   = int(n * VAL_FRAC)
    df_test = df.iloc[n_train + n_val:].reset_index(drop=True)
    print(f"\n[2] Test split: rows {n_train + n_val}  to  {n - 1}  ({len(df_test):,} rows)")

    # ── 5. Build test windows ─────────────────────────────────────────────────
    print(f"\n[3] Building {WINDOW_LEN}-step test windows ...")
    X_test_raw, y_test = build_windows(df_test)
    print(f"    X_test_raw : {X_test_raw.shape}  (raw cm, before scaling)")
    print(f"    y_test     : {y_test.shape}       (raw cm targets, columns: +15min, +30min)")

    # ── 6. Scale inputs only (transform — never fit) ──────────────────────────
    print(f"\n[4] Scaling test inputs with saved scaler (transform only) ...")
    n_samp, w, f = X_test_raw.shape
    X_test = scaler.transform(X_test_raw.reshape(-1, f)).reshape(X_test_raw.shape)
    print(f"    Input range before scaling : [{X_test_raw.min():.4f}, {X_test_raw.max():.4f}]")
    print(f"    Input range after  scaling : [{X_test.min():.4f}, {X_test.max():.4f}]")

    # ── 7. Run inference ──────────────────────────────────────────────────────
    print(f"\n[5] Running model.predict() on {n_samp} test windows ...")
    y_pred = model.predict(X_test, verbose=0)
    print(f"    y_pred shape : {y_pred.shape}  (raw cm outputs, linear activation)")

    # ── 8. Shape and unit checks ──────────────────────────────────────────────
    print(f"\n[6] Verification checks ...")
    assert y_test.shape == y_pred.shape, (
        f"SHAPE MISMATCH: y_test {y_test.shape} != y_pred {y_pred.shape}"
    )
    assert y_test.ndim == 2 and y_test.shape[1] == 2, (
        f"Expected (N, 2), got {y_test.shape}"
    )

    print(f"    y_test  shape    : {y_test.shape}  OK")
    print(f"    y_pred  shape    : {y_pred.shape}  OK")
    print(f"    y_test  range    : [{y_test.min():.4f}, {y_test.max():.4f}] cm")
    print(f"    y_pred  range    : [{y_pred.min():.4f}, {y_pred.max():.4f}] cm")
    print(f"    Units confirmed  : centimetres (no inverse-scale needed on outputs)")
    print(f"    No scaler.inverse_transform() applied to y_pred -- correct by design.")

    # ── 9. LSTM metrics ───────────────────────────────────────────────────────
    print(f"\n[7] Computing LSTM metrics ...")
    lstm_m = compute_metrics(y_test, y_pred)

    # ── 10. Persistence baseline ──────────────────────────────────────────────
    # Baseline: use the raw (unscaled) last water_level_cm value as prediction
    # for both horizons. X_test_raw[:, -1, 0] = last step, feature 0 = wl_cm.
    print(f"[8] Computing persistence baseline ...")
    print(f"    Baseline: last measured water_level_cm predicts both +15 min and +30 min.")
    base_m = persistence_baseline(X_test_raw, y_test)

    # ── 11. Print comparison table ────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("TEST SET METRICS  (units: centimetres)")
    print("=" * 70)
    print(f"  {'Metric':<25} {'LSTM':>10}  {'Baseline':>10}  {'Improvement':>12}")
    print("  " + "-" * 60)
    rows = [
        ("mae_15min_cm",  "MAE  +15 min (cm)"),
        ("mae_30min_cm",  "MAE  +30 min (cm)"),
        ("rmse_15min_cm", "RMSE +15 min (cm)"),
        ("rmse_30min_cm", "RMSE +30 min (cm)"),
        ("mae_overall",   "MAE  overall"),
        ("rmse_overall",  "RMSE overall"),
    ]
    for key, label in rows:
        lstm_v = lstm_m[key]
        base_v = base_m[key]
        imprv  = base_v - lstm_v
        better = " <-- better" if imprv > 0 else (" <-- WORSE" if imprv < 0 else "")
        print(f"  {label:<25} {lstm_v:>10.4f}  {base_v:>10.4f}  {imprv:>+12.4f}{better}")
    print("=" * 70)
    print("  Positive improvement = LSTM better than persistence baseline.")
    print("  Negative improvement = LSTM worse  than persistence baseline.")

    # ── 12. Save dam_model_meta.json ──────────────────────────────────────────
    from datetime import datetime
    meta = {
        "model_name":        "dam_lstm_simulated_v1.keras",
        "training_source":   "SIMULATED",
        "disclaimer": (
            "This model is trained on SIMULATED data only. "
            "Do NOT use for real-world safety decisions. "
            "Predictions must be labelled EXPERIMENTAL."
        ),
        "evaluated_at":      datetime.utcnow().isoformat() + "Z",
        "csv_used":          os.path.basename(csv_path),
        "window_len":        WINDOW_LEN,
        "n_features":        N_FEATURES,
        "feature_names":     FEATURE_NAMES,
        "target_names":      TARGET_NAMES,
        "n_outputs":         N_OUTPUTS,
        "sampling_minutes":  1,
        "split": {
            "total_rows":    int(n),
            "test_rows":     int(len(df_test)),
            "test_windows":  int(n_samp),
        },
        "thresholds_cm": {
            "normal_max":    5.0,
            "warning_max":   7.5,
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
        "test_metrics_lstm":     lstm_m,
        "test_metrics_baseline": base_m,
        "scaler": {
            "type":          "MinMaxScaler",
            "feature_range": [0, 1],
            "fit_on":        "training windows only",
            "data_min":      scaler.data_min_.tolist(),
            "data_max":      scaler.data_max_.tolist(),
        },
    }
    with open(META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)

    print(f"\n    Metadata saved -> {META_PATH}")
    print("\n" + "=" * 70)
    print("EVALUATION COMPLETE")
    print("=" * 70)
    print("REMINDER: These metrics are on SIMULATED data.")
    print("          Do NOT present predictions as real-world flood warnings.")
    print("=" * 70)


if __name__ == "__main__":
    main()
