"""
text_screening.py — NALU-powered text signal classifier for PRISM
==================================================================

Adapts the NALU-PTBR 8-head taxonomy for English-language behavioral
text screening within PRISM's companion chat + webhook pipeline.

Produces explainable, non-diagnostic signal scores across:
  1. Sentiment (positive/neutral/negative)
  2. Emotion (9-label intensity)
  3. Psychological cues (11-label)
  4. Behavioral intentions (6-label)
  5. Risk language (4-label)
  6. Clinical markers (5-label)
  7. Russell valence-arousal (2-dim regression)
  8. Psychometric proxies (5-dim normalized)

Every signal includes human-readable "contributing factors" for PRISM's
explainable-alert system (no diagnostic labels).
"""

from __future__ import annotations

import math
from typing import Any

# ===========================================================================
# NALU-aligned English keyword lexicon
# ===========================================================================

EMOTION_KEYWORDS = {
    "joy": [
        "happy",
        "glad",
        "delighted",
        "joyful",
        "wonderful",
        "great",
        "amazing",
        "love",
        "blessed",
        "grateful",
        "thankful",
        "content",
        "pleased",
        "excited",
        "thrilled",
        "elated",
        "cheerful",
        "awesome",
        "fantastic",
    ],
    "sadness": [
        "sad",
        "unhappy",
        "depressed",
        "down",
        "miserable",
        "heartbroken",
        "crying",
        "tears",
        "grief",
        "sorrow",
        "melancholy",
        "despair",
        "devastated",
        "gloomy",
        "dismal",
        "blue",
        "feel empty",
        "numb",
        "hollow",
        "nobody cares",
        "no one cares",
        "all alone",
        "completely alone",
    ],
    "anger": [
        "angry",
        "furious",
        "rage",
        "irritated",
        "annoyed",
        "frustrated",
        "mad",
        "livid",
        "outraged",
        "resentful",
        "bitter",
        "hostile",
        "pissed",
    ],
    "fear": [
        "afraid",
        "scared",
        "fearful",
        "terrified",
        "anxious",
        "worried",
        "dread",
        "panic",
        "frightened",
        "nervous",
        "uneasy",
        "alarmed",
        "paranoid",
        "apprehensive",
        "anxiety",
    ],
    "disgust": [
        "disgust",
        "disgusted",
        "gross",
        "repulsed",
        "sickening",
        "revolting",
    ],
    "surprise": [
        "surprised",
        "shocked",
        "stunned",
        "astonished",
        "unexpected",
    ],
    "calm": [
        "calm",
        "peaceful",
        "relaxed",
        "serene",
        "tranquil",
        "at ease",
        "composed",
        "centered",
        "grounded",
        "chill",
    ],
    "distress": [
        "distressed",
        "overwhelmed",
        "struggling",
        "can't cope",
        "breaking down",
        "falling apart",
        "losing it",
        "too much",
        "can't handle",
        "drowning",
        "suffocating",
        "barely holding on",
        "i can't",
        "i'm so tired",
        "exhausted",
        "drained",
    ],
    "neutral": [
        "okay",
        "fine",
        "alright",
        "meh",
        "whatever",
        "nothing much",
        "same old",
        "not much",
    ],
}

