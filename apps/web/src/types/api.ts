import type { CongestionLevel } from './common'

export type HealthResponse = {
  status: 'ok'
  application: string
  api_version: string
  timestamp: string
}

export type DashboardSummary = {
  available: boolean
  state: string
  active_runs: number | null
  intersection_count: number | null
  average_wait_seconds: number | null
  reason: string
}

export type Scenario = 'normal' | 'heavy' | 'emergency'
export type ControllerMode = 'fixed_time' | 'adaptive'
export type SimulationStatus = {
  available: boolean
  status: 'inactive' | 'running' | 'paused' | 'stopped'
  run_id: string | null
  scenario: Scenario | null
  controller_mode: ControllerMode | null
  reason: string
}

export type SimulationMetricItem = {
  name: string
  value: number | string | string[]
}

export type SimulationMetrics = {
  available: boolean
  items: SimulationMetricItem[]
  reason: string
}

export type AvailableCollection<T> = {
  available: boolean
  items: T[]
  reason: string
}

export type HereIntegrationStatus = {
  provider: string
  city: string
  configured: boolean
  status: 'NOT_CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE'
  base_url: string
  latitude: number
  longitude: number
  radius_meters: number
  api_key_configured: boolean
}

export type TrafficFlowItem = {
  road_segment_reference: string | null
  speed_mps: number | null
  speed_kph: number | null
  free_flow_speed_mps: number | null
  free_flow_speed_kph: number | null
  jam_factor: number | null
  confidence: number | null
  traversability: string | null
  road_geometry: unknown
  provider_timestamp: string | null
}

export type TrafficIncident = {
  id: string | null
  incident_type: string | null
  summary: string | null
  description: string | null
  start_time: string | null
  end_time: string | null
  criticality: string | null
  status: string | null
  road_closed: boolean | null
  road_segment_reference: string | null
  road_geometry: unknown
  provider_timestamp: string | null
}

export type TrafficLiveResponse = {
  available: boolean
  status: 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE'
  city: string
  flow_available: boolean
  flow_items: TrafficFlowItem[]
  incidents_available: boolean
  incidents: TrafficIncident[]
  last_updated_at: string | null
  is_stale: boolean
  persistence_status: 'PERSISTED' | 'NOT_CONFIGURED' | 'UNAVAILABLE'
  persistence_reason: string | null
  reason: string
}

export type TrafficIntersection = {
  id: string
  name: string
  latitude: number
  longitude: number
  signal_state: 'green' | 'yellow' | 'red' | null
  geometry: unknown
}

export type TrafficMetric = {
  intersection_id: string
  vehicle_count: number
  queue_length: number
  average_wait_seconds: number
  congestion: CongestionLevel
}
export type DatabaseTableResponse = {
  table: string
  source: 'NEON_POSTGRESQL'
  access: 'READ_ONLY'
  row_count: number
  items: Record<string, unknown>[]
}
export type DatabaseHealthResponse = {
  provider: 'NEON_POSTGRESQL'
  connected: boolean
}
export type DatabaseTableKey =
  | 'junctions'
  | 'observations'
  | 'signalConfig'
  | 'vehicleTypes'
  | 'scenarios'
  | 'scenarioApproaches'
export type Intersection = {
  id: string
  name: string
  latitude: number
  longitude: number
  signal_state: 'green' | 'yellow' | 'red'
}
export type Prediction = {
  intersection_id: string
  horizon_minutes: number
  congestion: CongestionLevel
}
export type EmergencyRequest = {
  intersection_id: string
  vehicle_type: 'ambulance' | 'fire_engine'
  direction: 'north' | 'east' | 'south' | 'west'
  priority: number
}
export type EmergencyEvent = EmergencyRequest & {
  id: string
  status: 'submitted'
  priority_applied: boolean
  created_at: string
  note: string
}
export type AIStatus = {
  configured: boolean
  available: boolean
  controller_mode: ControllerMode | null
  reason: string
}
export type AIDecision = Record<string, unknown>


export type SimulationVehicle = {
  id: string
  type: string
  x: number
  y: number
  angle: number
  speed: number
  road_id: string
  lane_id: string
}

export type SimulationVehicles = {
  available: boolean
  simulation_time: number
  vehicles: SimulationVehicle[]
  reason: string
}
