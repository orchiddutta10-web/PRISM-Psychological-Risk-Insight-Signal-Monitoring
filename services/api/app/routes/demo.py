from fastapi import APIRouter
from app.demo_simulation_engine import set_active_scenario, ACTIVE_SCENARIO, SCENARIOS

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/scenarios")
def get_scenarios():
    return {"active": ACTIVE_SCENARIO, "scenarios": SCENARIOS}


@router.post("/scenario/{scenario_id}")
def switch_scenario(scenario_id: str):
    set_active_scenario(scenario_id)
    return {
        "status": "success",
        "active_scenario": SCENARIOS.get(scenario_id, "Unknown"),
    }