PSYCHOLOGICAL_KEYWORDS = {
    "stress_pressure": [
        "stress",
        "stressed",
        "pressure",
        "overworked",
        "burnout",
        "burned out",
        "overloaded",
        "swamped",
        "deadline",
        "too many demands",
    ],
    "hopelessness": [
        "hopeless",
        "no hope",
        "no future",
        "nothing matters",
        "pointless",
        "giving up",
        "why bother",
        "no point",
        "never get better",
        "no way out",
        "suicidal",
        "end my life",
        "want to die",
        "kill myself",
        "can't go on",
        "can't live",
        "better off dead",
        "not worth living",
    ],
    "self_devaluation": [
        "worthless",
        "useless",
        "failure",
        "not good enough",
        "hate myself",
        "self-hatred",
        "burden",
        "everyone hates me",
        "no one loves me",
        "pathetic",
        "loser",
        "i'm stupid",
        "i suck",
    ],
    "loss_of_control": [
        "losing control",
        "can't control",
        "out of control",
        "helpless",
        "powerless",
        "trapped",
        "no control",
        "spiraling",
    ],
    "social_withdrawal": [
        "isolated",
        "alone",
        "lonely",
        "withdrawn",
        "avoiding people",
        "don't want to see anyone",
        "shut in",
        "isolating",
        "no friends",
        "cut off",
        "pushing people away",
        "leave me alone",
    ],
    "irritability": [
        "irritable",
        "irritated",
        "snappy",
        "on edge",
        "short temper",
        "easily annoyed",
        "agitated",
        "restless",
        "can't sit still",
    ],
    "cognitive_overload": [
        "can't think",
        "brain fog",
        "confused",
        "can't focus",
        "racing thoughts",
        "can't concentrate",
        "mind is blank",
        "scattered",
    ],
    "guilt_shame": [
        "guilty",
        "ashamed",
        "shame",
        "regret",
        "remorse",
        "blame myself",
        "my fault",
        "disgusted with myself",
        "mortified",
    ],
    "resilience_coping": [
        "coping",
        "managing",
        "dealing with",
        "getting through",
        "surviving",
        "hanging in",
        "pushing through",
        "staying strong",
        "adapting",
        "finding ways",
        "working on it",
        "taking steps",
        "getting help",
        "therapy",
        "counseling",
        "trying to",
        "self-care",
    ],
    "self_focus": [
        "i feel",
        "i am",
        "i've been",
        "myself",
        "my life",
        "my mind",
        "personally",
        "for me",
    ],
    "empathy": [
        "i understand",
        "i feel for",
        "i care about",
        "compassion",
        "sympathize",
        "empathize",
        "thinking of others",
        "helping someone",
    ],
}

BEHAVIORAL_KEYWORDS = {
    "hostility": [
        "hate",
        "despise",
        "kill",
        "destroy",
        "attack",
        "fight",
        "enemy",
        "i'll make you",
        "you'll regret",
        "pay for this",
    ],
    "toxicity": [
        "toxic",
        "insult",
        "stupid",
        "idiot",
        "moron",
        "shut up",
        "go to hell",
        "screw you",
        "don't care",
        "i hate",
    ],
    "help_seeking": [
        "help me",
        "need help",
        "please help",
        "can someone",
        "support",
        "therapy",
        "counseling",
        "doctor",
        "appointment",
        "reaching out",
    ],
    "avoidance": [
        "avoid",
        "escape",
        "run away",
        "hide",
        "don't want to deal",
        "ignoring",
        "procrastinating",
        "putting off",
    ],
    "coping": [
        "trying to",
        "working on",
        "getting better",
        "improving",
        "healing",
        "recovery",
        "taking care",
        "self-care",
        "exercise",
        "meditation",
    ],
    "aggression": [
        "hurt",
        "harm",
        "revenge",
        "get back at",
        "make them pay",
        "violence",
        "threaten",
        "destroy them",
    ],
}

RISK_KEYWORDS = {
    "anxiety_language": [
        "anxiety",
        "anxious",
        "panic attack",
        "worrying",
        "worried sick",
        "constant worry",
        "can't stop worrying",
        "overthinking",
        "what if",
        "nervous wreck",
        "on edge",
    ],
    "depression_language": [
        "depression",
        "depressed",
        "major depressive",
        "no energy",
        "can't get out of bed",
        "no motivation",
        "don't enjoy anything",
        "numb",
        "empty",
        "lifeless",
    ],
    "crisis_danger": [
        "crisis",
        "emergency",
        "urgent",
        "suicide",
        "self-harm",
        "hurt myself",
        "hurting myself",
        "hurt me",
        "cutting",
        "overdose",
        "pills",
        "jump off",
        "hang myself",
        "end it all",
        "not safe",
        "danger to myself",
        "danger to others",
        "thinking about hurting",
        "want to hurt",
        "want to die",
        "kill myself",
        "suicidal",
        "end my life",
        "ending it",
        "don't want to live",
    ],
    "risk_flag": [
        "not okay",
        "struggling badly",
        "breaking down",
        "can't go on",
        "paranoid",
        "hearing voices",
        "seeing things",
        "delusions",
        "mania",
        "psychotic",
        "losing my mind",
    ],
}

