from fastapi import APIRouter, Body, status

from app.schemas.common import ApiEnvelope, success_response
from app.schemas.simulation import (
    ScenarioRequest,
    SimulationMetrics,
    SimulationState,
    SimulationVehicles,
    StartSimulationRequest,
)
from app.services.simulation_service import simulation_service

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.post("/start", status_code=status.HTTP_202_ACCEPTED)
async def start_simulation(
    request: StartSimulationRequest = Body(default_factory=StartSimulationRequest),
) -> dict[str, object]:
    result = await simulation_service.start(request)
    return success_response("SUMO simulation started.", result)


@router.post("/pause")
async def pause_simulation() -> dict[str, object]:
    result = await simulation_service.pause()
    return success_response("Simulation paused.", result)


@router.post("/resume")
async def resume_simulation() -> dict[str, object]:
    result = await simulation_service.resume()
    return success_response("Simulation resumed.", result)


@router.post("/stop")
async def stop_simulation() -> dict[str, object]:
    result = await simulation_service.stop()
    return success_response("Simulation stopped.", result)


@router.post("/reset")
async def reset_simulation() -> dict[str, object]:
    result = await simulation_service.reset()
    return success_response("Simulation reset and restarted.", result)


@router.post("/scenario")
async def select_scenario(request: ScenarioRequest) -> dict[str, object]:
    if request.controller_mode != "fixed_time":
        from fastapi import HTTPException
        raise HTTPException(
            status_code=501,
            detail="Adaptive AI controller is not implemented yet.",
        )
    await simulation_service.set_scenario(request.scenario)
    return success_response("Scenario updated.", simulation_service.get_status())


@router.get("/status", response_model=ApiEnvelope[SimulationState])
async def simulation_status() -> dict[str, object]:
    return success_response(
        "Simulation status retrieved.",
        simulation_service.get_status(),
    )


@router.get("/metrics", response_model=ApiEnvelope[SimulationMetrics])
async def simulation_metrics() -> dict[str, object]:
    result = await simulation_service.get_metrics()
    return success_response("Simulation metrics retrieved.", result)



@router.get("/vehicles", response_model=ApiEnvelope[SimulationVehicles])
async def simulation_vehicles() -> dict[str, object]:
    result = await simulation_service.get_vehicles()
    return success_response("Live SUMO vehicles retrieved.", result)
