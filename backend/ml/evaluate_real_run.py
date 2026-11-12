"""
Stage 3 v2 Real-World Beaker Run Evaluator.

Takes a CSV recorded from the physical beaker setup with columns:
  - t_s: elapsed time in seconds (5 s sampling)
  - dist_cm: ultrasonic sensor distance reading in cm
  - rain_adc: rain sensor ADC reading
  - rain_digital: rain sensor digital reading ("HIGH"/"LOW" or 1/0)
  - true_water_level_cm: ground truth water height measured by hand/scale (cm from bottom)

Derives true status from 11.5 cm beaker reference rise:
  - warning: >= 50% of 11.5 cm = 5.75 cm
  - critical: >= 75% of 11.5 cm = 8.625 cm

Runs predict_status from infer_stage3_v2.py and computes:
  - Accuracy
  - Per-class recall, precision, and F1
  - 3x3 Confusion matrix
  - Seconds before (positive) or after (negative) true crossing for warning and critical alarms

Saves complete evaluation to reports/real_run_<name>.json.

Usage:
  python evaluate_real_run.py --input <path_to_csv> [--name <run_name>] [--output <path_to_json>]
"""
import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from infer_stage3_v2 import CLASS_NAMES, predict_status

REPORTS_DIR = os.path.join(_HERE, "reports")
BEAKER_HEIGHT_CM = 11.5
WARN_THRESHOLD_CM = 0.50 * BEAKER_HEIGHT_CM   # 5.75 cm
CRIT_THRESHOLD_CM = 0.75 * BEAKER_HEIGHT_CM   # 8.625 cm


def derive_true_status(water_levels: np.ndarray) -> np.ndarray:
    """
    Derives true status from ground truth water level in cm:
      - 'critical' if water_level >= 8.625 cm
      - 'warning'  if water_level >= 5.75 cm
      - 'normal'   otherwise
    """
    statuses = np.empty(len(water_levels), dtype=object)
    for i, lvl in enumerate(water_levels):
        if np.isnan(lvl):
            statuses[i] = "normal"
        elif lvl >= CRIT_THRESHOLD_CM:
            statuses[i] = "critical"
        elif lvl >= WARN_THRESHOLD_CM:
            statuses[i] = "warning"
        else:
            statuses[i] = "normal"
    return statuses


def find_first_crossing(t_arr: np.ndarray, status_arr: np.ndarray, target_classes: List[str]) -> Optional[float]:
    """Finds the timestamp t_s of the first occurrence of any target class."""
    for t_val, s_val in zip(t_arr, status_arr):
        if s_val in target_classes:
            return float(t_val)
    return None


