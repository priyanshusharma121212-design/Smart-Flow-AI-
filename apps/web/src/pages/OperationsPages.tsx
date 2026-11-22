import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, Ambulance, ArrowDown, BarChart3, Bike, Bus, CarFront, Check,
  ChevronLeft, ChevronRight, CircleAlert, Clock3, Download, Pause, Play,
  RefreshCw, RotateCcw, Search, Siren, Square, Truck, X,
} from 'lucide-react'
import { Badge, Button, Card, EmptyState, ErrorState, LoadingSkeleton, PageHeader } from '../components/common/UI'
import { useTheme } from '../contexts/useTheme'
import { useSimulation } from '../contexts/useSimulation'
import { useLiveTraffic } from '../contexts/useLiveTraffic'
import { useAuth } from '../contexts/useAuth'
import { TwoFactorSettings } from '../components/security/TwoFactorSettings'
import { demoTrafficSample } from '../data/demo-traffic'
import { defaultUserPreferences, loadUserPreferences, saveUserPreferences, type UserPreferences } from '../services/preferences'
import { api } from '../services/api'
import type { ReactNode } from 'react'
import type { DatabaseTableKey, DatabaseTableResponse, SimulationVehicle, TrafficFlowItem } from '../types/api'
import type { ApiResult } from '../types/common'

const LazyChartPanel = lazy(() => import('../components/charts/ChartPanel').then((module) => ({ default: module.ChartPanel })))
const LazyTrafficMapPanel = lazy(() => import('../components/traffic/TrafficMapPanel').then((module) => ({ default: module.TrafficMapPanel })))

const SAMPLE_DATA_LABEL = 'Sample data · illustrative only · not live'
const databaseTables: {
  key: DatabaseTableKey
  label: string
  load: () => Promise<ApiResult<DatabaseTableResponse>>
}[] = [
  { key: 'junctions', label: 'Junctions', load: api.databaseJunctions },
  { key: 'observations', label: 'Traffic observations', load: api.databaseObservations },
  { key: 'signalConfig', label: 'Signal configuration', load: api.databaseSignalConfig },
  { key: 'vehicleTypes', label: 'Vehicle types', load: api.databaseVehicleTypes },
  { key: 'scenarios', label: 'Traffic scenarios', load: api.databaseScenarios },
  { key: 'scenarioApproaches', label: 'Scenario approaches', load: api.databaseScenarioApproaches },
]
const historyRows = [
  { id: 'RUN-24018', name: 'Morning corridor test', scenario: 'Heavy Traffic', controller: 'Adaptive', start: '2026-11-18 08:00', end: '2026-11-18 08:24', status: 'Completed' },
  { id: 'RUN-24017', name: 'Emergency route sample', scenario: 'Emergency Traffic', controller: 'Fixed-Time', start: '2026-11-17 14:10', end: '2026-11-17 14:28', status: 'Completed' },
  { id: 'RUN-24016', name: 'Baseline comparison', scenario: 'Normal Traffic', controller: 'Adaptive', start: '2026-11-16 09:30', end: '2026-11-16 09:55', status: 'Stopped' },
  { id: 'RUN-24015', name: 'Evening demand test', scenario: 'Heavy Traffic', controller: 'Fixed-Time', start: '2026-11-15 17:00', end: '2026-11-15 17:20', status: 'Completed' },
  { id: 'RUN-24014', name: 'North approach sample', scenario: 'Normal Traffic', controller: 'Adaptive', start: '2026-11-14 11:00', end: '2026-11-14 11:15', status: 'Completed' },
  { id: 'RUN-24013', name: 'Queue comparison', scenario: 'Heavy Traffic', controller: 'Fixed-Time', start: '2026-11-13 16:40', end: '2026-11-13 17:02', status: 'Completed' },
]
function DemoLabel() { return <span className="demo-label">{SAMPLE_DATA_LABEL}</span> }
function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return <Card className={`data-panel ${className}`}>{title && <div className="panel-title">{title}</div>}{children}</Card>
}
function Metric({ label, value, unit, trend, icon }: { label: string; value: string; unit?: string; trend?: string; icon: ReactNode }) {
  return <Card className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><strong>{value}<small>{unit}</small></strong>{trend && <span className="metric-trend"><ArrowDown size={13} />{trend}</span>}</Card>
}
function ChartPanel({ title, type = 'line', data = [], color = '#29b8db', dataKey = 'vehicles', secondKey }: {
  title: string; type?: 'line' | 'bar' | 'area'; data?: Record<string, string | number>[]; color?: string; dataKey?: string; secondKey?: string
}) {
  return <Suspense fallback={<Panel title={title}><div className="chart-area skeleton" /></Panel>}>
    <LazyChartPanel title={title} type={type} data={data} color={color} dataKey={dataKey} secondKey={secondKey} />
  </Suspense>
}
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="table-scroll"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>
}
function StatusBadge({ children }: { children: string }) {
  const tone = /completed|granted|low/i.test(children) ? 'success' : /requested|detected|running|medium/i.test(children) ? 'warning' : /failed|high|critical/i.test(children) ? 'danger' : 'neutral'
  return <Badge tone={tone}>{children}</Badge>
}