CLINICAL_KEYWORDS = {
    "grief_loss": [
        "lost",
        "grief",
        "mourning",
        "passed away",
        "died",
        "gone forever",
        "bereavement",
        "missing them",
        "funeral",
        "loss",
    ],
    "sleep_disturbance": [
        "can't sleep",
        "insomnia",
        "nightmares",
        "waking up",
        "no sleep",
        "sleeping too much",
        "exhausted",
        "fatigue",
        "tired all the time",
    ],
    "relationship_distress": [
        "breakup",
        "divorce",
        "fighting with",
        "relationship problems",
        "alone forever",
        "betrayed",
        "cheated on",
        "toxic relationship",
    ],
    "caregiver_burden": [
        "caregiving",
        "taking care of",
        "looking after",
        "caring for parent",
        "burned out from care",
        "caregiver stress",
    ],
    "panic_attack": [
        "panic attack",
        "heart racing",
        "can't breathe",
        "chest tight",
        "dizzy",
        "shaking",
        "sweating",
        "feeling of doom",
        "hyperventilating",
    ],
}

ALL_KEYWORD_MAPS = {
    "emotion": EMOTION_KEYWORDS,
    "psychological": PSYCHOLOGICAL_KEYWORDS,
    "behavioral": BEHAVIORAL_KEYWORDS,
    "risk": RISK_KEYWORDS,
    "clinical": CLINICAL_KEYWORDS,
}

# ===========================================================================
# Screening engine
# ===========================================================================


class TextScreeningResult:
    """Structured screening output — all values are EXPLAINABLE signals, not diagnoses."""

    def __init__(self, text: str):
        self.text = text
        self.emotion: dict[str, float] = {}
        self.psychological: dict[str, float] = {}
        self.behavioral: dict[str, float] = {}
        self.risk: dict[str, float] = {}
        self.clinical: dict[str, float] = {}
        self.sentiment: dict[str, float] = {}
        self.valence: float = 0.0
        self.arousal: float = 0.0
        self.psychometric_proxies: dict[str, float] = {}

        # Composite indices
        self.distress_index: float = 0.0
        self.self_critical_index: float = 0.0
        self.withdrawal_index: float = 0.0
        self.overload_index: float = 0.0
        self.protective_index: float = 0.0
        self.risk_index: float = 0.0

        # Triage
        self.alert_level: str = "LOW"  # LOW, MILD, MODERATE, HIGH
        self.is_crisis: bool = False
        self.contributing_factors: list[str] = []


def _score_keyword_set(text: str, keywords: list[str]) -> float:
    """Score text against a keyword list using sigmoid-like response."""
    text_lower = text.lower()
    weighted_count = 0.0
    for kw in keywords:
        if kw in text_lower:
            weight = 1.0 + min(len(kw) * 0.03, 0.7)
            weighted_count += weight
    if weighted_count == 0:
        return 0.0
    score = 1.0 - math.exp(-weighted_count * 0.8)
    return round(min(score, 1.0), 4)


