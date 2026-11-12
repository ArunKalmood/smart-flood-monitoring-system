"""
Stage 3 LSTM Training Pipeline.

Trains a 3-class LSTM model on beaker-scale synthetic flood sequences prepared
by stage3_data.py to forecast flood hazard status (normal, warning, critical)
6 steps into the future.
"""
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

from stage3_data import load_stage3_data

# Ensure deterministic execution
keras.utils.set_random_seed(42)

REPORTS_DIR = os.path.join(_HERE, "reports")
MODELS_DIR = os.path.join(_HERE, "models")
HISTORY_CSV_PATH = os.path.join(REPORTS_DIR, "stage3_history.csv")

INPUT_SHAPE = (24, 5)
NUM_CLASSES = 3
BATCH_SIZE = 256
MAX_EPOCHS = 60
PATIENCE = 10
LEARNING_RATE = 1e-3


def build_model(input_shape=INPUT_SHAPE, num_classes=NUM_CLASSES, lr=LEARNING_RATE):
    """Builds the Stage 3 Keras Sequential LSTM architecture."""
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        layers.LSTM(64, return_sequences=True),
        layers.Dropout(0.2),
        layers.LSTM(32),
        layers.Dropout(0.2),
        layers.Dense(16, activation="relu"),
        layers.Dense(num_classes, activation="softmax"),
    ], name="lstm_stage3")

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=lr),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main():
    print("=" * 65)
    print("STAGE 3 LSTM TRAINING")
    print("=" * 65)

    os.makedirs(REPORTS_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)

    # 1. Load data
    print("Loading data via stage3_data.py...")
    X_train, y_train, X_val, y_val, X_test, y_test, scaler = load_stage3_data()
    print(f"Data shapes: X_train={X_train.shape}, X_val={X_val.shape}, X_test={X_test.shape}")

    # 2. Compute class weights from TRAIN labels only (inverse frequency)
    classes = np.unique(y_train)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    class_weight_dict = {int(c): float(w) for c, w in zip(classes, weights)}
    print(f"Class weights (train only): {class_weight_dict}")

    # 3. Build model
    model = build_model()
    model.summary(print_fn=lambda x: print(f"  {x}"))

    # 4. Callbacks
    early_stopping = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=PATIENCE,
        restore_best_weights=True,
        verbose=1,
    )

    # 5. Model training
    print(f"\nTraining model for up to {MAX_EPOCHS} epochs (batch size {BATCH_SIZE})...")
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

    # 6. Save model with timestamp
    timestamp = datetime.now().strftime("%Y%m%d.%H%M")
    model_filename = f"lstm-stage3-{timestamp}.keras"
    model_path = os.path.join(MODELS_DIR, model_filename)
    model.save(model_path)
    print(f"\nSaved trained model to: {model_path}")

    # 7. Save training history to CSV
    hist_df = pd.DataFrame(history.history)
    hist_df.insert(0, "epoch", range(1, len(hist_df) + 1))
    hist_df.to_csv(HISTORY_CSV_PATH, index=False)
    print(f"Saved training history to: {HISTORY_CSV_PATH}")

    # 8. Evaluate on test set
    test_loss, test_acc = model.evaluate(X_test, y_test, batch_size=BATCH_SIZE, verbose=0)

    # 9. Print final / best epoch metrics
    epochs_trained = len(hist_df)
    final_epoch = hist_df.iloc[-1].to_dict()
    best_val_idx = hist_df["val_loss"].idxmin()
    best_epoch = hist_df.iloc[best_val_idx].to_dict()

    print("\n" + "=" * 65)
    print("FINAL & BEST EPOCH METRICS")
    print("=" * 65)
    print(f"Total epochs run: {epochs_trained}")
    print(f"Best epoch based on val_loss: Epoch {int(best_epoch['epoch'])}")
    print(f"  - Train Loss:      {best_epoch['loss']:.4f}")
    print(f"  - Train Accuracy:  {best_epoch['accuracy']:.4f}")
    print(f"  - Val Loss:        {best_epoch['val_loss']:.4f}")
    print(f"  - Val Accuracy:    {best_epoch['val_accuracy']:.4f}")
    print("\nFinal epoch metrics (last executed):")
    print(f"  - Epoch:           {int(final_epoch['epoch'])}")
    print(f"  - Train Loss:      {final_epoch['loss']:.4f}")
    print(f"  - Train Accuracy:  {final_epoch['accuracy']:.4f}")
    print(f"  - Val Loss:        {final_epoch['val_loss']:.4f}")
    print(f"  - Val Accuracy:    {final_epoch['val_accuracy']:.4f}")
    print("\nTest Set Evaluation:")
    print(f"  - Test Loss:       {test_loss:.4f}")
    print(f"  - Test Accuracy:   {test_acc:.4f}")
    print("=" * 65)


if __name__ == "__main__":
    main()