function NeonDatabaseTablesPanel({ refreshToken }: { refreshToken: number }) {
  const [results, setResults] = useState<Partial<Record<DatabaseTableKey, ApiResult<DatabaseTableResponse>>>>({})
  const [loading, setLoading] = useState(true)

  const fetchResults = useCallback(async () => {
    const entries = await Promise.all(databaseTables.map(async (table) => [table.key, await table.load()] as const))
    return Object.fromEntries(entries)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    void fetchResults().then((nextResults) => {
      if (active) {
        setResults(nextResults)
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [fetchResults, refreshToken])

  const refresh = async () => {
    setLoading(true)
    setResults(await fetchResults())
    setLoading(false)
  }

  return <Panel title="Neon PostgreSQL records · read-only">
    <p className="mini-callout">
      Read-only PostgreSQL queries. These stored records are kept separate from HERE LIVE DATA and simulation output.
      The workbook preview is sample traffic data; database row provenance is not inferred.
      {' '}<Button variant="ghost" onClick={() => void refresh()} disabled={loading}><RefreshCw size={14} />Refresh database</Button>
    </p>
    {loading && <LoadingSkeleton lines={3} />}
    {!loading && <div className="dashboard-grid">
      {databaseTables.map((table) => {
        const result = results[table.key]
        return <Panel title={table.label} key={table.key}>
          {!result
            ? <EmptyState title="No response" description="No database response was received." />
            : !result.ok && result.error.status === 404
              ? <EmptyState title="Not configured" description="This table is not provisioned in Neon; no records are displayed." />
              : !result.ok
                ? <ErrorState message={result.error.message} />
              : <>
                <p className="mini-callout">NEON POSTGRESQL · READ-ONLY · {result.data.row_count} rows retrieved</p>
                {!result.data.items.length
                  ? <EmptyState title="No visible records" description="The read succeeded, but RLS returned no rows." />
                  : <div className="table-scroll">
                    {result.data.items.slice(0, 5).map((row, index) => (
                      <details key={`${table.key}-${index}`}>
                        <summary>Record {index + 1}</summary>
                        <pre className="database-record">{JSON.stringify(row, null, 2)}</pre>
                      </details>
                    ))}
                    {result.data.row_count > 5 && <small>Showing 5 of {result.data.row_count} returned rows.</small>}
                  </div>}
              </>}
        </Panel>
      })}
    </div>}
  </Panel>
}

export function DashboardPage() {
  const [databaseRefreshToken, setDatabaseRefreshToken] = useState(0)
  const {
    data,
    hereStatus,
    hereNotConfigured,
    intersections,
    loading,
    error,
    intersectionError,
    lastSuccessfulUpdateAt,
    refresh,
  } = useLiveTraffic()
  const refreshDashboardData = async () => {
    await refresh()
    setDatabaseRefreshToken((token) => token + 1)
  }
  const speedValues = data?.flow_items
    .map((item) => item.speed_kph)
    .filter((speed): speed is number => speed !== null) ?? []
  const jamValues = data?.flow_items
    .map((item) => item.jam_factor)
    .filter((jam): jam is number => jam !== null) ?? []
  const average = (values: number[]) => values.length
    ? (values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)
    : '—'
  const jamFactor = jamValues.length ? Number(average(jamValues)) : null
  const jamLabel = jamFactor === null ? 'Not supplied' : jamFactor >= 7 ? 'High' : jamFactor >= 4 ? 'Moderate' : 'Low'
  const items = data?.flow_items ?? []
  const speedSummary = average(speedValues)
  const sampleVehicleCount = demoTrafficSample.approaches.reduce((total, item) => total + item.vehicleCount, 0)

  return <>
    <PageHeader
      title="Traffic command center"
      description="Current HERE flow and incident information for the configured Jaipur pilot area."
      action={<Button variant="secondary" onClick={() => void refreshDashboardData()} disabled={loading}><RefreshCw size={15} />{hereNotConfigured ? 'Refresh dashboard data' : 'Refresh live data'}</Button>}
    />
    {loading && <Panel title="Loading current Jaipur traffic"><LoadingSkeleton lines={2} /></Panel>}
    {hereNotConfigured && !loading && <div className="mini-callout" role="status">Prototype environment active — HERE live traffic is not configured.</div>}
    {error && <ErrorState message={error} />}
    {!loading && <div className="mini-callout" role="status">
      Last successful HERE data fetch: {lastSuccessfulUpdateAt ? new Date(lastSuccessfulUpdateAt).toLocaleString() : 'none in this session'}.
    </div>}
    {data?.is_stale && <div className="mini-callout" role="status">HERE data is stale: the latest provider timestamp is more than 15 minutes old.</div>}
    {data && <div className="mini-callout" role="status">
      HERE provider: {data.status} · {data.city} · Last provider update: {data.last_updated_at ? new Date(data.last_updated_at).toLocaleString() : 'not supplied'}
      {data.persistence_status !== 'PERSISTED' && ` · ${data.persistence_reason ?? 'Provider values are not persisted.'}`}
    </div>}
    {(!data || !data.available) && !loading && <Panel title="Traffic Data Overview">
      <p className="mini-callout">Sample traffic data — illustrative values, not live measurements. Source: {demoTrafficSample.source}. Snapshot: {demoTrafficSample.timestamp}.</p>
      <div className="metric-grid compact">
        <Metric label="Sample vehicles (all four approaches)" value={String(sampleVehicleCount)} icon={<CarFront size={18} />} />
        <Metric label="Sample average wait" value="18" unit=" sec" icon={<Clock3 size={18} />} />
        <Metric label="Live average speed" value="N/A" icon={<Activity size={18} />} />
        <Metric label="Live incidents" value="N/A" icon={<CircleAlert size={18} />} />
      </div>
    </Panel>}
    <div className="metric-grid">
      <Metric label="HERE road segments" value={data ? String(data.flow_items.length) : 'N/A'} icon={<Activity size={18} />} />
      <Metric label="Average segment speed" value={data && speedValues.length ? speedSummary : 'N/A'} unit={speedValues.length ? ' km/h' : ''} icon={<Activity size={18} />} />
      <Metric label="Average HERE jam factor" value={jamFactor === null ? 'N/A' : `${jamFactor.toFixed(1)} / 10`} icon={<CircleAlert size={18} />} />
      <Metric label="Current incidents" value={data?.incidents_available ? String(data.incidents.length) : 'N/A'} icon={<Siren size={18} />} />
      <Metric label="Verified intersections" value={String(intersections.length)} icon={<Activity size={18} />} />
    </div>
    <div className="dashboard-grid">
      <Panel title="Provider connection">
        <div className="readout-grid"><span>HERE provider</span><strong>{hereStatus?.status ?? (error ? 'Unavailable' : loading ? 'Loading' : 'Unavailable')}</strong><span>Flow segments</span><strong>{data?.flow_available ? items.length : 'N/A'}</strong><span>Incidents</span><strong>{data?.incidents_available ? data.incidents.length : 'N/A'}</strong><span>Average congestion</span><strong>{jamLabel}</strong></div>
        {data?.reason && <p className="mini-callout">{data.reason}</p>}
      </Panel>
      <Panel title="Verified intersections">
        {intersectionError && <ErrorState message={intersectionError} />}
        {intersections.length
          ? <DataTable headers={['Name', 'Latitude', 'Longitude']} rows={intersections.map((intersection) => [intersection.name, intersection.latitude, intersection.longitude])} />
          : <EmptyState title="No verified intersections" description="The Jaipur intersection catalog is empty. Add confirmed locations through the controlled database workflow; HERE road segments are not mislabeled as intersections." />}
      </Panel>
      <Panel title="Current HERE incidents">
        {data?.incidents.length
          ? <div className="event-list">{data.incidents.map((incident, index) => <div className="event-item" key={incident.id ?? `incident-${index}`}><Siren size={17} /><div><strong>{incident.summary ?? incident.incident_type ?? 'Traffic incident'}</strong><small>{incident.criticality ?? 'Severity not supplied'} · {incident.road_segment_reference ?? 'Road reference not supplied'}</small></div><span>{incident.provider_timestamp ? new Date(incident.provider_timestamp).toLocaleTimeString() : 'Time unavailable'}</span></div>)}</div>
          : <EmptyState title={data?.incidents_available ? 'No current incidents reported' : 'Incident data unavailable'} description={data?.incidents_available ? 'HERE returned no incidents for the configured Jaipur area.' : 'No incident values are displayed unless HERE supplies them.'} />}
      </Panel>
      <Panel title="Sample approach readings · synthetic workbook">
        <p className="mini-callout">Sample traffic data — illustrative values, not live measurements. Source: {demoTrafficSample.source}. Timestamp: {demoTrafficSample.timestamp}.</p>
        <DataTable headers={['Approach', 'Sample vehicles', 'Signal state', 'Sample wait']} rows={demoTrafficSample.approaches.map((item) => [item.approach, item.vehicleCount, item.signalState, `${item.averageWait} sec`])} />
        <DemoLabel />
      </Panel>
    </div>
    <NeonDatabaseTablesPanel refreshToken={databaseRefreshToken} />
    <Suspense fallback={<Panel title="HERE road geometry"><LoadingSkeleton lines={2} /></Panel>}>
      <LazyTrafficMapPanel items={items} loading={loading} />
    </Suspense>
  </>
}

function IntersectionVisual({
  phase,
  emergency,
  vehicles,
}: {
  phase: number
  emergency: boolean
  vehicles: SimulationVehicle[]
}) {
  const verticalGreen = phase % 2 === 0

  return <div className={`intersection-visual ${emergency ? 'emergency-mode' : ''}`}>
    <div className="intersection-road horizontal"><div className="lane-mark" /></div>
    <div className="intersection-road vertical"><div className="lane-mark" /></div>

    <div className="live-vehicle-layer">
      {vehicles.map((vehicle) => {
        const kind = `${vehicle.type} ${vehicle.id}`.toLowerCase()
        const VehicleIcon = kind.includes('ambulance') ? Ambulance
          : kind.includes('fire') ? Siren
          : kind.includes('bus') ? Bus
          : kind.includes('bike') ? Bike
          : kind.includes('truck') ? Truck
          : CarFront

        const left = Math.max(0, Math.min(100, (vehicle.x / 600) * 100))
        const top = Math.max(0, Math.min(100, ((600 - vehicle.y) / 600) * 100))

        return <span
          className="live-vehicle"
          key={vehicle.id}
          title={`${vehicle.id} ? ${vehicle.type} ? ${vehicle.speed.toFixed(1)} m/s`}
          style={{
            left: `${left}%`,
            top: `${top}%`,
            transform: `translate(-50%, -50%) rotate(${vehicle.angle}deg)`,
          }}
        >
          <VehicleIcon size={16} />
        </span>
      })}
    </div>

    <div className="center-island">
      <div className="intersection-signal">
        <i className={!verticalGreen ? 'go' : ''} />
        <i className={phase === 1 ? 'caution' : ''} />
        <i className={verticalGreen ? 'go' : ''} />
      </div>
      <span>JUNCTION J0</span>
    </div>

    <div className={`direction-signal north-signal ${verticalGreen ? 'signal-green' : 'signal-red'}`} />
    <div className={`direction-signal east-signal ${verticalGreen ? 'signal-red' : 'signal-green'}`} />

    <div className="signal-legend">
      <span><i className="green-dot" /> Green phase</span>
      <span><i className="red-dot" /> Stopped</span>
      <span className="live-count">{vehicles.length} live vehicles</span>
    </div>

    {vehicles.length === 0 && (
      <div className="no-live-vehicles">
        Start the SUMO simulation to see live vehicles
      </div>
    )}
  </div>
}
export function SimulationPage() {
  const {
    status,
    metrics,
    vehicles,
    loading,
    error,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    resetSimulation,
  } = useSimulation()

  const metricValue = (name: string) => {
    const value = metrics?.items.find((item) => item.name === name)?.value
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
    return value ?? '?'
  }

  const simulationTime = metrics?.items.find((item) => item.name === 'simulation_time')?.value
  const elapsed = typeof simulationTime === 'number'
    ? `${Math.floor(simulationTime / 60).toString().padStart(2, '0')}:${Math.floor(simulationTime % 60).toString().padStart(2, '0')}`
    : '?'

  return <>
    <PageHeader
      title="SUMO traffic simulation"
      description="Live traffic simulation powered by SUMO and TraCI. Current controller: fixed-time signals."
      action={<Badge tone={status === 'Running' ? 'success' : status === 'Paused' ? 'warning' : 'neutral'}>{status}</Badge>}
    />

    <div className="simulation-layout">
      <Panel title="Junction preview">
        <IntersectionVisual phase={0} emergency={false} vehicles={vehicles?.vehicles ?? []} />
        <div className="simulation-note">
          <CircleAlert size={16} />
          Vehicle positions are streamed from the running SUMO simulation through TraCI. This is a 2D coordinate preview; 3D rendering is not connected yet.
        </div>
      </Panel>

      <div className="simulation-aside">
        <Panel title="SUMO simulation controls">
          <label className="field-label">
            Traffic scenario
            <select value="normal" disabled>
              <option value="normal">Normal Traffic</option>
              <option value="heavy" disabled>Heavy Traffic ? coming later</option>
              <option value="emergency" disabled>Emergency Traffic ? coming later</option>
            </select>
          </label>

          <label className="field-label">
            Signal controller
            <select value="fixed_time" disabled>
              <option value="fixed_time">Fixed-Time (available)</option>
              <option value="adaptive" disabled>Adaptive AI ? coming later</option>
            </select>
          </label>

          <div className="control-buttons">
            <Button onClick={() => void startSimulation('normal', 'fixed_time')} disabled={loading || status === 'Running' || status === 'Paused'}>
              <Play size={15} />Start
            </Button>
            <Button variant="secondary" onClick={() => void pauseSimulation()} disabled={status !== 'Running'}>
              <Pause size={15} />Pause
            </Button>
            <Button variant="secondary" onClick={() => void resumeSimulation()} disabled={status !== 'Paused'}>
              <Play size={15} />Resume
            </Button>
            <Button variant="secondary" onClick={() => void stopSimulation()} disabled={status !== 'Running' && status !== 'Paused'}>
              <Square size={14} />Stop
            </Button>
            <Button variant="ghost" onClick={() => void resetSimulation()} disabled={loading}>
              <RotateCcw size={14} />Restart
            </Button>
          </div>

          <div className="simulation-readout">
            <span>Backend status</span><strong><StatusBadge>{status}</StatusBadge></strong>
            <span>SUMO simulation time</span><strong>{elapsed}</strong>
            <span>Controller</span><strong>Fixed-Time</strong>
            <span>Scenario</span><strong>Normal Traffic</strong>
            <span>SUMO availability</span><strong>{metrics?.available ? 'Connected' : 'Waiting for simulation'}</strong>
          </div>

          {error && <div className="mini-callout" role="alert">{error}</div>}
          {loading && <p className="mini-callout">Checking backend simulation status...</p>}
          <div className="mini-callout">
            Adaptive AI, heavy traffic scenarios and emergency vehicle priority are not implemented yet.
          </div>
        </Panel>

        <Panel title="Live SUMO / TraCI metrics">
          {metrics?.available ? (
            <div className="readout-grid">
              <span>Simulation time (seconds)</span><strong>{metricValue('simulation_time')}</strong>
              <span>Active vehicles</span><strong>{metricValue('active_vehicles')}</strong>
              <span>Arrived vehicles</span><strong>{metricValue('arrived_vehicles')}</strong>
              <span>Waiting vehicles</span><strong>{metricValue('waiting_vehicles')}</strong>
              <span>Traffic light IDs</span><strong>{metricValue('traffic_lights')}</strong>
            </div>
          ) : (
            <EmptyState
              title="Live metrics not available"
              description={metrics?.reason ?? 'Start a SUMO simulation to retrieve live vehicle and traffic-light metrics.'}
            />
          )}
        </Panel>
      </div>
    </div>
  </>
}

export function AIControlPage() {
  return <>
    <PageHeader title="AI control center" description="Model recommendations are unavailable until a real simulation engine is connected." action={<Badge tone="warning">Not configured</Badge>} />
    <div className="dashboard-grid">
      <Panel title="AI recommendations"><EmptyState title="No connected AI model" description="No traffic predictions, queue estimates, or signal recommendations are generated by this prototype." /></Panel>
      <Panel title="Connection status"><div className="readout-grid"><span>AI model</span><strong>Not configured</strong><span>Scenario approach records</span><strong>Unavailable</strong><span>Signal control</span><strong>Simulation only</strong></div></Panel>
    </div>
  </>
}

export function EmergencyPage() {
  return <>
    <PageHeader title="Emergency management" description="Emergency event detection and signal priority are not connected." action={<Button variant="secondary" disabled><Siren size={16} />Not configured</Button>} />
    <EmptyState title="No verified emergency events" description="No emergency-event source is connected, so the prototype does not display or generate event records." />
    <div className="safety-notice"><ShieldIcon />No real-world emergency detection or signal-priority actions are performed by this prototype.</div>
  </>
}
function ShieldIcon() { return <CircleAlert size={18} /> }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={17} /></button></div>{children}</section></div>
}

export function HeatmapPage() {
  const { data, hereNotConfigured, loading, error, refresh } = useLiveTraffic()
  return <>
    <PageHeader title="Traffic congestion heatmap" description="HERE road geometry and jam factors for Jaipur; no locations are fabricated." action={<Button variant="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} />{hereNotConfigured ? 'Refresh dashboard data' : 'Refresh live data'}</Button>} />
    {loading && <Panel title="Loading HERE flow"><LoadingSkeleton lines={2} /></Panel>}
    {hereNotConfigured && !loading && <div className="mini-callout" role="status">HERE Live Traffic — Not configured. The map contains no traffic values until the provider is connected.</div>}
    {error && <ErrorState message={error} />}
    {data?.is_stale && <div className="mini-callout" role="status">The latest HERE source timestamp is more than 15 minutes old.</div>}
    <div className="map-layout">
      <Suspense fallback={<Panel title="HERE road geometry"><LoadingSkeleton lines={2} /></Panel>}>
        <LazyTrafficMapPanel items={data?.flow_items ?? []} loading={loading} />
      </Suspense>
      <Panel title="Current HERE road segments">
        {data?.flow_items.length
          ? <DataTable headers={['Road reference', 'Speed km/h', 'Free-flow km/h', 'Jam factor', 'Updated']} rows={data.flow_items.map((item: TrafficFlowItem) => [item.road_segment_reference ?? 'Not supplied', item.speed_kph ?? 'Not supplied', item.free_flow_speed_kph ?? 'Not supplied', item.jam_factor ?? 'Not supplied', item.provider_timestamp ?? 'Not supplied'])} />
          : <EmptyState title={data?.flow_available ? 'No flow segments returned' : 'Live flow unavailable'} description={data?.flow_available ? 'HERE returned an empty flow response for this area.' : 'Road speeds and congestion are not shown without provider data.'} />}
        {data?.last_updated_at && <p className="mini-callout">Latest provider update: {new Date(data.last_updated_at).toLocaleString()}</p>}
      </Panel>
    </div>
  </>
}

export function PredictionPage() {
  return <>
    <PageHeader title="Traffic prediction" description="Forecasts are unavailable until a real prediction service is connected." action={<Badge tone="warning">Not configured</Badge>} />
    <div className="dashboard-grid">
      <Panel title="Prediction service"><EmptyState title="No connected prediction model" description="No traffic forecasts or congestion estimates are generated by this prototype." /></Panel>
      <Panel title="Availability"><div className="readout-grid"><span>Prediction model</span><strong>Not configured</strong><span>Historical database records</span><strong>Unavailable</strong><span>Predicted traffic metrics</span><strong>N/A</strong></div></Panel>
    </div>
  </>
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((field) => `"${field.replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function AnalyticsPage() {
  const reportRows = demoTrafficSample.approaches.map((item) => ({
    time: item.approach,
    vehicles: item.vehicleCount,
    wait: item.averageWait,
  }))
  const totalVehicles = reportRows.reduce((total, row) => total + row.vehicles, 0)
  const averageWait = reportRows.length
    ? Math.round(reportRows.reduce((total, row) => total + row.wait, 0) / reportRows.length)
    : null
  const exportRows = [
    ['approach', 'vehicle_count', 'signal_state', 'green_time_seconds', 'average_wait_seconds'],
    ...demoTrafficSample.approaches.map((item) => [
      item.approach,
      String(item.vehicleCount),
      item.signalState,
      String(item.greenTime),
      String(item.averageWait),
    ]),
  ]
  return <>
    <PageHeader title="Analytics & reports" description="Review the attached workbook records and export those values without adding synthetic metrics." action={<Button onClick={() => downloadCsv('smartflow-sample-analytics.csv', exportRows)}><Download size={16} />Export CSV</Button>} />
    <DemoLabel />
    <p className="mini-callout">Sample traffic data — illustrative values, not live measurements. Source: {demoTrafficSample.source}.</p>
    <div className="metric-grid compact"><Metric label="Sample vehicles in workbook" value={String(totalVehicles)} icon={<CarFront size={18} />} /><Metric label="Sample average wait" value={averageWait === null ? 'N/A' : `${averageWait} sec`} icon={<Clock3 size={18} />} /><Metric label="Average speed" value="N/A" icon={<Activity size={18} />} /><Metric label="Queue length" value="N/A" icon={<BarChart3 size={18} />} /></div>
    <div className="dashboard-grid">
      <ChartPanel title="Workbook sample vehicles by approach" type="bar" data={reportRows} dataKey="vehicles" />
      <ChartPanel title="Workbook sample average wait by approach" type="bar" data={reportRows} dataKey="wait" color="#b481ed" />
      <Panel title="Workbook records"><DataTable headers={['Approach', 'Sample vehicles', 'Signal state', 'Green time', 'Sample wait']} rows={demoTrafficSample.approaches.map((item) => [item.approach, item.vehicleCount, item.signalState, `${item.greenTime} sec`, `${item.averageWait} sec`])} /></Panel>
      <Panel title="Unavailable historical metrics"><EmptyState title="No historical database records" description="Neon has no verified records for historical trends, speed, queue length, or emergency-response analytics." /></Panel>
    </div>
  </>
}

export function HistoryPage() {
  const [query, setQuery] = useState('')
  const [scenario, setScenario] = useState('All scenarios')
  const [page, setPage] = useState(0)
  const [details, setDetails] = useState<(typeof historyRows)[number] | null>(null)
  const filtered = useMemo(() => historyRows.filter((r) => (scenario === 'All scenarios' || r.scenario === scenario) && `${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase())), [query, scenario])
  const pageSize = 4
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize)
  return <>
    <PageHeader title="Simulation history" description="Search and inspect sample run records. These are not persisted backend runs." action={<DemoLabel />} />
    <div className="filters-row"><label className="search-field"><Search size={16} /><input placeholder="Search runs..." value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} /></label><label className="filter-field">Scenario<select value={scenario} onChange={(e) => { setScenario(e.target.value); setPage(0) }}><option>All scenarios</option><option>Normal Traffic</option><option>Heavy Traffic</option><option>Emergency Traffic</option></select></label></div>
    <Panel title="Sample simulation runs">{filtered.length ? <DataTable headers={['Run ID', 'Run name', 'Scenario', 'Controller', 'Start time', 'Completion', 'Status', 'Actions']} rows={rows.map((r) => [r.id, r.name, r.scenario, r.controller, r.start, r.end, <StatusBadge key={`status-${r.id}`}>{r.status}</StatusBadge>, <Button key={`action-${r.id}`} variant="secondary" onClick={() => setDetails(r)}>View</Button>])} /> : <EmptyState title="No matching runs" description="Try changing your search or scenario filter." />}<div className="pagination"><span>Page {page + 1} of {pageCount} · {filtered.length} sample runs</span><div><Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}><ChevronLeft size={15} />Previous</Button><Button variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>Next<ChevronRight size={15} /></Button></div></div></Panel>
    {details && <Modal title={details.name} onClose={() => setDetails(null)}><div className="readout-grid"><span>Run ID</span><strong>{details.id}</strong><span>Scenario</span><strong>{details.scenario}</strong><span>Controller</span><strong>{details.controller}</strong><span>Status</span><strong>{details.status}</strong><span>Start</span><strong>{details.start}</strong><span>Completion</span><strong>{details.end}</strong></div><DemoLabel /><div className="modal-actions"><Button variant="secondary" onClick={() => downloadCsv(`${details.id}-sample-report.csv`, [['Run ID', 'Name', 'Scenario', 'Controller'], [details.id, details.name, details.scenario, details.controller]])}><Download size={15} />Export preview CSV</Button></div></Modal>}
  </>
}