def screen_text(text: str) -> TextScreeningResult:
    """
    Run full NALU-aligned screening on a text message.

    Returns a TextScreeningResult with explainable signal scores.
    This is NOT diagnostic — it reports behavioral language signals
    relative to keyword baselines.
    """
    result = TextScreeningResult(text)

    # ---- Score all heads ----
    result.emotion = {
        k: _score_keyword_set(text, v) for k, v in EMOTION_KEYWORDS.items()
    }
    result.psychological = {
        k: _score_keyword_set(text, v) for k, v in PSYCHOLOGICAL_KEYWORDS.items()
    }
    result.behavioral = {
        k: _score_keyword_set(text, v) for k, v in BEHAVIORAL_KEYWORDS.items()
    }
    result.risk = {k: _score_keyword_set(text, v) for k, v in RISK_KEYWORDS.items()}
    result.clinical = {
        k: _score_keyword_set(text, v) for k, v in CLINICAL_KEYWORDS.items()
    }

    # ---- Sentiment ----
    pos_score = result.emotion.get("joy", 0) + result.emotion.get("calm", 0)
    neg_score = (
        result.emotion.get("sadness", 0)
        + result.emotion.get("fear", 0)
        + result.emotion.get("distress", 0)
        + result.emotion.get("anger", 0)
    )
    total = pos_score + neg_score + 0.5
    result.sentiment = {
        "positive": round(pos_score / total, 4),
        "negative": round(neg_score / total, 4),
        "neutral": round(0.5 / total, 4),
    }
    # Normalize
    s = sum(result.sentiment.values())
    if s > 0:
        result.sentiment = {k: round(v / s, 4) for k, v in result.sentiment.items()}

    # ---- Russell dimensions ----
    valence = (pos_score - neg_score) / (total + 0.01)
    arousal = (
        neg_score * 0.7
        + result.emotion.get("fear", 0) * 0.3
        + result.emotion.get("anger", 0) * 0.3
    )
    result.valence = round(float(math.tanh(valence * 3)), 4)
    result.arousal = round(float(math.tanh(arousal * 2)), 4)

    # ---- Psychometric proxies (normalized 0-1) ----
    result.psychometric_proxies = {
        "phq9_proxy": round(
            min(
                result.emotion.get("sadness", 0) * 1.2
                + result.risk.get("depression_language", 0) * 0.8
                + result.risk.get("crisis_danger", 0) * 0.5,
                1.0,
            ),
            4,
        ),
        "gad7_proxy": round(
            min(
                result.emotion.get("fear", 0) * 1.2
                + result.risk.get("anxiety_language", 0) * 0.8,
                1.0,
            ),
            4,
        ),
        "dass_depression_proxy": round(
            min(
                result.emotion.get("sadness", 0) * 1.3
                + result.psychological.get("hopelessness", 0) * 0.7,
                1.0,
            ),
            4,
        ),
        "dass_anxiety_proxy": round(
            min(
                result.emotion.get("fear", 0) * 1.3
                + result.risk.get("anxiety_language", 0) * 0.7,
                1.0,
            ),
            4,
        ),
        "dass_stress_proxy": round(
            min(
                result.psychological.get("stress_pressure", 0) * 1.3
                + result.emotion.get("distress", 0) * 0.5,
                1.0,
            ),
            4,
        ),
    }

    # ---- Composite indices ----
    result.distress_index = round(
        float(
            result.sentiment.get("negative", 0) * 0.3
            + result.emotion.get("distress", 0) * 0.5
            + result.emotion.get("sadness", 0) * 0.3
            + result.psychological.get("stress_pressure", 0) * 0.2
        ),
        4,
    )

    result.self_critical_index = round(
        float(
            result.psychological.get("self_devaluation", 0) * 0.5
            + result.psychological.get("guilt_shame", 0) * 0.4
            + result.psychological.get("hopelessness", 0) * 0.3
        ),
        4,
    )

    result.withdrawal_index = round(
        float(
            result.psychological.get("social_withdrawal", 0) * 0.5
            + result.behavioral.get("avoidance", 0) * 0.4
        ),
        4,
    )

    result.overload_index = round(
        float(
            result.psychological.get("stress_pressure", 0) * 0.4
            + result.psychological.get("cognitive_overload", 0) * 0.4
            + result.psychological.get("loss_of_control", 0) * 0.3
        ),
        4,
    )

    result.protective_index = round(
        float(
            result.psychological.get("resilience_coping", 0) * 0.4
            + result.behavioral.get("coping", 0) * 0.4
            + result.behavioral.get("help_seeking", 0) * 0.3
            + result.psychological.get("empathy", 0) * 0.2
        ),
        4,
    )

    result.risk_index = round(
        float(
            result.risk.get("crisis_danger", 0) * 0.5
            + result.risk.get("risk_flag", 0) * 0.4
            + result.psychological.get("hopelessness", 0) * 0.4
            + result.risk.get("depression_language", 0) * 0.2
        ),
        4,
    )

    # ---- Triage / alert level ----
    if result.risk_index >= 0.5 or result.risk.get("crisis_danger", 0) >= 0.35:
        result.alert_level = "HIGH"
        result.is_crisis = True
    elif result.risk_index >= 0.25 or result.distress_index >= 0.45:
        result.alert_level = "MODERATE"
    elif result.risk_index >= 0.1 or result.distress_index >= 0.25:
        result.alert_level = "MILD"
    else:
        result.alert_level = "LOW"

    # ---- Contributing factors (explainable) ----
    factors = []

    # Risk signals
    for cat, scores in [
        ("Risk", result.risk),
        ("Emotion", result.emotion),
        ("Psychological", result.psychological),
    ]:
        high_signals = [(k, v) for k, v in scores.items() if v >= 0.4]
        for name, score in sorted(high_signals, key=lambda x: -x[1])[:3]:
            readable = name.replace("_", " ").title()
            threshold_pct = round(score * 100)
            factors.append(f"{readable} language signal at {threshold_pct}% intensity")

    # Protective factors (positive signals)
    protective_sigs = [
        (k, v)
        for k, v in [
            ("resilience_coping", result.psychological.get("resilience_coping", 0)),
            ("coping", result.behavioral.get("coping", 0)),
            ("help_seeking", result.behavioral.get("help_seeking", 0)),
        ]
        if v >= 0.3
    ]
    if protective_sigs:
        names = ", ".join(n.replace("_", " ").title() for n, _ in protective_sigs)
        factors.append(f"Protective factors detected: {names}")

    # Valence/Arousal context
    if result.valence < -0.3:
        factors.append(
            f"Language valence is negative ({result.valence:+.2f}), indicating emotional distress tone"
        )
    if result.arousal > 0.4:
        factors.append(
            f"Language arousal is elevated ({result.arousal:+.2f}), indicating heightened activation"
        )

    # Add specific clinical red-flags as factors
    if result.risk.get("crisis_danger", 0) >= 0.3:
        factors.insert(
            0,
            "CRITICAL: Crisis/danger language detected — immediate human escalation required",
        )

    result.contributing_factors = factors

    return result


