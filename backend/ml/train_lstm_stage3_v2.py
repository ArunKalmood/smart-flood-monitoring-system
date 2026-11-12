"""
Stage 3 v2 Training Experiments.

Trains 4 model variants (one change at a time, seed 42 for each):
  Variant 1 (var1): 8 features, window 24 steps
  Variant 2 (var2): 8 features, window 36 steps
  Variant 3 (var3): Variant 1 with class weights for critical multiplied by 2
  Variant 4 (var4): Variant 1 with Bidirectional-free GRU(64) instead of the first LSTM(64)

Saves each model as:
  models/lstm-stage3-v2-<variant>-<YYYYMMDD.HHMM>.keras
and the history to:
  reports/stage3_v2_<variant>_history.csv
"""
import argparse
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.utils.class_weight import compute_class_weight
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from stage3_data_v2 import load_stage3_data_v2

MODELS_DIR = os.path.join(_HERE, "models")
REPORTS_DIR = os.path.join(_HERE, "reports")

NUM_CLASSES = 3
BATCH_SIZE = 256
MAX_EPOCHS = 60
PATIENCE = 10
LEARNING_RATE = 1e-3
SEED = 42


def build_model_v2(input_shape: tuple[int, int], use_gru_first: bool = False, lr: float = LEARNING_RATE) -> keras.Sequential:
    """
    Builds the Stage 3 v2 sequential architecture:
      - First layer: GRU(64, return_sequences=True) if use_gru_first else LSTM(64, return_sequences=True)
      - Dropout(0.2)
      - LSTM(32)
      - Dropout(0.2)
      - Dense(16, activation='relu')
      - Dense(3, activation='softmax')
    """
    model = keras.Sequential()
    model.add(layers.Input(shape=input_shape))

    if use_gru_first:
        model.add(layers.GRU(64, return_sequences=True, name="gru_1"))
    else:
        model.add(layers.LSTM(64, return_sequences=True, name="lstm_1"))

    model.add(layers.Dropout(0.2, name="dropout_1"))
    model.add(layers.LSTM(32, name="lstm_2"))
    model.add(layers.Dropout(0.2, name="dropout_2"))
    model.add(layers.Dense(16, activation="relu", name="dense_1"))
    model.add(layers.Dense(NUM_CLASSES, activation="softmax", name="dense_out"))

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train_single_variant(var_id: str, timestamp: str = None) -> dict:
    """Trains a specific variant under seed 42."""
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y%m%d.%H%M")

    # Set seed 42 for every run
    keras.utils.set_random_seed(SEED)
    tf.random.set_seed(SEED)
    np.random.seed(SEED)

    var_configs = {
        "var1": {
            "name": "Variant 1 (8 features, window 24)",
            "window_len": 24,
            "use_gru": False,
            "crit_weight_mult": 1.0,
            "scaler_path": os.path.join(MODELS_DIR, "scaler_stage3_v2.pkl"),
        },
        "var2": {
            "name": "Variant 2 (8 features, window 36)",
            "window_len": 36,
            "use_gru": False,
            "crit_weight_mult": 1.0,
            "scaler_path": os.path.join(MODELS_DIR, "scaler_stage3_v2_w36.pkl"),
        },
        "var3": {
            "name": "Variant 3 (Variant 1 with critical class weight x2)",
            "window_len": 24,
            "use_gru": False,
            "crit_weight_mult": 2.0,
            "scaler_path": os.path.join(MODELS_DIR, "scaler_stage3_v2.pkl"),
        },
        "var4": {
            "name": "Variant 4 (Variant 1 with GRU(64) instead of LSTM(64))",
            "window_len": 24,
            "use_gru": True,
            "crit_weight_mult": 1.0,
            "scaler_path": os.path.join(MODELS_DIR, "scaler_stage3_v2.pkl"),
        },
    }

    if var_id not in var_configs:
        raise ValueError(f"Unknown variant ID: {var_id}. Expected one of {list(var_configs.keys())}")

    cfg = var_configs[var_id]
    wlen = cfg["window_len"]

    print("\n" + "=" * 70)
    print(f"TRAINING {var_id.upper()}: {cfg['name']}")
    print("=" * 70)

    # 1. Load data
    print(f"Loading data (window_len={wlen})...")
    X_train, y_train, X_val, y_val, X_test, y_test, scaler = load_stage3_data_v2(
        window_len=wlen,
        scaler_path=cfg["scaler_path"],
        save_scaler=True,
    )
    print(f"Shapes: X_train={X_train.shape}, X_val={X_val.shape}, X_test={X_test.shape}")

    # 2. Compute class weights from TRAIN labels only
    classes = np.unique(y_train)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight_dict = {int(c): float(w) for c, w in zip(classes, weights)}
    if cfg["crit_weight_mult"] != 1.0:
        class_weight_dict[2] *= cfg["crit_weight_mult"]
        print(f"Adjusted critical class weight (x{cfg['crit_weight_mult']}): {class_weight_dict}")
    else:
        print(f"Class weights: {class_weight_dict}")

    # 3. Build model
    input_shape = (wlen, 8)
    model = build_model_v2(input_shape=input_shape, use_gru_first=cfg["use_gru"])
    model.summary(print_fn=lambda x: print(f"  {x}"))

    # 4. Callbacks
    early_stopping = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=PATIENCE,
        restore_best_weights=True,
        verbose=1,
    )

    # 5. Fit
    print(f"Fitting {var_id} for up to {MAX_EPOCHS} epochs (batch size {BATCH_SIZE})...")
    history = model.fit(
        X_train,
        y_train,
        validation_data=(X_val, y_val),
        epochs=MAX_EPOCHS,
        batch_size=BATCH_SIZE,
        class_weight=class_weight_dict,
        callbacks=[early_stopping],
        verbose=1,
    )

    # 6. Save model and history
    model_name = f"lstm-stage3-v2-{var_id}-{timestamp}.keras"
    model_path = os.path.join(MODELS_DIR, model_name)
    model.save(model_path)
    print(f"Saved model to: {model_path}")

    history_name = f"stage3_v2_{var_id}_history.csv"
    history_path = os.path.join(REPORTS_DIR, history_name)
    hist_df = pd.DataFrame(history.history)
    hist_df.insert(0, "epoch", range(1, len(hist_df) + 1))
    hist_df.to_csv(history_path, index=False)
    print(f"Saved history to: {history_path}")

    best_val_idx = hist_df["val_loss"].idxmin()
    best_row = hist_df.iloc[best_val_idx]
    print(f"Best Epoch: {int(best_row['epoch'])} | Val Loss: {best_row['val_loss']:.4f} | Val Acc: {best_row['val_accuracy']:.4f}")

    return {
        "variant": var_id,
        "model_path": model_path,
        "history_path": history_path,
        "best_epoch": int(best_row["epoch"]),
        "val_loss": float(best_row["val_loss"]),
        "val_accuracy": float(best_row["val_accuracy"]),
    }


