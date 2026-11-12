"""
Stage 3 Model Comparison Pipeline.

Compares three methods on the test events against the ground truth 'status':
  (a) fw_status column from CSV (firmware detection)
  (b) stage3 LSTM (deep sequence model, plain and critical-adjusted)
  (c) simple rule (instantaneous distance thresholds at 50% and 75% of 11.5 cm)

For events reaching warning or critical: reports lead time in seconds (positive=early, negative=late).
For events never reaching warning: reports false-alarm counts per method.
Saves the comparison result to reports/stage3_comparison.csv.
"""
import glob
import json
import os
import sys

import numpy as np
import pandas as pd
import joblib
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
COMPARISON_CSV_PATH = os.path.join(REPORTS_DIR, "stage3_comparison.csv")
ALL_EVENTS_CSV_PATH = os.path.join(REPORTS_DIR, "stage3_comparison_events_all.csv")

# Physical thresholds based on 11.5 cm beaker reference rise
# Empty water distance = 12.3 cm
# 50% rise of 11.5 cm = 5.75 cm -> dist <= 12.3 - 5.75 = 6.55 cm
# 75% rise of 11.5 cm = 8.625 cm -> dist <= 12.3 - 8.625 = 3.675 cm
RULE_WARN_DIST_CM = 6.55
RULE_CRIT_DIST_CM = 3.675


def get_latest_model_and_scaler():
    """Loads latest Stage 3 model and scaler."""
    model_files = [f for f in glob.glob(os.path.join(MODELS_DIR, "lstm-stage3-*.keras")) if "-v2-" not in os.path.basename(f)]
    if not model_files:
        raise FileNotFoundError("No models/lstm-stage3-*.keras found.")
    model_files.sort(key=os.path.getmtime, reverse=True)
    model_path = model_files[0]
    model = keras.models.load_model(model_path)

    scaler_path = os.path.join(MODELS_DIR, "scaler_stage3.pkl")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(f"Scaler not found at {scaler_path}")
    scaler = joblib.load(scaler_path)

    # Check for tuned critical multiplier in metrics.json
    mult = 2.20
    metrics_json_path = os.path.join(REPORTS_DIR, "stage3_metrics.json")
    if os.path.exists(metrics_json_path):
        try:
            with open(metrics_json_path, "r") as f:
                data = json.load(f)
                mult = float(data.get("critical_multiplier", 2.20))
        except Exception:
            pass

    return model, scaler, mult, model_path


def evaluate_event_methods(grp, model, scaler, crit_multiplier=2.20):
    """
    Evaluates fw_status, LSTM (plain & adjusted), and simple rule
    for every timestep in an event.
    """
    t_arr = grp["t_event_s"].to_numpy(dtype=np.float64)
    true_status = grp["status"].to_numpy()
    fw_status = grp["fw_status"].to_numpy()
    dt_arr = grp["dt_prev_s"].to_numpy(dtype=np.float64)

    features, _, _ = process_event_features(grp)
    dist_filled = features[:, 0]  # causal filled distance

    # 1. Simple Rule: thresholds at 50% (6.55 cm) and 75% (3.675 cm)
    rule_status = []
    for d in dist_filled:
        if d <= RULE_CRIT_DIST_CM:
            rule_status.append("critical")
        elif d <= RULE_WARN_DIST_CM:
            rule_status.append("warning")
        else:
            rule_status.append("normal")
    rule_status = np.array(rule_status)

    # 2. LSTM Sliding Windows (starts at step 23, warmup of 24 steps)
    lstm_plain = [None] * len(grp)
    lstm_adj = [None] * len(grp)

    windows = []
    valid_step_indices = []

    for k in range(WINDOW_LEN - 1, len(grp)):
        start_idx = k - WINDOW_LEN + 1
        # Check for gap transitions inside the window
        transitions = dt_arr[start_idx + 1 : k + 1]
        if np.any(transitions > MAX_ALLOWED_DT):
            continue
        windows.append(features[start_idx : k + 1])
        valid_step_indices.append(k)

    if windows:
        windows = np.array(windows, dtype=np.float32)
        orig_shape = windows[:, :, SCALED_FEATURE_INDICES].shape
        windows[:, :, SCALED_FEATURE_INDICES] = scaler.transform(
            windows[:, :, SCALED_FEATURE_INDICES].reshape(-1, len(SCALED_FEATURE_INDICES))
        ).reshape(orig_shape)

        probs = model.predict(windows, batch_size=256, verbose=0)
        p_plain = np.argmax(probs, axis=1)

        probs_adj = probs.copy()
        probs_adj[:, 2] *= crit_multiplier
        p_adj = np.argmax(probs_adj, axis=1)

        class_map = {0: "normal", 1: "warning", 2: "critical"}
        for idx, k in enumerate(valid_step_indices):
            lstm_plain[k] = class_map[p_plain[idx]]
            lstm_adj[k] = class_map[p_adj[idx]]

    return {
        "t": t_arr,
        "true": true_status,
        "fw": fw_status,
        "rule": rule_status,
        "lstm_plain": lstm_plain,
        "lstm_adj": lstm_adj,
    }


