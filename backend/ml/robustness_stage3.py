"""
Stage 3 Model Robustness Pipeline.

Breaks down macro-F1 and critical recall on TEST windows by:
  - gt_fault_scenario
  - gt_fault_ambient
  - gt_rain_sensor_fault
evaluated at the window's last input step (step 23).
Saves the breakdown to reports/stage3_robustness.csv and identifies the fault types
that degrade performance the most.
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd
import joblib
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from tensorflow import keras

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
ROBUSTNESS_CSV_PATH = os.path.join(REPORTS_DIR, "stage3_robustness.csv")


def get_latest_model_and_scaler():
    """Loads latest Stage 3 model and scaler."""
    model_files = glob.glob(os.path.join(MODELS_DIR, "lstm-stage3-*.keras"))
    if not model_files:
        raise FileNotFoundError("No models/lstm-stage3-*.keras found.")
    model_files.sort(key=os.path.getmtime, reverse=True)
    model_path = model_files[0]
    model = keras.models.load_model(model_path)

    scaler_path = os.path.join(MODELS_DIR, "scaler_stage3.pkl")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(f"Scaler not found at {scaler_path}")
    scaler = joblib.load(scaler_path)

    return model, scaler, model_path


def build_test_windows_with_faults(df, window_len=WINDOW_LEN, max_dt=MAX_ALLOWED_DT):
    """
    Builds the test windows and records fault column values at the last input step.
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
        features, status, dt_prev = process_event_features(grp_sorted)

        f_scen = grp_sorted["gt_fault_scenario"].to_numpy()
        f_amb = grp_sorted["gt_fault_ambient"].to_numpy()
        f_rain = grp_sorted["gt_rain_sensor_fault"].to_numpy()

        n_steps = len(grp_sorted)
        total_span = window_len + 6  # 30 steps

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
    print("=" * 70)
    print("STAGE 3 ROBUSTNESS BREAKDOWN BY FAULT TYPES")
    print("=" * 70)

    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. Load model and scaler
    model, scaler, model_path = get_latest_model_and_scaler()
    print(f"Loaded model: {os.path.basename(model_path)}")
    print(f"Loaded scaler: models/scaler_stage3.pkl")

    # 2. Extract test windows with fault metadata at last input step
    df = pd.read_csv(DEFAULT_DATA_CSV)
    X_test, y_test, f_scen, f_amb, f_rain = build_test_windows_with_faults(df)
    print(f"Total test windows: {len(X_test):,}")

    # 3. Scale test continuous channels
    orig_shape = X_test[:, :, SCALED_FEATURE_INDICES].shape
    flat = X_test[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
    scaled_flat = scaler.transform(flat).reshape(orig_shape)
    X_test[:, :, SCALED_FEATURE_INDICES] = scaled_flat

    # 4. Model predictions
    probs = model.predict(X_test, batch_size=256, verbose=0)
    preds = np.argmax(probs, axis=1)

    # Baseline overall test metrics
    overall_acc = accuracy_score(y_test, preds)
    overall_f1 = f1_score(y_test, preds, average="macro", zero_division=0)
    overall_crit_rec = recall_score(y_test, preds, labels=[2], average=None, zero_division=0)[0]
    overall_crit_prec = precision_score(y_test, preds, labels=[2], average=None, zero_division=0)[0]

    print("\nOVERALL TEST BASELINE:")
    print(f"  Accuracy:        {overall_acc:.4f}")
    print(f"  Macro-F1:        {overall_f1:.4f}")
    print(f"  Critical Recall: {overall_crit_rec:.4f} (Support: {(y_test == 2).sum()})")
    print(f"  Critical Prec:   {overall_crit_prec:.4f}")

    # 5. Compute breakdowns for each fault category
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
            else:
                crit_rec = np.nan
                crit_prec = np.nan

            results.append({
                "fault_category": cat_name,
                "fault_type": val,
                "window_count": n_total,
                "normal_count": n_norm,
                "warning_count": n_warn,
                "critical_count": n_crit,
                "accuracy": round(acc, 4),
                "macro_f1": round(macro_f1, 4),
                "critical_recall": round(crit_rec, 4) if not np.isnan(crit_rec) else None,
                "critical_precision": round(crit_prec, 4) if not np.isnan(crit_prec) else None,
            })

    # Save to reports/stage3_robustness.csv
    robust_df = pd.DataFrame(results)
    robust_df.to_csv(ROBUSTNESS_CSV_PATH, index=False)
    print(f"\nSaved robustness report to: {ROBUSTNESS_CSV_PATH}")

    # 6. Display tabular report
    print("\n" + "=" * 75)
    print("ROBUSTNESS BREAKDOWN TABLE")
    print("=" * 75)
    print(f"{'Category':22s} | {'Fault Type':12s} | {'Windows':7s} | {'Crit N':6s} | {'Macro-F1':8s} | {'Crit Rec':8s} | {'Crit Prec':9s}")
    print("-" * 75)
    for r in results:
        rec_str = f"{r['critical_recall']:.4f}" if r["critical_recall"] is not None else "  N/A  "
        prec_str = f"{r['critical_precision']:.4f}" if r["critical_precision"] is not None else "  N/A  "
        print(f"{r['fault_category']:22s} | {r['fault_type']:12s} | {r['window_count']:7d} | {r['critical_count']:6d} | {r['macro_f1']:8.4f} | {rec_str:8s} | {prec_str:9s}")
    print("=" * 75)

    # 7. Identify faults impacting critical recall and macro-F1
    print("\n" + "=" * 75)
    print("ANALYSIS: FAULT TYPES THAT REDUCE PERFORMANCE THE MOST")
    print("=" * 75)

    # A. Critical Recall Impact (among fault types with ground truth critical windows)
    crit_faults = [r for r in results if r["critical_recall"] is not None and r["fault_type"] != "none"]
    crit_faults.sort(key=lambda x: x["critical_recall"])

    print("\n[A. Faults that Reduce Critical Recall (compared to baseline none = 0.8894)]:")
    if crit_faults:
        for f in crit_faults:
            drop = overall_crit_rec - f["critical_recall"]
            print(f"  * {f['fault_category']} -> '{f['fault_type']}': Critical Recall = {f['critical_recall']:.4f} (drop: {drop:+.4f}, N_crit={f['critical_count']})")
    else:
        print("  None")

    # B. Macro-F1 Degradation
    f1_faults = [r for r in results if r["fault_type"] != "none"]
    f1_faults.sort(key=lambda x: x["macro_f1"])

    print("\n[B. Top 3 Fault Types Reducing Overall Classification Quality (Macro-F1)]:")
    for i, f in enumerate(f1_faults[:3], 1):
        drop = overall_f1 - f["macro_f1"]
        print(f"  {i}. {f['fault_category']} -> '{f['fault_type']}': Macro-F1 = {f['macro_f1']:.4f} (drop of {drop:.4f} vs baseline {overall_f1:.4f}, N={f['window_count']})")

    # C. Summary of 0-critical faults
    zero_crit = [r["fault_type"] for r in results if r["critical_count"] == 0 and r["fault_type"] != "none"]
    print(f"\n[C. Faults with zero critical ground truth windows in test split (recall undefined)]:")
    print(f"  {', '.join(sorted(set(zero_crit)))}")
    print("=" * 75)


if __name__ == "__main__":
    main()
