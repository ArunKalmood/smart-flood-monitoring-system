# Stage 3 LSTM Pipeline: Beaker Flood Early Warning

This directory documents the Stage 3 deep-learning sequence model developed for beaker-scale flood hazard early-warning forecasting.

---

## 1. Pipeline Overview & Specifications

- **Task:** 3-class temporal status forecasting (`0: normal`, `1: warning`, `2: critical`)
- **Input Window Length:** `24` steps (120 seconds of continuous history)
- **Sampling Interval:** `5` seconds
- **Prediction Horizon:** `6` steps ahead (30-second early warning)
- **Random Seed:** `42` (`keras.utils.set_random_seed(42)`)
- **Physical Reference & Thresholds:**
  - Beaker reference height: `11.5 cm` (empty distance floor = `12.3 cm`)
  - Warning threshold: `50%` of $11.5\text{ cm} = 5.75\text{ cm}$ rise ($\text{distance} \le 6.55\text{ cm}$)
  - Critical threshold: `75%` of $11.5\text{ cm} = 8.625\text{ cm}$ rise ($\text{distance} \le 3.675\text{ cm}$)
- **5 Input Features per Time Step:**
  1. `dist_cm_filled`: Causal forward-fill of ultrasonic distance (leading invalid values filled with `12.3 cm`).
  2. `dist_missing`: Binary flag (`1.0` if raw `dist_cm` is `NaN`).
  3. `dist_sentinel`: Binary flag (`1.0` if raw `dist_cm == -1.0`).
  4. `rain_adc`: Raw analog rain sensor reading (`float32`).
  5. `rain_digital_high`: Binary flag (`1.0` if `rain_digital == 'HIGH'`).
- **Feature Scaling:** `StandardScaler` fitted **only on TRAIN windows** across continuous channels (`dist_cm_filled` and `rain_adc`), persisted to `models/scaler_stage3.pkl`.

---

## 2. Exact Execution Commands

All commands should be executed from the `backend/` directory using the workspace virtualenv:

```bash
cd /home/arunkumar/Videos/ibm_bob/MP/flood-monitor/backend
```

### Step 1: Rebuild Windows and Fit Scaler
Reads `data/beaker_v2/synthetic_flood_dataset.csv`, extracts causal sliding windows, splits by event into train/val/test, fits and saves the scaler:
```bash
./venv/bin/python ml/stage3_data.py
```

### Step 2: Train the Stage 3 LSTM Model
Builds the Keras Sequential LSTM architecture (Input 24x5 → LSTM 64 → Dropout 0.2 → LSTM 32 → Dropout 0.2 → Dense 16 → Dense 3 Softmax), computes class weights on train fold, trains with Adam (lr=1e-3, batch=256), applies EarlyStopping (patience=10 on val_loss), and saves the timestamped model:
```bash
./venv/bin/python ml/train_lstm_stage3.py
```

### Step 3: Evaluate Test Performance & Tune Critical Multiplier
Loads the latest trained model, tunes the critical-class multiplier on the validation set for $\ge 0.95$ recall with best precision, evaluates plain and adjusted test metrics, and exports confusion matrix plots and metadata:
```bash
./venv/bin/python ml/evaluate_stage3.py
```

### Step 4: Compare Methods on Test Events
Compares firmware (`fw_status`), Stage 3 LSTM, and instantaneous distance rule across all 90 test events, measuring warning/critical lead time (in seconds) on hazard events and false-alarm counts on normal-only events:
```bash
./venv/bin/python ml/compare_stage3.py
```

### Step 5: Robustness Analysis Across Fault Conditions
Breaks down test split Macro-F1 and critical recall by `gt_fault_scenario`, `gt_fault_ambient`, and `gt_rain_sensor_fault` at the window's last input step:
```bash
./venv/bin/python ml/robustness_stage3.py
```

---

## 3. Files & Artifacts Produced

### Python Pipeline Scripts (`backend/ml/`)
- `stage3_data.py`: Window generation, causal forward-fill, gap validation, and train-split scaling.
- `train_lstm_stage3.py`: Model architecture definition, class-weight training, early stopping, and history logging.
- `evaluate_stage3.py`: Test inference, validation probability tuning, confusion matrix generation, and metadata export.
- `compare_stage3.py`: Lead time and false-alarm comparison of Firmware vs. LSTM vs. Simple Rule.
- `robustness_stage3.py`: Robustness and fault impact analysis under scenario and ambient sensor faults.

### Models and Scalers (`backend/ml/models/`)
- `scaler_stage3.pkl`: `StandardScaler` fitted strictly on train windows continuous channels (`dist_cm_filled` and `rain_adc`).
- `lstm-stage3-<YYYYMMDD.HHMM>.keras`: Saved Keras Sequential model weights and graph (e.g., `lstm-stage3-20261014.1719.keras`).
- `lstm-stage3-<YYYYMMDD.HHMM>.meta.json`: Full model provenance, architecture, hyperparameters, thresholds, seed, and metrics.

### Reports and Logs (`backend/ml/reports/`)
- `stage3_history.csv`: Epoch-by-epoch loss, accuracy, val_loss, and val_accuracy curves.
- `stage3_metrics.json`: Plain and adjusted test metrics, per-class precision/recall/F1, and confusion matrices.
- `stage3_confusion.png`: High-resolution side-by-side confusion matrix plot (Plain vs. Adjusted).
- `stage3_comparison.csv`: Lead times for all 38 hazard test events and overall false-alarm counts.
- `stage3_comparison_events_all.csv`: Event-by-event classification and false-alarm flags across all 90 test events.
- `stage3_robustness.csv`: Fault-by-fault breakdown of window count, macro-F1, critical recall, and precision.
- `stage3_README.md`: This reference document.

---

## 4. Key Metrics Summary

- **Test Accuracy:** `96.76%`
- **Test Macro-F1:** `0.8832` (Plain) / `0.8810` (Adjusted)
- **Critical Recall:** `89.14%` (Plain) $\rightarrow$ **`96.90%`** (Adjusted with validation multiplier `2.20`)
- **True Critical Predicted as Normal:** **`0`** (Zero dangerous false negatives)
- **False-Alarm Rate on Normal Events:**
  - Simple Instantaneous Rule: `44 / 52` (`84.6%`)
  - Firmware Detection: `16 / 52` (`30.8%`)
  - **Stage 3 LSTM:** **`5 / 52` (`9.6%`)**
- **Critical Lead Time on Rapid Flood Events:** Up to **`+55.0 s` early warning**
