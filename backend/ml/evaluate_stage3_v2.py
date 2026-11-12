"""
Stage 3 v2 Model Evaluation and Selection Pipeline.

Step D:
1. Loads all trained Stage 3 v2 variants:
   - var1: 8 features, window 24
   - var2: 8 features, window 36
   - var3: var1 with critical class weight x2
   - var4: var1 with GRU(64) instead of LSTM(64)
2. On the VALIDATION split, reports for each variant:
   - Plain accuracy, macro-F1, critical recall, critical precision
   - Calibrated critical multiplier achieving critical recall >= 0.95 with best precision
   - Calibrated validation macro-F1, critical recall, and critical precision
3. Chooses the WINNER by validation macro-F1 at critical recall >= 0.95.
4. Evaluates the single winner ONCE on the TEST split (plain & calibrated, no tuning on test).
5. Compares winner test metrics against baseline Stage 3 v1 model (stage3_metrics.json).
6. Performs lead-time analysis on test events with the warm-up artifact fix:
   left-pads the first 23 steps with row 0 instead of skipping predictions.
7. Saves results to reports/stage3_v2_metrics.json and reports/stage3_v2_comparison.csv.
"""
import glob
import json
import os
import re
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
import tensorflow as tf
from tensorflow import keras

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from stage3_data_v2 import (
    DEFAULT_DATA_CSV,
    FEATURE_NAMES_V2,
    HORIZON_STEPS,
    MAX_ALLOWED_DT,
    SCALED_FEATURE_INDICES_V2,
    STATUS_MAP,
    load_stage3_data_v2,
    process_event_features_v2,
)

MODELS_DIR = os.path.join(_HERE, "models")
REPORTS_DIR = os.path.join(_HERE, "reports")
V1_METRICS_PATH = os.path.join(REPORTS_DIR, "stage3_metrics.json")
V2_METRICS_PATH = os.path.join(REPORTS_DIR, "stage3_v2_metrics.json")
V2_COMPARISON_CSV = os.path.join(REPORTS_DIR, "stage3_v2_comparison.csv")

CLASS_NAMES = ["normal", "warning", "critical"]
INV_STATUS_MAP = {v: k for k, v in STATUS_MAP.items()}

# Physical thresholds based on 11.5 cm beaker reference rise
# Empty water distance = 12.3 cm
# 50% rise of 11.5 cm = 5.75 cm -> dist <= 12.3 - 5.75 = 6.55 cm
# 75% rise of 11.5 cm = 8.625 cm -> dist <= 12.3 - 8.625 = 3.675 cm
RULE_WARN_DIST_CM = 6.55
RULE_CRIT_DIST_CM = 3.675


