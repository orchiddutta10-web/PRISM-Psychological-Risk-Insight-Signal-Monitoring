"""
Phase 11 — XAI Engine Tests
"""

import numpy as np
import pytest

from app.utils.prism_ml_engine import (
    FusionEngine,
    InsightResult,
    ModalityScores,
)
from app.utils.xai_engine import (
    AudienceLayers,
    ExplanationResult,
    XaiConfidence,
    XaiCounterfactual,
    XaiEngine,
    XaiFactor,
    XaiTimelineEvent,
)


# ── Helper ──────────────────────────────────────────────────────────────


def _make_result(score: float = 50.0) -> InsightResult:
    """Create a synthetic InsightResult for testing."""
    return InsightResult(
        subject_id="test-subject",
        insight_score=score,
        tier_label=(
            "Baseline" if score <= 30
            else "Behavioural change observed" if score <= 60
            else "Multiple unusual signals" if score <= 80
            else "High-priority pattern"
        ),
        tier_summary="Test tier summary",
        anomaly_score=score / 100.0,
        modality_scores=ModalityScores(
            phone=0.5, vision=0.3, physio=0.15, audio=0.05, risk_reg=0.0
        ),
        fusion_score=score / 100.0,
        contributing_factors=["Test factor 1", "Test factor 2"],
        confidence=0.8,
    )


# ════════════════════════════════════════════════════════════════════════


class TestXaiFactor:
    def test_to_dict(self):
        f = XaiFactor(
            modality="phone",
            label="Screen Time",
            direction="↑↑",
            magnitude_pct=68.0,
            importance_weight=0.31,
            confidence="High",
            raw_deviation=0.68,
            comparison_text="Compared to 14-day baseline.",
        )
        d = f.to_dict()
        assert d["modality"] == "phone"
        assert d["direction"] == "↑↑"
        assert d["magnitude_pct"] == 68.0
        assert d["confidence"] == "High"


class TestXaiTimelineEvent:
    def test_to_dict(self):
        e = XaiTimelineEvent(
            day_offset=5,
            event_type="modality_shift",
            description="Sleep decreased.",
            insight_score=65.0,
            tier_label="Behavioural change observed",
        )
        d = e.to_dict()
        assert d["day_offset"] == 5
        assert d["tier_label"] == "Behavioural change observed"


class TestXaiCounterfactual:
    def test_is_always_hypothetical(self):
        c = XaiCounterfactual(
            behavior_change="Walk more",
            estimated_impact="Moderate",
            modality_affected="phone",
            rationale="Activity affects score.",
        )
        assert c.is_hypothetical is True
        assert "is_hypothetical" in c.to_dict()


class TestXaiConfidence:
    def test_to_dict(self):
        c = XaiConfidence(
            overall=0.85,
            data_completeness=0.90,
            modality_confidences={"phone": "High"},
            baseline_age_days=14,
            missing_modalities=["audio"],
            uncertainty_note="Audio data missing.",
        )
        d = c.to_dict()
        assert d["overall"] == 0.85
        assert d["missing_modalities"] == ["audio"]


class TestAudienceLayers:
    def test_filter_guardian(self):
        layers = AudienceLayers(
            guardian={"headline": "Guardian view"},
            clinician={"clinical_notes": "Clinician detail"},
            scientist={"features": "ML features"},
        )
        result = layers.filter("guardian")
        assert result["headline"] == "Guardian view"
        assert "clinical_notes" not in result

    def test_filter_clinician_gets_guardian_plus_clinical(self):
        layers = AudienceLayers(
            guardian={"headline": "Guardian view"},
            clinician={"clinical_notes": "Clinician detail"},
            scientist={"features": "ML features"},
        )
        result = layers.filter("clinician")
        assert result["headline"] == "Guardian view"
        assert result["clinical_notes"] == "Clinician detail"
        assert "features" not in result

    def test_filter_scientist_gets_all(self):
        layers = AudienceLayers(
            guardian={"headline": "Guardian view"},
            clinician={"clinical_notes": "Clinician detail"},
            scientist={"features": "ML features"},
        )
        result = layers.filter("scientist")
        assert result["headline"] == "Guardian view"
        assert result["clinical_notes"] == "Clinician detail"
        assert result["features"] == "ML features"

    def test_filter_unknown_falls_back_to_guardian(self):
        layers = AudienceLayers(
            guardian={"headline": "Guardian view"},
            clinician={"clinical_notes": "Clinician detail"},
        )
        result = layers.filter("unknown")
        assert result["headline"] == "Guardian view"
        assert "clinical_notes" not in result


