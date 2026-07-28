# Phase 10 — PRISM ML Engine (Day 3)

> **Status**: Research Prototype. Not a diagnostic tool. Scores indicate unusual multimodal behavioural patterns only.
> **Human review is required before any intervention.**

---

## System Architecture — Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SENSOR & EDGE LAYER                              │
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Android  │  │ ESP32    │  │ RPi Cam  │  │ RPi Mic  │  │ Companion│ │
│  │ Phone    │  │ PRISM    │  │ (Media-  │  │ (16kHz   │  │ Chat     │ │
│  │ Events   │  │ PULSE    │  │  Pipe)   │  │  mono)   │  │ Webhooks │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│       │             │             │             │             │        │
│       ▼             ▼             ▼             ▼             ▼        │
│  PhoneEvent    SensorReading  VisionFeature  AudioFeature  RiskRegistry│
│  (screen,app)  (bpm,g_force) (blink,slouch) (speech,sil)  (hits)      │
└───────┬─────────┬─────────────┬─────────────┬─────────────┬───────────┘
        │         │             │             │             │
        └─────────┴──────┬──────┴──────┬──────┴──────┬──────┘
                         │             │             │
                         ▼             ▼             ▼
              ┌──────────────────────────────────────────┐
              │        FEATURE VECTOR BUILDER            │
              │  (FeatureVectorBuilder, 16-dimensional)  │
              │                                          │
              │  [0]  total_active_mins                  │
              │  [1]  sleep_hours_proxy                  │
              │  [2]  avg_bpm                            │
              │  [3]  bpm_std                            │
              │  [4]  avg_g_force                        │
              │  [5]  g_force_std                        │
              │  [6]  avg_blink_rate_bpm                 │
              │  [7]  blink_rate_std                     │
              │  [8]  slouch_ratio                       │
              │  [9]  avg_speech_segments                │
              │  [10] speech_segments_std                │
              │  [11] avg_silence_ratio                  │
              │  [12] silence_ratio_std                  │
              │  [13] screen_on_count                    │
              │  [14] unique_app_count                   │
              │  [15] night_activity_ratio               │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │     MODEL A: ISOLATION FOREST             │
              │     (per-subject, unsupervised)           │
              │                                          │
              │  Input:  16-dim feature vector            │
              │  Output: Anomaly Score [0, 1]             │
              │                                          │
              │  Hyperparameters:                         │
              │    n_estimators = 150                     │
              │    contamination = 0.10                   │
              │    max_samples = auto                     │
              │                                          │
              │  Training: fitted on subject's last       │
              │  14 days of windowed feature vectors      │
              │  (min 5 windows required)                 │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │   MODALITY DEVIATION SCORER               │
              │   (per-modality z-score deviations)       │
              │                                          │
              │  Phone   ← features [0,1,13,14,15]       │
              │  Vision  ← features [6,7,8]              │
              │  Physio  ← features [2,3,4,5]            │
              │  Audio   ← features [9,10,11,12]         │
              │  RiskReg ← RiskRegistryHit query          │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │   MODEL B: RULE-BASED FUSION ENGINE       │
              │                                          │
              │  Risk Score =                            │
              │    Phone   × 0.35                        │
              │  + Vision  × 0.25                        │
              │  + Physio  × 0.20                        │
              │  + Audio   × 0.10                        │
              │  + RiskReg × 0.10                        │
              │                                          │
              │  ⚠ Weights are prototype demonstration   │
              │    values only. NOT clinically validated. │
              │    Intended solely for demonstrating      │
              │    multimodal signal fusion.              │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │     PRISM INSIGHT SCORE                   │
              │     (0–100 with interpretation)           │
              │                                          │
              │   0–30   Baseline                         │
              │   31–60  Behavioural change observed      │
              │   61–80  Multiple unusual signals          │
              │   81–100 High-priority pattern             │
              │                                          │
              │  NEVER outputs:                           │
              │    - Healthy                              │
              │    - Depressed                            │
              │    - Suicidal                             │
              │    - Mentally ill                         │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │     DATABASE PERSISTENCE                   │
              │                                          │
              │  RiskScoreV2 (score_value, risk_level,    │
              │               contributing_factors)       │
              │  AlertV2     (summary, is_read)           │
              │  AuditLogEntry (immutable audit trail)    │
              └────────────────┬─────────────────────────┘
                               │
                               ▼
              ┌──────────────────────────────────────────┐
              │     DASHBOARD VISUALIZATION                │
              │                                          │
              │  ┌──────────────────────────────────┐    │
              │  │  PRISM Insight Score: 47 / 100    │    │
              │  │  Behavioural change observed      │    │
              │  │                                    │    │
              │  │  Contributing factors:             │    │
              │  │  - Phone Behaviour: Screen time    │    │
              │  │    patterns shifted vs baseline    │    │
              │  │  - Visual Engagement: Changes in   │    │
              │  │    blink rate or posture           │    │
              │  │                                    │    │
              │  │  Modality Breakdown:               │    │
              │  │  Phone  ████████░░  0.63          │    │
              │  │  Vision ██████░░░░  0.45          │    │
              │  │  Physio ███░░░░░░░  0.12          │    │
              │  │  Audio  ██░░░░░░░░  0.08          │    │
              │  │  Risk   ░░░░░░░░░░  0.00          │    │
              │  └──────────────────────────────────┘    │
              └──────────────────────────────────────────┘
