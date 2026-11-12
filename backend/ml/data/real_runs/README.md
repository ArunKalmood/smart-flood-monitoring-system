# Real Beaker Run Recording Protocol & Evaluation Guide

This directory (`data/real_runs/`) stores physical sensor benchmark runs recorded from the physical IoT beaker hardware setup.

> [!IMPORTANT]
> **STRICT ZERO-TRAINING POLICY**:
> Files in this directory are **NEVER used for training or validation tuning**. They serve exclusively as a frozen, real-world physical benchmark to test model generalization, acoustic noise robustness, sensor dropouts, and alarm lead/lag timing under physical conditions.

---

## 1. Physical Hardware Setup

- **Reference Container**: Standard cylindrical beaker with reference active height of **11.5 cm**.
- **Ultrasonic Distance Sensor**: Mounted rigidly directly above the beaker opening.
  - Distance from sensor transducer face to empty beaker bottom: **12.3 cm**.
  - All distance readings (`dist_cm`) are measured in **centimetres**.
  - Echo dropouts or out-of-range sensor readings should be logged as `-1.0` or `NaN`.
- **Rain Sensor**: Positioned to detect precipitation.
  - `rain_adc`: Analog ADC value (raw integer/float reading).
  - `rain_digital`: Digital threshold indicator (`HIGH` / `LOW` or `1` / `0`).
- **Ground Truth Water Level**:
  - Measured by hand against an external vertical millimetre scale or marked graduated line on the beaker.
  - Column name: `true_water_level_cm` (measured water depth from container bottom in centimetres).

---

## 2. Status Threshold Definitions

Based on the 11.5 cm beaker reference rise:

| Status Class | Water Level Criterion (`true_water_level_cm`) | Sensor Distance Criterion (`dist_cm`) |
| :--- | :--- | :--- |
| **Normal** | $< 5.75\text{ cm}$ ($< 50\%$ height) | $> 6.55\text{ cm}$ |
| **Warning** | $\ge 5.75\text{ cm}$ and $< 8.625\text{ cm}$ ($50\%$ to $75\%$ height) | $\le 6.55\text{ cm}$ and $> 3.675\text{ cm}$ |
| **Critical** | $\ge 8.625\text{ cm}$ ($\ge 75\%$ height) | $\le 3.675\text{ cm}$ |

---

## 3. The Four Required Benchmark Scenarios

To thoroughly validate the system against diverse hydrological dynamics, record **four distinct runs**. Each run must be sampled at a strict **5-second sampling interval ($\Delta t = 5.0\text{ s}$)** and run for **at least 10 minutes** ($\ge 120$ sequential readings):

### Run 1: Slow Fill (`slow_fill.csv`)
- **Duration**: $\ge 10$ minutes ($\ge 120$ steps at 5s spacing).
- **Procedure**: Start with an empty or near-empty beaker ($< 1.0\text{ cm}$). Gradually add water using a slow, steady trickle or drip rate so that the water level rises smoothly over 6–8 minutes through Warning ($5.75\text{ cm}$) and reaches Critical ($8.625\text{ cm}$).
- **Objective**: Evaluates early warning lead-time and steady-state predictive tracking under gradual flood accumulation.

### Run 2: Fast Fill (`fast_fill.csv`)
- **Duration**: $\ge 10$ minutes ($\ge 120$ steps at 5s spacing).
- **Procedure**: Start with low water level ($< 2.0\text{ cm}$) for 1–2 minutes, then rapidly pour water to surge the level from Normal to Critical in under 60–90 seconds, then hold or maintain.
- **Objective**: Evaluates responsiveness to sudden flash flooding, rapid rate-of-rise detection (`dist_diff`), and absence of lag during sudden surges.

### Run 3: Drain (`drain.csv`)
- **Duration**: $\ge 10$ minutes ($\ge 120$ steps at 5s spacing).
- **Procedure**: Start with the beaker filled to Critical level ($\ge 9.0\text{ cm}$). After 1–2 minutes of baseline recording, steadily siphon, pump, or drain the beaker until it drops below Warning down to Normal ($< 3.0\text{ cm}$).
- **Objective**: Tests model hysteresis, recovery behavior when water recedes, and verifies that the model clears alarms without latching or lingering in false critical states.

### Run 4: Stays Low (`stays_low.csv`)
- **Duration**: $\ge 10$ minutes ($\ge 120$ steps at 5s spacing).
- **Procedure**: Beaker remains dry or holds a negligible pool ($< 2.0\text{ cm}$) throughout the entire 10+ minutes. Expose the sensor to real ambient disturbances: room vibrations, air currents, occasional water splashes or mist on the rain sensor, and periodic hand movements near the beaker.
- **Objective**: Measures false-alarm rejection under physical environmental noise, sensor acoustic jitter, and surface agitation.

---

## 4. CSV File Format & Columns

Each recorded CSV file should contain the following exact columns:

```csv
t_s,dist_cm,rain_adc,rain_digital,true_water_level_cm
0.0,12.30,4095,LOW,0.00
5.0,12.28,4090,LOW,0.00
10.0,12.10,3800,HIGH,0.20
...
```

### Column Specifications:
1. `t_s` *(float)*: Elapsed time in seconds from run start (`0.0, 5.0, 10.0, ...`). Spacing must be approximately 5.0 seconds.
2. `dist_cm` *(float)*: Raw ultrasonic reading in cm. If an echo is missed, record `-1.0` or leave empty (`NaN`).
3. `rain_adc` *(float/int)*: Raw rain sensor analog-to-digital converter reading.
4. `rain_digital` *(string/int)*: Rain digital sensor pin: `"HIGH"` / `"LOW"` (or `1` / `0`).
5. `true_water_level_cm` *(float)*: Manual ground truth water height measured in cm from the beaker bottom.

---

## 5. How to Run Inference & Evaluation

From the `backend` directory, using `backend/venv`:

### 1. Generate Model Predictions:
```bash
./venv/bin/python ml/infer_stage3_v2.py \
  --input ml/data/real_runs/slow_fill.csv \
  --output ml/data/real_runs/slow_fill_predictions.csv
```
This applies the frozen Stage 3 v2 model (`lstm-stage3-v2-var2-20261014.1812.keras`), 8 causal features, warm-up left-padding, and the calibrated critical multiplier ($m = 1.10$).

### 2. Evaluate Against Ground Truth:
```bash
./venv/bin/python ml/evaluate_real_run.py \
  --input ml/data/real_runs/slow_fill.csv \
  --name slow_fill
```
This generates:
- Overall accuracy and Macro-F1.
- Per-class recall, precision, and F1.
- Full 3x3 confusion matrix.
- Warning alarm crossing lead/lag time in seconds ($t_{\text{true}} - t_{\text{pred}}$).
- Critical alarm crossing lead/lag time in seconds.
- JSON output saved to `ml/reports/real_run_slow_fill.json`.