class TestExplanationResult:
    def test_to_dict(self):
        confidence = XaiConfidence(
            overall=0.8, data_completeness=1.0,
            modality_confidences={}, baseline_age_days=14,
            missing_modalities=[], uncertainty_note="",
        )
        explanation = ExplanationResult(
            risk_score=55.0,
            risk_level="Behavioural change observed",
            summary="A summary.",
            confidence=confidence,
            observation_window="14 days",
            baseline_comparison="vs 14-day baseline",
            ranked_factors=[
                XaiFactor("phone", "Phone", "↑↑", 68.0, 0.35, "High", 0.68, "test"),
            ],
            timeline=[
                XaiTimelineEvent(3, "modality_shift", "test", 50.0, "Baseline"),
            ],
            counterfactuals=[
                XaiCounterfactual("Walk more", "Moderate", "phone", "reason"),
            ],
            technical_details={"key": "value"},
        )
        d = explanation.to_dict()
        assert "ranked_factors" in d
        assert "timeline" in d
        assert "counterfactuals" in d
        assert len(d["ranked_factors"]) == 1

    def test_filter_audience_hides_technical_for_guardian(self):
        confidence = XaiConfidence(
            overall=0.8, data_completeness=1.0,
            modality_confidences={}, baseline_age_days=14,
            missing_modalities=[], uncertainty_note="",
        )
        explanation = ExplanationResult(
            risk_score=50.0, risk_level="Baseline", summary="ok",
            confidence=confidence, observation_window="14d",
            baseline_comparison="vs baseline",
            technical_details={"secret": "data"},
        )
        filtered = explanation.filter_audience("guardian")
        assert filtered.technical_details == {}


# ════════════════════════════════════════════════════════════════════════


