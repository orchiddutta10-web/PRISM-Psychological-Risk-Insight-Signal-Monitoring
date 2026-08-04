"""
Train the Behavioral AI models (Module 3).

Generates a synthetic-but-realistic typing-behavior corpus (keystroke timing,
corrections, session patterns) labeled for stress, cognitive load, fatigue,
stability, and trend-level anxiety/depression patterns, then trains:

  Signal-level:
    - RandomForest → Stress Score
    - RandomForest → Cognitive Load
    - RandomForest → Typing Fatigue
    - IsolationForest → Typing Stability (anomaly detection)

  Trend-level:
    - HistGradientBoosting → Possible Anxiety Trend
    - HistGradientBoosting → Possible Depression Trend
    - RandomForest ensemble → Mental Risk Score + confidence

Artifacts are written to app/resources/behavioral_ai/ and an evaluation
report to docs/MODEL_EVAL_BEHAVIORAL.md.

Usage (from services/api):
    python scripts/train_behavioral_ai.py

> [!IMPORTANT]
> All data here is SYNTHETIC. The models are demo/benchmark artifacts that
> ship with the repo so the screening pipeline works end-to-end; they have
> NOT been validated on real populations and must never be used to diagnose.
"""
import os
import sys

import numpy as np
import joblib
from sklearn.ensemble import (
    RandomForestClassifier,
    IsolationForest,
    HistGradientBoostingClassifier,
)
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    roc_auc_score,
)

# Ensure the app package is importable when run from services/api
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.utils.behavioral_ai import (  # noqa: E402
    MODELS_DIR,
    SIGNAL_FEATURES,
)

RNG = np.random.default_rng(42)

# Feature indices (must match SIGNAL_FEATURES order in behavioral_ai.py)
FEAT = {name: i for i, name in enumerate(SIGNAL_FEATURES)}


def _top_feature_names(model, n: int = 3, trend: bool = False):
    """Returns the top-n feature names by model feature_importances_."""
    names = [f"{dim}_{stat}"
             for dim in ("stress", "cognitive_load", "typing_fatigue", "typing_stability")
             for stat in ("mean", "std", "slope")] if trend else SIGNAL_FEATURES
    imp = getattr(model, "feature_importances_", None)
    if imp is None:
        return "n/a"
    order = np.argsort(-np.asarray(imp))[:n]
    return ", ".join(names[i] for i in order)


# ─── Synthetic corpus generation ───────────────────────────────────────────


def _typed_row(base_delay: float, jitter: float, stress: float, label: int):
    """One row: typing dynamics influenced by a latent (stress/load/fatigue)."""
    delay_index = max(0.6, base_delay + stress * RNG.normal(0.35, 0.12) + RNG.normal(0, jitter))
    iki_mean = 250.0 + stress * 140.0 + RNG.normal(0, 30)
    iki_std = 45.0 + stress * 160.0 + RNG.normal(0, 12)
    correction_var = 0.04 + stress * 0.28 + RNG.normal(0, 0.015)
    burst_length = max(2, 14 - stress * 9 + RNG.normal(0, 2))
    typing_speed = max(8, 55 - stress * 30 + RNG.normal(0, 6))
    error_rate = max(0.0, 0.03 + stress * 0.22 + RNG.normal(0, 0.01))
    session_duration = 90 + stress * 120 + RNG.normal(0, 25)
    hour_of_day = RNG.integers(6, 24)

    return [
        delay_index, iki_mean, iki_std, correction_var, burst_length,
        typing_speed, error_rate, session_duration, float(hour_of_day),
    ], label


def generate_dataset(n_samples: int = 4000, anomaly_frac: float = 0.18):
    """
    Produces labeled rows for the three classifier dimensions. Each sample
    gets an independent latent stress/load/fatigue level; the three labels
    are correlated (as they are in reality) but not identical.
    """
    X, y_stress, y_load, y_fatigue = [], [], [], []
    for _ in range(n_samples):
        base = RNG.normal(1.0, 0.08)
        jitter = RNG.uniform(0.02, 0.06)

        stress_latent = 1.0 if RNG.random() < anomaly_frac else 0.0
        load_latent = 1.0 if RNG.random() < anomaly_frac else 0.0
        fatigue_latent = 1.0 if RNG.random() < anomaly_frac else 0.0
        # Correlate: at least 60% of the time a stressed session is also loaded.
        if RNG.random() < 0.6:
            load_latent = max(load_latent, stress_latent)

        row, _ = _typed_row(base, jitter, stress_latent, 0)
        X.append(row)
        y_stress.append(stress_latent)
        y_load.append(load_latent)
        y_fatigue.append(fatigue_latent)

    X = np.array(X)
    return {
        "X": X,
        "y_stress": np.array(y_stress),
        "y_load": np.array(y_load),
        "y_fatigue": np.array(y_fatigue),
    }


