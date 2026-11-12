"""
Stage 3 Model Evaluation Pipeline.

Loads the latest trained Stage 3 LSTM model and scaler, evaluates test split metrics
(accuracy, per-class precision/recall/F1, macro-F1, confusion matrix, critical->normal misclassifications),
tunes a critical-class probability multiplier on the validation split (recall >= 0.95 with best precision),
evaluates both plain and adjusted test performance, generates confusion matrix visualization,
and outputs stage3_metrics.json and the model's corresponding meta.json.
"""
import glob
import json
import os
import re
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
import tensorflow as tf
from tensorflow import keras

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from stage3_data import (
    FEATURE_NAMES,
    HORIZON_STEPS,
    STATUS_MAP,
    WINDOW_LEN,
    load_stage3_data,
)

MODELS_DIR = os.path.join(_HERE, "models")
REPORTS_DIR = os.path.join(_HERE, "reports")
CONFUSION_PNG_PATH = os.path.join(REPORTS_DIR, "stage3_confusion.png")
METRICS_JSON_PATH = os.path.join(REPORTS_DIR, "stage3_metrics.json")

CLASS_NAMES = ["normal", "warning", "critical"]
INV_STATUS_MAP = {v: k for k, v in STATUS_MAP.items()}


def get_latest_model_path():
    """Finds the newest models/lstm-stage3-*.keras file."""
    pattern = os.path.join(MODELS_DIR, "lstm-stage3-*.keras")
    model_files = glob.glob(pattern)
    if not model_files:
        raise FileNotFoundError(f"No trained Stage 3 model found matching {pattern}")
    # Sort by mtime descending
    model_files.sort(key=os.path.getmtime, reverse=True)
    return model_files[0]


def extract_timestamp(model_path):
    """Extracts the timestamp string from model filename."""
    filename = os.path.basename(model_path)
    match = re.search(r"lstm-stage3-(.+)\.keras", filename)
    if match:
        return match.group(1)
    return "unknown"


def compute_metrics(y_true, y_pred):
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


def find_best_critical_multiplier(probs_val, y_val, target_recall=0.95):
    """
    Sweeps a multiplier on the validation split for class 2 (critical)
    to achieve recall >= target_recall with highest precision.
    """
    best_mult = 1.0
    best_precision = -1.0
    best_metrics = None

    # Search grid from 1.0 to 15.0 with 0.05 step
    multipliers = np.arange(1.0, 15.01, 0.05)
    eligible = []

    for m in multipliers:
        adj = probs_val.copy()
        adj[:, 2] *= m
        preds = np.argmax(adj, axis=1)
        p, r, _, _ = precision_recall_fscore_support(
            y_val, preds, labels=[2], zero_division=0
        )
        rec = float(r[0])
        prec = float(p[0])

        if rec >= target_recall:
            eligible.append((prec, rec, m))
            if prec > best_precision:
                best_precision = prec
                best_mult = float(m)
                best_metrics = {"recall": rec, "precision": prec, "multiplier": best_mult}

    if not eligible:
        # Fallback to multiplier achieving highest recall
        best_rec = -1.0
        for m in multipliers:
            adj = probs_val.copy()
            adj[:, 2] *= m
            preds = np.argmax(adj, axis=1)
            p, r, _, _ = precision_recall_fscore_support(
                y_val, preds, labels=[2], zero_division=0
            )
            if r[0] > best_rec:
                best_rec = float(r[0])
                best_mult = float(m)
                best_metrics = {"recall": best_rec, "precision": float(p[0]), "multiplier": best_mult}

    return best_mult, best_metrics


def plot_confusion_matrices(cm_plain, cm_adj, output_path):
    """Plots and saves side-by-side confusion matrices for Plain and Adjusted inference."""
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.5))

    for ax, cm, title in zip(
        axes,
        [cm_plain, cm_adj],
        ["Test: Plain (argmax)", "Test: Adjusted (Critical Recall Tuning)"],
    ):
        cm = np.array(cm)
        im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
        ax.set_title(title, fontsize=12, fontweight="bold", pad=12)
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

        tick_marks = np.arange(len(CLASS_NAMES))
        ax.set_xticks(tick_marks)
        ax.set_xticklabels(CLASS_NAMES, fontsize=10)
        ax.set_yticks(tick_marks)
        ax.set_yticklabels(CLASS_NAMES, fontsize=10)

        thresh = cm.max() / 2.0
        for i in range(cm.shape[0]):
            for j in range(cm.shape[1]):
                color = "white" if cm[i, j] > thresh else "black"
                ax.text(
                    j,
                    i,
                    format(cm[i, j], "d"),
                    ha="center",
                    va="center",
                    color=color,
                    fontsize=11,
                    fontweight="semibold",
                )

        ax.set_ylabel("True Status", fontsize=11)
        ax.set_xlabel("Predicted Status", fontsize=11)

    plt.tight_layout()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, dpi=160, bbox_inches="tight")
    plt.close(fig)


