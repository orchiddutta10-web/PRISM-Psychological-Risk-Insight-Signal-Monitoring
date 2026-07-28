"""
Phase 11 — Explainable AI (XAI) Engine

Extends PrismInsightScorer with rich, multi-audience explanations.
Produces ranked contributing factors, natural language explanations,
timeline events, counterfactuals, and per-modality confidence breakdowns.

All outputs are descriptive behavioural signals — NEVER diagnostic or clinical.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import numpy as np

from app.utils.prism_ml_engine import (
    BASELINE_WINDOW_DAYS,
    INSIGHT_TIERS,
    MODALITY_LABELS,
    FusionEngine,
    InsightResult,
    ModalityScores,
)

logger = logging.getLogger(__name__)

# ─── Data structures ─────────────────────────────────────────────────────


@dataclass
class XaiFactor:
    modality: str
    label: str
    direction: str               # "↑↑↑" | "↑↑" | "↑" | "→" | "↓"
    magnitude_pct: float         # 0–100 percentage
    importance_weight: float     # 0–1, sum of all weights ≈ 1.0
    confidence: str              # "High" | "Medium" | "Low"
    raw_deviation: float         # original modality score 0–1
    comparison_text: str         # human-readable comparison vs baseline

    def to_dict(self) -> dict:
        return {
            "modality": self.modality,
            "label": self.label,
            "direction": self.direction,
            "magnitude_pct": round(self.magnitude_pct, 1),
            "importance_weight": round(self.importance_weight, 3),
            "confidence": self.confidence,
            "raw_deviation": round(self.raw_deviation, 4),
            "comparison_text": self.comparison_text,
        }


@dataclass
class XaiTimelineEvent:
    day_offset: int              # days ago (0 = today)
    event_type: str              # "modality_shift" | "threshold_cross"
    description: str
    insight_score: float
    tier_label: str

    def to_dict(self) -> dict:
        return {
            "day_offset": self.day_offset,
            "event_type": self.event_type,
            "description": self.description,
            "insight_score": round(self.insight_score, 1),
            "tier_label": self.tier_label,
        }


@dataclass
class XaiCounterfactual:
    behavior_change: str         # "Increase daily steps by 2,000"
    estimated_impact: str        # "Significant" | "Moderate" | "Marginal"
    modality_affected: str
    rationale: str
    is_hypothetical: bool = True

    def to_dict(self) -> dict:
        return {
            "behavior_change": self.behavior_change,
            "estimated_impact": self.estimated_impact,
            "modality_affected": self.modality_affected,
            "rationale": self.rationale,
            "is_hypothetical": self.is_hypothetical,
        }


@dataclass
class XaiConfidence:
    overall: float
    data_completeness: float     # % of expected sensor data received
    modality_confidences: dict[str, str]   # per-modality "High"/"Medium"/"Low"
    baseline_age_days: int
    missing_modalities: list[str]
    uncertainty_note: str

    def to_dict(self) -> dict:
        return {
            "overall": round(self.overall, 3),
            "data_completeness": round(self.data_completeness, 3),
            "modality_confidences": self.modality_confidences,
            "baseline_age_days": self.baseline_age_days,
            "missing_modalities": self.missing_modalities,
            "uncertainty_note": self.uncertainty_note,
        }


@dataclass
class AudienceLayers:
    """Three-tier output for guardian, clinician, and data scientist."""
    guardian: dict = field(default_factory=dict)
    clinician: dict = field(default_factory=dict)
    scientist: dict = field(default_factory=dict)

    def filter(self, audience: str) -> dict:
        if audience == "guardian":
            return self.guardian
        elif audience == "clinician":
            return {**self.guardian, **self.clinician}
        elif audience == "scientist":
            return {**self.guardian, **self.clinician, **self.scientist}
        return self.guardian  # default fallback


@dataclass
class ExplanationResult:
    risk_score: float
    risk_level: str
    summary: str
    confidence: XaiConfidence
    observation_window: str
    baseline_comparison: str
    ranked_factors: list = field(default_factory=list)
    timeline: list = field(default_factory=list)
    counterfactuals: list = field(default_factory=list)
    audience_layers: AudienceLayers = field(default_factory=AudienceLayers)
    technical_details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "risk_score": round(self.risk_score, 1),
            "risk_level": self.risk_level,
            "summary": self.summary,
            "confidence": self.confidence.to_dict(),
            "observation_window": self.observation_window,
            "baseline_comparison": self.baseline_comparison,
            "ranked_factors": [f.to_dict() for f in self.ranked_factors],
            "timeline": [t.to_dict() for t in self.timeline],
            "counterfactuals": [c.to_dict() for c in self.counterfactuals],
            "technical_details": self.technical_details,
        }

    def filter_audience(self, audience: str) -> ExplanationResult:
        """Return a copy filtered to the specified audience layer."""
        filtered = ExplanationResult(
            risk_score=self.risk_score,
            risk_level=self.risk_level,
            summary=self.summary,
            confidence=self.confidence,
            observation_window=self.observation_window,
            baseline_comparison=self.baseline_comparison,
            ranked_factors=self.ranked_factors,
            timeline=self.timeline,
            counterfactuals=self.counterfactuals,
            audience_layers=self.audience_layers,
            technical_details=(self.technical_details if audience == "scientist" else {}),
        )
        # Overlay audience-specific content onto summary
        layer = self.audience_layers.filter(audience)
        if layer.get("enhanced_summary"):
            filtered.summary = layer["enhanced_summary"]
        return filtered


# ─── XAI Engine ──────────────────────────────────────────────────────────


class XaiEngine:
    """Produces rich, multi-audience explanations from an InsightResult."""

    MODALITY_READABLE = {
        "phone":    {"label": "Physical Activity & Screen Time", "column": "total_active_mins"},
        "vision":   {"label": "Visual Engagement (Posture/Gaze)", "column": "avg_blink_rate_bpm"},
        "physio":   {"label": "Physiological (Heart Rate)", "column": "avg_bpm"},
        "audio":    {"label": "Vocal Patterns", "column": "avg_speech_segments"},
        "risk_reg": {"label": "Safety Registry", "column": "risk_registry_hits"},
    }

    MODALITY_COMPARISONS = {
        "phone":    "Compared to your recent screen-time and activity patterns.",
        "vision":   "Based on changes in posture, blink rate, and time at screen.",
        "physio":   "Relative to your typical resting heart rate and movement variance.",
        "audio":    "Compared to your usual vocal engagement and speech patterns.",
        "risk_reg": "New app installations or safety-registry matches detected.",
    }

    @staticmethod
    def explain(
        result: InsightResult,
        ranked: Optional[list[XaiFactor]] = None,
        timeline: Optional[list[XaiTimelineEvent]] = None,
    ) -> ExplanationResult:
        """Full explanation pipeline from an InsightResult."""
        if ranked is None:
            ranked = XaiEngine._rank_factors(result.modality_scores)
        if timeline is None:
            timeline = XaiEngine._build_timeline_synthetic(result)

        # Confidence breakdown
        confidence = XaiEngine._build_confidence(result)

        # Natural language explanation
        nl_explanation = XaiEngine._build_natural_language(result, ranked, confidence)

        # Counterfactuals from top factors
        counterfactuals = XaiEngine._build_counterfactuals(ranked)

        # Audience layers
        audience_layers = XaiEngine._build_audience_layers(
            result, ranked, nl_explanation, confidence, counterfactuals
        )

        # Observation window
        observation_window = f"Previous {BASELINE_WINDOW_DAYS} days"
        baseline_comparison = (
            f"Compared against personal {BASELINE_WINDOW_DAYS}-day rolling baseline"
        )

        return ExplanationResult(
            risk_score=result.insight_score,
            risk_level=result.tier_label,
            summary=nl_explanation,
            confidence=confidence,
            observation_window=observation_window,
            baseline_comparison=baseline_comparison,
            ranked_factors=ranked,
            timeline=timeline,
            counterfactuals=counterfactuals,
            audience_layers=audience_layers,
            technical_details=XaiEngine._build_technical_details(result),
        )

    @staticmethod
    def _rank_factors(scores: ModalityScores) -> list[XaiFactor]:
        """Rank modalities by deviation magnitude with direction and importance."""
        sd = scores.to_dict()
        weights = FusionEngine().weights
        total_deviation = sum(sd.values()) + 1e-6

        factors = []
        for key, dev in sorted(sd.items(), key=lambda x: -x[1]):
            readable = XaiEngine.MODALITY_READABLE.get(key, {"label": key})
            label = readable["label"]
            weight = weights.get(key, 0.10)

            direction = XaiEngine._get_direction(dev)
            magnitude = dev * 100.0
            importance = weight * dev / total_deviation
            # normalize importance so max factor ~= its weight
            importance = min(importance / max(sum(sd.values()) * 0.5, 0.01), weight)

            # Per-modality confidence
            if dev > 0.75:
                mod_conf = "High"
            elif dev > 0.30:
                mod_conf = "Medium"
            else:
                mod_conf = "Low"

            comparison = XaiEngine.MODALITY_COMPARISONS.get(
                key, "Compared to your personal baseline."
            )

            factors.append(
                XaiFactor(
                    modality=key,
                    label=label,
                    direction=direction,
                    magnitude_pct=round(magnitude, 1),
                    importance_weight=round(importance, 3),
                    confidence=mod_conf,
                    raw_deviation=dev,
                    comparison_text=comparison,
                )
            )

        return factors

    @staticmethod
    def _get_direction(deviation: float) -> str:
        """Map deviation score to arrow direction indicator."""
        if deviation < 0.10:
            return "→"
        elif deviation < 0.30:
            return "↑"
        elif deviation < 0.55:
            return "↑↑"
        else:
            return "↑↑↑"

    @staticmethod
    def _build_natural_language(
        result: InsightResult,
        ranked: list[XaiFactor],
        confidence: XaiConfidence,
    ) -> str:
        """Multi-paragraph natural language explanation."""
        score = result.insight_score
        tier = result.tier_label

        # Paragraph 1 — summary
        if score <= 30:
            p1 = (
                "Your behavioural signals remain consistent with your established "
                "personal patterns. All monitored modalities — screen time, physical "
                "activity, sleep proxy, heart rate, and engagement — are within expected ranges."
            )
        elif score <= 60:
            p1 = (
                f"Over the {BASELINE_WINDOW_DAYS}-day observation window, one or more "
                "behavioural signals have shifted from your personal baseline. "
                "This is categorised as a 'Behavioural change observed' — it is not "
                "unusual for routines to shift during exam periods, holidays, or life "
                "changes, and may not indicate anything concerning."
            )
        elif score <= 80:
            p1 = (
                "Multiple independent behavioural and physiological signals have deviated "
                "from your personal baseline concurrently. When several systems flag "
                "changes at the same time — e.g., reduced movement, disrupted sleep, "
                "and increased screen time — the combined pattern warrants attention "
                "because isolated changes are common, but clustered changes are less so."
            )
        else:
            p1 = (
                "A pronounced, multi-modal behavioural shift has been detected across "
                "several independent monitoring channels. This pattern resembles a "
                "sustained change across multiple dimensions (activity, screen time, "
                "physiological indicators) that differs markedly from your established "
                "routine. This does NOT indicate a diagnosis of any condition — it "
                "signals that guardian review is recommended."
            )

        # Paragraph 2 — contributing factors
        if len(ranked) > 1:
            top = ranked[0]
            second = ranked[1] if len(ranked) > 1 else None
            p2 = (
                f"The strongest contributing signal is {top.label.lower()} "
                f"({top.direction} {top.magnitude_pct:.0f}% deviation, {top.importance_weight*100:.0f}% importance)"
            )
            if second and second.magnitude_pct > 10:
                p2 += (
                    f", followed by {second.label.lower()} "
                    f"({second.direction} {second.magnitude_pct:.0f}% deviation)."
                )
            else:
                p2 += "."
        else:
            p2 = "No single modality shows significant deviation from baseline."

        # Paragraph 3 — uncertainty
        if confidence.overall < 0.5:
            p3 = (
                f"Note: Confidence in this assessment is low ({confidence.overall*100:.0f}%). "
                f"{confidence.uncertainty_note}"
            )
        elif confidence.missing_modalities:
            p3 = (
                f"Data completeness is {confidence.data_completeness*100:.0f}%. "
                f"Some modalities ({', '.join(confidence.missing_modalities)}) have "
                "limited or no recent data, which may affect precision."
            )
        else:
            p3 = (
                f"Data quality is good — {confidence.data_completeness*100:.0f}% "
                "of expected sensor streams are reporting. "
                "This does not indicate a diagnosis or predict any condition. "
                "It describes unusual behavioural patterns that may warrant review."
            )

        return f"{p1}\n\n{p2}\n\n{p3}"

    @staticmethod
    def _build_timeline_synthetic(result: InsightResult) -> list[XaiTimelineEvent]:
        """Build a synthetic timeline from the current insight result.

        In production, this would query `risk_scores_v2` history for the
        subject. For the prototype, we generate a representative timeline
        from the modality scores and insight score.
        """
        sd = result.modality_scores.to_dict()
        events = []

        # Generate back-dated events based on deviation magnitudes
        if sd.get("phone", 0) > 0.25:
            event_day = max(1, int(sd["phone"] * 14))
            events.append(
                XaiTimelineEvent(
                    day_offset=event_day,
                    event_type="modality_shift",
                    description="Screen time and activity patterns began to shift from baseline.",
                    insight_score=result.insight_score,
                    tier_label=result.tier_label,
                )
            )

        if sd.get("vision", 0) > 0.25:
            event_day = max(2, int(sd["vision"] * 12))
            events.append(
                XaiTimelineEvent(
                    day_offset=event_day,
                    event_type="modality_shift",
                    description="Changes in posture, blink rate, or presence at screen detected.",
                    insight_score=result.insight_score,
                    tier_label=result.tier_label,
                )
            )

        if sd.get("physio", 0) > 0.25:
            event_day = max(3, int(sd["physio"] * 10))
            events.append(
                XaiTimelineEvent(
                    day_offset=event_day,
                    event_type="modality_shift",
                    description="Heart rate or movement variance departed from resting baseline.",
                    insight_score=result.insight_score,
                    tier_label=result.tier_label,
                )
            )

        if sd.get("audio", 0) > 0.25:
            event_day = max(4, int(sd["audio"] * 8))
            events.append(
                XaiTimelineEvent(
                    day_offset=event_day,
                    event_type="modality_shift",
                    description="Speech patterns or silence ratio shifted from vocal baseline.",
                    insight_score=result.insight_score,
                    tier_label=result.tier_label,
                )
            )

        if result.insight_score > 30:
            events.append(
                XaiTimelineEvent(
                    day_offset=0,
                    event_type="threshold_cross",
                    description=f"Multiple behavioural indicators crossed risk threshold. "
                    f"Insight Score reached {result.insight_score:.0f}/100.",
                    insight_score=result.insight_score,
                    tier_label=result.tier_label,
                )
            )

        return sorted(events, key=lambda e: -e.day_offset)

    @staticmethod
    def _build_counterfactuals(ranked: list[XaiFactor]) -> list[XaiCounterfactual]:
        """Generate what-if scenarios from top contributing factors."""
        suggestions = []

        for factor in ranked[:3]:
            if factor.magnitude_pct < 15:
                continue  # too small to meaningfully counterfactual

            if factor.modality == "phone":
                suggestions.append(
                    XaiCounterfactual(
                        behavior_change="Increase daily physical activity and reduce late-night screen time.",
                        estimated_impact="Significant" if factor.importance_weight > 0.15 else "Moderate",
                        modality_affected="phone",
                        rationale=(
                            "Screen time and activity patterns are the strongest weighted "
                            "contributors to the Insight Score. Returning activity to baseline "
                            "levels would likely reduce the score."
                        ),
                    )
                )
            elif factor.modality == "vision":
                suggestions.append(
                    XaiCounterfactual(
                        behavior_change="Improve posture and reduce prolonged screen-facing time.",
                        estimated_impact="Moderate",
                        modality_affected="vision",
                        rationale=(
                            "Posture and blink-rate deviations contribute to the visual "
                            "engagement signal. Ergonomic adjustments and screen breaks may help."
                        ),
                    )
                )
            elif factor.modality == "physio":
                suggestions.append(
                    XaiCounterfactual(
                        behavior_change="Engage in light physical activity to stabilise heart-rate patterns.",
                        estimated_impact="Moderate",
                        modality_affected="physio",
                        rationale=(
                            "Heart-rate elevation or movement variance is contributing to "
                            "the physiological signal. Light daily exercise may help normalise this."
                        ),
                    )
                )
            elif factor.modality == "audio":
                suggestions.append(
                    XaiCounterfactual(
                        behavior_change="Maintain regular vocal engagement with family or friends.",
                        estimated_impact="Marginal",
                        modality_affected="audio",
                        rationale=(
                            "Reduced speech engagement or increased silence contributes "
                            "a small portion to the overall score."
                        ),
                    )
                )
            elif factor.modality == "risk_reg":
                suggestions.append(
                    XaiCounterfactual(
                        behavior_change="Review recently installed apps with a trusted adult.",
                        estimated_impact="Significant",
                        modality_affected="risk_reg",
                        rationale=(
                            "Safety-registry matches are high-priority signals. "
                            "Reviewing these with a guardian may resolve the alert."
                        ),
                    )
                )

        return suggestions

    @staticmethod
    def _build_confidence(result: InsightResult) -> XaiConfidence:
        """Per-modality confidence + data completeness."""
        sd = result.modality_scores.to_dict()
        total_modalities = 5
        active = sum(1 for v in sd.values() if v > 0.001)
        missing = [k for k, v in sd.items() if v < 0.001]

        completeness = active / total_modalities

        per_mod = {}
        for key, dev in sd.items():
            if dev > 0.75:
                per_mod[key] = "High"
            elif dev > 0.30:
                per_mod[key] = "Medium"
            elif dev > 0.01:
                per_mod[key] = "Low"
            else:
                per_mod[key] = "No Data"

        if completeness < 0.4:
            uncertainty = "Very limited sensor data — only a subset of modalities are reporting. Interpret with caution."
        elif completeness < 0.7:
            uncertainty = f"Some sensor data is missing. Available: {active}/{total_modalities} modalities."
        else:
            uncertainty = ""

        return XaiConfidence(
            overall=result.confidence,
            data_completeness=round(completeness, 3),
            modality_confidences=per_mod,
            baseline_age_days=BASELINE_WINDOW_DAYS,
            missing_modalities=missing,
            uncertainty_note=uncertainty,
        )

    @staticmethod
    def _build_audience_layers(
        result: InsightResult,
        ranked: list[XaiFactor],
        nl_explanation: str,
        confidence: XaiConfidence,
        counterfactuals: list[XaiCounterfactual],
    ) -> AudienceLayers:
        """Build three-tier audience-specific output layers."""
        top_factor = ranked[0] if ranked else None

        guardian = {
            "headline": (
                f"PRISM Insight Score: {result.insight_score:.0f}/100 — "
                f"{result.tier_label}"
            ),
            "one_liner": (
                f"Your behavioural signals show "
                f"{'no notable changes' if result.insight_score <= 30 else 'some changes'} "
                f"compared to your usual patterns."
            ),
            "primary_signal": (
                f"{top_factor.label}: {top_factor.direction} {top_factor.magnitude_pct:.0f}% "
                f"from baseline"
            ) if top_factor else "All signals within baseline.",
            "what_this_means": nl_explanation,
            "suggested_actions": [
                c.behavior_change for c in counterfactuals[:2]
            ] if counterfactuals else [
                "Continue monitoring. All signals are within expected ranges."
            ],
        }

        clinician = {
            "enhanced_summary": nl_explanation,
            "behavioral_interpretation": (
                "Multi-modal behavioural analysis indicates "
                f"{'pronounced' if result.insight_score >= 81 else 'measurable' if result.insight_score >= 31 else 'no significant'} "
                "deviation from the individual's 14-day rolling baseline. "
                "These are statistical pattern observations, not diagnostic assessments. "
                "PRISM scores reflect unusual behavioural clustering, not clinical severity."
            ),
            "confidence_indicators": {
                "data_completeness": f"{confidence.data_completeness*100:.0f}%",
                "missing_modalities": confidence.missing_modalities,
                "uncertainty_note": confidence.uncertainty_note,
            },
            "contributing_modalities": [
                {
                    "modality": f.label,
                    "deviation_pct": f.magnitude_pct,
                    "direction": f.direction,
                    "importance_weight": f.importance_weight,
                }
                for f in ranked
            ],
        }

        scientist = {
            "feature_importance": {
                f.modality: {
                    "importance_weight": f.importance_weight,
                    "raw_deviation": f.raw_deviation,
                    "confidence": f.confidence,
                }
                for f in ranked
            },
            "model_details": {
                "anomaly_score": result.anomaly_score,
                "fusion_score": result.fusion_score,
                "tier_thresholds": [
                    {"range": f"{lo}-{hi}", "label": label}
                    for lo, hi, label, _ in INSIGHT_TIERS
                ],
            },
            "confidence_metrics": confidence.to_dict(),
            "drift_indicators": {
                "note": (
                    "Drift indicators not yet computed. Requires ≥30 days of "
                    "historical scores for meaningful drift analysis."
                ),
            },
        }

        return AudienceLayers(
            guardian=guardian,
            clinician=clinician,
            scientist=scientist,
        )

    @staticmethod
    def _build_technical_details(result: InsightResult) -> dict:
        """Build the technical details payload for data scientists."""
        return {
            "anomaly_score": round(result.anomaly_score, 4),
            "fusion_score": round(result.fusion_score, 4),
            "insight_score": round(result.insight_score, 1),
            "tier_label": result.tier_label,
            "modality_scores": {
                k: round(v, 4) for k, v in result.modality_scores.to_dict().items()
            },
            "tier_definitions": [
                {"range": f"{lo}-{hi}", "label": label}
                for lo, hi, label, _ in INSIGHT_TIERS
            ],
            "baseline_window_days": BASELINE_WINDOW_DAYS,
        }