# ===========================================================================
# Crisis-only check (fast path for pre-persona routing)
# ===========================================================================


def is_crisis_message(text: str) -> bool:
    """Fast pre-screen — returns True if crisis language is detected."""
    crisis_kws = RISK_KEYWORDS["crisis_danger"] + RISK_KEYWORDS["risk_flag"]
    text_lower = text.lower()
    crisis_hit = False
    for kw in crisis_kws:
        if kw in text_lower:
            crisis_hit = True
            break
    if not crisis_hit:
        return False

    # Confirm with full screening
    result = screen_text(text)
    return result.is_crisis or result.risk_index >= 0.4


# ===========================================================================
# Structured screening for alert generation
# ===========================================================================


def screen_for_alert(text: str, device_id: str) -> dict[str, Any]:
    """
    Full screening with PRISM-alert-compatible payload.

    Returns a dict suitable for feeding into PRISM's Alert model.
    All values are explainable behavioral signals, not clinical diagnoses.
    """
    result = screen_text(text)

    # Map alert level to PRISM severity tiers
    severity_map = {
        "LOW": "sage",
        "MILD": "sage",
        "MODERATE": "amber",
        "HIGH": "red",
    }
    severity = severity_map.get(result.alert_level, "sage")

    # Build PRISM-compatible summary
    if result.is_crisis:
        plain_language_summary = (
            "Crisis language detected in companion chat. "
            f"Distress index: {result.distress_index:.2f}, Risk index: {result.risk_index:.2f}. "
            "Companion session escalated — crisis protocol activated."
        )
    elif result.alert_level == "MODERATE":
        plain_language_summary = (
            "Elevated behavioral language signals in companion chat. "
            f"Distress: {result.distress_index:.2f}, Risk: {result.risk_index:.2f}. "
            f"Protective factors: {result.protective_index:.2f}. "
            "Monitoring recommended; no immediate crisis indicators."
        )
    elif result.alert_level == "MILD":
        plain_language_summary = (
            "Mild behavioral language variations detected. "
            f"Distress: {result.distress_index:.2f}. "
            "Within expected conversational range."
        )
    else:
        plain_language_summary = (
            f"Language screening within baseline. Protective index: {result.protective_index:.2f}. "
            "No concerning signals detected."
        )

    return {
        "device_id": device_id,
        "signal_type": "text_screening",
        "severity_tier": severity,
        "is_crisis": result.is_crisis,
        "alert_level": result.alert_level,
        "plain_language_summary": plain_language_summary,
        "contributing_factors": result.contributing_factors,
        "composite_indices": {
            "distress": result.distress_index,
            "self_critical": result.self_critical_index,
            "withdrawal": result.withdrawal_index,
            "overload": result.overload_index,
            "protective": result.protective_index,
            "risk": result.risk_index,
        },
        "emotion_signals": result.emotion,
        "valence": result.valence,
        "arousal": result.arousal,
        "psychometric_proxies": result.psychometric_proxies,
    }
