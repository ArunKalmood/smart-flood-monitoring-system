# Stage 3 v2 LSTM Pipeline: Beaker Flood Forecasting & Robustness

This document provides complete instructions, parameters, and documentation for the **Stage 3 v2** deep-learning sequence forecasting pipeline for beaker-scale flood hazard monitoring.

---

## 1. Pipeline Overview & Specifications

- **Task:** 3-class temporal status forecasting (`0: normal`, `1: warning`, `2: critical`)
- **Winning Architecture:** Sequential LSTM (`var2`)
  - `Input(shape=(36, 8))`
  - `LSTM(64, return_sequences=True)`
  - `Dropout(0.2)`
  - `LSTM(32)`
  - `Dropout(0.2)`
  - `Dense(16, activation="relu")`
  - `Dense(3, activation="softmax")`
- **Input Window Length:** `36` steps (180 seconds of sequence history)
- **Sampling Interval:** `5` seconds
- **Prediction Horizon:** `6` steps ahead (30-second early warning)
- **Random Seed:** `42` (`keras.utils.set_random_seed(42)`, `tf.random.set_seed(42)`, `np.random.seed(42)`)
- **Calibrated Critical Multiplier:** `m = 1.10` (tuned strictly on validation split)
- **Physical Reference & Thresholds:**
  - Beaker reference height: `11.5 cm` (empty distance floor = `12.3 cm`)
  - Warning threshold: `50%` of $11.5\text{ cm} = 5.75\text{ cm}$ rise ($\text{distance} \le 6.55\text{ cm}$)
  - Critical threshold: `75%` of $11.5\text{ cm} = 8.625\text{ cm}$ rise ($\text{distance} \le 3.675\text{ cm}$)
- **8 Input Features per Time Step:**
  1. `dist_cm_filled`: Causal forward-fill of ultrasonic distance (leading invalid values filled with `12.3 cm`).
  2. `dist_missing`: Binary flag (`1.0` if raw `dist_cm` is `NaN`).
  3. `dist_sentinel`: Binary flag (`1.0` if raw `dist_cm == -1.0`).
  4. `rain_adc`: Raw analog rain sensor reading (`float32`).
  5. `rain_digital_high`: Binary flag (`1.0` if `rain_digital == 'HIGH'`).
  6. `dist_diff`: First backward difference of `dist_cm_filled` within the event (`0.0` at $t=0$).
  7. `dist_rolling_med_3`: Causal rolling median of `dist_cm_filled` over the last 3 steps ($k-2$ to $k$).
  8. `steps_since_last_valid_dist`: Integer counter of consecutive invalid distance steps, capped at `12`.
- **Feature Scaling:** `StandardScaler` fitted **only on TRAIN windows** across continuous/count channels (`[0, 3, 5, 6, 7]`: `dist_cm_filled`, `rain_adc`, `dist_diff`, `dist_rolling_med_3`, `steps_since_last_valid_dist`).

---

## 2. Frozen Model & Scaler Artifacts

- **Frozen Winning Model:**  
  `models/lstm-stage3-v2-var2-20261014.1812.keras`
- **Frozen Feature Scaler (36-Step):**  
  `models/scaler_stage3_v2_w36.pkl`
- **24-Step Scaler (Variants 1, 3, 4):**  
  `models/scaler_stage3_v2.pkl`

---

## 3. Critical Operational Rule: Warm-Up Left-Padding

> [!IMPORTANT]
> **Inference Warm-Up Left-Padding Requirement:**  
> When performing real-time inference or evaluating sequential events, the model expects an input window of 36 steps. For the first 35 steps of an event ($k = 0, \dots, 34$, i.e., $t < 175\text{ s}$), the window **must be left-padded with the event's first row (row 0)** rather than skipping predictions:
> ```python
> if k < 35:
>     pad_count = 35 - k
>     window = np.vstack([np.tile(features[0:1], (pad_count, 1)), features[0 : k + 1]])
> else:
>     window = features[k - 35 : k + 1]
> ```
> Without this left-padding, the model suffers an artificial 175-second delay before issuing any forecast, severely penalizing lead times on fast-rising flood events. With left-padding, predictions begin immediately at $t = 0\text{ s}$, recovering **+112.0 seconds** of effective warning lead time.

---

## 4. Exact Execution Commands

Run all commands from the `backend/` directory using the workspace virtualenv (`./venv/bin/python`):

```bash
cd /home/arunkumar/Videos/ibm_bob/MP/flood-monitor/backend
```

### Step 1: Baseline Error Analysis
Analyzes misclassifications of the baseline Stage 3 v1 model on the validation split:
```bash
./venv/bin/python ml/analyze_errors_stage3.py
```

### Step 2: Build 8-Feature Windows & Scalers
Builds sliding windows (24-step or 36-step), performs causal forward fill, and fits `StandardScaler` on train windows:
```bash
# 24-step window
./venv/bin/python ml/stage3_data_v2.py --window 24

# 36-step window
./venv/bin/python ml/stage3_data_v2.py --window 36
```