class TestXaiEngine:
    def test_rank_factors_ordered_by_deviation(self):
        result = _make_result()
        ranked = XaiEngine._rank_factors(result.modality_scores)
        assert len(ranked) == 5
        # First should be phone (highest deviation = 0.5)
        assert ranked[0].modality == "phone"
        assert ranked[0].importance_weight > 0

    def test_rank_factors_handles_all_zeros(self):
        scores = ModalityScores()
        ranked = XaiEngine._rank_factors(scores)
        assert len(ranked) == 5
        for f in ranked:
            assert f.magnitude_pct == 0.0

    def test_direction_mapping(self):
        assert XaiEngine._get_direction(0.05) == "→"
        assert XaiEngine._get_direction(0.20) == "↑"
        assert XaiEngine._get_direction(0.40) == "↑↑"
        assert XaiEngine._get_direction(0.80) == "↑↑↑"

    def test_explain_produces_all_fields(self):
        result = _make_result(55.0)
        explanation = XaiEngine.explain(result)
        assert explanation.risk_score == 55.0
        assert len(explanation.ranked_factors) == 5
        assert explanation.observation_window == "Previous 14 days"
        assert explanation.summary != ""
        assert explanation.confidence.overall > 0
        assert len(explanation.timeline) > 0
        assert len(explanation.counterfactuals) >= 0

    def test_explain_baseline_has_no_timeline_events(self):
        result = _make_result(15.0)
        explanation = XaiEngine.explain(result)
        # Baseline (<30) produces no threshold_cross event
        for event in explanation.timeline:
            assert event.event_type != "threshold_cross"

    def test_explain_high_priority_has_timeline_threshold(self):
        result = _make_result(85.0)
        explanation = XaiEngine.explain(result)
        has_threshold = any(e.event_type == "threshold_cross" for e in explanation.timeline)
        assert has_threshold

    def test_natural_language_baseline(self):
        result = _make_result(10.0)
        ranked = XaiEngine._rank_factors(result.modality_scores)
        confidence = XaiEngine._build_confidence(result)
        nl = XaiEngine._build_natural_language(result, ranked, confidence)
        assert "consistent" in nl.lower()
        assert "personal patterns" in nl.lower()

    def test_natural_language_high_priority(self):
        result = _make_result(90.0)
        ranked = XaiEngine._rank_factors(result.modality_scores)
        confidence = XaiEngine._build_confidence(result)
        nl = XaiEngine._build_natural_language(result, ranked, confidence)
        assert "does NOT indicate a diagnosis" in nl
        assert "guardian review" in nl.lower()

    def test_counterfactuals_from_high_deviation(self):
        result = _make_result(75.0)
        ranked = XaiEngine._rank_factors(result.modality_scores)
        counter = XaiEngine._build_counterfactuals(ranked)
        assert len(counter) > 0
        for c in counter:
            assert c.is_hypothetical is True
            assert c.estimated_impact in ["Significant", "Moderate", "Marginal"]

    def test_counterfactuals_empty_for_low_deviation(self):
        # Scores near zero — no counterfactuals should trigger
        scores = ModalityScores(phone=0.05, vision=0.03, physio=0.02, audio=0.01, risk_reg=0.0)
        result = _make_result(5.0)
        result.modality_scores = scores
        ranked = XaiEngine._rank_factors(scores)
        counter = XaiEngine._build_counterfactuals(ranked)
        assert len(counter) == 0  # all magnitudes < 15%

    def test_confidence_all_modalities_present(self):
        # All modalities above threshold → completeness = 1.0
        scores = ModalityScores(phone=0.5, vision=0.3, physio=0.15, audio=0.05, risk_reg=0.01)
        result = _make_result(50.0)
        result.modality_scores = scores
        conf = XaiEngine._build_confidence(result)
        assert conf.data_completeness == 1.0
        assert conf.missing_modalities == []

    def test_confidence_with_missing(self):
        result = _make_result(50.0)
        result.modality_scores = ModalityScores(phone=0.5)  # only phone
        conf = XaiEngine._build_confidence(result)
        assert conf.data_completeness < 1.0
        assert len(conf.missing_modalities) == 4

    def test_audience_layers_produced(self):
        result = _make_result(50.0)
        ranked = XaiEngine._rank_factors(result.modality_scores)
        conf = XaiEngine._build_confidence(result)
        nl = XaiEngine._build_natural_language(result, ranked, conf)
        counter = XaiEngine._build_counterfactuals(ranked)
        layers = XaiEngine._build_audience_layers(result, ranked, nl, conf, counter)
        assert layers.guardian.get("headline")
        assert layers.clinician.get("behavioral_interpretation")
        assert layers.scientist.get("feature_importance")

    def test_technical_details(self):
        result = _make_result(50.0)
        details = XaiEngine._build_technical_details(result)
        assert "anomaly_score" in details
        assert "fusion_score" in details
        assert "tier_definitions" in details


# ════════════════════════════════════════════════════════════════════════


class TestNonDiagnosticConstraint:
    """Verify Phase 11 XAI never produces diagnostic labels."""

    def test_xai_output_contains_no_clinical_terms(self):
        prohibited = {"healthy", "depressed", "suicidal", "mentally ill",
                       "depression", "anxiety", "clinical diagnosis", "disorder"}
        result = _make_result(75.0)
        explanation = XaiEngine.explain(result)
        combined = (
            f"{explanation.summary} "
            f"{' '.join(f.comparison_text for f in explanation.ranked_factors)} "
            f"{' '.join(c.rationale for c in explanation.counterfactuals)} "
            f"{' '.join(e.description for e in explanation.timeline)}"
        ).lower()
        for word in prohibited:
            assert word not in combined, f"Prohibited term '{word}' found in XAI output"

    def test_counterfactuals_never_claim_certainty(self):
        result = _make_result(65.0)
        ranked = XaiEngine._rank_factors(result.modality_scores)
        counter = XaiEngine._build_counterfactuals(ranked)
        for c in counter:
            assert "would" in c.estimated_impact.lower() or c.is_hypothetical
            assert "will" not in c.rationale.lower()  # no guarantees