def main():
    parser = argparse.ArgumentParser(description="Train Stage 3 v2 Model Variants")
    parser.add_argument(
        "--variant",
        type=str,
        default="all",
        choices=["all", "var1", "var2", "var3", "var4", "1", "2", "3", "4"],
        help="Which variant to train (1-4 or all)",
    )
    args = parser.parse_args()

    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d.%H%M")

    target = args.variant.lower()
    if target in ["1", "var1"]:
        variants_to_run = ["var1"]
    elif target in ["2", "var2"]:
        variants_to_run = ["var2"]
    elif target in ["3", "var3"]:
        variants_to_run = ["var3"]
    elif target in ["4", "var4"]:
        variants_to_run = ["var4"]
    else:
        variants_to_run = ["var1", "var2", "var3", "var4"]

    results = []
    for vid in variants_to_run:
        res = train_single_variant(vid, timestamp=timestamp)
        results.append(res)

    print("\n" + "=" * 70)
    print("ALL REQUESTED VARIANTS COMPLETED")
    print("=" * 70)
    for r in results:
        print(f"  {r['variant'].upper()}: Best Val Loss = {r['val_loss']:.4f}, Val Acc = {r['val_accuracy']:.4f} (Epoch {r['best_epoch']})")
        print(f"    Model: {os.path.basename(r['model_path'])}")


if __name__ == "__main__":
    main()
