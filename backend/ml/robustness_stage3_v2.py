"""
Stage 3 v2 Model Robustness Pipeline.

Evaluates the frozen Stage 3 v2 winner model:
  lstm-stage3-v2-var2-20261014.1812.keras
using models/scaler_stage3_v2_w36.pkl with 8-feature, 36-step windows on TEST windows only.

Breaks down macro-F1 and critical recall by:
  - gt_fault_scenario
  - gt_fault_ambient
  - gt_rain_sensor_fault
evaluated at the window's last input step (step 35).
For each fault value, reports the number of true critical windows, and marks
recall as 'undefined' when that number is 0.

Saves results to reports/stage3_v2_robustness.csv.
"""
import glob
import os
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from tensorflow import keras

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from stage3_data_v2 import (
    DEFAULT_DATA_CSV,
    MAX_ALLOWED_DT,
    SCALED_FEATURE_INDICES_V2,
    process_event_features_v2,
)

MODELS_DIR = os.path.join(_HERE, "models")
REPORTS_DIR = os.path.join(_HERE, "reports")
FROZEN_MODEL_NAME = "lstm-stage3-v2-var2-20261014.1812.keras"
ROBUSTNESS_CSV_PATH = os.path.join(REPORTS_DIR, "stage3_v2_robustness.csv")

WINDOW_LEN = 36
HORIZON_STEPS = 6


def get_model_and_scaler():
    """Loads the frozen Stage 3 v2 model and 36-step scaler."""
    model_path = os.path.join(MODELS_DIR, FROZEN_MODEL_NAME)
    if not os.path.exists(model_path):
        # Fallback to pattern match if exact file missing
        matches = glob.glob(os.path.join(MODELS_DIR, "lstm-stage3-v2-var2-*.keras"))
        if not matches:
            raise FileNotFoundError(f"Model not found: {model_path}")
        model_path = sorted(matches, key=os.path.getmtime, reverse=True)[0]

    model = keras.models.load_model(model_path)

    # 36-step scaler
    scaler_path = os.path.join(MODELS_DIR, "scaler_stage3_v2_w36.pkl")
    if not os.path.exists(scaler_path):
        scaler_path = os.path.join(MODELS_DIR, "scaler_stage3_v2.pkl")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError("No scaler_stage3_v2*.pkl found in models/")

    scaler = joblib.load(scaler_path)
    return model, scaler, model_path, scaler_path


def build_test_windows_with_faults(df: pd.DataFrame, window_len: int = WINDOW_LEN, horizon: int = HORIZON_STEPS, max_dt: float = MAX_ALLOWED_DT):
    """
    Builds the 36-step test windows and records fault column values at the last input step.
    Fault columns are read strictly for evaluation/reporting and NEVER fed as model inputs.
    """
    test_df = df[df["split"] == "test"].copy()
    windows = []
    targets = []
    fault_scenarios = []
    fault_ambients = []
    fault_rains = []

    for _, grp in test_df.groupby("event_id"):
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        features, status, dt_prev = process_event_features_v2(grp_sorted)

        f_scen = grp_sorted["gt_fault_scenario"].to_numpy()
        f_amb = grp_sorted["gt_fault_ambient"].to_numpy()
        f_rain = grp_sorted["gt_rain_sensor_fault"].to_numpy()

        n_steps = len(grp_sorted)
        total_span = window_len + horizon  # 42 steps

        for i in range(n_steps - total_span + 1):
            transitions = dt_prev[i + 1 : i + total_span]
            if np.any(transitions > max_dt):
                continue

            last_input_step = i + window_len - 1
            windows.append(features[i : i + window_len])
            targets.append(status[i + total_span - 1])

            fault_scenarios.append(f_scen[last_input_step])
            fault_ambients.append(f_amb[last_input_step])
            fault_rains.append(f_rain[last_input_step])

    X_test = np.array(windows, dtype=np.float32)
    y_test = np.array(targets, dtype=np.int64)
    fault_scenarios = np.array(fault_scenarios)
    fault_ambients = np.array(fault_ambients)
    fault_rains = np.array(fault_rains)

    return X_test, y_test, fault_scenarios, fault_ambients, fault_rains


