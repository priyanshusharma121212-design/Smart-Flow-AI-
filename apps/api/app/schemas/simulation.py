from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ScenarioType = Literal["normal", "heavy", "emergency"]
ControllerMode = Literal["fixed_time", "adaptive"]


class RunConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)


class StartSimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioType = "normal"
    controller_mode: ControllerMode = "fixed_time"
    config: RunConfiguration = Field(default_factory=RunConfiguration)


class ScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario: ScenarioType
    controller_mode: ControllerMode


class SimulationState(BaseModel):
    available: bool
    status: Literal["inactive", "running", "paused", "stopped"]
    run_id: str | None
    scenario: ScenarioType | None
    controller_mode: ControllerMode | None
    reason: str


class SimulationMetrics(BaseModel):
    available: bool
    items: list[dict[str, object]]
    reason: str

class SimulationVehicle(BaseModel):
    id: str
    type: str
    x: float
    y: float
    angle: float
    speed: float
    road_id: str
    lane_id: str


class SimulationVehicles(BaseModel):
    available: bool
    simulation_time: float
    vehicles: list[SimulationVehicle]
    reason: str