def generate_trend_dataset(n_sessions: int = 1500, window: int = 8):
    """
    Produces rolling-window trend samples. Each row = aggregate stats over a
    window of signal scores (mean/std/slope per dimension) plus a latent
    anxiety/depression trend label.
    """
    X, y_anx, y_dep = [], [], []
    for _ in range(n_sessions):
        n = int(RNG.integers(3, window + 1))
        anxiety = 1.0 if RNG.random() < 0.22 else 0.0
        depression = 1.0 if RNG.random() < 0.16 else 0.0

        scores = []
        for t in range(n):
            # Anxiety: rising stress slope; Depression: rising fatigue, falling stability.
            stress = max(0.0, min(1.0, 0.2 + anxiety * (0.15 * t / n) + RNG.normal(0.05, 0.04)))
            load = max(0.0, min(1.0, 0.25 + anxiety * (0.12 * t / n) + RNG.normal(0.05, 0.05)))
            fatigue = max(0.0, min(1.0, 0.25 + depression * (0.14 * t / n) + RNG.normal(0.05, 0.04)))
            stability = max(0.0, min(1.0, 0.85 - depression * (0.10 * t / n) + RNG.normal(0.03, 0.05)))
            scores.append([stress, load, fatigue, stability])

        arr = np.array(scores)
        means = arr.mean(axis=0)
        stds = arr.std(axis=0)
        x = np.arange(len(arr), dtype=float)
        slopes = np.array([np.polyfit(x, arr[:, i], 1)[0] if np.std(arr[:, i]) > 0 else 0.0 for i in range(4)])

        X.append(np.concatenate([means, stds, slopes]))
        y_anx.append(anxiety)
        y_dep.append(depression)

    return {
        "X": np.array(X),
        "y_anxiety": np.array(y_anx),
        "y_depression": np.array(y_dep),
    }


# ─── Training ──────────────────────────────────────────────────────────────