def main():
    print("=" * 80)
    print("STAGE 3 v2 ROBUSTNESS EVALUATION (FROZEN MODEL: VAR2, 36-STEP WINDOW)")
    print("=" * 80)

    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. Load model and scaler
    model, scaler, model_path, scaler_path = get_model_and_scaler()
    print(f"Loaded model:  {os.path.basename(model_path)}")
    print(f"Loaded scaler: {os.path.basename(scaler_path)}")

    # 2. Extract test windows with fault metadata at last input step
    df = pd.read_csv(DEFAULT_DATA_CSV)
    X_test, y_test, f_scen, f_amb, f_rain = build_test_windows_with_faults(df)
    print(f"Total test windows: {len(X_test):,}")

    # 3. Scale test continuous channels
    orig_shape = X_test[:, :, SCALED_FEATURE_INDICES_V2].shape
    flat = X_test[:, :, SCALED_FEATURE_INDICES_V2].reshape(-1, len(SCALED_FEATURE_INDICES_V2))
    scaled_flat = scaler.transform(flat).reshape(orig_shape)
    X_test[:, :, SCALED_FEATURE_INDICES_V2] = scaled_flat

    # 4. Predict
    probs = model.predict(X_test, batch_size=256, verbose=0)
    preds = np.argmax(probs, axis=1)

    overall_acc = accuracy_score(y_test, preds)
    overall_f1 = f1_score(y_test, preds, average="macro", zero_division=0)
    overall_crit_rec = recall_score(y_test, preds, labels=[2], average=None, zero_division=0)[0]
    overall_crit_prec = precision_score(y_test, preds, labels=[2], average=None, zero_division=0)[0]
    total_crit = int((y_test == 2).sum())

    print("\nOVERALL TEST BASELINE (PLAIN):")
    print(f"  Accuracy:                 {overall_acc:.4f}")
    print(f"  Macro-F1:                 {overall_f1:.4f}")
    print(f"  Critical Recall:          {overall_crit_rec:.4f} (Support: {total_crit})")
    print(f"  Critical Precision:       {overall_crit_prec:.4f}")

    # 5. Fault breakdowns
    results = []
    categories = [
        ("gt_fault_scenario", f_scen),
        ("gt_fault_ambient", f_amb),
        ("gt_rain_sensor_fault", f_rain),
    ]

    for cat_name, cat_values in categories:
        unique_vals = sorted(set(cat_values))
        for val in unique_vals:
            mask = (cat_values == val)
            y_sub = y_test[mask]
            p_sub = preds[mask]

            n_total = len(y_sub)
            n_crit = int((y_sub == 2).sum())
            n_warn = int((y_sub == 1).sum())
            n_norm = int((y_sub == 0).sum())

            acc = float(accuracy_score(y_sub, p_sub))
            macro_f1 = float(f1_score(y_sub, p_sub, average="macro", zero_division=0))

            if n_crit > 0:
                crit_rec = float(recall_score(y_sub, p_sub, labels=[2], average=None, zero_division=0)[0])
                crit_prec = float(precision_score(y_sub, p_sub, labels=[2], average=None, zero_division=0)[0])
                crit_rec_str = f"{round(crit_rec, 4)}"
                crit_prec_str = f"{round(crit_prec, 4)}"
            else:
                crit_rec = np.nan
                crit_prec = np.nan
                crit_rec_str = "undefined"
                crit_prec_str = "undefined"

            results.append({
                "fault_category": cat_name,
                "fault_type": val,
                "window_count": n_total,
                "normal_count": n_norm,
                "warning_count": n_warn,
                "critical_count": n_crit,
                "accuracy": round(acc, 4),
                "macro_f1": round(macro_f1, 4),
                "critical_recall": crit_rec_str,
                "critical_precision": crit_prec_str,
            })

    # Save to reports/stage3_v2_robustness.csv
    robust_df = pd.DataFrame(results)
    robust_df.to_csv(ROBUSTNESS_CSV_PATH, index=False)
    print(f"\nSaved Stage 3 v2 robustness report to: {ROBUSTNESS_CSV_PATH}")

    # 6. Tabular display
    print("\n" + "=" * 90)
    print("STAGE 3 v2 ROBUSTNESS BREAKDOWN TABLE")
    print("=" * 90)
    print(f"{'Category':22s} | {'Fault Type':16s} | {'Windows':7s} | {'Crit N':6s} | {'Macro-F1':8s} | {'Crit Rec':10s} | {'Crit Prec':10s}")
    print("-" * 90)
    for r in results:
        print(f"{r['fault_category']:22s} | {r['fault_type']:16s} | {r['window_count']:7d} | {r['critical_count']:6d} | {r['macro_f1']:8.4f} | {r['critical_recall']:10s} | {r['critical_precision']:10s}")
    print("=" * 90)

    # Identify faults with lowest critical recall (where defined)
    valid_crit = [r for r in results if r["critical_count"] > 0]
    valid_crit.sort(key=lambda x: float(x["critical_recall"]))
    print("\nFault types with lowest critical recall:")
    for i, r in enumerate(valid_crit[:5], 1):
        print(f"  {i}. {r['fault_category']}.{r['fault_type']}: Critical Recall = {r['critical_recall']} (Support: {r['critical_count']}, Macro-F1 = {r['macro_f1']})")


if __name__ == "__main__":
    main()
