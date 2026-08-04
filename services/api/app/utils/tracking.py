"""
Module 6: Long-Term Behaviour Tracking.

Aggregates behavioral AI screening scores (Module 3) into daily / weekly /
monthly TrendSnapshot rows so the dashboard can render long-horizon stress,
fatigue and mental-wellness trends without recomputing over raw events.

Design notes:
- Snapshots are de-identified: they store only mean scores per dimension plus
  a single `wellness` composite (0..1, higher = more attention-worthy).
- Scores are encrypted at rest (FieldSymmetricEncryption), matching the rest
  of the repo.
- The aggregation is idempotent per (device, granularity, period): running it
  twice upserts the same period instead of duplicating rows.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)

# Behavioral dimensions persisted as RiskScore rows (model_name = behavioral_*).
BEHAVIORAL_DIMS = [
    "stress",
    "cognitive_load",
    "typing_fatigue",
    "typing_stability",
    "mental_risk",
]

GRANULARITIES = ("daily", "weekly", "monthly")


def _period_bounds(granularity: str, ts: datetime) -> tuple[datetime, datetime]:
    """Returns (period_start, period_end) for a timestamp at the given granularity."""
    # Normalize to a UTC day boundary.
    day = ts.replace(hour=0, minute=0, second=0, microsecond=0)
    if granularity == "daily":
        return day, day + timedelta(days=1)
    if granularity == "weekly":
        # ISO week: Monday start.
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=7)
    if granularity == "monthly":
        start = day.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        return start, end
    raise ValueError(f"Unknown granularity: {granularity}")


def _wellness_from_scores(scores: dict) -> float:
    """
    Composite 0..1 proxy for the mental-risk trend, mirroring the weighted
    ensemble in behavioral_ai.evaluate_trend (stress .30, load .25, fatigue
    .20, instability .25). Missing dims are treated as neutral 0.
    """
    stress = scores.get("stress", 0.0)
    load = scores.get("cognitive_load", 0.0)
    fatigue = scores.get("typing_fatigue", 0.0)
    stability = scores.get("typing_stability", 1.0)
    instability = 1.0 - stability
    composite = 0.30 * stress + 0.25 * load + 0.20 * fatigue + 0.25 * instability
    return round(max(0.0, min(1.0, composite)), 3)


def compute_snapshots(
    db: Session, device_id: str, granularities: tuple = GRANULARITIES
) -> int:
    """
    Computes TrendSnapshot rows for the given device across the requested
    granularities, over the last 90 days of behavioral RiskScores.

    Returns the number of snapshot rows upserted.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    scores = (
        db.query(models.RiskScore)
        .filter(
            models.RiskScore.device_id == device_id,
            models.RiskScore.model_name.like("behavioral_%"),
            models.RiskScore.timestamp >= cutoff,
        )
        .order_by(models.RiskScore.timestamp.asc())
        .all()
    )
    if not scores:
        return 0

    upserted = 0
    for granularity in granularities:
        # Group score rows into their period buckets.
        buckets: dict[tuple, list] = {}
        for s in scores:
            start, end = _period_bounds(granularity, s.timestamp)
            buckets.setdefault((start, end), []).append(s)

        for (start, end), rows in buckets.items():
            dim_means: dict[str, float] = {}
            for dim in BEHAVIORAL_DIMS:
                vals = [
                    r.score
                    for r in rows
                    if r.model_name == f"behavioral_{dim}" and r.score is not None
                ]
                if vals:
                    dim_means[dim] = round(sum(vals) / len(vals), 3)

            if not dim_means:
                continue

            wellness = _wellness_from_scores(dim_means)
            existing = (
                db.query(models.TrendSnapshot)
                .filter(
                    models.TrendSnapshot.device_id == device_id,
                    models.TrendSnapshot.granularity == granularity,
                    models.TrendSnapshot.period_start == start,
                )
                .first()
            )
            if existing:
                existing.period_end = end
                existing.wellness = wellness
                existing.sample_count = len(rows)
                existing.scores = dim_means
            else:
                snapshot = models.TrendSnapshot(
                    device_id=device_id,
                    granularity=granularity,
                    period_start=start,
                    period_end=end,
                    wellness=wellness,
                    sample_count=len(rows),
                )
                snapshot.scores = dim_means
                db.add(snapshot)
            upserted += 1

    db.commit()
    return upserted


def get_trends(
    db: Session, device_id: str, granularity: str = "daily", days: int = 90
) -> dict:
    """
    Returns trend snapshots for the dashboard: a list of {period_start,
    period_end, wellness, scores} plus a derived `trend` field (delta between
    the two most recent snapshots) for the risk meter.
    """
    if granularity not in GRANULARITIES:
        raise ValueError(f"Unknown granularity: {granularity}")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(models.TrendSnapshot)
        .filter(
            models.TrendSnapshot.device_id == device_id,
            models.TrendSnapshot.granularity == granularity,
            models.TrendSnapshot.period_start >= cutoff,
        )
        .order_by(models.TrendSnapshot.period_start.asc())
        .all()
    )

    points = [
        {
            "period_start": r.period_start.isoformat(),
            "period_end": r.period_end.isoformat(),
            "wellness": r.wellness,
            "sample_count": r.sample_count,
            "scores": r.scores,
        }
        for r in rows
    ]

    trend = 0.0
    if len(points) >= 2:
        trend = round(points[-1]["wellness"] - points[-2]["wellness"], 3)

    return {
        "device_id": device_id,
        "granularity": granularity,
        "points": points,
        "trend": trend,
    }
