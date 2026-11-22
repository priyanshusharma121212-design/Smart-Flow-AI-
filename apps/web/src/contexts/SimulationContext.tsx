import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../services/api'
import type { Scenario, SimulationMetrics, SimulationVehicles, SimulationStatus as BackendSimulationStatus } from '../types/api'
import { SimulationContext, type SimulationStatus } from './simulation-context'

function toDisplayStatus(status: BackendSimulationStatus['status']): SimulationStatus {
  if (status === 'running') return 'Running'
  if (status === 'paused') return 'Paused'
  if (status === 'stopped') return 'Stopped'
  return 'Idle'
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [backendStatus, setBackendStatus] = useState<BackendSimulationStatus | null>(null)
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null)
  const [vehicles, setVehicles] = useState<SimulationVehicles | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refreshSimulation = useCallback(async () => {
    const result = await api.simulationStatus()
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    setBackendStatus(result.data)
    setError('')

    if (result.data.status === 'running' || result.data.status === 'paused') {
      const metricResult = await api.simulationMetrics()
      if (metricResult.ok) setMetrics(metricResult.data)
      else setMetrics(null)

      const vehicleResult = await api.simulationVehicles()
      if (vehicleResult.ok) setVehicles(vehicleResult.data)
      else setVehicles(null)
    } else {
      setMetrics(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      const result = await api.simulationStatus()
      if (!active) return

      if (result.ok) {
        setBackendStatus(result.data)
        setError('')

        if (result.data.status === 'running' || result.data.status === 'paused') {
          const metricResult = await api.simulationMetrics()
          if (!active) return
          if (metricResult.ok) setMetrics(metricResult.data)
          else {
            setMetrics(null)
            setError(metricResult.error.message)
          }
          const vehicleResult = await api.simulationVehicles()
          if (!active) return
          if (vehicleResult.ok) setVehicles(vehicleResult.data)
          else setVehicles(null)
        } else {
          setMetrics(null)
          setVehicles(null)
        }
      } else {
        setError(result.error.message)
      }

      if (active) {
        setLoading(false)
        timer = setTimeout(() => { void poll() }, 1000)
      }
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [])

  const runAction = useCallback(async (
    action: () => Promise<{ ok: true; data: BackendSimulationStatus } | { ok: false; error: { message: string } }>,
  ) => {
    setError('')
    const result = await action()
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setBackendStatus(result.data)
    await refreshSimulation()
  }, [refreshSimulation])

  const startSimulation = useCallback(
    (scenario: Scenario = 'normal', controllerMode: 'fixed_time' | 'adaptive' = 'fixed_time') =>
      runAction(() => api.startSimulation(scenario, controllerMode)),
    [runAction],
  )
  const pauseSimulation = useCallback(() => runAction(api.pauseSimulation), [runAction])
  const resumeSimulation = useCallback(() => runAction(api.resumeSimulation), [runAction])
  const stopSimulation = useCallback(() => runAction(api.stopSimulation), [runAction])
  const resetSimulation = useCallback(() => runAction(api.resetSimulation), [runAction])

  const status = backendStatus ? toDisplayStatus(backendStatus.status) : 'Idle'

  const setStatus = useCallback((next: SimulationStatus) => {
    if (next === 'Running' && status === 'Paused') void resumeSimulation()
    else if (next === 'Running' && status !== 'Running') void startSimulation()
    else if (next === 'Paused') void pauseSimulation()
    else if (next === 'Stopped') void stopSimulation()
    else if (next === 'Idle') void resetSimulation()
  }, [status, startSimulation, pauseSimulation, resumeSimulation, stopSimulation, resetSimulation])

  return (
    <SimulationContext.Provider value={{
      status,
      setStatus,
      backendStatus,
      metrics,
      vehicles,
      loading,
      error,
      startSimulation,
      pauseSimulation,
      resumeSimulation,
      stopSimulation,
      resetSimulation,
      refreshSimulation,
    }}>
      {children}
    </SimulationContext.Provider>
  )
}