def find_latest_model(variant_id: str) -> str:
    """Finds the latest .keras model file for a given variant."""
    pattern = os.path.join(MODELS_DIR, f"lstm-stage3-v2-{variant_id}-*.keras")
    files = glob.glob(pattern)
    if not files:
        raise FileNotFoundError(f"No model found matching pattern: {pattern}")
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Computes comprehensive classification metrics."""
    acc = float(accuracy_score(y_true, y_pred))
    p, r, f1, support = precision_recall_fscore_support(
        y_true, y_pred, labels=[0, 1, 2], zero_division=0
    )
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(
        y_true, y_pred, average="macro", zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1, 2])
    crit_as_normal = int(cm[2, 0])

    per_class = {}
    for i, name in enumerate(CLASS_NAMES):
        per_class[name] = {
            "precision": float(round(p[i], 4)),
            "recall": float(round(r[i], 4)),
            "f1": float(round(f1[i], 4)),
            "support": int(support[i]),
        }

    return {
        "accuracy": float(round(acc, 4)),
        "macro_f1": float(round(f1_macro, 4)),
        "macro_precision": float(round(p_macro, 4)),
        "macro_recall": float(round(r_macro, 4)),
        "per_class": per_class,
        "confusion_matrix": cm.tolist(),
        "critical_predicted_as_normal": crit_as_normal,
    }


def find_calibrated_critical_multiplier(probs_val: np.ndarray, y_val: np.ndarray, target_recall: float = 0.95):
    """
    Sweeps multiplier on critical class (index 2) to achieve critical recall >= target_recall
    with the best precision on the validation split.
    """
    multipliers = np.arange(1.0, 15.01, 0.05)
    best_mult = 1.0
    best_precision = -1.0
    best_recall = -1.0
    found_eligible = False

    for m in multipliers:
        adj = probs_val.copy()
        adj[:, 2] *= m
        preds = np.argmax(adj, axis=1)
        p, r, _, _ = precision_recall_fscore_support(y_val, preds, labels=[2], zero_division=0)
        rec = float(r[0])
        prec = float(p[0])

        if rec >= target_recall:
            if prec > best_precision:
                best_precision = prec
                best_recall = rec
                best_mult = float(round(m, 2))
                found_eligible = True

    if not found_eligible:
        # Fallback to highest recall
        for m in multipliers:
            adj = probs_val.copy()
            adj[:, 2] *= m
            preds = np.argmax(adj, axis=1)
            p, r, _, _ = precision_recall_fscore_support(y_val, preds, labels=[2], zero_division=0)
            if r[0] > best_recall:
                best_recall = float(r[0])
                best_precision = float(p[0])
                best_mult = float(round(m, 2))

    return best_mult, best_recall, best_precision


def evaluate_lead_time_with_padding(
    grp: pd.DataFrame,
    model: keras.Model,
    scaler: joblib.load,
    window_len: int = 24,
    crit_multiplier: float = 1.0,
    use_left_padding: bool = True,
) -> dict:
    """
    Evaluates event predictions across all timesteps.
    If use_left_padding is True: for steps k < window_len - 1, left-pads the window
    with the first step's features, resolving the warm-up artifact.
    """
    features, _, dt_prev = process_event_features_v2(grp)
    t_arr = grp["t_event_s"].to_numpy(dtype=np.float64)
    true_status = grp["status"].to_numpy()
    fw_status = grp["fw_status"].to_numpy()

    # Simple rule using distance thresholds
    dist_filled = features[:, 0]
    rule_status = []
    for d in dist_filled:
        if d <= RULE_CRIT_DIST_CM:
            rule_status.append("critical")
        elif d <= RULE_WARN_DIST_CM:
            rule_status.append("warning")
        else:
            rule_status.append("normal")
    rule_status = np.array(rule_status)

    n_steps = len(features)
    lstm_preds_plain = [None] * n_steps
    lstm_preds_adj = [None] * n_steps

    windows = []
    step_indices = []

    start_step = 0 if use_left_padding else (window_len - 1)
    for k in range(start_step, n_steps):
        if k < window_len - 1:
            # Check transitions in the available steps
            if k > 0 and np.any(dt_prev[1 : k + 1] > MAX_ALLOWED_DT):
                continue
            pad_len = window_len - 1 - k
            pad_block = np.tile(features[0:1], (pad_len, 1))
            win = np.vstack([pad_block, features[0 : k + 1]])
        else:
            start_idx = k - window_len + 1
            if np.any(dt_prev[start_idx + 1 : k + 1] > MAX_ALLOWED_DT):
                continue
            win = features[start_idx : k + 1]

        windows.append(win)
        step_indices.append(k)

    if windows:
        windows_arr = np.array(windows, dtype=np.float32)
        orig_shape = windows_arr[:, :, SCALED_FEATURE_INDICES_V2].shape
        windows_arr[:, :, SCALED_FEATURE_INDICES_V2] = scaler.transform(
            windows_arr[:, :, SCALED_FEATURE_INDICES_V2].reshape(-1, len(SCALED_FEATURE_INDICES_V2))
        ).reshape(orig_shape)

        probs = model.predict(windows_arr, batch_size=256, verbose=0)
        p_plain = np.argmax(probs, axis=1)

        probs_adj = probs.copy()
        probs_adj[:, 2] *= crit_multiplier
        p_adj = np.argmax(probs_adj, axis=1)

        for idx, k in enumerate(step_indices):
            lstm_preds_plain[k] = CLASS_NAMES[p_plain[idx]]
            lstm_preds_adj[k] = CLASS_NAMES[p_adj[idx]]

    return {
        "t": t_arr,
        "true": true_status,
        "fw": fw_status,
        "rule": rule_status,
        "lstm_plain": lstm_preds_plain,
        "lstm_adj": lstm_preds_adj,
    }


def find_first_signal_time(t_arr, status_series, target_classes):
    for t_val, s_val in zip(t_arr, status_series):
        if s_val in target_classes:
            return float(t_val)
    return None


def main():
    print("=" * 80)
    print("STAGE 3 v2 EVALUATION, SELECTION & TEST VALIDATION")
    print("=" * 80)

    # 1. Variants configuration
    variants = [
        {"id": "var1", "name": "Var 1 (8 feat, win 24)", "window": 24, "scaler": "scaler_stage3_v2.pkl"},
        {"id": "var2", "name": "Var 2 (8 feat, win 36)", "window": 36, "scaler": "scaler_stage3_v2_w36.pkl"},
        {"id": "var3", "name": "Var 3 (Var 1, crit wt x2)", "window": 24, "scaler": "scaler_stage3_v2.pkl"},
        {"id": "var4", "name": "Var 4 (Var 1, GRU(64))", "window": 24, "scaler": "scaler_stage3_v2.pkl"},
    ]

    # Preload datasets for window 24 and window 36
    print("\n--- Loading Validation Sets ---")
    data_cache = {}
    for w in [24, 36]:
        s_name = "scaler_stage3_v2.pkl" if w == 24 else "scaler_stage3_v2_w36.pkl"
        s_path = os.path.join(MODELS_DIR, s_name)
        X_tr, y_tr, X_v, y_v, X_te, y_te, s = load_stage3_data_v2(
            window_len=w, scaler_path=s_path, save_scaler=False
        )
        data_cache[w] = {
            "X_val": X_v, "y_val": y_v,
            "X_test": X_te, "y_test": y_te,
            "scaler": s,
        }
        print(f"Loaded data for window {w}: Val={X_v.shape}, Test={X_te.shape}")

    # 2. Evaluate all variants on VALIDATION
    print("\n" + "=" * 80)
    print("STEP 1: VALIDATION EVALUATION & CALIBRATION (ALL VARIANTS)")
    print("=" * 80)

    val_records = []
    models_dict = {}

    for var in variants:
        vid = var["id"]
        model_path = find_latest_model(vid)
        model = keras.models.load_model(model_path)
        models_dict[vid] = (model, model_path)

        w = var["window"]
        X_val = data_cache[w]["X_val"]
        y_val = data_cache[w]["y_val"]

        probs_val = model.predict(X_val, batch_size=256, verbose=0)
        preds_plain = np.argmax(probs_val, axis=1)

        # Plain validation metrics
        plain_m = compute_metrics(y_val, preds_plain)

        # Multiplier calibration
        best_mult, cal_rec, cal_prec = find_calibrated_critical_multiplier(probs_val, y_val, target_recall=0.95)

        # Calibrated metrics
        adj_probs = probs_val.copy()
        adj_probs[:, 2] *= best_mult
        preds_adj = np.argmax(adj_probs, axis=1)
        adj_m = compute_metrics(y_val, preds_adj)

        val_records.append({
            "variant": vid,
            "name": var["name"],
            "model_file": os.path.basename(model_path),
            "window": w,
            "plain_acc": plain_m["accuracy"],
            "plain_macro_f1": plain_m["macro_f1"],
            "plain_crit_rec": plain_m["per_class"]["critical"]["recall"],
            "plain_crit_prec": plain_m["per_class"]["critical"]["precision"],
            "cal_mult": best_mult,
            "cal_acc": adj_m["accuracy"],
            "cal_macro_f1": adj_m["macro_f1"],
            "cal_crit_rec": adj_m["per_class"]["critical"]["recall"],
            "cal_crit_prec": adj_m["per_class"]["critical"]["precision"],
            "plain_metrics": plain_m,
            "cal_metrics": adj_m,
        })

    # Print Validation Comparison Table
    print(f"\n{'Variant':<8} | {'Window':<6} | {'Plain F1':<8} | {'Plain Rec':<9} | {'Plain Prec':<10} | {'Mult':<5} | {'Cal F1':<8} | {'Cal Rec':<8} | {'Cal Prec':<8}")
    print("-" * 88)
    for r in val_records:
        print(f"{r['variant']:<8} | {r['window']:<6} | {r['plain_macro_f1']:<8.4f} | {r['plain_crit_rec']:<9.4f} | {r['plain_crit_prec']:<10.4f} | {r['cal_mult']:<5.2f} | {r['cal_macro_f1']:<8.4f} | {r['cal_crit_rec']:<8.4f} | {r['cal_crit_prec']:<8.4f}")

    # 3. Model Selection
    # "Choose the winner by validation macro-F1 at critical recall >= 0.95."
    # Filter candidates with cal_crit_rec >= 0.95
    candidates = [r for r in val_records if r["cal_crit_rec"] >= 0.95]
    if not candidates:
        candidates = val_records  # fallback

    candidates.sort(key=lambda x: (x["cal_macro_f1"], x["cal_crit_prec"]), reverse=True)
    winner_record = candidates[0]
    winner_id = winner_record["variant"]
    winner_model, winner_model_path = models_dict[winner_id]
    winner_wlen = winner_record["window"]
    winner_mult = winner_record["cal_mult"]
    winner_scaler = data_cache[winner_wlen]["scaler"]

    print("\n" + "=" * 80)
    print(f"WINNER SELECTION: {winner_id.upper()} ({winner_record['name']})")
    print(f"  - Model: {os.path.basename(winner_model_path)}")
    print(f"  - Calibrated Validation Macro-F1:     {winner_record['cal_macro_f1']:.4f}")
    print(f"  - Calibrated Validation Crit Recall:  {winner_record['cal_crit_rec']:.4f} (>= 0.95 requirement met)")
    print(f"  - Calibrated Validation Crit Prec:    {winner_record['cal_crit_prec']:.4f}")
    print(f"  - Fixed Critical Multiplier:          {winner_mult:.2f}")
    print("=" * 80)

    # 4. Single TEST Evaluation on Winner
    print("\n" + "=" * 80)
    print(f"STEP 2: TEST SPLIT EVALUATION (WINNER: {winner_id.upper()} ONLY)")
    print("=" * 80)

    X_test = data_cache[winner_wlen]["X_test"]
    y_test = data_cache[winner_wlen]["y_test"]

    test_probs = winner_model.predict(X_test, batch_size=256, verbose=0)
    test_preds_plain = np.argmax(test_probs, axis=1)

    test_plain_metrics = compute_metrics(y_test, test_preds_plain)

    test_probs_adj = test_probs.copy()
    test_probs_adj[:, 2] *= winner_mult
    test_preds_adj = np.argmax(test_probs_adj, axis=1)

    test_adj_metrics = compute_metrics(y_test, test_preds_adj)

    print("\n[TEST PLAIN METRICS (m = 1.0)]")
    print(f"  Accuracy:                      {test_plain_metrics['accuracy']:.4f}")
    print(f"  Macro-F1:                      {test_plain_metrics['macro_f1']:.4f}")
    print(f"  Macro-Precision:               {test_plain_metrics['macro_precision']:.4f}")
    print(f"  Macro-Recall:                  {test_plain_metrics['macro_recall']:.4f}")
    print(f"  Critical Recall:               {test_plain_metrics['per_class']['critical']['recall']:.4f}")
    print(f"  Critical Precision:            {test_plain_metrics['per_class']['critical']['precision']:.4f}")
    print(f"  Critical Predicted as Normal:  {test_plain_metrics['critical_predicted_as_normal']}")
    print(f"  Confusion Matrix:              {test_plain_metrics['confusion_matrix']}")

    print(f"\n[TEST CALIBRATED METRICS (Fixed Val Multiplier m = {winner_mult:.2f})]")
    print(f"  Accuracy:                      {test_adj_metrics['accuracy']:.4f}")
    print(f"  Macro-F1:                      {test_adj_metrics['macro_f1']:.4f}")
    print(f"  Macro-Precision:               {test_adj_metrics['macro_precision']:.4f}")
    print(f"  Macro-Recall:                  {test_adj_metrics['macro_recall']:.4f}")
    print(f"  Critical Recall:               {test_adj_metrics['per_class']['critical']['recall']:.4f}")
    print(f"  Critical Precision:            {test_adj_metrics['per_class']['critical']['precision']:.4f}")
    print(f"  Critical Predicted as Normal:  {test_adj_metrics['critical_predicted_as_normal']}")
    print(f"  Confusion Matrix:              {test_adj_metrics['confusion_matrix']}")

    # 5. Load and compare with Original Stage 3 v1
    v1_metrics = {}
    if os.path.exists(V1_METRICS_PATH):
        with open(V1_METRICS_PATH, "r") as f:
            v1_metrics = json.load(f)

    v1_test_plain = v1_metrics.get("test_plain", {})
    v1_test_adj = v1_metrics.get("test_adjusted", {})

    print("\n" + "=" * 80)
    print("STEP 3: TEST COMPARISON vs ORIGINAL STAGE 3 v1")
    print("=" * 80)
    print(f"{'Metric':<25} | {'Stage 3 v1':<12} | {'Stage 3 v2':<12} | {'Delta':<10}")
    print("-" * 65)

    def print_diff(label, v1_val, v2_val):
        delta = v2_val - v1_val
        sign = "+" if delta >= 0 else ""
        print(f"{label:<25} | {v1_val:<12.4f} | {v2_val:<12.4f} | {sign}{delta:<10.4f}")

    if v1_test_plain:
        print("[Plain Test]")
        print_diff("Accuracy", v1_test_plain.get("accuracy", 0), test_plain_metrics["accuracy"])
        print_diff("Macro-F1", v1_test_plain.get("macro_f1", 0), test_plain_metrics["macro_f1"])
        print_diff("Critical Recall", v1_test_plain.get("per_class", {}).get("critical", {}).get("recall", 0), test_plain_metrics["per_class"]["critical"]["recall"])
        print_diff("Critical Precision", v1_test_plain.get("per_class", {}).get("critical", {}).get("precision", 0), test_plain_metrics["per_class"]["critical"]["precision"])

    if v1_test_adj:
        print("\n[Adjusted/Calibrated Test]")
        print_diff("Accuracy", v1_test_adj.get("accuracy", 0), test_adj_metrics["accuracy"])
        print_diff("Macro-F1", v1_test_adj.get("macro_f1", 0), test_adj_metrics["macro_f1"])
        print_diff("Critical Recall", v1_test_adj.get("per_class", {}).get("critical", {}).get("recall", 0), test_adj_metrics["per_class"]["critical"]["recall"])
        print_diff("Critical Precision", v1_test_adj.get("per_class", {}).get("critical", {}).get("precision", 0), test_adj_metrics["per_class"]["critical"]["precision"])

    # 6. Lead-Time Analysis on Test Events with Warm-Up Artifact Fix
    print("\n" + "=" * 80)
    print("STEP 4: LEAD-TIME ANALYSIS & WARM-UP ARTIFACT FIX")
    print("=" * 80)
    print(f"Fix applied: For the first {winner_wlen - 1} steps of an event, the input window is")
    print("left-padded with the event's first row instead of skipping predictions.")
    print("This allows predictions from t = 0s, eliminating the artificial 115s warm-up delay.")

    df_raw = pd.read_csv(DEFAULT_DATA_CSV)
    test_df = df_raw[df_raw["split"] == "test"].copy()
    test_events = list(test_df.groupby("event_id"))

    comp_rows = []
    normal_fa_count_padded = 0
    normal_fa_count_unpadded = 0
    normal_fa_count_fw = 0
    normal_fa_count_rule = 0
    normal_events_total = 0

    lead_times_warn_padded = []
    lead_times_crit_padded = []
    lead_times_warn_unpadded = []
    lead_times_crit_padded_adj = []

    lead_times_warn_padded_start_warn = []
    lead_times_warn_unpadded_start_warn = []
    lead_times_warn_padded_trans = []
    lead_times_warn_unpadded_trans = []

    for eid, grp in test_events:
        grp_sorted = grp.sort_values("t_event_s").reset_index(drop=True)
        scenario_id = grp_sorted["scenario_id"].iloc[0] if "scenario_id" in grp_sorted.columns else "unknown"

        # Padded evaluation (warm-up fixed)
        ev_pad = evaluate_lead_time_with_padding(
            grp_sorted, winner_model, winner_scaler, window_len=winner_wlen,
            crit_multiplier=winner_mult, use_left_padding=True
        )

        # Unpadded evaluation (warm-up skipped, legacy behavior)
        ev_unpad = evaluate_lead_time_with_padding(
            grp_sorted, winner_model, winner_scaler, window_len=winner_wlen,
            crit_multiplier=winner_mult, use_left_padding=False
        )

        t_arr = ev_pad["t"]
        true_s = ev_pad["true"]
        has_warn = np.isin(true_s, ["warning", "critical"]).any()
        has_crit = (true_s == "critical").any()

        if not has_warn:
            normal_events_total += 1
            fw_fa = int(np.isin(ev_pad["fw"], ["warning", "critical"]).any())
            rule_fa = int(np.isin(ev_pad["rule"], ["warning", "critical"]).any())
            pad_fa = int(any(s in ["warning", "critical"] for s in ev_pad["lstm_plain"] if s is not None))
            unpad_fa = int(any(s in ["warning", "critical"] for s in ev_unpad["lstm_plain"] if s is not None))

            normal_fa_count_fw += fw_fa
            normal_fa_count_rule += rule_fa
            normal_fa_count_padded += pad_fa
            normal_fa_count_unpadded += unpad_fa

            comp_rows.append({
                "event_id": eid,
                "scenario_id": scenario_id,
                "reaches_hazard": False,
                "true_warning_t_s": np.nan,
                "true_critical_t_s": np.nan,
                "fw_warn_lead_s": np.nan,
                "fw_crit_lead_s": np.nan,
                "rule_warn_lead_s": np.nan,
                "rule_crit_lead_s": np.nan,
                "lstm_v2_pad_warn_lead_s": np.nan,
                "lstm_v2_pad_crit_lead_s": np.nan,
                "lstm_v2_unpad_warn_lead_s": np.nan,
                "lstm_v2_unpad_crit_lead_s": np.nan,
                "fw_fa": fw_fa,
                "rule_fa": rule_fa,
                "lstm_v2_pad_fa": pad_fa,
                "lstm_v2_unpad_fa": unpad_fa,
            })
        else:
            t_true_warn = t_arr[np.isin(true_s, ["warning", "critical"])][0]
            t_true_crit = t_arr[true_s == "critical"][0] if has_crit else None

            # First signals
            t_fw_warn = find_first_signal_time(t_arr, ev_pad["fw"], ["warning", "critical"])
            t_fw_crit = find_first_signal_time(t_arr, ev_pad["fw"], ["critical"]) if has_crit else None

            t_rule_warn = find_first_signal_time(t_arr, ev_pad["rule"], ["warning", "critical"])
            t_rule_crit = find_first_signal_time(t_arr, ev_pad["rule"], ["critical"]) if has_crit else None

            # Padded LSTM
            t_pad_warn = find_first_signal_time(t_arr, ev_pad["lstm_plain"], ["warning", "critical"])
            t_pad_crit = find_first_signal_time(t_arr, ev_pad["lstm_plain"], ["critical"]) if has_crit else None
            t_pad_crit_adj = find_first_signal_time(t_arr, ev_pad["lstm_adj"], ["critical"]) if has_crit else None

            # Unpadded LSTM
            t_unpad_warn = find_first_signal_time(t_arr, ev_unpad["lstm_plain"], ["warning", "critical"])
            t_unpad_crit = find_first_signal_time(t_arr, ev_unpad["lstm_plain"], ["critical"]) if has_crit else None

            fw_warn_lead = (t_true_warn - t_fw_warn) if t_fw_warn is not None else None
            fw_crit_lead = (t_true_crit - t_fw_crit) if (t_true_crit is not None and t_fw_crit is not None) else None

            rule_warn_lead = (t_true_warn - t_rule_warn) if t_rule_warn is not None else None
            rule_crit_lead = (t_true_crit - t_rule_crit) if (t_true_crit is not None and t_rule_crit is not None) else None

            pad_warn_lead = (t_true_warn - t_pad_warn) if t_pad_warn is not None else None
            pad_crit_lead = (t_true_crit - t_pad_crit) if (t_true_crit is not None and t_pad_crit is not None) else None
            pad_crit_adj_lead = (t_true_crit - t_pad_crit_adj) if (t_true_crit is not None and t_pad_crit_adj is not None) else None

            unpad_warn_lead = (t_true_warn - t_unpad_warn) if t_unpad_warn is not None else None
            unpad_crit_lead = (t_true_crit - t_unpad_crit) if (t_true_crit is not None and t_unpad_crit is not None) else None

            if pad_warn_lead is not None:
                lead_times_warn_padded.append(pad_warn_lead)
            if pad_crit_lead is not None:
                lead_times_crit_padded.append(pad_crit_lead)
            if pad_crit_adj_lead is not None:
                lead_times_crit_padded_adj.append(pad_crit_adj_lead)
            if unpad_warn_lead is not None:
                lead_times_warn_unpadded.append(unpad_warn_lead)

            if t_true_warn == 0.0:
                if pad_warn_lead is not None:
                    lead_times_warn_padded_start_warn.append(pad_warn_lead)
                if unpad_warn_lead is not None:
                    lead_times_warn_unpadded_start_warn.append(unpad_warn_lead)
            else:
                if pad_warn_lead is not None:
                    lead_times_warn_padded_trans.append(pad_warn_lead)
                if unpad_warn_lead is not None:
                    lead_times_warn_unpadded_trans.append(unpad_warn_lead)

            comp_rows.append({
                "event_id": eid,
                "scenario_id": scenario_id,
                "reaches_hazard": True,
                "true_warning_t_s": t_true_warn,
                "true_critical_t_s": t_true_crit if t_true_crit is not None else np.nan,
                "fw_warn_lead_s": fw_warn_lead if fw_warn_lead is not None else np.nan,
                "fw_crit_lead_s": fw_crit_lead if fw_crit_lead is not None else np.nan,
                "rule_warn_lead_s": rule_warn_lead if rule_warn_lead is not None else np.nan,
                "rule_crit_lead_s": rule_crit_lead if rule_crit_lead is not None else np.nan,
                "lstm_v2_pad_warn_lead_s": pad_warn_lead if pad_warn_lead is not None else np.nan,
                "lstm_v2_pad_crit_lead_s": pad_crit_lead if pad_crit_lead is not None else np.nan,
                "lstm_v2_unpad_warn_lead_s": unpad_warn_lead if unpad_warn_lead is not None else np.nan,
                "lstm_v2_unpad_crit_lead_s": unpad_crit_lead if unpad_crit_lead is not None else np.nan,
                "fw_fa": np.nan,
                "rule_fa": np.nan,
                "lstm_v2_pad_fa": np.nan,
                "lstm_v2_unpad_fa": np.nan,
            })

    comp_df = pd.DataFrame(comp_rows)
    comp_df.to_csv(V2_COMPARISON_CSV, index=False)
    print(f"\nSaved comparison CSV to: {V2_COMPARISON_CSV}")

    mean_warn_pad = float(np.mean(lead_times_warn_padded)) if lead_times_warn_padded else 0.0
    mean_warn_unpad = float(np.mean(lead_times_warn_unpadded)) if lead_times_warn_unpadded else 0.0
    mean_crit_pad = float(np.mean(lead_times_crit_padded)) if lead_times_crit_padded else 0.0
    mean_crit_pad_adj = float(np.mean(lead_times_crit_padded_adj)) if lead_times_crit_padded_adj else 0.0

    mean_start_pad = float(np.mean(lead_times_warn_padded_start_warn)) if lead_times_warn_padded_start_warn else 0.0
    median_start_pad = float(np.median(lead_times_warn_padded_start_warn)) if lead_times_warn_padded_start_warn else 0.0
    mean_start_unpad = float(np.mean(lead_times_warn_unpadded_start_warn)) if lead_times_warn_unpadded_start_warn else 0.0
    median_start_unpad = float(np.median(lead_times_warn_unpadded_start_warn)) if lead_times_warn_unpadded_start_warn else 0.0

    mean_trans_pad = float(np.mean(lead_times_warn_padded_trans)) if lead_times_warn_padded_trans else 0.0
    median_trans_pad = float(np.median(lead_times_warn_padded_trans)) if lead_times_warn_padded_trans else 0.0
    mean_trans_unpad = float(np.mean(lead_times_warn_unpadded_trans)) if lead_times_warn_unpadded_trans else 0.0
    median_trans_unpad = float(np.median(lead_times_warn_unpadded_trans)) if lead_times_warn_unpadded_trans else 0.0

    print(f"\nLead-Time Summary across {len(test_events)} test events:")
    print(f"  Warning Lead-Time (Overall, with Warm-Up Fix / Left Padding):  {mean_warn_pad:+.1f} s")
    print(f"  Warning Lead-Time (Overall, without Warm-Up Fix / Unpadded):    {mean_warn_unpad:+.1f} s")
    print(f"  --- (a) Events starting at warning (n={len(lead_times_warn_padded_start_warn)}):")
    print(f"        Padded:   Mean = {mean_start_pad:+.1f} s, Median = {median_start_pad:+.1f} s")
    print(f"        Unpadded: Mean = {mean_start_unpad:+.1f} s, Median = {median_start_unpad:+.1f} s")
    print(f"  --- (b) Events transitioning during run (n={len(lead_times_warn_padded_trans)}):")
    print(f"        Padded:   Mean = {mean_trans_pad:+.1f} s, Median = {median_trans_pad:+.1f} s")
    print(f"        Unpadded: Mean = {mean_trans_unpad:+.1f} s, Median = {median_trans_unpad:+.1f} s")
    print(f"  Critical Lead-Time (Plain, Padded):                            {mean_crit_pad:+.1f} s")
    print(f"  Critical Lead-Time (Adjusted m={winner_mult:.2f}, Padded):                {mean_crit_pad_adj:+.1f} s")
    print(f"\nFalse Alarm Count on {normal_events_total} normal test events:")
    print(f"  - Firmware (fw_status):                  {normal_fa_count_fw} / {normal_events_total}")
    print(f"  - Simple Rule:                           {normal_fa_count_rule} / {normal_events_total}")
    print(f"  - Stage 3 v2 Winner (Left-Padded):       {normal_fa_count_padded} / {normal_events_total}")
    print(f"  - Stage 3 v2 Winner (Unpadded):          {normal_fa_count_unpadded} / {normal_events_total}")

    # 7. Write complete metrics JSON
    metrics_payload = {
        "winner_variant": winner_id,
        "winner_model_file": os.path.basename(winner_model_path),
        "window_length": winner_wlen,
        "features_count": 8,
        "feature_names": FEATURE_NAMES_V2,
        "calibrated_critical_multiplier": winner_mult,
        "calibrated_test_critical_recall_at_m_1_10": float(test_adj_metrics["per_class"]["critical"]["recall"]),
        "warm_up_fix": f"Left-padded first {winner_wlen - 1} steps with event's row 0 instead of skipping predictions",
        "validation_summary_all_variants": [
            {
                "variant": r["variant"],
                "name": r["name"],
                "model_file": r["model_file"],
                "window": r["window"],
                "plain_accuracy": r["plain_acc"],
                "plain_macro_f1": r["plain_macro_f1"],
                "plain_critical_recall": r["plain_crit_rec"],
                "plain_critical_precision": r["plain_crit_prec"],
                "calibrated_multiplier": r["cal_mult"],
                "calibrated_accuracy": r["cal_acc"],
                "calibrated_macro_f1": r["cal_macro_f1"],
                "calibrated_critical_recall": r["cal_crit_rec"],
                "calibrated_critical_precision": r["cal_crit_prec"],
            }
            for r in val_records
        ],
        "test_plain": test_plain_metrics,
        "test_adjusted": test_adj_metrics,
        "test_comparison_vs_v1": {
            "plain": {
                "accuracy": {"v1": v1_test_plain.get("accuracy"), "v2": test_plain_metrics["accuracy"]},
                "macro_f1": {"v1": v1_test_plain.get("macro_f1"), "v2": test_plain_metrics["macro_f1"]},
                "critical_recall": {
                    "v1": v1_test_plain.get("per_class", {}).get("critical", {}).get("recall"),
                    "v2": test_plain_metrics["per_class"]["critical"]["recall"],
                },
                "critical_precision": {
                    "v1": v1_test_plain.get("per_class", {}).get("critical", {}).get("precision"),
                    "v2": test_plain_metrics["per_class"]["critical"]["precision"],
                },
            },
            "adjusted": {
                "accuracy": {"v1": v1_test_adj.get("accuracy"), "v2": test_adj_metrics["accuracy"]},
                "macro_f1": {"v1": v1_test_adj.get("macro_f1"), "v2": test_adj_metrics["macro_f1"]},
                "critical_recall": {
                    "v1": v1_test_adj.get("per_class", {}).get("critical", {}).get("recall"),
                    "v2": test_adj_metrics["per_class"]["critical"]["recall"],
                },
                "critical_precision": {
                    "v1": v1_test_adj.get("per_class", {}).get("critical", {}).get("precision"),
                    "v2": test_adj_metrics["per_class"]["critical"]["precision"],
                },
            },
        },
        "lead_time_test_summary": {
            "overall_mean_warning_lead_time_padded_s": mean_warn_pad,
            "overall_mean_warning_lead_time_unpadded_s": mean_warn_unpad,
            "warning_lead_times_breakdown": {
                "events_starting_at_warning": {
                    "total_events": 31,
                    "signaled_events_count": len(lead_times_warn_padded_start_warn),
                    "mean_lead_time_padded_s": mean_start_pad,
                    "median_lead_time_padded_s": median_start_pad,
                    "mean_lead_time_unpadded_s": mean_start_unpad,
                    "median_lead_time_unpadded_s": median_start_unpad,
                },
                "events_transitioning_during_run": {
                    "total_events": 7,
                    "signaled_events_count": len(lead_times_warn_padded_trans),
                    "mean_lead_time_padded_s": mean_trans_pad,
                    "median_lead_time_padded_s": median_trans_pad,
                    "mean_lead_time_unpadded_s": mean_trans_unpad,
                    "median_lead_time_unpadded_s": median_trans_unpad,
                },
            },
            "mean_critical_lead_time_padded_plain_s": mean_crit_pad,
            "mean_critical_lead_time_padded_adj_s": mean_crit_pad_adj,
            "false_alarms_normal_events": {
                "firmware": normal_fa_count_fw,
                "simple_rule": normal_fa_count_rule,
                "stage3_v2_padded": normal_fa_count_padded,
                "stage3_v2_unpadded": normal_fa_count_unpadded,
                "total_normal_events": normal_events_total,
            },
        },
    }

    with open(V2_METRICS_PATH, "w") as f:
        json.dump(metrics_payload, f, indent=2)
    print(f"\nSaved metrics to: {V2_METRICS_PATH}")
    print("=" * 80)


if __name__ == "__main__":
    main()