### Step 3: Train All 4 Model Variants (Seed 42)
Trains `var1` (8 feat, win 24), `var2` (8 feat, win 36), `var3` (var1, crit wt $\times 2$), and `var4` (var1, GRU(64)):
```bash
./venv/bin/python ml/train_lstm_stage3_v2.py --variant all
```

### Step 4: Multi-Variant Validation Selection & Single Test Evaluation
Evaluates all 4 variants on validation, chooses the winner (`var2`) by validation macro-F1 at critical recall $\ge 0.95$, evaluates `var2` on the test split, and computes lead times with warm-up left-padding:
```bash
./venv/bin/python ml/evaluate_stage3_v2.py
```

### Step 5: Test Split Robustness Breakdown Across Fault Conditions
Evaluates the frozen model (`lstm-stage3-v2-var2-20261014.1812.keras`) on test windows broken down by scenario, ambient, and rain sensor fault types, marking critical recall as `undefined` when true critical support is 0:
```bash
./venv/bin/python ml/robustness_stage3_v2.py
```

### Step 6: Verify Consistency with Baseline Comparison
Confirms that the simple distance rule yields identical false-alarm counts (44/52) across both pipelines:
```bash
./venv/bin/python ml/compare_stage3.py
```

---

## 5. Summary of Key Results

### Validation Selection Across Variants

| Variant | Window | Plain Macro-F1 | Plain Crit Recall | Plain Crit Prec | Multiplier ($m$) | Calibrated Macro-F1 | Calibrated Crit Recall ($\ge 0.95$) | Calibrated Crit Prec |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **var1** | 24 | 0.8850 | 0.9244 | 0.9804 | 1.60 | 0.8867 | 0.9513 | 0.9642 |
| **var2** | **36** | **0.9144** | **0.9566** | **0.9787** | **1.10** | **0.9160** | **0.9618** | **0.9788** |
| **var3** | 24 | 0.8873 | 0.9462 | 0.9674 | 1.20 | 0.8862 | 0.9529 | 0.9594 |
| **var4** | 24 | 0.8946 | 0.9311 | 0.9893 | 1.85 | 0.8924 | 0.9529 | 0.9643 |

### Final Test Split Metrics (Winner: `var2`)

| Metric | Stage 3 v1 (Baseline) | Stage 3 v2 Winner (`var2`) | Delta |
| :--- | :---: | :---: | :---: |
| **Plain Test Accuracy** | 0.9676 | **0.9815** | **+0.0139** |
| **Plain Test Macro-F1** | 0.8832 | **0.9251** | **+0.0419** |
| **Plain Critical Recall** | 0.8914 | **0.9200** | **+0.0286** |
| **Plain Critical Precision** | 0.8953 | **0.9399** | **+0.0446** |
| **Critical Predicted as Normal** | **0** | **0** | 0 |
| **Calibrated Test Accuracy** ($m=1.10$) | 0.9675 | **0.9817** | **+0.0142** |
| **Calibrated Test Macro-F1** | 0.8810 | **0.9264** | **+0.0454** |
| **Calibrated Critical Precision** | 0.8388 | **0.9402** | **+0.1014** |
| **Calibrated Critical Recall** | 0.9690 | **0.9247** | -0.0443 |

### Warning Lead-Time Breakdown (Test Split)

- **(a) Events Starting at Warning ($t=0\text{ s}$, $n=31$ total, 25 signaled):**
  - Left-Padded: Mean = **-14.8 s**, Median = **0.0 s**
  - Unpadded (without fix): Mean = **-196.0 s**, Median = **-175.0 s**
- **(b) Events Transitioning During Run ($t > 0\text{ s}$, $n=7$ total, 7 signaled):**
  - Left-Padded: Mean = **+47.1 s early**, Median = **+45.0 s early**
  - Unpadded (without fix): Mean = **+5.0 s**, Median = **+15.0 s**
  - Baseline Firmware: Mean = **-2.9 s** (late)
  - Simple Threshold Rule: Mean = **-22.1 s** (late)
- **False-Alarm Rate on 52 Normal Test Events:**
  - Simple Threshold Rule (Physical: $6.55\text{ cm}$): **44 / 52** (84.6%)
  - Firmware (`fw_status`): **16 / 52** (30.8%)
  - Stage 3 v2 Winner (Left-Padded): **3 / 52 (5.8%)**

---

## 6. Artifact Files Produced

- Python Scripts:
  - `stage3_data_v2.py`: 8-feature extraction and 24/36-step window generator.
  - `analyze_errors_stage3.py`: Validation misclassification breakdown.
  - `train_lstm_stage3_v2.py`: 4-variant training pipeline under seed 42.
  - `evaluate_stage3_v2.py`: Multi-variant selection, test evaluation, and warm-up fix.
  - `robustness_stage3_v2.py`: Test split fault robustness analysis.
- Reports:
  - `reports/stage3_v2_metrics.json`: Comprehensive test and validation metrics.
  - `reports/stage3_v2_comparison.csv`: Event-by-event lead times and false alarm records.
  - `reports/stage3_v2_robustness.csv`: Fault-by-fault window count, macro-F1, and critical recall/precision.
  - `reports/stage3_v2_var[1-4]_history.csv`: Training loss and accuracy histories for all variants.