def evaluate_run(
    df: pd.DataFrame,
    run_name: str,
    input_file: str,
) -> Dict[str, Any]:
    """
    Evaluates a single recorded beaker run DataFrame against infer_stage3_v2.
    """
    required_cols = ["t_s", "dist_cm", "rain_adc", "rain_digital", "true_water_level_cm"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Input CSV missing required column(s): {missing}. Required: {required_cols}")

    df_sorted = df.sort_values("t_s").reset_index(drop=True)
    t_arr = df_sorted["t_s"].to_numpy(dtype=np.float64)
    true_levels = df_sorted["true_water_level_cm"].to_numpy(dtype=np.float64)
    true_status = derive_true_status(true_levels)

    # Run inference pipeline
    predictions = predict_status(df_sorted)
    pred_status = np.array([p["status"] for p in predictions], dtype=object)

    n_steps = len(df_sorted)
    duration_s = float(t_arr[-1] - t_arr[0]) if n_steps > 0 else 0.0

    # 1. Accuracy
    acc = float(accuracy_score(true_status, pred_status))

    # 2. Per-class metrics
    per_class: Dict[str, Any] = {}
    for c in CLASS_NAMES:
        c_true_mask = (true_status == c)
        c_pred_mask = (pred_status == c)
        support = int(np.sum(c_true_mask))
        pred_cnt = int(np.sum(c_pred_mask))
        tp = int(np.sum(c_true_mask & c_pred_mask))

        recall = float(tp / support) if support > 0 else None
        precision = float(tp / pred_cnt) if pred_cnt > 0 else None
        if recall is not None and precision is not None and (recall + precision) > 0:
            f1 = float(2 * precision * recall / (precision + recall))
        elif support == 0 and pred_cnt == 0:
            f1 = 1.0
        else:
            f1 = 0.0 if (recall is not None or precision is not None) else None

        per_class[c] = {
            "support": support,
            "pred_count": pred_cnt,
            "true_positives": tp,
            "recall": round(recall, 4) if recall is not None else None,
            "precision": round(precision, 4) if precision is not None else None,
            "f1": round(f1, 4) if f1 is not None else None,
        }

    # Macro-F1 across classes present in ground truth
    classes_with_support = [c for c in CLASS_NAMES if per_class[c]["support"] > 0]
    if classes_with_support:
        macro_f1 = float(np.mean([per_class[c]["f1"] for c in classes_with_support if per_class[c]["f1"] is not None]))
    else:
        macro_f1 = 1.0

    # 3. Confusion Matrix (3x3: rows = true, cols = pred)
    cm = confusion_matrix(true_status, pred_status, labels=CLASS_NAMES)
    cm_dict = {}
    for i, true_c in enumerate(CLASS_NAMES):
        cm_dict[true_c] = {}
        for j, pred_c in enumerate(CLASS_NAMES):
            cm_dict[true_c][f"pred_{pred_c}"] = int(cm[i, j])

    # 4. Alarm Crossing Lead/Lag Times
    # Warning: first time water reaches >= 5.75 cm (status in ['warning', 'critical'])
    t_true_warn = find_first_crossing(t_arr, true_status, ["warning", "critical"])
    t_pred_warn = find_first_crossing(t_arr, pred_status, ["warning", "critical"])

    warn_alarm_info: Dict[str, Any] = {
        "true_crossing_t_s": t_true_warn,
        "pred_crossing_t_s": t_pred_warn,
        "lead_time_seconds": None,
        "timing_description": None,
    }
    if t_true_warn is not None and t_pred_warn is not None:
        lead_s = float(t_true_warn - t_pred_warn)
        warn_alarm_info["lead_time_seconds"] = round(lead_s, 2)
        if lead_s > 0:
            warn_alarm_info["timing_description"] = f"Early by {lead_s:.1f} s before true crossing"
        elif lead_s < 0:
            warn_alarm_info["timing_description"] = f"Late by {abs(lead_s):.1f} s after true crossing"
        else:
            warn_alarm_info["timing_description"] = "Exact alarm on crossing step (0.0 s)"
    elif t_true_warn is not None and t_pred_warn is None:
        warn_alarm_info["timing_description"] = "MISSED: True warning occurred but alarm never triggered"
    elif t_true_warn is None and t_pred_warn is not None:
        warn_alarm_info["timing_description"] = f"FALSE ALARM: Warning triggered at t={t_pred_warn:.1f}s but water never reached warning"
    else:
        warn_alarm_info["timing_description"] = "N/A: Run remained normal throughout (no true warning and no alarm)"

    # Critical: first time water reaches >= 8.625 cm (status == 'critical')
    t_true_crit = find_first_crossing(t_arr, true_status, ["critical"])
    t_pred_crit = find_first_crossing(t_arr, pred_status, ["critical"])

    crit_alarm_info: Dict[str, Any] = {
        "true_crossing_t_s": t_true_crit,
        "pred_crossing_t_s": t_pred_crit,
        "lead_time_seconds": None,
        "timing_description": None,
    }
    if t_true_crit is not None and t_pred_crit is not None:
        lead_s = float(t_true_crit - t_pred_crit)
        crit_alarm_info["lead_time_seconds"] = round(lead_s, 2)
        if lead_s > 0:
            crit_alarm_info["timing_description"] = f"Early by {lead_s:.1f} s before true crossing"
        elif lead_s < 0:
            crit_alarm_info["timing_description"] = f"Late by {abs(lead_s):.1f} s after true crossing"
        else:
            crit_alarm_info["timing_description"] = "Exact alarm on crossing step (0.0 s)"
    elif t_true_crit is not None and t_pred_crit is None:
        crit_alarm_info["timing_description"] = "MISSED: True critical occurred but alarm never triggered"
    elif t_true_crit is None and t_pred_crit is not None:
        crit_alarm_info["timing_description"] = f"FALSE ALARM: Critical triggered at t={t_pred_crit:.1f}s but water never reached critical"
    else:
        crit_alarm_info["timing_description"] = "N/A: Run did not reach critical level"

    report = {
        "run_name": run_name,
        "input_file": os.path.abspath(input_file),
        "total_steps": n_steps,
        "duration_seconds": duration_s,
        "sampling_dt_s": float(np.median(np.diff(t_arr))) if n_steps > 1 else 5.0,
        "thresholds_cm": {
            "beaker_height_cm": BEAKER_HEIGHT_CM,
            "warning_threshold_cm": WARN_THRESHOLD_CM,
            "critical_threshold_cm": CRIT_THRESHOLD_CM,
        },
        "accuracy": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "per_class": per_class,
        "confusion_matrix": {
            "labels": CLASS_NAMES,
            "matrix_rows_true_cols_pred": cm.tolist(),
            "breakdown": cm_dict,
        },
        "alarms": {
            "warning": warn_alarm_info,
            "critical": crit_alarm_info,
        },
    }

    return report


def print_evaluation_summary(report: Dict[str, Any]):
    """Prints a clear terminal summary of the real run evaluation."""
    print("\n" + "=" * 70)
    print(f"REAL RUN EVALUATION: {report['run_name']}")
    print("=" * 70)
    print(f"Input file:       {report['input_file']}")
    print(f"Total steps:      {report['total_steps']} ({report['duration_seconds']:.1f} s duration, ~{report['sampling_dt_s']:.1f}s dt)")
    print(f"Overall Accuracy: {report['accuracy'] * 100:.2f}%")
    print(f"Macro-F1:         {report['macro_f1']:.4f}")

    print("\nPer-Class Breakdown:")
    print(f"{'Class':<12} | {'Support':<8} | {'Recall':<10} | {'Precision':<10} | {'F1-Score':<10}")
    print("-" * 58)
    for c in CLASS_NAMES:
        pc = report["per_class"][c]
        rec_str = f"{pc['recall']:.4f}" if pc["recall"] is not None else "undefined"
        prec_str = f"{pc['precision']:.4f}" if pc["precision"] is not None else "undefined"
        f1_str = f"{pc['f1']:.4f}" if pc["f1"] is not None else "undefined"
        print(f"{c:<12} | {pc['support']:<8d} | {rec_str:<10} | {prec_str:<10} | {f1_str:<10}")

    header_col = "True / Pred"
    print(f"{header_col:<12} | {'Normal':<8} | {'Warning':<8} | {'Critical':<8}")
    print("-" * 44)
    mat = report["confusion_matrix"]["matrix_rows_true_cols_pred"]
    for i, c in enumerate(CLASS_NAMES):
        print(f"{c:<12} | {mat[i][0]:<8d} | {mat[i][1]:<8d} | {mat[i][2]:<8d}")

    print("\nAlarm Lead / Lag Crossing Times:")
    w_info = report["alarms"]["warning"]
    c_info = report["alarms"]["critical"]
    print(f"  Warning Alarm:  {w_info['timing_description']}")
    if w_info["lead_time_seconds"] is not None:
        print(f"                  (True crossing: {w_info['true_crossing_t_s']}s, Pred alarm: {w_info['pred_crossing_t_s']}s, Lead: {w_info['lead_time_seconds']:+.1f}s)")

    print(f"  Critical Alarm: {c_info['timing_description']}")
    if c_info["lead_time_seconds"] is not None:
        print(f"                  (True crossing: {c_info['true_crossing_t_s']}s, Pred alarm: {c_info['pred_crossing_t_s']}s, Lead: {c_info['lead_time_seconds']:+.1f}s)")
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Evaluate a physical beaker test run CSV against Stage 3 v2 model")
    parser.add_argument("--input", "-i", type=str, required=True, help="Path to input run CSV")
    parser.add_argument("--name", "-n", type=str, default=None, help="Optional run name (defaults to input filename stem)")
    parser.add_argument("--output", "-o", type=str, default=None, help="Optional output JSON path")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: input file '{args.input}' not found.")
        sys.exit(1)

    # Determine run name
    if args.name:
        run_name = args.name
    else:
        run_name = os.path.splitext(os.path.basename(args.input))[0]

    # Determine output path
    if args.output:
        out_json_path = args.output
    else:
        os.makedirs(REPORTS_DIR, exist_ok=True)
        out_json_path = os.path.join(REPORTS_DIR, f"real_run_{run_name}.json")

    print(f"Loading real run CSV: {args.input}")
    df = pd.read_csv(args.input)

    report = evaluate_run(df, run_name=run_name, input_file=args.input)
    print_evaluation_summary(report)

    os.makedirs(os.path.dirname(os.path.abspath(out_json_path)), exist_ok=True)
    with open(out_json_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nSaved evaluation report to: {out_json_path}\n")


if __name__ == "__main__":
    main()