```

---

## MODEL A — Isolation Forest

### Why Isolation Forest

Isolation Forest is the appropriate choice for per-subject behavioural anomaly detection because:

1. **Unsupervised** — no labelled "concerning" data exists for individual teens, and it would be ethically problematic to create. IF learns what is *normal for this specific person* then flags departures.

2. **Sub-linear complexity** — O(n log n) training, suitable for per-subject models on constrained infrastructure.

3. **Interpretable decision boundary** — anomalies are isolated with fewer random splits, meaning the path length directly maps to a score. This supports the "contributing factors" explainability requirement.

4. **Robust to irrelevant features** — the random subspace sampling at each split naturally handles the heterogeneous feature space (BPM, blink rate, screen events).

5. **Small-sample tolerant** — works with as few as 5 windows of history, enabling personalization after a short observation period.

6. **Already in the project tech stack** — Scikit-Learn Isolation Forest is already used in the existing app-usage model (`ml_engine.py`) and in `train_models.py`.

### Expected Feature Preprocessing

| Step | Method | Purpose |
|:---|:---|:---|
| 1. Aggregation | Rolling 24h windows from raw table events | Convert sparse per-event data into consistent feature vectors |
| 2. Missing-value imputation | Column-mean imputation per subject | Handle missing modalities (e.g., no vision data when camera offline) |
| 3. Standardization | `StandardScaler` (zero mean, unit variance) | BPM (range ~50–120) and screen counts (range ~0–500) must be on comparable scales |
| 4. Subject isolation | Per-subject scaler and model | Each teen's "normal" looks different; a global model would have poor precision |

### Training Workflow

```
1. Query BehaviorWindow rows for subject (last 14 days)
2. For each window, build 16-dim feature vector from:
   - BehaviorWindow aggregates
   - SensorReading (BPM, g_force) within window
   - VisionFeature (blink rate, slouch) within window
   - AudioFeature (speech segments, silence) within window
   - PhoneEvent (screen on, apps, night ratio) within window