export function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preferencesError, setPreferencesError] = useState('')
  const [loadedPreferencesUserId, setLoadedPreferencesUserId] = useState<string | null>(null)
  const { theme, setTheme } = useTheme()
  const { user, configured } = useAuth()
  const [notifications, setNotifications] = useState(defaultUserPreferences.notifications)
  const [showDemoLabels, setShowDemoLabels] = useState(defaultUserPreferences.showDemoLabels)
  const [scenario, setScenario] = useState(defaultUserPreferences.scenario)
  const [controller, setController] = useState(defaultUserPreferences.controller)
  const [showDirectionLabels, setShowDirectionLabels] = useState(defaultUserPreferences.showDirectionLabels)
  const preferencesLoading = Boolean(user && loadedPreferencesUserId !== user.id)
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    let active = true
    void loadUserPreferences(userId)
      .then((preferences) => {
        if (!active) return
        setPreferencesError('')
        setTheme(preferences.theme)
        setNotifications(preferences.notifications)
        setShowDemoLabels(preferences.showDemoLabels)
        setScenario(preferences.scenario)
        setController(preferences.controller)
        setShowDirectionLabels(preferences.showDirectionLabels)
        setLoadedPreferencesUserId(userId)
      })
      .catch((error: unknown) => {
        if (!active) return
        setPreferencesError(error instanceof Error ? error.message : 'Preferences could not be loaded.')
        setLoadedPreferencesUserId(userId)
      })
    return () => { active = false }
  }, [setTheme, userId])

  const preferences: UserPreferences = {
    theme,
    notifications,
    showDemoLabels,
    scenario,
    controller,
    showDirectionLabels,
  }

  const savePreferences = async () => {
    setSaved(false)
    setPreferencesError('')
    setSaving(true)
    try {
      if (user) {
        await saveUserPreferences(user.id, preferences)
        setSaved(true)
      } else {
        localStorage.setItem('smartflow-guest-preferences', JSON.stringify(preferences))
        setSaved(true)
      }
    } catch (error) {
      setPreferencesError(error instanceof Error ? error.message : 'Preferences could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader title="Settings" description={user ? `Personal preferences for ${user.email ?? 'your account'}.` : 'Guest preferences stay in this browser; sign in to sync settings across devices.'} />
    {preferencesLoading && <Panel title="Loading account preferences"><LoadingSkeleton lines={2} /></Panel>}
    {preferencesError && <ErrorState message={preferencesError} />}
    <div className="settings-grid"><Panel title="Profile"><div className="settings-profile"><div className="avatar large">{user?.email?.slice(0, 2).toUpperCase() ?? 'OP'}</div><div><strong>{user?.user_metadata.name ?? 'Guest workspace'}</strong><small>{user?.email ?? (configured ? 'Not signed in' : 'Supabase Auth is not configured')}</small></div></div></Panel>
      <Panel title="Preferences"><label className="field-label">Theme<select value={theme} onChange={(e) => setTheme(e.target.value === 'light' ? 'light' : 'dark')}><option value="dark">Dark</option><option value="light">Light</option></select></label><label className="check-field"><input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} /> Enable local notification reminders</label><label className="check-field"><input type="checkbox" checked={showDemoLabels} onChange={(e) => setShowDemoLabels(e.target.checked)} /> Show sample data labels</label></Panel>
      <Panel title="Simulation preferences"><label className="field-label">Default scenario<select value={scenario} onChange={(e) => setScenario(e.target.value)}><option>Normal Traffic</option><option>Heavy Traffic</option><option>Emergency Traffic</option></select></label><label className="field-label">Default controller<select value={controller} onChange={(e) => setController(e.target.value)}><option>Adaptive AI</option><option>Fixed-Time</option></select></label><label className="check-field"><input type="checkbox" checked={showDirectionLabels} onChange={(e) => setShowDirectionLabels(e.target.checked)} /> Show vehicle direction labels</label></Panel>
      <Panel title="System information"><div className="readout-grid"><span>Frontend version</span><strong>0.0.0 · development</strong><span>Backend connection</span><strong><StatusBadge>Not checked</StatusBadge></strong><span>API configuration</span><strong>{import.meta.env.VITE_API_URL ? 'URL configured' : 'Default URL'}</strong><span>Secrets</span><strong>Not displayed</strong></div></Panel>
    </div>
    <TwoFactorSettings />
    <div className="settings-save"><span>{saved ? <><Check size={16} /> {user ? 'Preferences saved to your account.' : 'Preferences saved in this browser.'}</> : user ? 'Account preferences use Supabase row-level security.' : 'Sign in to sync preferences across devices.'}</span><Button onClick={() => void savePreferences()} disabled={saving || preferencesLoading}>{saving ? 'Saving…' : 'Save preferences'}</Button></div>
  </>
}
