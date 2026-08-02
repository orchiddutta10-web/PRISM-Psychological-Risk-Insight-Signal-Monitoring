# PRISM Behavioral AI Model — Evaluation Report

> [!NOTE]
> All models are trained on **synthetic** typing-behavior data for demo/benchmark purposes. They are screening aids, not diagnostic tools, and have not been validated on real populations.

## 1. Signal-level models (per typing event)

### Stress Score
- Model: RandomForest (200 trees, depth 8)
- Accuracy: 1.000 | ROC-AUC: 1.000
- Positive rate (flagged): 0.184

### Cognitive Load
- Model: RandomForest (200 trees, depth 8)
- Accuracy: 0.794 | ROC-AUC: 0.706
- Positive rate (flagged): 0.276

### Typing Fatigue
- Model: RandomForest (200 trees, depth 8)
- Accuracy: 0.805 | ROC-AUC: 0.550
- Positive rate (flagged): 0.195

### Typing Stability (IsolationForest)
- Median score_samples (healthy): -0.4524 (used for calibration)
- Anomaly rate: 0.099

## 2. Trend models (rolling window)

### Possible Anxiety Trend
- Model: HistGradientBoosting (150 iterations)
- Accuracy: 0.980 | ROC-AUC: 0.999

### Possible Depression Trend
- Model: HistGradientBoosting (150 iterations)
- Accuracy: 0.970 | ROC-AUC: 0.996

## 3. Mental Risk Score (weighted ensemble)

- Model: RandomForest ensemble over trend features (mean/std/slope)
- ROC-AUC (any-dimension attention): 0.995

The Mental Risk Score is a screening composite. Per PRISM's paper framing, it indicates behavioral patterns that may warrant attention — it is never a diagnosis.