3. Impute NaN columns with per-column mean across subject's windows
4. StandardScaler.fit() on subject's historical vectors
5. IsolationForest(n_estimators=150, contamination=0.10).fit() on scaled data
6. Persist fitted model + scaler to disk (joblib) for reuse across restarts
```

**Minimum requirement**: 5 behaviour windows (≈5 days) before first fit.

### Inference Workflow

```
1. Build current feature vector from most recent window + surrounding raw events
2. Impute missing values using subject's historical column means
3. Transform with subject's StandardScaler
4. model.score_samples() → raw anomaly score (more negative = more anomalous)
5. Invert and scale to [0, 1]
6. Return anomaly score
```

### Example Anomaly Score Generation

| Scenario | Feature Characteristics | Anomaly Score |
|:---|:---|:---|
| Normal day matching baseline | All features within 1σ of mean | 0.05 – 0.15 |
| One modality slightly off (e.g., less sleep) | Sleep hours 2σ below mean, rest normal | 0.20 – 0.40 |
| Two modalities deviate (low movement + low BPM) | Active mins and BPM both 2σ out | 0.45 – 0.65 |
| Multi-modal extreme deviation | Most features 3σ+ from baseline | 0.75 – 0.95 |

### Advantages

- Personalizes to each subject — no one-size-fits-all threshold
- Degrades gracefully with missing modalities (imputation handles gaps)
- Naturally handles the multi-modal nature of the data (16 features from 5 sources)
- Proven in intrusion detection, fraud detection, and behavioural monitoring use cases
- Low computational cost per scoring event (single tree traversal)

### Prototype Limitations

- Assumes stationary baseline — if a teen's behaviour genuinely shifts over months, the 14-day window may flag normal adaptation as anomalous. Re-fitting is needed.
- No temporal sequence modelling — each window is scored independently; a trend over 3 days of gradually decreasing activity may score lower than a single-day spike even though the trend is more concerning.
- Contamination=0.10 is an assumption — in a real deployment with ground-truth labels, this would be tuned.
- 16 features is a simplification — many more could be extracted from the raw data streams.

---

## MODEL B — Rule-Based Fusion Engine

### Purpose

Combine five modality-level deviation scores into a single risk score via weighted linear fusion. This is the multimodal signal integration step that answers: "are multiple independent systems flagging concern simultaneously?"

### Inputs

| Modality | Source | Weight |
|:---|:---|:---|
| **Phone Behaviour** (0.35) | Screen time, app diversity, night activity ratio, sleep proxy, active minutes | 0.35 |
| **Vision/CV** (0.25) | Blink rate deviation, slouch ratio, presence pattern shifts | 0.25 |
| **Physiology** (0.20) | BPM mean/std, g-force mean/std from ESP32 PRISM PULSE | 0.20 |
| **Audio** (0.10) | Speech segment count/std, silence ratio/std from RPi mic | 0.10 |
| **Risk Registry** (0.10) | Recent RiskRegistryHit severity-weighted count | 0.10 |

### Weight Justification (prototype rationale)

- **Phone (0.35)** — highest weight because behavioural metadata from the phone (screen time, sleep disruption, app usage) has the strongest established correlation with wellbeing pattern shifts in the research literature. Also the most reliable data stream.
- **Vision (0.25)** — computer vision features (blink rate, posture, presence) provide a meaningful independent signal about engagement at the computer/study station.
- **Physio (0.20)** — wearable vitals are the most direct physiological measure but the ESP32 prototype signal is noisier than medical-grade wearables.
- **Audio (0.10)** — acoustic features are secondary; voice is captured only when the teen is speaking near the RPi, making it the sparsest modality.
- **Risk Registry (0.10)** — binary/severity hits only; kept at low weight to avoid over-triggering on false-positive app matches.

> **⚠️ These weights are prototype demonstration values only. They are NOT clinically validated. They are intended solely for demonstrating multimodal signal fusion. Empirical validation (e.g., logistic regression coefficient estimation on labelled outcomes, or domain-expert elicitation) is required before any operational use.**

### Fusion Formula

```
Risk_Score = clamp(Phone×0.35 + Vision×0.25 + Physio×0.20 + Audio×0.10 + RiskReg×0.10, 0, 1)
```

---

## OUTPUT INTERPRETATION — PRISM Insight Score

### Scale

The fusion score (0–1) is linearly scaled to 0–100 (with slight non-linear emphasis at the high end to ensure extreme multi-modal deviations push into the 81–100 tier).

### Interpretation Tiers

| Score Range | Label | Behavioural Meaning |
|:---|:---|:---|
| **0–30** | Baseline | Behavioural metrics aligned with established personal patterns. |
| **31–60** | Behavioural change observed | One or more modalities show deviation from personal baseline. |
| **61–80** | Multiple unusual signals | Several independent behavioural and physiological signals deviate concurrently. |
| **81–100** | High-priority pattern | A pronounced, multi-modal behavioural shift has been detected. Requires guardian review. |

### Prohibited Outputs (enforced by design)

The system is architecturally incapable of outputting clinical or diagnostic labels. The feature vector contains **no** content data (no message text, no audio, no video). The output labels describe statistical deviation from a personal pattern only. The following are **never** output:

- Healthy / Unhealthy
- Depressed / Depression
- Suicidal / Suicide risk
- Mentally ill / Psychiatric disorder
- Any DSM-5 or ICD-11 category

---

## IMPLEMENTATION DETAILS

### Recommended Python Libraries

| Library | Version | Purpose |
|:---|:---|:---|
| `scikit-learn` | ≥1.3 | IsolationForest, StandardScaler |
| `numpy` | ≥1.24 | Feature vector manipulation |
| `joblib` | ≥1.3 | Model persistence |
| `sqlalchemy` | ≥2.0 | Database ORM (existing) |

All are already in `services/api/requirements.txt`.

### Example Feature Vector

```python
# Shape: (16,)
# Values after StandardScaler transformation (z-scores)
exemplar = np.array([
     0.12,   # total_active_mins         (slightly above mean)
    -0.05,   # sleep_hours_proxy         (slightly below mean)
    -2.10,   # avg_bpm                    (unusually low BPM)
     1.80,   # bpm_std                    (high BPM variability)
     0.30,   # avg_g_force                (normal movement)
     0.20,   # g_force_std                (normal movement variance)
     0.85,   # avg_blink_rate_bpm         (elevated blinking)
     0.90,   # blink_rate_std             (variable blinking)
     2.50,   # slouch_ratio               (significantly more slouching)
    -0.40,   # avg_speech_segments        (slightly fewer vocalizations)
     0.10,   # speech_segments_std        (normal speech variation)
     1.30,   # avg_silence_ratio          (more silence than usual)
     0.80,   # silence_ratio_std          (variable silence)
     1.75,   # screen_on_count            (more screen activations)
    -0.20,   # unique_app_count           (slightly fewer apps)
     1.50,   # night_activity_ratio       (more activity 00:00–06:00)
])
```

This exemplar would produce:
- **Anomaly score**: ~0.72 (BPM and slouch both extreme)
- **Phone modality**: ~0.55 (screen + night elevate this)
- **Vision modality**: ~0.85 (blink + slouch strongly elevated)
- **Physio modality**: ~0.68 (BPM signals elevated)
- **Audio modality**: ~0.38 (moderate silence deviations)
- **Fusion score**: 0.55 → **Insight Score: 55** → *Behavioural change observed*

### Isolation Forest Hyperparameters (Prototype)

| Parameter | Value | Rationale |
|:---|:---|:---|
| `n_estimators` | 150 | Balances stability (more trees = smoother scores) with compute (per-subject model) |
| `contamination` | 0.10 | Assumes ~10% of windows may be unusual; conservative for a monitoring prototype |
| `max_samples` | auto (256) | Default; sufficient for 14–30 window history |
| `random_state` | 42 | Reproducibility |

### Normalization Strategy

1. **Per-subject StandardScaler**: Each subject's historical feature vectors are used to compute μ and σ per feature.
2. **Z-score normalization**: `(x - μ) / σ` for each feature.
3. **StandardScaler** is re-fitted whenever the model is re-fitted (recommended: every 7 days of new data, or every new window if resources permit).
4. Features are standardized before Isolation Forest scoring AND before modality deviation scoring.

### Missing-Data Handling

| Scenario | Handling |
|:---|:---|
| Modality completely missing (e.g., no vision data) | Column-mean imputation from subject's history |
| Partial window (e.g., only 3 hours of data) | Impute NaN values with subject's column means |
| No subject history at all (<5 windows) | Model reports "not fitted"; returns baseline score of 0 |
| All modalities missing | Returns `None` — no evaluation performed |
| ESP32 offline (no BPM/g_force) | Physio features imputed; physio modality score ≈ 0 (no deviation detected) |

### Score Scaling to 0–100

```
insight = fusion_score × 100.0
```

The fusion score is already in [0, 1] since each modality score is clamped to [0, 1] and the weights sum to 1.0. Direct linear scaling preserves the distribution. A slight non-linear boost can be applied to the top quartile to ensure that severe multi-modal deviations cross the 81+ threshold.

### Confidence Considerations

- Confidence is estimated as `0.4 + (active_modalities × 0.15)`, capped at 1.0.
- Fewer than 3 active modalities → confidence < 0.7.
- Risk-registry hits raise confidence independent of other modalities (they are deterministic).
- Confidence degrades when feature vectors have high NaN proportion (many imputed values).

### Error Handling

| Error | Handling |
|:---|:---|
| Database connection failure | Log error; return `None`; retry on next scoring cycle |
| Model not fitted (insufficient history) | Return `None`; caller should treat as "no evaluation available" |
| Feature vector entirely NaN | Return `None` (no data to score) |
| Scaler transform failure | Fall back to un-scaled raw values; log warning |
| Isolation Forest prediction exception | Catch, log, return anomaly score = 0.0 |
| Risk registry query failure | Risk register score = 0.0; log warning |

### Explainability Notes

Every `InsightResult` output includes:
1. **Tier label** — the interpretation category (Baseline, Behavioural change observed, etc.)
2. **Tier summary** — a one-line plain-language description
3. **Contributing factors** — per-modality human-readable explanations of what changed
4. **Modality breakdown** — per-modality deviation scores enabling the guardian to see *which* signals are driving the insight score

Example contributing factor output:
```
- Phone Behaviour: Screen time or activity patterns shifted relative to personal baseline.
- Physiological Signals: Heart rate or movement variance differs from expected resting range.
```

These are deliberately generic and descriptive — they explain the *shape* of the deviation, not its meaning or clinical significance.

---

## PSEUDOCODE

```
function evaluate_subject(subject_id, db):
    // 1. Load or build feature vectors
    history = build_history_vectors(db, subject_id, days=14)
    current = build_current_vector(db, subject_id)

    if history is None or len(history) < 5:
        return NOT_FITTED

    if current is None:
        return NO_DATA

    // 2. Normalize inputs
    scaler = StandardScaler()
    scaler.fit(history)
    history_scaled = scaler.transform(impute_nans(history))
    current_scaled = scaler.transform(impute_nans(current.reshape(1, -1)))

    // 3. Run Isolation Forest
    if_model = IsolationForest(n_estimators=150, contamination=0.10, random_state=42)
    if_model.fit(history_scaled)
    raw_anomaly = -if_model.score_samples(current_scaled)[0]
    anomaly_score = scale_to_0_1(raw_anomaly)      // clamp and normalize

    // 4. Compute per-modality deviation scores
    deviation_scorer = ModalityDeviationScorer(history)
    modality_scores = deviation_scorer.score(current)

    // 5. Query risk-registry hits
    risk_hits = db.query(RiskRegistryHit).filter(subject_id, recent=14d)
    modality_scores.risk_reg = score_risk_hits(risk_hits)

    // 6. Compute weighted fusion score
    fusion_score = (
        modality_scores.phone    * 0.35 +
        modality_scores.vision   * 0.25 +
        modality_scores.physio   * 0.20 +
        modality_scores.audio    * 0.10 +
        modality_scores.risk_reg * 0.10
    )
    fusion_score = clamp(fusion_score, 0.0, 1.0)

    // 7. Generate PRISM Insight Score
    insight_score = fusion_score * 100.0

    if    insight_score <= 30: tier = "Baseline"
    elif insight_score <= 60: tier = "Behavioural change observed"
    elif insight_score <= 80: tier = "Multiple unusual signals"
    else:                     tier = "High-priority pattern"

    // 8. Build contributing factors
    factors = []
    for modality, score in modality_scores:
        if score > threshold[modality]:
            factors.append(modality_label[modality] + ": " + describe(modality, score))

    // 9. Return interpretation
    return InsightResult(
        subject_id=subject_id,
        insight_score=insight_score,
        tier_label=tier,
        tier_summary=tier_summaries[tier],
        anomaly_score=anomaly_score,
        modality_scores=modality_scores,
        fusion_score=fusion_score,
        contributing_factors=factors,
        confidence=estimate_confidence(modality_scores),
    )
