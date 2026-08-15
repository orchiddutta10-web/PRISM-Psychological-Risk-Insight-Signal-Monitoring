# Module 4: Explainable AI (EXAI)

Every score the Behavioral AI pipeline (Module 3) emits ships a structured,
human-readable explanation. PRISM's core constraint is **no black-box ML
outputs** (AGENTS.md): an alert is only useful to a guardian if they can see
*why* the risk score moved.

## Where explanations come from

All explainability is computed in `app/utils/behavioral_ai.py` and exposed via
`GET /api/v1/events/typing/behavioral/{device_id}` on every dimension
(`stress`, `cognitive_load`, `typing_fatigue`, `typing_stability`):

| Field | Meaning |
|-------|---------|
| `feature_importance` | Global importance of each typing feature for that dimension (mean decrease in impurity from the trained tree model, normalized to sum to 1). |
| `shap_values` | SHAP-style *local* attribution for the most recent typing event — a signed per-feature contribution (positive pushes the score up, negative pulls it down). |
| `reasoning` | Human-readable "why" strings rendered from the top contributing features. |

The trend layer (`mental_risk_score`, `anxiety_trend`, `depression_trend`)
ships `top_features` (the trend features that matter most, e.g.
`stress_mean`, `stress_slope`) and its own `reasoning`.

## Example

For a stressed typing event the API returns reasoning like:

> **Risk score increased because error rate increased, delete/hesitation rate
> increased, large variation in typing rhythm.**

This mirrors the Module 4 spec example:

- typing speed decreased
- delete rate increased
- long pauses detected
- large variation in typing rhythm

## No heavy `shap` dependency

The `shap` package is not a project dependency. Local attribution is computed
from the tree models' own `feature_importances_` combined with how far the
current event's features sit from a calm reference vector, normalized to a
signed, sorted contribution list. Global importance is read from a
`feature_importance.json` metadata file written by
`scripts/train_behavioral_ai.py` (falling back to the live model's
`feature_importances_`, then to a transparent heuristic weight vector when
artifacts are absent — matching the graceful-degradation pattern used
everywhere else in the pipeline).

## Screening, not diagnosis

Explanations never phrase outputs as a diagnosis. The disclaimer
`"Behavioral screening signal, not a diagnosis..."` is attached to every
flagged explanation, consistent with the paper's framing of unobtrusive
screening rather than clinical diagnosis.

## Regenerating the metadata

```bash
cd services/api
python scripts/train_behavioral_ai.py
```

This retrains the models, rewrites `docs/MODEL_EVAL_BEHAVIORAL.md`, and writes
`app/resources/behavioral_ai/feature_importance.json`.
