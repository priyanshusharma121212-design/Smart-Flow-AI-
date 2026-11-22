import { Bell, ChevronDown, Menu, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../contexts/useTheme'
import { useSimulation } from '../../contexts/useSimulation'
import { useAuth } from '../../contexts/useAuth'
import { api } from '../../services/api'

const backendHealthPollMs = 10_000

export function TopNavbar({ onMenu }: { onMenu: () => void }) {
  const [openMenu, setOpenMenu] = useState<'notifications' | 'profile' | null>(null)
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null)
  const [backendError, setBackendError] = useState('')
  const [databaseConnected, setDatabaseConnected] = useState<boolean | null>(null)
  const [databaseError, setDatabaseError] = useState('')
  const { theme, toggleTheme } = useTheme()
  const { status, backendStatus } = useSimulation()
  const { configured, mfaStatus, user, signOut } = useAuth()
  const [profileError, setProfileError] = useState('')
  useEffect(() => {
    let active = true
    let healthTimer: ReturnType<typeof setTimeout> | undefined
    let databaseTimer: ReturnType<typeof setTimeout> | undefined
    const checkBackendHealth = async () => {
      try {
        const health = await api.health()
        if (!active) return
        if (health.ok && health.data.status === 'ok') {
          setBackendConnected(true)
          setBackendError('')
        } else {
          setBackendConnected(false)
          setBackendError(
            health.ok
              ? `FastAPI reported status "${health.data.status}".`
              : health.error.message,
          )
        }
      } catch (error) {
        if (!active) return
        setBackendConnected(false)
        setBackendError(
          error instanceof Error ? error.message : 'The health check failed unexpectedly.',
        )
      } finally {
        if (active) {
          healthTimer = setTimeout(() => { void checkBackendHealth() }, backendHealthPollMs)
        }
      }
    }

    const checkDatabaseHealth = async () => {
      try {
        const health = await api.databaseHealth()
        if (!active) return
        if (health.ok && health.data.connected) {
          setDatabaseConnected(true)
          setDatabaseError('')
        } else {
          setDatabaseConnected(false)
          setDatabaseError(health.ok ? 'Neon reported disconnected.' : health.error.message)
        }
      } catch (error) {
        if (!active) return
        setDatabaseConnected(false)
        setDatabaseError(
          error instanceof Error ? error.message : 'The database health check failed unexpectedly.',
        )
      } finally {
        if (active) {
          databaseTimer = setTimeout(() => { void checkDatabaseHealth() }, backendHealthPollMs)
        }
      }
    }

    void checkBackendHealth()
    void checkDatabaseHealth()
    return () => {
      active = false
      if (healthTimer) clearTimeout(healthTimer)
      if (databaseTimer) clearTimeout(databaseTimer)
    }
  }, [])

  const connectionClass = backendConnected === null
    ? 'backend-checking'
    : backendConnected ? 'backend-connected' : 'backend-disconnected'
  const connectionTitle = backendConnected
    ? 'FastAPI health check succeeded.'
    : backendConnected === null
      ? 'Checking FastAPI health.'
      : `FastAPI health check failed: ${backendError || 'Unknown error.'}`
  const databaseClass = databaseConnected === null
    ? 'backend-checking'
    : databaseConnected ? 'backend-connected' : 'backend-disconnected'
  const databaseTitle = databaseConnected
    ? 'Neon database health check succeeded.'
    : databaseConnected === null
      ? 'Checking Neon database health.'
      : `Neon database health check failed: ${databaseError || 'Unknown error.'}`
  const simulationStatusClass = !backendStatus
    ? 'backend-checking'
    : !backendStatus.available
      ? 'status-informational'
      : status === 'Running'
        ? 'backend-connected'
        : 'status-informational'

  const simulationLabel = !backendStatus
    ? 'checking'
    : backendStatus.available
      ? status.toLowerCase()
      : 'not configured'

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}>
        <Menu size={20} />
      </button>
      <div className="topbar-actions">
        <div className={`connection-status ${connectionClass}`} role="status" aria-label={connectionTitle} title={connectionTitle}>
          <span className="status-dot" />
          <span>Backend: {backendConnected ? 'connected' : backendConnected === null ? 'checking' : 'disconnected'}</span>
        </div>
        <div className={`connection-status ${databaseClass}`} role="status" aria-label={databaseTitle} title={databaseTitle}>
          <span className="status-dot" />
          <span>Database: {databaseConnected ? 'connected' : databaseConnected === null ? 'checking' : 'disconnected'}</span>
        </div>
        <div className={`connection-status ${simulationStatusClass}`} title={backendStatus?.reason ?? 'Checking SUMO simulation status.'}>
          <span className="status-dot" />
          <span>SUMO: {simulationLabel}</span>
        </div>
        <button className="icon-button" aria-label="Notifications" aria-expanded={openMenu === 'notifications'} onClick={() => setOpenMenu(openMenu === 'notifications' ? null : 'notifications')}>
          <Bell size={19} />
        </button>
        <button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button className="profile-button" aria-label="Open profile menu" aria-expanded={openMenu === 'profile'} onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}>
          <div className="avatar">{user?.email?.slice(0, 2).toUpperCase() ?? 'OP'}</div>
          <div className="profile-copy">
            <strong>{user?.user_metadata.name ?? user?.email ?? 'Public user'}</strong>
            <span>{user
              ? mfaStatus === 'required' ? 'MFA verification required' : mfaStatus === 'checking' ? 'Checking MFA' : mfaStatus === 'unavailable' ? 'MFA status unavailable' : 'Signed in'
              : 'Guest access'}</span>
          </div>
          <ChevronDown size={16} />
        </button>
        {openMenu && <div className="topbar-popover" role="status">
          <strong>{openMenu === 'notifications' ? 'Notifications' : 'Workspace profile'}</strong>
          <p>{openMenu === 'notifications'
            ? 'No connected backend notifications.'
            : user && mfaStatus === 'required'
              ? `${user.email ?? 'Account'} · complete TOTP verification. Public dashboard access remains available.`
              : user?.email ?? (configured ? 'Public access · sign in to save preferences.' : 'Public access · account features are not configured.')}</p>
          {profileError && <p role="alert">{profileError}</p>}
          {openMenu === 'profile' && user && mfaStatus === 'required' && <Link to="/login" onClick={() => setOpenMenu(null)}>Complete 2FA verification</Link>}
          {openMenu === 'profile' && user
            ? <button onClick={() => { void signOut().then((result) => { if (result.error) setProfileError(result.error); else { setProfileError(''); setOpenMenu(null) } }).catch(() => setProfileError('Sign-out is unavailable; try again when account services recover.')) }}>Sign out</button>
            : openMenu === 'profile' && configured
              ? <Link to="/login" onClick={() => setOpenMenu(null)}>Sign in</Link>
              : <button onClick={() => setOpenMenu(null)}>Dismiss</button>}
        </div>}
      </div>
    </header>
  )
}