def main():
    print("=" * 65)
    print("STAGE 3 MODEL EVALUATION")
    print("=" * 65)

    # 1. Locate latest model
    model_path = get_latest_model_path()
    timestamp = extract_timestamp(model_path)
    print(f"Loading latest model: {model_path} (timestamp: {timestamp})")
    model = keras.models.load_model(model_path)

    # 2. Load data
    print("Loading test and validation splits via stage3_data.py...")
    _, _, X_val, y_val, X_test, y_test, _ = load_stage3_data()
    print(f"Data shapes: X_val={X_val.shape}, X_test={X_test.shape}")

    # 3. Model inference
    print("Running inference on validation split...")
    probs_val = model.predict(X_val, batch_size=256, verbose=0)

    print("Running inference on test split...")
    probs_test = model.predict(X_test, batch_size=256, verbose=0)

    # 4. Plain test evaluation
    preds_plain = np.argmax(probs_test, axis=1)
    metrics_plain = compute_metrics(y_test, preds_plain)

    # 5. Tune critical multiplier on VALIDATION set only
    print("\nTuning critical multiplier on validation split (recall >= 0.95)...")
    best_mult, val_tuning_metrics = find_best_critical_multiplier(probs_val, y_val, target_recall=0.95)
    print(f"Selected critical multiplier: {best_mult:.2f}")
    print(f"Validation metrics at selected multiplier -> Recall: {val_tuning_metrics['recall']:.4f}, Precision: {val_tuning_metrics['precision']:.4f}")

    # 6. Apply multiplier to TEST set
    probs_test_adj = probs_test.copy()
    probs_test_adj[:, 2] *= best_mult
    preds_adj = np.argmax(probs_test_adj, axis=1)
    metrics_adj = compute_metrics(y_test, preds_adj)

    # 7. Generate confusion matrix plot
    plot_confusion_matrices(
        metrics_plain["confusion_matrix"],
        metrics_adj["confusion_matrix"],
        CONFUSION_PNG_PATH,
    )
    print(f"\nSaved confusion matrix visualization to: {CONFUSION_PNG_PATH}")

    # 8. Output metrics to reports/stage3_metrics.json
    metrics_output = {
        "model_file": os.path.basename(model_path),
        "timestamp": timestamp,
        "critical_multiplier": round(best_mult, 4),
        "val_tuning": val_tuning_metrics,
        "test_plain": metrics_plain,
        "test_adjusted": metrics_adj,
    }
    with open(METRICS_JSON_PATH, "w") as f:
        json.dump(metrics_output, f, indent=2)
    print(f"Saved evaluation metrics to: {METRICS_JSON_PATH}")

    # 9. Output model metadata to models/lstm-stage3-<timestamp>.meta.json
    meta_json_path = os.path.join(MODELS_DIR, f"lstm-stage3-{timestamp}.meta.json")
    meta_content = {
        "model_name": os.path.basename(model_path),
        "timestamp": timestamp,
        "window_length": WINDOW_LEN,
        "n_features": len(FEATURE_NAMES),
        "features": FEATURE_NAMES,
        "horizon": f"{HORIZON_STEPS} steps = {HORIZON_STEPS * 5} s",
        "horizon_steps": HORIZON_STEPS,
        "sampling": "5 s",
        "class_mapping": STATUS_MAP,
        "thresholds": {
            "warning": "50% of 11.5 cm = 5.75 cm",
            "critical": "75% of 11.5 cm = 8.625 cm",
            "beaker_reference_height_cm": 11.5,
        },
        "data_file_name": "synthetic_flood_dataset.csv",
        "seed": 42,
        "critical_multiplier": round(best_mult, 4),
        "test_metrics_plain": metrics_plain,
        "test_metrics_adjusted": metrics_adj,
    }
    with open(meta_json_path, "w") as f:
        json.dump(meta_content, f, indent=2)
    print(f"Saved model metadata to: {meta_json_path}")

    # 10. Print comprehensive report to console
    print("\n" + "=" * 65)
    print("TEST EVALUATION REPORT")
    print("=" * 65)

    print("\n[A. PLAIN TEST RESULTS (Argmax)]")
    print(f"  Overall Accuracy:                    {metrics_plain['accuracy']:.4f}")
    print(f"  Macro-F1:                            {metrics_plain['macro_f1']:.4f}")
    print(f"  Critical Predicted as Normal [cm2,0]: {metrics_plain['critical_predicted_as_normal']}")
    print("  Per-Class Metrics:")
    for cname in CLASS_NAMES:
        m = metrics_plain["per_class"][cname]
        print(f"    - {cname:8s} | Prec: {m['precision']:.4f} | Rec: {m['recall']:.4f} | F1: {m['f1']:.4f} | Support: {m['support']}")
    print("  Confusion Matrix [[norm, warn, crit]]:")
    for row in metrics_plain["confusion_matrix"]:
        print(f"    {row}")

    print(f"\n[B. ADJUSTED TEST RESULTS (Critical Multiplier = {best_mult:.2f})]")
    print(f"  Overall Accuracy:                    {metrics_adj['accuracy']:.4f}")
    print(f"  Macro-F1:                            {metrics_adj['macro_f1']:.4f}")
    print(f"  Critical Predicted as Normal [cm2,0]: {metrics_adj['critical_predicted_as_normal']}")
    print("  Per-Class Metrics:")
    for cname in CLASS_NAMES:
        m = metrics_adj["per_class"][cname]
        print(f"    - {cname:8s} | Prec: {m['precision']:.4f} | Rec: {m['recall']:.4f} | F1: {m['f1']:.4f} | Support: {m['support']}")
    print("  Confusion Matrix [[norm, warn, crit]]:")
    for row in metrics_adj["confusion_matrix"]:
        print(f"    {row}")
    print("=" * 65)


if __name__ == "__main__":
    main()
