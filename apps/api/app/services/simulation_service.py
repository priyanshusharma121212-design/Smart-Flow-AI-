import asyncio
import sys
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.simulation import (
    ScenarioType,
    SimulationMetrics,
    SimulationState,
    StartSimulationRequest,
)


class SimulationService:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._connection: Any = None
        self._task: asyncio.Task | None = None
        self._last_request: StartSimulationRequest | None = None
        self._state = SimulationState(
            available=self._is_configured(),
            status="inactive",
            run_id=None,
            scenario=None,
            controller_mode=None,
            reason="SUMO is configured and ready." if self._is_configured()
            else "SUMO configuration is incomplete.",
        )

    def _is_configured(self) -> bool:
        return (
            bool(settings.sumo_home)
            and Path(settings.sumo_binary).is_file()
            and Path(settings.sumo_config).is_file()
        )

    def get_status(self) -> SimulationState:
        return self._state

    async def start(self, request: StartSimulationRequest) -> SimulationState:
        async with self._lock:
            if self._state.status in ("running", "paused"):
                raise HTTPException(status_code=409, detail="A simulation is already active.")

            if not self._is_configured():
                raise HTTPException(status_code=503, detail="SUMO configuration is incomplete.")

            if request.controller_mode != "fixed_time":
                raise HTTPException(
                    status_code=501,
                    detail="Adaptive AI controller is not implemented yet. Use fixed_time.",
                )

            if request.scenario != "normal":
                raise HTTPException(
                    status_code=501,
                    detail="Only the normal scenario is currently configured. Heavy and emergency scenarios are not implemented yet.",
                )

            tools_path = str(Path(settings.sumo_home) / "tools")
            if tools_path not in sys.path:
                sys.path.insert(0, tools_path)

            try:
                import traci

                label = "smartflow_" + uuid.uuid4().hex[:10]
                command = [
                    settings.sumo_binary,
                    "-c", settings.sumo_config,
                    "--no-step-log", "true",
                ]
                traci.start(command, label=label)
                connection = traci.getConnection(label)
                self._connection = connection
                self._last_request = request

                self._state = SimulationState(
                    available=True,
                    status="running",
                    run_id=uuid.uuid4().hex,
                    scenario=request.scenario,
                    controller_mode=request.controller_mode,
                    reason="SUMO simulation is running with fixed-time signals.",
                )
                self._task = asyncio.create_task(self._simulation_loop())
                return self._state

            except Exception as exc:
                self._connection = None
                self._state = SimulationState(
                    available=True,
                    status="stopped",
                    run_id=None,
                    scenario=request.scenario,
                    controller_mode=request.controller_mode,
                    reason=f"SUMO failed to start: {exc}",
                )
                raise HTTPException(status_code=503, detail=self._state.reason) from exc

    async def _simulation_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(1.0)

                async with self._lock:
                    if self._state.status == "paused":
                        continue
                    if self._state.status != "running" or self._connection is None:
                        return

                    self._connection.simulationStep()
                    remaining = self._connection.simulation.getMinExpectedNumber()

                    if remaining == 0:
                        self._state = self._state.model_copy(
                            update={
                                "status": "stopped",
                                "reason": "SUMO simulation completed naturally.",
                            }
                        )
                        self._connection.close()
                        self._connection = None
                        return

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            async with self._lock:
                self._state = self._state.model_copy(
                    update={"status": "stopped", "reason": f"Simulation error: {exc}"}
                )
                if self._connection is not None:
                    try:
                        self._connection.close()
                    except Exception:
                        pass
                    self._connection = None

    async def pause(self) -> SimulationState:
        async with self._lock:
            if self._state.status != "running":
                raise HTTPException(status_code=409, detail="Simulation is not running.")
            self._state = self._state.model_copy(
                update={"status": "paused", "reason": "Simulation paused."}
            )
            return self._state

    async def resume(self) -> SimulationState:
        async with self._lock:
            if self._state.status != "paused":
                raise HTTPException(status_code=409, detail="Simulation is not paused.")
            self._state = self._state.model_copy(
                update={"status": "running", "reason": "Simulation resumed."}
            )
            return self._state

    async def stop(self) -> SimulationState:
        async with self._lock:
            if self._state.status not in ("running", "paused"):
                raise HTTPException(status_code=409, detail="No active simulation to stop.")

            if self._connection is not None:
                self._connection.close()
                self._connection = None

            self._state = self._state.model_copy(
                update={"status": "stopped", "reason": "Simulation stopped by user."}
            )
            return self._state

    async def reset(self) -> SimulationState:
        request = self._last_request or StartSimulationRequest()

        if self._state.status in ("running", "paused"):
            await self.stop()

        return await self.start(request)

    async def set_scenario(self, scenario: ScenarioType) -> None:
        del scenario
        raise HTTPException(
            status_code=501,
            detail="Scenario switching is not implemented yet. Start a normal scenario.",
        )

    async def get_metrics(self) -> SimulationMetrics:
        async with self._lock:
            if self._connection is None or self._state.status not in ("running", "paused"):
                return SimulationMetrics(
                    available=False,
                    items=[],
                    reason="No active SUMO simulation. Start a simulation to view live metrics.",
                )

            try:
                conn = self._connection
                vehicle_ids = conn.vehicle.getIDList()
                waiting = sum(
                    1 for vehicle_id in vehicle_ids
                    if conn.vehicle.getWaitingTime(vehicle_id) > 0
                )
                items = [
                    {"name": "simulation_time", "value": conn.simulation.getTime()},
                    {"name": "active_vehicles", "value": len(vehicle_ids)},
                    {"name": "arrived_vehicles", "value": conn.simulation.getArrivedNumber()},
                    {"name": "waiting_vehicles", "value": waiting},
                    {"name": "traffic_lights", "value": list(conn.trafficlight.getIDList())},
                ]
                return SimulationMetrics(
                    available=True,
                    items=items,
                    reason="Live metrics retrieved from SUMO through TraCI.",
                )
            except Exception as exc:
                return SimulationMetrics(
                    available=False,
                    items=[],
                    reason=f"Could not read SUMO metrics: {exc}",
                )


    async def get_vehicles(self):
        from app.schemas.simulation import SimulationVehicle, SimulationVehicles

        async with self._lock:
            if self._connection is None or self._state.status not in ("running", "paused"):
                return SimulationVehicles(
                    available=False,
                    simulation_time=0.0,
                    vehicles=[],
                    reason="No active SUMO simulation.",
                )

            try:
                conn = self._connection
                vehicles = []

                for vehicle_id in conn.vehicle.getIDList():
                    vehicle_type = conn.vehicle.getTypeID(vehicle_id)
                    x, y = conn.vehicle.getPosition(vehicle_id)

                    vehicles.append(
                        SimulationVehicle(
                            id=vehicle_id,
                            type=vehicle_type,
                            x=float(x),
                            y=float(y),
                            angle=float(conn.vehicle.getAngle(vehicle_id)),
                            speed=float(conn.vehicle.getSpeed(vehicle_id)),
                            road_id=conn.vehicle.getRoadID(vehicle_id),
                            lane_id=conn.vehicle.getLaneID(vehicle_id),
                        )
                    )

                return SimulationVehicles(
                    available=True,
                    simulation_time=float(conn.simulation.getTime()),
                    vehicles=vehicles,
                    reason="Live vehicle positions retrieved from SUMO through TraCI.",
                )

            except Exception as exc:
                return SimulationVehicles(
                    available=False,
                    simulation_time=0.0,
                    vehicles=[],
                    reason=f"Could not read SUMO vehicles: {exc}",
                )



simulation_service = SimulationService()
