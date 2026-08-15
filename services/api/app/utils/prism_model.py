"""
PRISM 57-feature inference service.

Lazy-loads the three trained artifacts from settings.PRISM_MODEL_DIR:
  - prism_classifier_model.joblib
  - prism_regressor_model.joblib
  - prism_scaler.joblib

Public entry point: `predict_prism(device_id, db)`.

Hard rules:
  - The scaler is NEVER refit. Only `scaler.transform()` is called.
  - If any artifact is missing or has an unexpected shape, the function
    returns a typed `PrismInsufficientData` with `reason="model_not_loaded"`
    or `"feature_mismatch"`. Never a fake prediction.
  - NaN inputs propagate to NaN scaler outputs. The classifier/regressor are
    expected to handle NaN gracefully (RandomForest in scikit-learn does).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

import joblib
import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.utils.prism_features import (
    EXPECTED_FEATURE_COUNT,
    FeatureBuildResult,
    build_feature_vector,
)

logger = logging.getLogger(__name__)


# ── Public envelopes ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class PrismPrediction:
    """Successful inference output."""

    classifier_index: int
    classifier_label: str
    classifier_probabilities: Dict[str, float]
    regressor_score: float
    regressor_label: str
    regressor_thresholds: Dict[str, float]
    regressor_name: str
    data_sufficiency: Dict[str, int]
    feature_status: Dict[str, str]
    model_version: Dict[str, str]
    generated_at: str

    def to_dict(self) -> Dict:
        return {
            "status": "ok",
            "classifier": {
                "index": self.classifier_index,
                "label": self.classifier_label,
                "probabilities": self.classifier_probabilities,
            },
            "regressor": {
                "score": round(float(self.regressor_score), 4),
                "label": self.regressor_label,
                "name": self.regressor_name,
                "thresholds": self.regressor_thresholds,
            },
            "data_sufficiency": self.data_sufficiency,
            "feature_status": self.feature_status,
            "model_version": self.model_version,
            "generated_at": self.generated_at,
        }


@dataclass(frozen=True)
class PrismInsufficientData:
    """Why a prediction could not be produced. The API converts this to 503."""

    reason: str  # "model_not_loaded" | "feature_engineering_failed" | "insufficient_history"
    message: str
    details: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "status": "insufficient_data",
            "reason": self.reason,
            "message": self.message,
            "details": self.details,
        }


# ── Model registry ───────────────────────────────────────────────────────────


class _PrismModelRegistry:
    """
    Loads and caches the three artifacts. Cached on first successful load.
    Validates feature count on every load (fail loud).
    """

    def __init__(self) -> None:
        self._cache: Dict[str, object] = {}
        self._load_error: Optional[str] = None

    def get_classifier(self):
        return self._cache.get("classifier")

    def get_regressor(self):
        return self._cache.get("regressor")

    def get_scaler(self):
        return self._cache.get("scaler")

    def load_all(self) -> Tuple[bool, Optional[str]]:
        """Idempotent load. Returns (success, error_message)."""
        if self._cache:
            return True, None
        if self._load_error is not None:
            return False, self._load_error

        model_dir = settings.PRISM_MODEL_DIR
        if not os.path.isdir(model_dir):
            self._load_error = f"PRISM_MODEL_DIR does not exist: {model_dir}"
            return False, self._load_error

        paths = {
            "classifier": os.path.join(model_dir, "prism_classifier_model.joblib"),
            "regressor": os.path.join(model_dir, "prism_regressor_model.joblib"),
            "scaler": os.path.join(model_dir, "prism_scaler.joblib"),
        }
        missing = [name for name, p in paths.items() if not os.path.isfile(p)]
        if missing:
            self._load_error = f"Missing PRISM artifacts: {missing}"
            return False, self._load_error

        try:
            classifier = joblib.load(paths["classifier"])
            regressor = joblib.load(paths["regressor"])
            scaler = joblib.load(paths["scaler"])
        except Exception as exc:
            self._load_error = f"joblib.load failed: {exc}"
            return False, self._load_error

        # Validate feature count on every artifact.
        for name, obj in (
            ("classifier", classifier),
            ("regressor", regressor),
            ("scaler", scaler),
        ):
            n = getattr(obj, "n_features_in_", None)
            if n is not None and n != EXPECTED_FEATURE_COUNT:
                self._load_error = (
                    f"{name} expects {n} features, "
                    f"expected {EXPECTED_FEATURE_COUNT}"
                )
                return False, self._load_error

        self._cache = {
            "classifier": classifier,
            "regressor": regressor,
            "scaler": scaler,
        }
        return True, None

    @staticmethod
    def model_version() -> Dict[str, str]:
        return {
            "classifier_n_estimators": str(getattr(_registry.get_classifier(), "n_estimators", "")),
            "classifier_class_weight": str(getattr(_registry.get_classifier(), "class_weight", "")),
            "regressor_n_estimators": str(getattr(_registry.get_regressor(), "n_estimators", "")),
            "feature_count": str(EXPECTED_FEATURE_COUNT),
            "feature_count_locked": "yes",
        }


_registry = _PrismModelRegistry()


def _regressor_tier(score: float) -> str:
    low_max = settings.PRISM_REGRESSOR_LOW_MAX
    high_min = settings.PRISM_REGRESSOR_HIGH_MIN
    if score < low_max:
        return "low"
    if score < high_min:
        return "moderate"
    return "elevated"


# ── Public entry point ───────────────────────────────────────────────────────


def predict_prism(
    device_id: str,
    db: Session,
) -> object:
    """
    Run the Prism 57-feature inference for one device.

    Returns:
      - `PrismPrediction` on success
      - `PrismInsufficientData` on any failure (never raises)

    The function NEVER modifies database state, never logs raw audio/facial
    values, and never returns a fake prediction when data is missing.
    """
    # 1. Load models (lazy, idempotent).
    ok, err = _registry.load_all()
    if not ok:
        return PrismInsufficientData(
            reason="model_not_loaded",
            message=err or "PRISM artifacts could not be loaded.",
            details={"model_dir": settings.PRISM_MODEL_DIR},
        )

    # 2. Build the feature vector. `build_feature_vector` validates
    #    ordering and shape before returning; it raises PrismFeatureError
    #    only on schema lock violations (a programming error, not data
    #    missing). We catch it as a safety net.
    try:
        features: FeatureBuildResult = build_feature_vector(db, device_id)
    except Exception as exc:
        logger.warning(
            "PRISM feature engineering failed for device %s: %s",
            device_id,
            exc,
        )
        return PrismInsufficientData(
            reason="feature_engineering_failed",
            message=str(exc),
        )

    # 3. Scale. `scaler.transform` only — never refit.
    raw = features.values.reshape(1, -1)
    try:
        scaled = _registry.get_scaler().transform(raw)
    except Exception as exc:
        logger.warning(
            "PRISM scaler.transform failed for device %s: %s",
            device_id,
            exc,
        )
        return PrismInsufficientData(
            reason="feature_engineering_failed",
            message=f"scaler.transform raised: {exc}",
        )

    # 4. Classifier — return class index + full probability vector.
    classifier = _registry.get_classifier()
    regressor = _registry.get_regressor()

    try:
        class_idx = int(classifier.predict(scaled)[0])
        probabilities = classifier.predict_proba(scaled)[0].tolist()
    except Exception as exc:
        logger.warning(
            "PRISM classifier inference failed for device %s: %s",
            device_id,
            exc,
        )
        return PrismInsufficientData(
            reason="feature_engineering_failed",
            message=f"classifier.predict raised: {exc}",
        )

    if class_idx not in settings.PRISM_CLASSIFIER_LABELS:
        return PrismInsufficientData(
            reason="feature_engineering_failed",
            message=(
                f"classifier returned class {class_idx} which is outside the "
                f"known label mapping {sorted(settings.PRISM_CLASSIFIER_LABELS.keys())}."
            ),
        )

    class_labels_map = dict(settings.PRISM_CLASSIFIER_LABELS)
    # Build a label-keyed probability map; if the model emits classes outside
    # `classes_`, we still surface whatever we have.
    classes_seen = list(getattr(classifier, "classes_", list(class_labels_map.keys())))
    probs_by_label: Dict[str, float] = {}
    for i, label_idx in enumerate(classes_seen):
        try:
            label = class_labels_map.get(int(label_idx), f"class_{int(label_idx)}")
        except Exception:
            label = f"class_{label_idx}"
        probs_by_label[label] = float(probabilities[i]) if i < len(probabilities) else 0.0
    # Ensure every configured label is present in the output (even at 0.0).
    for idx, label in class_labels_map.items():
        probs_by_label.setdefault(label, 0.0)

    # 5. Regressor.
    try:
        regressor_raw = float(regressor.predict(scaled)[0])
    except Exception as exc:
        logger.warning(
            "PRISM regressor inference failed for device %s: %s",
            device_id,
            exc,
        )
        return PrismInsufficientData(
            reason="feature_engineering_failed",
            message=f"regressor.predict raised: {exc}",
        )

    # Regressor output is documented only as a 0..1 score in this integration;
    # we clip for safety but do not invent units. We surface the raw value
    # along with thresholds the operator configured via env vars.
    regressor_score = max(0.0, min(1.0, regressor_raw))

    return PrismPrediction(
        classifier_index=class_idx,
        classifier_label=class_labels_map[class_idx],
        classifier_probabilities=probs_by_label,
        regressor_score=regressor_score,
        regressor_label=_regressor_tier(regressor_score),
        regressor_thresholds={
            "low_max": float(settings.PRISM_REGRESSOR_LOW_MAX),
            "high_min": float(settings.PRISM_REGRESSOR_HIGH_MIN),
        },
        regressor_name=settings.PRISM_REGRESSOR_NAME,
        data_sufficiency=features.data_sufficiency,
        feature_status=features.feature_status,
        model_version=_PrismModelRegistry.model_version(),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


def reset_model_registry_for_tests() -> None:
    """Drop the cached artifacts — for unit tests that swap artifacts at runtime."""
    global _registry
    _registry = _PrismModelRegistry()
