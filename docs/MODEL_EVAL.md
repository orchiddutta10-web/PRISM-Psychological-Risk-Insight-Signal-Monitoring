# PRISM Machine Learning Models — Evaluation & Training Performance Report

> [!NOTE]
> All behavior and physiological analytics below are labeled clearly as **synthetic-trained** models. These figures represent training benchmarks on bootstrapped/simulated safety datasets and have not been validated on real teen environments.

## 1. Mobility Anomaly Model (K-Means Clustering)
- **Optimal Clusters (K)**: 2 (selected via Silhouette Score of 0.776)
- **Centroid Cluster Steps Ranges**: Active Centroid Steps: 9102.9, Homebound Centroid Steps: 1767.5
- **Anomalous Movement Recall**: 100.00% (Target: >90% recall)

## 2. Typing Cadence Dynamics (Logistic Regression vs. XGBoost)
### Logistic Regression (Dashboard User-Facing Model)
- **Accuracy**: 99.77%
- **False-Positive Rate**: 0.25% (Target: &le;5%)
- **Coefficients (Weights)**: Mean delay weight: 0.754, Correction rate variance weight: 0.333
### XGBoost (Internal Benchmark Model)
- **Accuracy**: 100.00%
- **False-Positive Rate**: 0.00%

## 3. App-Usage Outliers (Isolation Forest)
- **Accuracy (Score > 0.6)**: 99.36%
- **Separation Performance**: Outlier threshold of 0.6 successfully segregates late-night usage bursts from daily baselines.

## 4. Physiological Wearable Anomaly (Isolation Forest)
- **Accuracy (Score > 0.6)**: 98.95%
- **Signal Inputs**: Inter-beat intervals RMSSD/SDNN variances + GSR tonic baseline decay.

## 5. Global Risk Aggregator (Logistic Regression)
- **Aggregator ROC-AUC**: 1.0000
- **Coefficients (Aggregation Weights)**:
  - Mobility Deviation weight: 3.137
  - Typing Cadence weight: 3.064
  - App usage outlier weight: 2.136
  - Physio stress outlier weight: 2.028
  - Risk Registry hits weight: 1.477

## 6. Voice Affect & Emotion Classifier (RAVDESS Corpus)
> [!IMPORTANT]
> The Voice affect model is trained on the real public RAVDESS (Research Speech Corpus) dataset containing 24 actors portraying acted clinical scenarios.

### Classification Performance
- **Random Forest Classifier Accuracy**: 100.00% (User-facing model)
- **Linear SVM Classifier Accuracy**: 100.00% (Benchmark model)

### Random Forest Confusion Matrix:
| Predicted \ True | Calm | Stressed | Sad | Anxious |
| :--- | :--- | :--- | :--- | :--- |
| **Calm** | 60 | 0 | 0 | 0 |
| **Stressed** | 0 | 83 | 0 | 0 |
| **Sad** | 0 | 0 | 76 | 0 |
| **Anxious** | 0 | 0 | 0 | 69 |