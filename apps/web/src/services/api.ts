import axios, { AxiosError } from 'axios'
import type {
  AIDecision,
  AIStatus,
  AvailableCollection,
  DashboardSummary,
  DatabaseHealthResponse,
  DatabaseTableResponse,
  EmergencyEvent,
  EmergencyRequest,
  HealthResponse,
  Prediction,
  Scenario,
  SimulationStatus,
  SimulationMetrics,
  SimulationVehicles,
  TrafficMetric,
  TrafficIntersection,
  TrafficLiveResponse,
  HereIntegrationStatus,
} from '../types/api'
import type { ApiResult } from '../types/common'
import { API_URL } from '../utils/constants'

const client = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

type ApiEnvelope<T> = {
  success: boolean
  message: string
  data: T
  timestamp: string
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  return typeof envelope.success === 'boolean'
    && typeof envelope.message === 'string'
    && typeof envelope.timestamp === 'string'
    && 'data' in envelope
}

function serverMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('message' in value)) return undefined
  const message = value.message
  return typeof message === 'string' ? message : undefined
}

async function request<T>(method: 'get' | 'post', url: string, data?: unknown, timeout?: number): Promise<ApiResult<T>> {
  try {
    const response = await client.request<unknown>({ method, url, data, timeout })
    if (!isApiEnvelope(response.data) || !response.data.success) {
      return { ok: false, error: { code: 'INVALID_RESPONSE', message: 'The server returned an invalid response.' } }
    }
    return { ok: true, data: response.data.data as T }
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        return { ok: false, error: { code: 'TIMEOUT', message: 'The request timed out.' } }
      }
      if (!error.response) {
        return { ok: false, error: { code: 'NETWORK', message: 'The backend is unavailable.' } }
      }
      return {
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          status: error.response.status,
          message: serverMessage(error.response.data) ?? `The server returned status ${error.response.status}.`,
        },
      }
    }
    return { ok: false, error: { code: 'INVALID_RESPONSE', message: 'An unexpected error occurred.' } }
  }
}

export const api = {
  health: () => request<HealthResponse>('get', '/api/health'),
  databaseHealth: () => request<DatabaseHealthResponse>('get', '/api/database/health'),
  dashboardSummary: () => request<DashboardSummary>('get', '/api/dashboard/summary'),
  hereStatus: () => request<HereIntegrationStatus>('get', '/api/integrations/here/status'),
  liveTraffic: () => request<TrafficLiveResponse>('get', '/api/traffic/live', undefined, 25000),
  startSimulation: (scenario: Scenario = 'normal', controllerMode: 'fixed_time' | 'adaptive' = 'fixed_time') =>
    request<SimulationStatus>('post', '/api/simulation/start', { scenario, controller_mode: controllerMode }),
  pauseSimulation: () => request<SimulationStatus>('post', '/api/simulation/pause'),
  resumeSimulation: () => request<SimulationStatus>('post', '/api/simulation/resume'),
  stopSimulation: () => request<SimulationStatus>('post', '/api/simulation/stop'),
  resetSimulation: () => request<SimulationStatus>('post', '/api/simulation/reset'),
  simulationStatus: () => request<SimulationStatus>('get', '/api/simulation/status'),
  simulationMetrics: () => request<SimulationMetrics>('get', '/api/simulation/metrics'),
  simulationVehicles: () => request<SimulationVehicles>('get', '/api/simulation/vehicles'),
  intersections: () => request<AvailableCollection<TrafficIntersection>>('get', '/api/traffic/intersections'),
  databaseJunctions: () => request<DatabaseTableResponse>('get', '/api/database/junctions'),
  databaseObservations: () => request<DatabaseTableResponse>('get', '/api/database/observations'),
  databaseSignalConfig: () => request<DatabaseTableResponse>('get', '/api/database/signal-config'),
  databaseVehicleTypes: () => request<DatabaseTableResponse>('get', '/api/database/vehicle-types'),
  databaseScenarios: () => request<DatabaseTableResponse>('get', '/api/database/scenarios'),
  databaseScenarioApproaches: () => request<DatabaseTableResponse>('get', '/api/database/scenario-approaches'),
  trafficMetrics: () => request<AvailableCollection<TrafficMetric>>('get', '/api/traffic/metrics'),
  congestion: () => request<AvailableCollection<TrafficMetric>>('get', '/api/traffic/congestion'),
  prediction: () => request<AvailableCollection<Prediction>>('get', '/api/traffic/prediction'),
  aiStatus: () => request<AIStatus>('get', '/api/ai/status'),
  aiDecisions: () => request<AvailableCollection<AIDecision>>('get', '/api/ai/decisions'),
  setControllerMode: (mode: 'fixed-time' | 'adaptive') =>
    request<AIStatus>('post', '/api/ai/controller/mode', { mode: mode.replace('-', '_') }),
  createEmergency: (body: EmergencyRequest) => request<EmergencyEvent>('post', '/api/traffic/emergency', body),
  emergencyHistory: () => request<AvailableCollection<EmergencyEvent>>('get', '/api/traffic/emergency/history'),
  comparison: () => request<AvailableCollection<Record<string, unknown>>>('get', '/api/analytics/comparison'),
  performance: () => request<AvailableCollection<Record<string, unknown>>>('get', '/api/analytics/performance'),
  report: (runId: string) => request<Record<string, unknown>>('get', `/api/reports/${encodeURIComponent(runId)}`),
}
