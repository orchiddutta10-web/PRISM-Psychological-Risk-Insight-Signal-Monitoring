# PRISM 57-feature ML Model — Operator Guide

## What this is

Three trained scikit-learn artifacts (`prism_classifier_model.joblib`, `prism_regressor_model.joblib`, `prism_scaler.joblib`) are integrated into the PRISM backend as an **additional** signal layer. They are NOT a replacement for the existing `run_risk_engine` heuristic models.

| Artifact | Type | Classes / Output | n_features_in_ |
|---|---|---|---|
| `prism_classifier_model.joblib` | `RandomForestClassifier(n_estimators=200, class_weight='balanced', random_state=42)` | `[0, 1, 2]` | 57 |
| `prism_regressor_model.joblib` | `RandomForestRegressor(n_estimators=200, random_state=42)` | continuous float (clipped to 0..1 by the service) | 57 |
| `prism_scaler.joblib` | `StandardScaler` (loaded once, `transform` only — **never refit**) | — | 57 |

The artifacts were trained under `scikit-learn==1.6.1`. The runtime must satisfy `scikit-learn>=1.6,<2` to deserialize them safely. `joblib>=1.4` is required.

## Where to drop the files

By default, the backend loads from `services/api/app/resources/prism/`. Create that directory and copy the three files into it:

```
services/api/app/resources/prism/
├── prism_classifier_model.joblib
├── prism_regressor_model.joblib
└── prism_scaler.joblib
```

If the files live elsewhere, set `PRISM_MODEL_DIR` to an absolute path (e.g. `/opt/prism/models/`).

The directory must **not** be served as a static asset by the Next.js dashboard; it lives entirely behind the FastAPI process.

## Classifier class labels — REQUIRES CONFIRMATION

The classifier returns one of `{0, 1, 2}`. **The semantic meaning of each class index is not present in this repository and cannot be inferred from the codebase.** The integration therefore:

- Surfaces the raw class index in the API response (`classifier.index`).
- Maps the index to a label via configurable env vars, defaulting to safe placeholders:

| Index | Default label | Override env var |
|---|---|---|
| 0 | `Stable` | `PRISM_LABEL_0` |
| 1 | `Watch` | `PRISM_LABEL_1` |
| 2 | `Attention` | `PRISM_LABEL_2` |

- Surfaces a small banner in the dashboard telling the user that the labels require confirmation against the original training documentation.

Once the training documentation is available, set the env vars to the real labels. **Do not** rely on the placeholders for any compliance or medical-decision support.

## Regressor semantics

The regressor output is treated as an **opaque continuous score in [0, 1]**. The integration surfaces:

- `regressor.score` — the raw clipped value.
- `regressor.label` — one of `low` / `moderate` / `elevated`, determined by configurable thresholds (`PRISM_REGRESSOR_LOW_MAX=0.33`, `PRISM_REGRESSOR_HIGH_MIN=0.66`).
- `regressor.name` — display name (default `"Prism continuous score"`).
- `regressor.thresholds` — the thresholds used, so the UI can show "above 0.66 = elevated".

The integration **does not** claim any unit, scale, or clinical meaning for the regressor output.

## API surface

```
GET /api/v1/prism/predict/{device_id}   → 200 PrismPredictionResponse
                                       → 503 { reason, message, details }
GET /api/v1/prism/history/{device_id}  → 200 { device_id, items: [...] }
```

Both endpoints require a guardian JWT and enforce `verify_guardian_device_access`. The dashboard consumes them at `/analytics` (`apps/dashboard/src/app/analytics/page.tsx`).

## Feature pipeline

Single source of truth: `services/api/app/utils/prism_features.py`. The exact 57-feature schema is locked in `FEATURE_NAMES`. Reordering or renaming a feature will silently corrupt inference. A test (`test_feature_names_match_spec`) freezes the schema.

Sources used by the feature pipeline:

| Feature group | DB source |
|---|---|
| Daily snapshot (Sleep, Steps, Screen time, Typing, Pulse, POIs) | `BaselineProfile.rolling_mean` (latest row per `signal_type`) |
| App activity (Chrome, Figma, IG, Slack, Spotify, Terminal, TikTok, VS Code, YouTube) | Last 24h of `RawSignalEvent(signal_type='app_usage')` metadata, summed by app, converted minutes → hours |
| Rolling stats (3d / 7d / 14d mean, 7d / 14d std, dev_from_7d) | `BaselineProfile.updated_at` history, fallback to per-day `RawSignalEvent.metadata_json` aggregates |
| Audio (Stress, Pitch variance, Pause ratio, RMS, Centroid, MFCC) | Latest `RawSignalEvent(signal_type='voice')` metadata |
| Facial (Valence, Smile %, Eye fatigue) | Latest `RawSignalEvent(signal_type='facial')` metadata |

Missing data is propagated as `NaN` (so the scaler sees true NaN, not a fake 0.0). The endpoint reports per-feature `feature_status` so the UI can show "Limited data" when applicable.

## Error / insufficient-data states

The endpoint returns **HTTP 503** with a structured payload for any of:

| `reason` | When |
|---|---|
| `model_not_loaded` | Artifacts missing or unloadable in `PRISM_MODEL_DIR` |
| `feature_engineering_failed` | Bug in the feature pipeline (schema lock, NaN propagation failure) |
| `insufficient_history` | Reserved for explicit insufficient-history checks (currently folded into `model_not_loaded`) |

The dashboard handles all three with the same "Prism prediction unavailable — limited data" surface.

## Security notes

- `.joblib` files are loaded **only** from the configured `PRISM_MODEL_DIR`. The user cannot influence the path.
- The endpoint validates `device_id` is owned by the authenticated guardian.
- The feature pipeline **never** logs raw audio or facial values. The snapshot table stores only the prediction result, not the raw 57-feature vector.
- The classifier output is a label index; no biometric values are returned to the client.

## Local development steps

```powershell
# 1. Copy artifacts
mkdir services\api\app\resources\prism
Copy-Item '<downloaded>prism_classifier_model.joblib' services\api\app\resources\prism\
Copy-Item '<downloaded>prism_regressor_model.joblib'  services\api\app\resources\prism\
Copy-Item '<downloaded>prism_scaler.joblib'           services\api\app\resources\prism\

# 2. Install dependencies (already pinned in requirements.txt)
.\.venv\Scripts\python.exe -m pip install -r services\api\requirements.txt

# 3. Start the API
cd services\api; ..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 4. Hit the endpoint
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/v1/prism/predict/<device_id>

# 5. Open the dashboard
start http://localhost:3000/analytics
```

## Verification checklist (per the implementation plan)

- [x] All three artifacts load with `n_features_in_ == 57`.
- [x] Feature order is locked by `FEATURE_NAMES` and a regression test.
- [x] Scaler is `transform`-only — verified by `test_predict_prism_scaler_never_refit`.
- [x] Classifier returns one of `{0, 1, 2}` with `predict_proba` summing to 1.
- [x] Regressor returns a finite float in `[0, 1]`.
- [x] Inference is deterministic for fixed input.
- [x] Missing-data path returns `PrismInsufficientData`, never a fake prediction.
- [x] API endpoint surfaces 200 with a stable response shape, or 503 with a structured error.
- [x] Classifier labels are configurable via env vars and explicitly flagged for confirmation.
- [x] No raw audio / facial values appear in any log line.
- [x] Existing `run_risk_engine` heuristic pipeline is untouched.
