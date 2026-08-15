from fastapi import APIRouter, Depends, HTTPException

from app.config import settings
from app.demo_simulation_engine import ACTIVE_SCENARIO, SCENARIOS, set_active_scenario
from app import models
from app.utils import auth

router = APIRouter(prefix="/demo", tags=["demo"])


def require_demo_mode(
    current_user: models.Guardian = Depends(auth.get_current_user),
) -> models.Guardian:
    if settings.ENV.lower() == "production" or not settings.DEMO_MODE:
        raise HTTPException(status_code=404, detail="Demo mode is disabled.")
    return current_user


@router.get("/scenarios")
def get_scenarios():
    if settings.ENV.lower() == "production":
        raise HTTPException(status_code=404, detail="Demo mode is disabled.")
    return {"active": ACTIVE_SCENARIO, "scenarios": SCENARIOS}


@router.post("/scenario/{scenario_id}")
def switch_scenario(
    scenario_id: str, _: models.Guardian = Depends(require_demo_mode)
):
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Unknown demo scenario.")
    set_active_scenario(scenario_id)
    return {"status": "success", "active_scenario": SCENARIOS[scenario_id]}
