'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck, ArrowLeft, Bell, User, Clock, TrendingUp,
  Activity, ChevronRight, MessageCircle, Settings2, BarChart3,
  CheckCircle, AlertTriangle, Info, Heart, Zap,
} from 'lucide-react'

const API = '/api/v1/guardian'

// ── Types ───────────────────────────────────────────────────

interface GuardianAlert {
  id: string
  severity: string
  category: string
  title: string
  summary: string
  contributing_observations: string[]
  interpretation: string | null
  suggested_approach: string | null
  conversation_starter: string | null
  confidence: number
  is_acknowledged: boolean
  detected_at: string
}

interface DashboardData {
  connection_id: string
  device_name: string
  current_status: string
  status_summary: string
  stability_score: number
  recent_changes: string
  positive_changes: string[]
  unread_alerts: number
}

interface Connection {
  id: string
  device_id: string
  device_name: string
  status: string
}

// ── Config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  stable: { label: 'Stable', color: '#059669', bg: '#ECFDF5', icon: <CheckCircle size={18} color="#059669" /> },
  improving: { label: 'Improving', color: '#059669', bg: '#ECFDF5', icon: <TrendingUp size={18} color="#059669" /> },
  mild_change: { label: 'Mild Change Detected', color: '#D97706', bg: '#FFFBEB', icon: <AlertTriangle size={18} color="#D97706" /> },
  needs_attention: { label: 'Needs Attention', color: '#EA580C', bg: '#FFF7ED', icon: <AlertTriangle size={18} color="#EA580C" /> },
  high_concern: { label: 'High Concern', color: '#DC2626', bg: '#FEF2F2', icon: <Info size={18} color="#DC2626" /> },
}

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  info: { label: 'Info', color: '#6B7280', bg: '#F9FAFB' },
  observation: { label: 'Observation', color: '#D97706', bg: '#FFFBEB' },
  attention: { label: 'Needs Attention', color: '#EA580C', bg: '#FFF7ED' },
  urgent: { label: 'Urgent', color: '#DC2626', bg: '#FEF2F2' },
  critical: { label: 'Critical', color: '#991B1B', bg: '#FEF2F2' },
  positive: { label: 'Positive', color: '#059669', bg: '#ECFDF5' },
}

const CATEGORY_ICONS: Record<string, string> = {
  behavior: '📊', wellbeing: '💚', safety: '🛡️', isolation: '🤝',
  sleep: '🌙', routine: '🔄', mood: '💭', risk_escalation: '⚠️', positive: '🌟',
}

// ── Page ────────────────────────────────────────────────────

