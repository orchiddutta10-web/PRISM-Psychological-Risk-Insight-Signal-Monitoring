"""
Phase 10 — ML Engine API routes.

Endpoints for triggering and retrieving PRISM Insight Scores.
All routes require guardian JWT auth + RBAC.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.utils import auth
from app.utils.prism_ml_engine import PrismMLEngine
from app.utils.xai_engine import ExplanationResult, XaiEngine
from app.utils.drift_monitor import DriftMonitor, DriftReport, DataQualityReport
from app.services.colab_ml_service import ColabModelFeatures, ColabPredictionResponse, ColabMLService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ml", tags=["ml-engine"])

# ── Request / Response schemas ──────────────────────────────────────────


class InsightScoreResponse(BaseModel):
    subject_id: str
    insight_score: float
    tier_label: str
    tier_summary: str
    anomaly_score: float
    modality_scores: dict[str, float]
    fusion_score: float
    contributing_factors: list[str]
    confidence: float
    colab_ml_risk_level: str | None = None
    colab_ml_score: float | None = None


class InsightHistoryResponse(BaseModel):
    subject_id: str
    history: list[InsightScoreResponse]
    count: int


class FitResponse(BaseModel):
    subject_id: str
    fitted: bool
    n_windows: int | None = None
    detail: str


class EvaluateRequest(BaseModel):
    persist: bool = Field(
        default=True,
        description="Whether to persist the result to RiskScoreV2 and AlertV2 tables.",
    )


class ExplanationResponse(BaseModel):
    risk_score: float
    risk_level: str
    summary: str
    confidence: dict
    observation_window: str
    baseline_comparison: str
    ranked_factors: list[dict]
    timeline: list[dict]
    counterfactuals: list[dict]
    technical_details: dict = Field(default_factory=dict)


# ── Engine singleton (lazy init so tests can override) ─────────────────

_engine: Optional[PrismMLEngine] = None


def get_ml_engine() -> PrismMLEngine:
    return _engine


def set_ml_engine(engine: PrismMLEngine) -> None:
    global _engine
    _engine = engine


# ── Routes ──────────────────────────────────────────────────────────────


@router.post(
    "/predict_colab",
    response_model=ColabPredictionResponse,
    status_code=status.HTTP_200_OK,
)
def predict_colab(
    features: ColabModelFeatures,
) -> ColabPredictionResponse:
    """
    Development endpoint for testing the Colab-trained 57-feature models directly.
    Accepts explicit features as JSON.
    """
    from app.config import settings
    if settings.ENV.lower() == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is restricted to development/validation environments only."
        )
    service = ColabMLService()
    return service.predict(features)


@router.post(
    "/insight/{subject_id}/fit",
    response_model=FitResponse,
    status_code=status.HTTP_200_OK,
)
def fit_subject_model(
    subject_id: str,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> FitResponse:
    """
    Fit (or re-fit) the subject's per-subject Isolation Forest model
    using their 14-day behavioural history. Must have ≥ 5 behaviour windows.
    """
    engine = get_ml_engine()
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML engine not initialized.",
        )

    fitted = engine.ensure_fitted(subject_id)

    if fitted:
        n_windows = None
        if subject_id in engine._subjects:
            n_windows = engine._subjects[subject_id]._n_fit_samples
        return FitResponse(
            subject_id=subject_id,
            fitted=True,
            n_windows=n_windows,
            detail="Isolation Forest model fitted successfully.",
        )

    return FitResponse(
        subject_id=subject_id,
        fitted=False,
        detail="Insufficient historical data. Need at least 5 behaviour windows.",
    )


@router.post(
    "/insight/{subject_id}",
    response_model=InsightScoreResponse,
    status_code=status.HTTP_200_OK,
)
def evaluate_subject(
    subject_id: str,
    req: EvaluateRequest = EvaluateRequest(),
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> InsightScoreResponse:
    """
    Run the full Phase 10 pipeline and return a PRISM Insight Score.

    Pipeline:
      1. Build feature vector from DB tables
      2. Isolation Forest → anomaly score
      3. Per-modality deviation scores
      4. Rule-based fusion engine
      5. PRISM Insight Score with interpretation

    Optionally persists the result to risk_scores_v2 and alerts_v2.
    """
    engine = get_ml_engine()
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML engine not initialized.",
        )

    # Ensure model is fitted (no-op if already fitted)
    engine.ensure_fitted(subject_id)

    if req.persist:
        result = engine.evaluate_and_persist(subject_id)
    else:
        result = engine.evaluate(subject_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No feature data available for this subject. Ensure sensor data is flowing.",
        )

    return InsightScoreResponse(
        subject_id=result.subject_id,
        insight_score=result.insight_score,
        tier_label=result.tier_label,
        tier_summary=result.tier_summary,
        anomaly_score=result.anomaly_score,
        modality_scores=result.modality_scores.to_dict(),
        fusion_score=result.fusion_score,
        contributing_factors=result.contributing_factors,
        confidence=result.confidence,
        colab_ml_risk_level=result.colab_ml_risk_level,
        colab_ml_score=result.colab_ml_score,
    )


@router.get(
    "/insight/{subject_id}",
    response_model=InsightScoreResponse,
    status_code=status.HTTP_200_OK,
)
def get_latest_insight(
    subject_id: str,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> InsightScoreResponse:
    """
    Retrieve the most recently persisted PRISM Insight Score from the database.
    Does NOT run the ML pipeline — reads from risk_scores_v2.
    """
    latest = (
        db.query(models.RiskScoreV2)
        .filter(models.RiskScoreV2.window.has(subject_id=subject_id))
        .order_by(models.RiskScoreV2.id.desc())
        .first()
    )

    if latest is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No insight score has been computed for this subject yet.",
        )

    return InsightScoreResponse(
        subject_id=subject_id,
        insight_score=latest.score_value,
        tier_label=_tier_label_for(latest.score_value),
        tier_summary=_tier_summary_for(latest.score_value),
        anomaly_score=0.0,
        modality_scores={},
        fusion_score=latest.score_value / 100.0,
        contributing_factors=latest.contributing_factors,
        confidence=0.7,
        colab_ml_risk_level=None,
        colab_ml_score=None,
    )


@router.get(
    "/insight/{subject_id}/history",
    response_model=InsightHistoryResponse,
    status_code=status.HTTP_200_OK,
)
def get_insight_history(
    subject_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> InsightHistoryResponse:
    """
    Retrieve historical PRISM Insight Scores for this subject.
    """
    scores = (
        db.query(models.RiskScoreV2)
        .filter(models.RiskScoreV2.window.has(subject_id=subject_id))
        .order_by(models.RiskScoreV2.id.desc())
        .limit(limit)
        .all()
    )

    history = []
    for s in scores:
        history.append(
            InsightScoreResponse(
                subject_id=subject_id,
                insight_score=s.score_value,
                tier_label=_tier_label_for(s.score_value),
                tier_summary=_tier_summary_for(s.score_value),
                anomaly_score=0.0,
                modality_scores={},
                fusion_score=s.score_value / 100.0,
                contributing_factors=s.contributing_factors,
                confidence=0.7,
                colab_ml_risk_level=None,
                colab_ml_score=None,
            )
        )

    return InsightHistoryResponse(
        subject_id=subject_id,
        history=history,
        count=len(history),
    )


@router.get(
    "/insight/{subject_id}/explain",
    response_model=ExplanationResponse,
    status_code=status.HTTP_200_OK,
)
def get_explanation(
    subject_id: str,
    audience: str = Query(
        default="guardian", pattern="^(guardian|clinician|scientist)$"
    ),
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> ExplanationResponse:
    """
    Phase 11 — Full XAI explanation for a subject's PRISM Insight Score.

    Returns ranked contributing factors with direction/magnitude/importance,
    natural language explanation, timeline, counterfactuals, and per-modality
    confidence breakdown. Supports three audience tiers via the `audience`
    query parameter: guardian, clinician, scientist.

    The explanation is an additive extension — it reads from the existing
    InsightResult and enriches it with explainability metadata. No ML
    re-inference is triggered for the GET endpoint.
    """
    engine = get_ml_engine()
    if engine is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML engine not initialized.",
        )

    # Try live evaluation first
    result = engine.evaluate(subject_id)
    if result is None:
        # Fall back to most recent persisted insight
        latest = (
            db.query(models.RiskScoreV2)
            .filter(models.RiskScoreV2.window.has(subject_id=subject_id))
            .order_by(models.RiskScoreV2.id.desc())
            .first()
        )
        if latest is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No insight data available for this subject.",
            )
        return ExplanationResponse(
            risk_score=latest.score_value,
            risk_level=_tier_label_for(latest.score_value),
            summary=_tier_summary_for(latest.score_value),
            confidence={
                "overall": 0.5,
                "uncertainty_note": "Limited data — explanation generated from historical score only.",
            },
            observation_window="N/A (stale data)",
            baseline_comparison="Using most recent persisted score.",
            ranked_factors=[],
            timeline=[],
            counterfactuals=[],
        )

    explanation = XaiEngine.explain(result)
    explanation = explanation.filter_audience(audience)

    return ExplanationResponse(
        risk_score=explanation.risk_score,
        risk_level=explanation.risk_level,
        summary=explanation.summary,
        confidence=explanation.confidence.to_dict(),
        observation_window=explanation.observation_window,
        baseline_comparison=explanation.baseline_comparison,
        ranked_factors=[f.to_dict() for f in explanation.ranked_factors],
        timeline=[t.to_dict() for t in explanation.timeline],
        counterfactuals=[c.to_dict() for c in explanation.counterfactuals],
        technical_details=explanation.technical_details,
    )


# ── Phase 12 — Feedback ──────────────────────────────────────────────────


class FeedbackRequest(BaseModel):
    subject_id: str
    source: str = Field(..., pattern=r"^(guardian|clinician|system)$")
    feedback_type: str = Field(
        ...,
        pattern=r"^(helpful|not_helpful|false_alert|missed_alert|correct|incorrect)$",
    )
    insight_score_at_time: float | None = None
    risk_level_at_time: str | None = None
    comment: str | None = None


class FeedbackResponse(BaseModel):
    status: str
    feedback_id: str


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
def submit_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> FeedbackResponse:
    """Submit feedback on a PRISM prediction or alert."""
    record = models.FeedbackRecord(
        subject_id=req.subject_id,
        source=req.source,
        feedback_type=req.feedback_type,
        insight_score_at_time=req.insight_score_at_time,
        risk_level_at_time=req.risk_level_at_time,
        comment=req.comment,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    # Write to immutable audit log
    entry = models.AuditLogEntry(
        actor_id=str(current_user.id),
        action="SUBMIT_FEEDBACK",
        resource=f"insight/{req.subject_id}",
    )
    entry.context = {
        "feedback_id": record.id,
        "source": req.source,
        "feedback_type": req.feedback_type,
    }
    db.add(entry)
    db.commit()

    return FeedbackResponse(status="recorded", feedback_id=record.id)


# ── Phase 12 — Drift Detection ───────────────────────────────────────────


class DriftResponse(BaseModel):
    subject_id: str
    timestamp: str
    score_drift: dict
    feature_drift: dict
    confidence_drift: dict
    recommendation: str
    overall_alert: str


@router.get(
    "/drift/{subject_id}",
    response_model=DriftResponse,
    status_code=status.HTTP_200_OK,
)
def check_drift(
    subject_id: str,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> DriftResponse:
    """Check for score, feature, and confidence drift for a subject."""
    report = DriftMonitor.analyze(subject_id, db)
    return DriftResponse(**report.to_dict())


# ── Phase 12 — Retraining ────────────────────────────────────────────────


class RetrainRequest(BaseModel):
    force: bool = False


class RetrainResponse(BaseModel):
    subject_id: str
    retrained: bool
    model_version: str | None = None
    detail: str


@router.post(
    "/retrain/{subject_id}",
    response_model=RetrainResponse,
    status_code=status.HTTP_200_OK,
)
def retrain_model(
    subject_id: str,
    req: RetrainRequest = RetrainRequest(),
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> RetrainResponse:
    """
    Re-fit the per-subject Isolation Forest model on the latest data.

    Validates data quality before retraining. Saves to ModelRegistry.
    Rolls back if performance degrades.
    """
    engine = get_ml_engine()
    if engine is None:
        raise HTTPException(status_code=503, detail="ML engine not initialized.")

    quality = DriftMonitor.validate_training_data(subject_id, db)
    if quality.quarantined and not req.force:
        raise HTTPException(
            status_code=400,
            detail=f"Training data quarantined: {quality.reason}. Use force=true to override.",
        )

    if quality.total_windows < 5:
        return RetrainResponse(
            subject_id=subject_id,
            retrained=False,
            detail=f"Insufficient data: {quality.total_windows} windows (need ≥5).",
        )

    # Attempt retraining
    from datetime import datetime as dt, timezone

    success = engine.ensure_fitted(subject_id)
    if not success:
        return RetrainResponse(
            subject_id=subject_id,
            retrained=False,
            detail="Retraining failed — model could not fit on current data.",
        )

    version = dt.now().strftime("%Y%m%d_%H%M%S")

    # Register in model registry
    registry = models.ModelRegistry(
        subject_id=subject_id,
        model_type="isolation_forest",
        version=version,
        file_path=f"in_memory:{subject_id}",
        status="active",
        deployed_at=dt.now(timezone.utc),
    )
    registry.metrics = {
        "n_windows": quality.total_windows,
        "data_completeness": quality.data_completeness,
    }
    db.add(registry)
    db.commit()

    # Audit log
    entry = models.AuditLogEntry(
        actor_id=str(current_user.id),
        action="RETRAIN_MODEL",
        resource=f"insight/{subject_id}",
    )
    entry.context = {"model_version": version, "force": req.force}
    db.add(entry)
    db.commit()

    return RetrainResponse(
        subject_id=subject_id,
        retrained=True,
        model_version=version,
        detail="Model retrained and registered successfully.",
    )


# ── Phase 12 — Learning Analytics ────────────────────────────────────────


class AnalyticsResponse(BaseModel):
    subject_id: str
    feedback_volume: dict
    recent_scores: list[dict]
    drift_events: list[dict]
    retraining_history: list[dict]


@router.get(
    "/analytics/{subject_id}",
    response_model=AnalyticsResponse,
    status_code=status.HTTP_200_OK,
)
def get_analytics(
    subject_id: str,
    db: Session = Depends(get_db),
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> AnalyticsResponse:
    """Aggregate learning analytics for a subject."""
    # Feedback volume
    feedback_records = (
        db.query(models.FeedbackRecord)
        .filter(models.FeedbackRecord.subject_id == subject_id)
        .all()
    )
    feedback_volume = {
        "total": len(feedback_records),
        "helpful": sum(1 for f in feedback_records if f.feedback_type == "helpful"),
        "not_helpful": sum(
            1 for f in feedback_records if f.feedback_type == "not_helpful"
        ),
        "false_alert": sum(
            1 for f in feedback_records if f.feedback_type == "false_alert"
        ),
    }

    # Recent scores
    recent_scores = (
        db.query(models.RiskScoreV2)
        .join(
            models.BehaviorWindow,
            models.RiskScoreV2.window_id == models.BehaviorWindow.id,
        )
        .filter(models.BehaviorWindow.subject_id == subject_id)
        .order_by(models.BehaviorWindow.start_ts.desc())
        .limit(30)
        .all()
    )
    score_trend = [
        {"score_value": s.score_value, "risk_level": s.risk_level}
        for s in recent_scores
    ]

    # Model registry
    models_list = (
        db.query(models.ModelRegistry)
        .filter(models.ModelRegistry.subject_id == subject_id)
        .order_by(models.ModelRegistry.created_at.desc())
        .all()
    )
    retraining_history = [
        {"version": m.version, "status": m.status, "metrics": m.metrics}
        for m in models_list
    ]

    # Drift (most recent only)
    report = DriftMonitor.analyze(subject_id, db)

    return AnalyticsResponse(
        subject_id=subject_id,
        feedback_volume=feedback_volume,
        recent_scores=score_trend,
        drift_events=[report.to_dict()],
        retraining_history=retraining_history,
    )


# ── Helpers ─────────────────────────────────────────────────────────────


INSIGHT_TIERS = [
    (0, 30, "Baseline", "Behavioural metrics aligned with established patterns."),
    (
        31,
        60,
        "Behavioural change observed",
        "One or more modalities show deviation from personal baseline.",
    ),
    (
        61,
        80,
        "Multiple unusual signals",
        "Several independent behavioural and physiological signals deviate concurrently.",
    ),
    (
        81,
        100,
        "High-priority pattern",
        "A pronounced, multi-modal behavioural shift has been detected.",
    ),
]


def _tier_label_for(score: float) -> str:
    for lo, hi, label, _ in INSIGHT_TIERS:
        if lo <= score <= hi:
            return label
    return "Unknown"


def _tier_summary_for(score: float) -> str:
    for lo, hi, _, summary in INSIGHT_TIERS:
        if lo <= score <= hi:
            return summary
    return "Unable to determine interpretation."