def find_first_signal_time(t_arr, status_series, target_classes):
    """Finds the first timestamp where status_series matches any of target_classes."""
    for t_val, s_val in zip(t_arr, status_series):
        if s_val in target_classes:
            return float(t_val)
    return None


def main():
    print("=" * 65)
    print("STAGE 3 METHOD COMPARISON (ON TEST SPLIT)")
    print("=" * 65)

    os.makedirs(REPORTS_DIR, exist_ok=True)

    # 1. Load model and artifacts
    model, scaler, crit_mult, model_path = get_latest_model_and_scaler()
    print(f"Loaded model: {os.path.basename(model_path)}")
    print(f"Loaded scaler: models/scaler_stage3.pkl")
    print(f"Critical multiplier: {crit_mult:.2f}")

    # 2. Load dataset and filter to test split
    df = pd.read_csv(DEFAULT_DATA_CSV)
    test_df = df[df["split"] == "test"].copy()
    test_events = list(test_df.groupby("event_id"))
    print(f"Total test events: {len(test_events)}")

    # 3. Track metrics
    hazard_rows = []
    all_events_rows = []

    false_alarms = {
        "fw": 0,
        "lstm": 0,
        "lstm_adj": 0,
        "rule": 0,
    }
    normal_events_count = 0

    for eid, grp in test_events:
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        scenario_id = grp_sorted["scenario_id"].iloc[0] if "scenario_id" in grp_sorted.columns else "unknown"

        ev_data = evaluate_event_methods(grp_sorted, model, scaler, crit_multiplier=crit_mult)
        t_arr = ev_data["t"]
        true_s = ev_data["true"]

        has_warn = np.isin(true_s, ["warning", "critical"]).any()
        has_crit = (true_s == "critical").any()

        if not has_warn:
            # Event never reaches warning (normal-only event)
            normal_events_count += 1
            fw_fa = int(np.isin(ev_data["fw"], ["warning", "critical"]).any())
            rule_fa = int(np.isin(ev_data["rule"], ["warning", "critical"]).any())
            lstm_fa = int(any(s in ["warning", "critical"] for s in ev_data["lstm_plain"] if s is not None))
            lstm_adj_fa = int(any(s in ["warning", "critical"] for s in ev_data["lstm_adj"] if s is not None))

            false_alarms["fw"] += fw_fa
            false_alarms["rule"] += rule_fa
            false_alarms["lstm"] += lstm_fa
            false_alarms["lstm_adj"] += lstm_adj_fa

            all_events_rows.append({
                "event_id": eid,
                "scenario_id": scenario_id,
                "reaches_hazard": False,
                "true_warning_t_s": np.nan,
                "true_critical_t_s": np.nan,
                "fw_warn_lead_s": np.nan,
                "fw_crit_lead_s": np.nan,
                "lstm_warn_lead_s": np.nan,
                "lstm_crit_lead_s": np.nan,
                "lstm_adj_crit_lead_s": np.nan,
                "rule_warn_lead_s": np.nan,
                "rule_crit_lead_s": np.nan,
                "fw_false_alarm": fw_fa,
                "lstm_false_alarm": lstm_fa,
                "rule_false_alarm": rule_fa,
            })
        else:
            # Event reaches warning or critical
            t_true_warn = t_arr[np.isin(true_s, ["warning", "critical"])][0]
            t_true_crit = t_arr[true_s == "critical"][0] if has_crit else None

            # First signal timestamps
            t_fw_warn = find_first_signal_time(t_arr, ev_data["fw"], ["warning", "critical"])
            t_fw_crit = find_first_signal_time(t_arr, ev_data["fw"], ["critical"]) if has_crit else None

            t_rule_warn = find_first_signal_time(t_arr, ev_data["rule"], ["warning", "critical"])
            t_rule_crit = find_first_signal_time(t_arr, ev_data["rule"], ["critical"]) if has_crit else None

            t_lstm_warn = find_first_signal_time(t_arr, ev_data["lstm_plain"], ["warning", "critical"])
            t_lstm_crit = find_first_signal_time(t_arr, ev_data["lstm_plain"], ["critical"]) if has_crit else None
            t_lstm_adj_crit = find_first_signal_time(t_arr, ev_data["lstm_adj"], ["critical"]) if has_crit else None

            # Calculate lead times (positive = early, negative = late)
            fw_warn_lead = (t_true_warn - t_fw_warn) if t_fw_warn is not None else None
            fw_crit_lead = (t_true_crit - t_fw_crit) if (t_true_crit is not None and t_fw_crit is not None) else None

            rule_warn_lead = (t_true_warn - t_rule_warn) if t_rule_warn is not None else None
            rule_crit_lead = (t_true_crit - t_rule_crit) if (t_true_crit is not None and t_rule_crit is not None) else None

            lstm_warn_lead = (t_true_warn - t_lstm_warn) if t_lstm_warn is not None else None
            lstm_crit_lead = (t_true_crit - t_lstm_crit) if (t_true_crit is not None and t_lstm_crit is not None) else None
            lstm_adj_crit_lead = (t_true_crit - t_lstm_adj_crit) if (t_true_crit is not None and t_lstm_adj_crit is not None) else None

            hazard_item = {
                "event_id": eid,
                "scenario_id": scenario_id,
                "true_warning_t_s": t_true_warn,
                "true_critical_t_s": t_true_crit,
                "fw_warn_lead_s": fw_warn_lead,
                "fw_crit_lead_s": fw_crit_lead,
                "lstm_warn_lead_s": lstm_warn_lead,
                "lstm_crit_lead_s": lstm_crit_lead,
                "lstm_adj_crit_lead_s": lstm_adj_crit_lead,
                "rule_warn_lead_s": rule_warn_lead,
                "rule_crit_lead_s": rule_crit_lead,
                "fw_false_alarm_count_overall": None,  # populated below
                "lstm_false_alarm_count_overall": None,
                "rule_false_alarm_count_overall": None,
            }
            hazard_rows.append(hazard_item)

            all_events_rows.append({
                "event_id": eid,
                "scenario_id": scenario_id,
                "reaches_hazard": True,
                "true_warning_t_s": t_true_warn,
                "true_critical_t_s": t_true_crit,
                "fw_warn_lead_s": fw_warn_lead,
                "fw_crit_lead_s": fw_crit_lead,
                "lstm_warn_lead_s": lstm_warn_lead,
                "lstm_crit_lead_s": lstm_crit_lead,
                "lstm_adj_crit_lead_s": lstm_adj_crit_lead,
                "rule_warn_lead_s": rule_warn_lead,
                "rule_crit_lead_s": rule_crit_lead,
                "fw_false_alarm": np.nan,
                "lstm_false_alarm": np.nan,
                "rule_false_alarm": np.nan,
            })

    # Populate overall false alarm counts in hazard_rows
    for row in hazard_rows:
        row["fw_false_alarm_count_overall"] = false_alarms["fw"]
        row["lstm_false_alarm_count_overall"] = false_alarms["lstm"]
        row["rule_false_alarm_count_overall"] = false_alarms["rule"]

    # 4. Save results to reports/stage3_comparison.csv
    comp_df = pd.DataFrame(hazard_rows)
    comp_df.to_csv(COMPARISON_CSV_PATH, index=False)
    print(f"\nSaved comparison result for {len(comp_df)} hazard events to: {COMPARISON_CSV_PATH}")

    # Also save complete 90-event breakdown for comprehensive record
    all_df = pd.DataFrame(all_events_rows)
    all_df.to_csv(ALL_EVENTS_CSV_PATH, index=False)
    print(f"Saved complete 90-event breakdown to: {ALL_EVENTS_CSV_PATH}")

    # 5. Summary Statistics
    print("\n" + "=" * 65)
    print("COMPARISON SUMMARY")
    print("=" * 65)
    print(f"Test events total:                     {len(test_events)}")
    print(f"  - Events reaching warning/critical:  {len(hazard_rows)} (38 expected)")
    print(f"  - Events reaching critical:          {sum(1 for r in hazard_rows if r['true_critical_t_s'] is not None)} (9 expected)")
    print(f"  - Events never reaching warning:     {normal_events_count} (52 expected)")

    print("\n[A. FALSE-ALARM COUNT ON NORMAL-ONLY EVENTS (N=52)]")
    print(f"  Firmware (fw_status):  {false_alarms['fw']:2d} / {normal_events_count} ({false_alarms['fw']/normal_events_count*100:5.1f}%)")
    print(f"  Simple Rule:           {false_alarms['rule']:2d} / {normal_events_count} ({false_alarms['rule']/normal_events_count*100:5.1f}%)")
    print(f"  Stage 3 LSTM (Plain):  {false_alarms['lstm']:2d} / {normal_events_count} ({false_alarms['lstm']/normal_events_count*100:5.1f}%)")
    print(f"  Stage 3 LSTM (Adj):    {false_alarms['lstm_adj']:2d} / {normal_events_count} ({false_alarms['lstm_adj']/normal_events_count*100:5.1f}%)")

    print("\n[B. WARNING LEAD TIME (SECONDS BEFORE TRUE WARNING) - 38 HAZARD EVENTS]")
    print("Method                | Mean (s) | Median (s) | Min (s) | Max (s) | Signaled")
    print("-" * 72)
    for name, col in [
        ("Firmware (fw_status)", "fw_warn_lead_s"),
        ("Simple Rule (dist)  ", "rule_warn_lead_s"),
        ("Stage 3 LSTM (Plain)", "lstm_warn_lead_s"),
    ]:
        valid = comp_df[col].dropna()
        count = len(valid)
        print(f"{name:21s} | {valid.mean():8.1f} | {valid.median():10.1f} | {valid.min():7.1f} | {valid.max():7.1f} | {count:2d}/{len(comp_df)}")

    print("\n[C. CRITICAL LEAD TIME (SECONDS BEFORE TRUE CRITICAL) - 9 CRITICAL EVENTS]")
    print("Method                | Mean (s) | Median (s) | Min (s) | Max (s) | Signaled")
    print("-" * 72)
    crit_sub = comp_df[comp_df["true_critical_t_s"].notna()]
    for name, col in [
        ("Firmware (fw_status)", "fw_crit_lead_s"),
        ("Simple Rule (dist)  ", "rule_crit_lead_s"),
        ("Stage 3 LSTM (Plain)", "lstm_crit_lead_s"),
        ("Stage 3 LSTM (Adj)  ", "lstm_adj_crit_lead_s"),
    ]:
        valid = crit_sub[col].dropna()
        count = len(valid)
        print(f"{name:21s} | {valid.mean():8.1f} | {valid.median():10.1f} | {valid.min():7.1f} | {valid.max():7.1f} | {count:2d}/{len(crit_sub)}")

    print("\n" + "=" * 65)
    print("SAMPLE EVENT ROWS (FIRST 5 HAZARD EVENTS):")
    print("=" * 65)
    sample_cols = [
        "event_id",
        "true_warning_t_s",
        "fw_warn_lead_s",
        "rule_warn_lead_s",
        "lstm_warn_lead_s",
        "true_critical_t_s",
        "rule_crit_lead_s",
        "lstm_crit_lead_s",
    ]
    print(comp_df[sample_cols].head(5).to_string(index=False))
    print("=" * 65)


if __name__ == "__main__":
    main()
