from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import settings
from app.database import get_db
from app.utils.auth import get_current_user, verify_guardian_device_access
from app.utils.prism_model import (
    PrismInsufficientData,
    PrismPrediction,
    predict_prism,
)

router = APIRouter(prefix="/api/v1/prism", tags=["PRISM 57-feature Model"])


def _persist_snapshot(db: Session, device_id: str, prediction: PrismPrediction) -> None:
    """Store the prediction result so the UI can show history."""
    snapshot = models.PrismPredictionSnapshot(
        device_id=device_id,
        classifier_label=prediction.classifier_label,
        classifier_index=prediction.classifier_index,
        regressor_score=prediction.regressor_score,
        regressor_label=prediction.regressor_label,
        data_sufficiency=prediction.data_sufficiency,
    )
    snapshot.classifier_probabilities = dict(prediction.classifier_probabilities)
    db.add(snapshot)
    db.commit()


@router.get("/predict/{device_id}")
def get_prism_prediction(
    device_id: str,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(get_current_user),
):
    """
    Generate a 57-feature ML prediction for one device.

    Returns:
      - 200 with a stable PrismPredictionResponse when the artifacts are
        loaded and inference succeeds.
      - 503 with a structured `insufficient_data` payload when artifacts
        are missing, history is empty, or the model returns an unknown class.
    """
    verify_guardian_device_access(current_guardian, device_id, db)

    prediction = predict_prism(device_id=device_id, db=db)

    if isinstance(prediction, PrismInsufficientData):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "reason": prediction.reason,
                "message": prediction.message,
                "details": prediction.details,
            },
        )

    # Persist snapshot (best-effort; failure to persist must not break the API).
    try:
        _persist_snapshot(db, device_id, prediction)
    except Exception as exc:  # pragma: no cover — defensive
        db.rollback()
        from app.utils import auth  # local import keeps the route slim

        auth.log_audit_event(
            db,
            action=f"PRISM snapshot persistence failed: {exc}",
            device_id=str(device_id),
            guardian_id=str(current_guardian.id),
        )

    payload = prediction.to_dict()
    payload["classifier"]["index"] = prediction.classifier_index
    payload["classifier"]["label"] = prediction.classifier_label
    payload["classifier"]["probabilities"] = prediction.classifier_probabilities
    payload["regressor"] = {
        "score": round(float(prediction.regressor_score), 4),
        "label": prediction.regressor_label,
        "name": prediction.regressor_name,
        "thresholds": prediction.regressor_thresholds,
    }
    payload["generated_at"] = prediction.generated_at
    payload["data_sufficiency"] = prediction.data_sufficiency
    payload["feature_status"] = prediction.feature_status
    payload["model_version"] = prediction.model_version
    return payload


@router.get("/history/{device_id}")
def get_prism_history(
    device_id: str,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_guardian: models.Guardian = Depends(get_current_user),
):
    """Recent Prism predictions for a device (newest first)."""
    verify_guardian_device_access(current_guardian, device_id, db)
    rows = (
        db.query(models.PrismPredictionSnapshot)
        .filter(models.PrismPredictionSnapshot.device_id == device_id)
        .order_by(models.PrismPredictionSnapshot.generated_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return {
        "device_id": device_id,
        "items": [
            {
                "generated_at": (
                    row.generated_at.replace(tzinfo=timezone.utc).isoformat()
                    if row.generated_at.tzinfo is None
                    else row.generated_at.isoformat()
                ),
                "classifier": {
                    "index": row.classifier_index,
                    "label": row.classifier_label,
                    "probabilities": row.classifier_probabilities,
                },
                "regressor": {
                    "score": row.regressor_score,
                    "label": row.regressor_label,
                },
                "data_sufficiency": row.data_sufficiency,
            }
            for row in rows
        ],
    }