```

---

## INTEGRATION POINTS

### How this plugs into the existing codebase

| Existing Component | Integration |
|:---|:---|
| `services/api/app/utils/ml_engine.py` | Phase 10 engine replaces the per-modality `evaluate_*` functions. The old evaluators remain for backward compatibility during transition. |
| `services/api/app/utils/worker.py` | The `run_baseline_aggregation` worker can trigger `engine.ensure_fitted(subject_id)` after computing new profiles. |
| `services/api/app/models.py` | Uses existing Phase 8 tables: `BehaviorWindow`, `RiskScoreV2`, `AlertV2`, `SensorReading`, `VisionFeature`, `AudioFeature`, `PhoneEvent`, `RiskRegistryHit`. |
| `services/api/app/routes/telemetry.py` | After ingesting a unified event, optionally trigger `engine.evaluate_and_persist(subject_id)`. |
| `apps/dashboard/src/app/signals/page.tsx` | The existing signals page can read `RiskScoreV2.score_value` and `contributing_factors` to render the PRISM Insight Score card. |

### Database queries used

All queries read from Phase 8 simplified schema tables with a 14-day sliding window. The engine does **not** require schema changes — it reads from tables that already exist:

- `behavior_windows` — daily aggregates
- `sensor_readings` — BPM and g-force from PRISM PULSE
- `vision_features` — blink rate and slouch from RPi camera
- `audio_features` — speech segments and silence ratio from RPi mic
- `phone_events` — screen on/off and app usage from Android
- `risk_registry_hits` — safety registry matches

Writes go to:
- `risk_scores_v2` — persisted insight score with contributing factors
- `alerts_v2` — guardian notification (for scores > 30)
- `audit_log_entries` — immutable audit trail (handled by existing audit middleware)

---

## LIMITATIONS

### This is a research prototype.

The PRISM ML Engine is a demonstration of multimodal behavioural signal fusion for early-stage research exploration. It makes no clinical, diagnostic, or predictive claims.

### It is not a diagnostic tool.

The output scores and labels describe statistical deviations from a personal behavioural baseline. They do not and cannot diagnose, predict, or classify any medical, psychiatric, or psychological condition.

### Scores indicate unusual multimodal behavioural patterns only.

"High-priority pattern" means "multiple independent behavioural and physiological signals have deviated from this individual's personal baseline simultaneously." It does not mean "something is wrong" — it means "guardian review is warranted."

### Human review is required before any intervention.

No automated action (notification to school, clinician referral, etc.) should ever be triggered by these scores without explicit human guardian review. The system is designed to surface patterns for human judgment, not to make decisions.

### The fusion weights are illustrative and require empirical validation.

The weights (0.35, 0.25, 0.20, 0.10, 0.10) were chosen to demonstrate the concept of weighted multimodal fusion. Before any operational use, they must be:
1. Validated against a labelled dataset (if available with appropriate ethics approval)
2. Tuned via logistic regression coefficient estimation
3. Alternatively, elicited from domain experts using structured methods (e.g., Analytical Hierarchy Process)
4. Tested for stability across demographic subgroups

### Additional known limitations

- **14-day baseline window** may be too short to capture genuine patterns in teens with irregular schedules
- **Temporal independence assumption** — each window is scored independently; a gradual trend over 3 days is not distinguished from a single-day spike
- **Missing modality bias** — subjects with fewer devices (phone only, no RPi/ESP32) will always score lower because fewer modalities can deviate
- **No ground-truth validation** — without labelled outcomes, precision/recall/FPR cannot be measured
- **Synthetic training data** — the Isolation Forest has been tested on synthetic data only; real-world distributions will differ