def train_and_save():
    os.makedirs(MODELS_DIR, exist_ok=True)
    report = []
    report.append("# PRISM Behavioral AI Model — Evaluation Report\n")
    report.append(
        "> [!NOTE]\n> All models are trained on **synthetic** typing-behavior data "
        "for demo/benchmark purposes. They are screening aids, not diagnostic "
        "tools, and have not been validated on real populations.\n"
    )

    # ── Signal-level classifiers ──
    data = generate_dataset()
    X, y_stress, y_load, y_fatigue = data["X"], data["y_stress"], data["y_load"], data["y_fatigue"]

    report.append("## 1. Signal-level models (per typing event)\n")

    classifiers = {
        "stress": (y_stress, "stress_rf.joblib", "Stress Score"),
        "cognitive_load": (y_load, "cognitive_load_rf.joblib", "Cognitive Load"),
        "typing_fatigue": (y_fatigue, "typing_fatigue_rf.joblib", "Typing Fatigue"),
    }
    for key, (y, filename, label) in classifiers.items():
        X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
        clf = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=42)
        clf.fit(X_tr, y_tr)
        joblib.dump(clf, os.path.join(MODELS_DIR, filename))

        preds = clf.predict(X_te)
        proba = clf.predict_proba(X_te)[:, 1]
        acc = accuracy_score(y_te, preds)
        auc = roc_auc_score(y_te, proba) if len(set(y_te)) > 1 else 0.0
        report.append(f"### {label}")
        report.append(f"- Model: RandomForest (200 trees, depth 8)")
        report.append(f"- Accuracy: {acc:.3f} | ROC-AUC: {auc:.3f}")
        report.append(f"- Positive rate (flagged): {y_te.mean():.3f}")
        report.append(f"- Top features: {_top_feature_names(clf, n=3)}\n")

    # ── Typing stability (IsolationForest) ──
    stable_idx = (y_stress == 0) & (y_load == 0) & (y_fatigue == 0)
    X_stable = X[stable_idx]
    iso = IsolationForest(contamination=0.1, random_state=42)
    iso.fit(X_stable)
    # Calibrate: store the median score_samples of the healthy distribution so
    # inference can map raw scores to a 0..1 risk (raw == median → risk 0.5).
    # Set dynamically — the runtime reads it via getattr(model, "median_score_").
    setattr(iso, "median_score_", float(np.median(iso.score_samples(X_stable))))
    joblib.dump(iso, os.path.join(MODELS_DIR, "typing_stability_if.joblib"))
    anomaly_score = -iso.score_samples(X)
    report.append("### Typing Stability (IsolationForest)")
    report.append(
        f"- Median score_samples (healthy): "
        f"{getattr(iso, 'median_score_', -0.46):.4f} (used for calibration)"
    )
    report.append(f"- Anomaly rate: {(anomaly_score > np.percentile(anomaly_score, 90)).mean():.3f}\n")

    # ── Trend models ──
    report.append("## 2. Trend models (rolling window)\n")
    tdata = generate_trend_dataset()

    for key, y, filename, label in (
        ("anxiety", tdata["y_anxiety"], "anxiety_trend_model.joblib", "Possible Anxiety Trend"),
        ("depression", tdata["y_depression"], "depression_trend_model.joblib", "Possible Depression Trend"),
    ):
        X_tr, X_te, y_tr, y_te = train_test_split(tdata["X"], y, test_size=0.2, random_state=42)
        clf = HistGradientBoostingClassifier(max_iter=150, random_state=42)
        clf.fit(X_tr, y_tr)
        joblib.dump(clf, os.path.join(MODELS_DIR, filename))

        preds = clf.predict(X_te)
        proba = clf.predict_proba(X_te)[:, 1]
        acc = accuracy_score(y_te, preds)
        auc = roc_auc_score(y_te, proba) if len(set(y_te)) > 1 else 0.0
        report.append(f"### {label}")
        report.append(f"- Model: HistGradientBoosting (150 iterations)")
        report.append(f"- Accuracy: {acc:.3f} | ROC-AUC: {auc:.3f}")
        report.append(f"- Top features: {_top_feature_names(clf, n=3, trend=True)}\n")

    # ── Mental risk ensemble ──
    report.append("## 3. Mental Risk Score (weighted ensemble)\n")
    # Composite truth over trend windows: any signal dimension elevated on
    # average. Trained on the 12-feature trend vector (mean/std/slope) so it
    # matches evaluate_trend's inference input.
    window_risk = np.logical_or(tdata["y_anxiety"].astype(int), tdata["y_depression"].astype(int))
    X_risk = tdata["X"]
    X_tr, X_te, y_tr, y_te = train_test_split(X_risk, window_risk, test_size=0.2, random_state=42)
    ens = RandomForestClassifier(n_estimators=200, max_depth=6, random_state=42)
    ens.fit(X_tr, y_tr)
    joblib.dump(ens, os.path.join(MODELS_DIR, "mental_risk_ensemble.joblib"))
    proba = ens.predict_proba(X_te)[:, 1]
    auc = roc_auc_score(y_te, proba)
    report.append(f"- Model: RandomForest ensemble over trend features (mean/std/slope)")
    report.append(f"- ROC-AUC (any-dimension attention): {auc:.3f}\n")
    report.append(
        "The Mental Risk Score is a screening composite. Per PRISM's paper "
        "framing, it indicates behavioral patterns that may warrant attention "
        "— it is never a diagnosis.\n"
    )

    # Docs convention: services/api/docs/ (same place as MODEL_EVAL.md).
    docs_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs"
    )
    os.makedirs(docs_dir, exist_ok=True)
    with open(os.path.join(docs_dir, "MODEL_EVAL_BEHAVIORAL.md"), "w") as f:
        f.write("\n".join(report))

    # Module 4: persist global feature importances so the runtime can surface
    # them without re-reading the .joblib blobs. Written as a plain JSON map.
    import json as _json

    fi = {}
    for key, (_, filename, _) in classifiers.items():
        clf = joblib.load(os.path.join(MODELS_DIR, filename))
        fi[key] = {
            SIGNAL_FEATURES[i]: round(float(v), 4)
            for i, v in enumerate(clf.feature_importances_)
        }
    with open(os.path.join(MODELS_DIR, "feature_importance.json"), "w") as f:
        _json.dump(fi, f, indent=2)

    print(f"Artifacts written to {MODELS_DIR}")
    print(f"Evaluation report -> docs/MODEL_EVAL_BEHAVIORAL.md")


if __name__ == "__main__":
    train_and_save()
