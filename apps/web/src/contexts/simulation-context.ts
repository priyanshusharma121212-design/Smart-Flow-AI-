import { createContext } from 'react'
import type { SimulationMetrics, SimulationVehicles, SimulationStatus as BackendSimulationStatus, Scenario } from '../types/api'

export type SimulationStatus = 'Idle' | 'Running' | 'Paused' | 'Stopped'

type SimulationContextValue = {
  status: SimulationStatus
  setStatus: (status: SimulationStatus) => void
  backendStatus: BackendSimulationStatus | null
  metrics: SimulationMetrics | null
  vehicles: SimulationVehicles | null
  loading: boolean
  error: string
  startSimulation: (scenario?: Scenario, controllerMode?: 'fixed_time' | 'adaptive') => Promise<void>
  pauseSimulation: () => Promise<void>
  resumeSimulation: () => Promise<void>
  stopSimulation: () => Promise<void>
  resetSimulation: () => Promise<void>
  refreshSimulation: () => Promise<void>
}

export const SimulationContext = createContext<SimulationContextValue | undefined>(undefined)