export default function GuardianDashboardPage() {
  const router = useRouter()
  const [token, setToken] = useState<string>('')
  const [connections, setConnections] = useState<Connection[]>([])
  const [activeConn, setActiveConn] = useState<Connection | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [alerts, setAlerts] = useState<GuardianAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)
  const [connectInput, setConnectInput] = useState('')

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  useEffect(() => {
    const t = localStorage.getItem('prism_token')
    if (!t) { router.push('/'); return }
    setToken(t)
  }, [router])

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API}/connections`, { headers })
      if (res.ok) {
        const data = await res.json()
        setConnections(data)
        if (data.length > 0) setActiveConn(data[0])
        else setLoading(false)
      } else {
        setLoading(false)
      }
    } catch { setLoading(false) }
  }, [headers])

  const fetchDashboard = useCallback(async (connId: string) => {
    try {
      const res = await fetch(`${API}/dashboard/${connId}`, { headers })
      if (res.ok) setDashboard(await res.json())
    } catch {} finally { setLoading(false) }
  }, [headers])

  // Severity is passed explicitly — reading it from state here would race
  // with setSelectedSeverity and fetch with the previous filter value.
  const fetchAlerts = useCallback(async (connId: string, severity: string | null = null) => {
    try {
      const params = severity ? `?severity=${encodeURIComponent(severity)}` : ''
      const res = await fetch(`${API}/alerts/${connId}${params}`, { headers })
      if (res.ok) {
        const data = await res.json()
        setAlerts(data.alerts || [])
      }
    } catch {}
  }, [headers])

  useEffect(() => {
    if (!token) return
    fetchConnections()
  }, [token, fetchConnections])

  useEffect(() => {
    if (activeConn) {
      fetchDashboard(activeConn.id)
      fetchAlerts(activeConn.id, selectedSeverity)
    }
  }, [activeConn, selectedSeverity, fetchDashboard, fetchAlerts])

  const acknowledge = async (alertId: string) => {
    if (!activeConn) return
    try {
      await fetch(`${API}/alerts/${alertId}/acknowledge`, {
        method: 'POST', headers,
        body: JSON.stringify({ connection_id: activeConn.id }),
      })
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, is_acknowledged: true } : a))
    } catch {}
  }

  const connectDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`${API}/connections`, {
        method: 'POST', headers,
        body: JSON.stringify({ device_id: deviceId }),
      })
      if (res.ok) {
        const data = await res.json()
        setConnections(prev => [...prev, { id: data.connection_id, device_id: deviceId, device_name: 'Device', status: 'active' }])
        setActiveConn({ id: data.connection_id, device_id: deviceId, device_name: 'Device', status: 'active' })
      }
    } catch {}
  }

  const statusCfg = dashboard ? STATUS_CONFIG[dashboard.current_status] || STATUS_CONFIG.stable : STATUS_CONFIG.stable

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F2' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #0A0A0A', margin: '0 auto 16px', animation: 'spin-slow 2s linear infinite', borderRightColor: 'transparent' }} />
          <p style={{ fontSize: 14, color: '#6B6B6B' }}>Loading Guardian Dashboard…</p>
        </div>
      </div>
    )
  }

  if (!activeConn) {
    return (
      <div style={{ minHeight: '100vh', background: '#F4F4F2', fontFamily: "'Inter', system-ui, sans-serif", position: 'relative' }}>
        <header style={{
          height: 58, background: '#fff', borderBottom: '1px solid #EBEBEB',
          display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16,
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <button onClick={() => router.push('/overview')} style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B6B6B',
          }}><ArrowLeft size={16} /> Dashboard</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={16} color="#fff" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Guardian Dashboard</span>
          </div>
        </header>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 58px)' }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 32, background: '#fff', borderRadius: 24, border: '1px solid #EBEBEB', boxShadow: '0 8px 40px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#0A0A0A', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A0A', marginBottom: 10 }}>No Guardian Connections</h2>
          <p style={{ fontSize: 14, color: '#6B6B6B', lineHeight: 1.7, marginBottom: 24 }}>
            Connect with a PRISM user to start receiving privacy-preserving behavioral trend summaries.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="Enter device ID" 
              value={connectInput}
              onChange={e => setConnectInput(e.target.value)}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid #EBEBEB',
                fontSize: 14, fontFamily: "'Inter', sans-serif"
              }}
            />
            <button onClick={() => connectDevice(connectInput)} style={{
              padding: '12px 24px', background: '#0A0A0A', color: '#fff', border: 'none',
              borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>Connect</button>
          </div>
          <p style={{ fontSize: 11, color: '#AEAEB2' }}>
            You&apos;ll see behavioral trends only — never messages, conversations, or private content.
          </p>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F2', fontFamily: "'Inter', system-ui, sans-serif", color: '#0A0A0A' }}>
      {/* Header */}
      <header style={{
        height: 58, background: '#fff', borderBottom: '1px solid #EBEBEB',
        display: 'flex', alignItems: 'center', padding: '0 28px', gap: 16,
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button onClick={() => router.push('/overview')} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6B6B6B',
        }}><ArrowLeft size={16} /> Dashboard</button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={16} color="#fff" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Guardian Dashboard</span>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Status Card */}
        <div style={{
          background: '#fff', borderRadius: 20, border: '1px solid #EBEBEB',
          padding: '28px 32px', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  background: statusCfg.bg, color: statusCfg.color,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {statusCfg.icon} {statusCfg.label}
                </div>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A0A', margin: 0 }}>{dashboard?.device_name || 'Unknown'}</h1>
              <p style={{ fontSize: 14, color: '#6B6B6B', marginTop: 8, maxWidth: 520, lineHeight: 1.6 }}>
                {dashboard?.status_summary}
              </p>
            </div>

            {/* Stability */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%', border: '6px solid #F0F0F0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderTopColor: '#0A0A0A', borderRightColor: '#0A0A0A',
              }}>
                <span style={{ fontFamily: "'Space Grotesk', monospace", fontSize: 20, fontWeight: 800 }}>
                  {dashboard?.stability_score ?? '—'}
                </span>
              </div>
              <p style={{ fontSize: 10, color: '#AEAEB2', marginTop: 6, fontWeight: 600 }}>STABILITY</p>
            </div>
          </div>
        </div>

        {/* Recent Changes */}
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #EBEBEB', padding: '24px 28px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Activity size={16} color="#6B6B6B" />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#AEAEB2', textTransform: 'uppercase' }}>Recent Behavioural Change</span>
          </div>
          <p style={{ fontSize: 14, color: '#0A0A0A', lineHeight: 1.7, margin: 0 }}>
            {dashboard?.recent_changes || 'No significant changes detected.'}
          </p>
        </div>

        {/* Alerts */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={16} color="#6B6B6B" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#AEAEB2', textTransform: 'uppercase' }}>
                Alerts {dashboard?.unread_alerts ? `(${dashboard.unread_alerts} unread)` : ''}
              </span>
            </div>
            {/* Severity filters */}
            <div style={{ display: 'flex', gap: 6 }}>
              {Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => setSelectedSeverity(selectedSeverity === key ? null : key)}
                  style={{
                    padding: '4px 10px', borderRadius: 8, border: selectedSeverity === key ? `2px solid ${cfg.color}` : '1px solid #EBEBEB',
                    background: selectedSeverity === key ? cfg.bg : '#fff', cursor: 'pointer',
                    fontSize: 10, fontWeight: 600, color: cfg.color,
                  }}>{cfg.label}</button>
              ))}
            </div>
          </div>

          {alerts.length === 0 ? (
            <div style={{
              background: '#fff', borderRadius: 16, border: '1px solid #EBEBEB', padding: '32px 28px',
              textAlign: 'center',
            }}>
              <Bell size={24} color="#D1D1D6" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: '#AEAEB2', margin: 0 }}>No alerts to display.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map(alert => {
                const sevCfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info
                const isExpanded = expandedAlert === alert.id
                return (
                  <div key={alert.id} style={{
                    background: alert.is_acknowledged ? '#fff' : sevCfg.bg,
                    borderRadius: 14, border: alert.is_acknowledged ? '1px solid #EBEBEB' : `1.5px solid ${sevCfg.color}30`,
                    padding: '18px 24px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }} onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
                        <span style={{ fontSize: 18 }}>{CATEGORY_ICONS[alert.category] || '📊'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: sevCfg.bg, color: sevCfg.color,
                            }}>{sevCfg.label}</span>
                            <span style={{ fontSize: 10, color: '#AEAEB2' }}>
                              {alert.confidence}% confidence
                            </span>
                          </div>
                          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0A0A0A', margin: '0 0 4px' }}>
                            {alert.title}
                          </h3>
                          <p style={{ fontSize: 13, color: '#6B6B6B', margin: 0, lineHeight: 1.5 }}>
                            {alert.summary}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: '#AEAEB2' }}>
                          {new Date(alert.detected_at).toLocaleDateString()}
                        </span>
                        {!alert.is_acknowledged && (
                          <button onClick={(e) => { e.stopPropagation(); acknowledge(alert.id) }}
                            style={{
                              padding: '4px 12px', borderRadius: 8, border: '1px solid #EBEBEB',
                              background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#0A0A0A',
                            }}>Acknowledge</button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #EBEBEB', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {alert.contributing_observations.length > 0 && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#AEAEB2', marginBottom: 8 }}>What We&apos;re Seeing</p>
                            {alert.contributing_observations.map((obs, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#0A0A0A', marginTop: 6, flexShrink: 0 }} />
                                <span style={{ fontSize: 13, color: '#3A3A3A', lineHeight: 1.5 }}>{obs}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {alert.interpretation && (
                          <div style={{ padding: 12, borderRadius: 10, background: '#F9F9F8' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#AEAEB2', marginBottom: 4 }}>What This Means</p>
                            <p style={{ fontSize: 13, color: '#3A3A3A', margin: 0, lineHeight: 1.5 }}>{alert.interpretation}</p>
                          </div>
                        )}
                        {alert.suggested_approach && (
                          <div style={{ padding: 12, borderRadius: 10, background: '#F9F9F8' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#AEAEB2', marginBottom: 4 }}>Suggested Approach</p>
                            <p style={{ fontSize: 13, color: '#3A3A3A', margin: 0, lineHeight: 1.5 }}>{alert.suggested_approach}</p>
                          </div>
                        )}
                        {alert.conversation_starter && (
                          <div style={{ padding: 12, borderRadius: 10, background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <MessageCircle size={12} color="#4F46E5" />
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5' }}>Conversation Starter</span>
                            </div>
                            <p style={{ fontSize: 13, color: '#3730A3', margin: 0, lineHeight: 1.5 }}>{alert.conversation_starter}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Positive Changes */}
        {dashboard?.positive_changes && dashboard.positive_changes.length > 0 && (
          <div style={{
            background: '#ECFDF5', borderRadius: 16, border: '1px solid #A7F3D0',
            padding: '24px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TrendingUp size={16} color="#059669" />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', color: '#059669', textTransform: 'uppercase' }}>Positive Changes</span>
            </div>
            {dashboard.positive_changes.map((change, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <CheckCircle size={14} color="#059669" style={{ marginTop: 2 }} />
                <span style={{ fontSize: 14, color: '#065F46' }}>{change}</span>
              </div>
            ))}
          </div>
        )}

        {/* Privacy notice */}
        <div style={{
          padding: 16, borderRadius: 14, background: '#F9F9F8', border: '1px solid #EBEBEB',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <ShieldCheck size={16} color="#AEAEB2" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: '#AEAEB2', margin: 0, lineHeight: 1.6 }}>
            PRISM Guardian shares behavioral trend summaries only — never messages, conversations, journals, voice content, location data, or personal reflections. Your data access is logged for transparency.
          </p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  )
}
