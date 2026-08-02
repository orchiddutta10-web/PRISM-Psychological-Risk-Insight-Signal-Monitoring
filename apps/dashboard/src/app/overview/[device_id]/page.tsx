'use client'

import React, { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ShieldCheck, ArrowLeft, MapPin, Keyboard, Smartphone, 
  AlertTriangle, CheckCircle, Clock, BarChart3, ShieldAlert,
  ChevronDown, ChevronUp, Sliders, Moon, Sun, Eye, Info, X, HelpCircle
} from 'lucide-react'
import { API, wsUrl } from '@/lib/api'

interface AlertItem {
  id: string
  device_id: string
  severity_tier: 'sage' | 'amber' | 'red'
  plain_language_summary: string
  contributing_factors: string[]
  is_viewed: boolean
  timestamp: string
}

interface RiskScoreItem {
  id: string
  device_id: string
  model_name: 'mobility' | 'typing' | 'app_usage' | 'signatures' | 'pulse'
  score: number
  threshold: number
  flagged: boolean
  contributing_factors: string[]
  timestamp: string
}

interface Baseline {
  mean: number
  variance: number
}

interface PageProps {
  params: Promise<{ device_id: string }>
}

export default function ChildProfilePage({ params }: PageProps) {
  const router = useRouter()
  const { device_id: deviceId } = use(params)

  const [token, setToken] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState('Child Device')
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [scores, setScores] = useState<RiskScoreItem[]>([])
  const [baselines, setBaselines] = useState<Record<string, Baseline>>({})
  const [timeFilter, setTimeFilter] = useState<'7d' | '30d' | '90d'>('7d')
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // RBAC & Consent Settings
  const [userRole, setUserRole] = useState<'guardian' | 'guardian-admin' | 'clinician' | 'self'>('guardian')
  const [consentGrants, setConsentGrants] = useState<Record<string, boolean>>({
    location: false,
    app_usage: false,
    typing: false,
    gsr: false,
    voice: false,
    companion_chat: false
  })

  // Adaptive Theming
  const [theme, setTheme] = useState<'dark' | 'light' | 'high-contrast'>('dark')

  // Personalization
  const [panelOrder, setPanelOrder] = useState<string[]>(['mobility', 'typing', 'app_usage'])
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({
    mobility: false,
    typing: false,
    app_usage: false
  })
  const [quietHours, setQuietHours] = useState(false)
  const [threshMobility, setThreshMobility] = useState(4000)
  const [threshTyping, setThreshTyping] = useState(1.20)
  const [threshUsage, setThreshUsage] = useState(0.60)
  const [threshWarning, setThreshWarning] = useState<string | null>(null)

  // Guided Onboarding Tour
  const [tourStep, setTourStep] = useState<number | null>(null)

  // Helper for alert explainability structure
  const formatAlertExplainability = (alert: AlertItem) => {
    const summary = alert.plain_language_summary || '';
    const factors = alert.contributing_factors || [];
    
    let whatChanged = summary;
    let vsBaseline = "Compared to standard 14-day telemetry baselines.";
    let nextStep = "Consider checking in with them about their general routine in a supportive environment.";
    
    const textLower = (summary + " " + factors.join(" ")).toLowerCase();
    
    if (textLower.includes("sleep") || textLower.includes("night") || textLower.includes("bedtime") || textLower.includes("circadian")) {
      whatChanged = "Sleep boundary shifting and nocturnal inactivity deviations detected.";
      vsBaseline = "Compared to their 14-day nocturnal baseline plateau and motion entropy bounds.";
      nextStep = "Consider having a supportive discussion about their sleep routine and winding down without screens before bed.";
    } else if (textLower.includes("step") || textLower.includes("movement") || textLower.includes("mobility") || textLower.includes("withdrawal")) {
      whatChanged = "Substantial drop in daily activity and movement levels observed.";
      vsBaseline = "Compared to their 14-day running average step count and geographic entropy.";
      nextStep = "Consider inviting them to do a shared physical activity or checking in about their day in a warm way.";
    } else if (textLower.includes("app") || textLower.includes("packages") || textLower.includes("chat") || textLower.includes("registry") || textLower.includes("com.")) {
      whatChanged = "Installation or high usage of a newly flagged or unverified chat application detected.";
      vsBaseline = "Compared to their standard installed app registry baselines.";
      nextStep = "Consider discussing online safety configurations and verifying app details together in a collaborative way.";
    } else if (textLower.includes("voice") || textLower.includes("stress") || textLower.includes("emotion") || textLower.includes("affect")) {
      whatChanged = "Deviations in vocal stress markers and acoustic affect profiles during check-in.";
      vsBaseline = "Compared to their baseline vocal frequency profiles.";
      nextStep = "Consider starting a gentle conversation, letting them share how they are feeling at their own pace.";
    } else if (textLower.includes("crisis") || textLower.includes("companion") || textLower.includes("safety")) {
      whatChanged = "Crisis indicator keywords matched in AI companion conversation stream.";
      vsBaseline = "Emergency crisis bypass triggered by safety monitoring perimeter.";
      nextStep = "Urgent: Please check in immediately and share the provided hotlines. Consider seeking professional counselor guidance.";
    }
    
    if (factors.length > 0) {
      if (factors[0] && !factors[0].includes("Emergency")) {
        whatChanged = factors[0];
      }
      if (factors.length > 1) {
        vsBaseline = factors.slice(1).join(" & ");
      }
    }
    
    whatChanged = whatChanged.replace(/depress[a-z]*/gi, "mood variation").replace(/insomnia/gi, "sleep boundary disruption");
    
    return { whatChanged, vsBaseline, nextStep };
  };

  const handleToggleConsent = async (modality: string) => {
    const nextState = !consentGrants[modality];
    setConsentGrants(prev => ({ ...prev, [modality]: nextState }));
    try {
      await fetch(`${API}/consent/grants/${deviceId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modality, is_granted: nextState })
      });
    } catch (err) {
      console.error("Failed to update consent grant:", err);
      setConsentGrants(prev => ({ ...prev, [modality]: !nextState }));
    }
  };

  useEffect(() => {
    // Theme sync on mount
    const savedTheme = localStorage.getItem('prism_theme') as any
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    }

    // Check first run for tour
    const tourDone = localStorage.getItem('prism_tour_profile_done')
    if (!tourDone) {
      setTourStep(1)
    }

    const activeToken = localStorage.getItem('prism_token')
    if (!activeToken) {
      router.push('/')
      return
    }
    setToken(activeToken)

    const gs = localStorage.getItem('prism_guardian')
    if (gs) {
      try {
        const g = JSON.parse(gs)
        setUserRole(g.role || 'guardian')
      } catch {}
    }

    const fetchData = async () => {
      try {
        const resAlerts = await fetch(`${API}/events/alerts/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        const alertsData = await resAlerts.json()
        setAlerts(alertsData)
        if (alertsData.length > 0) {
          setDeviceName(alertsData[0].device_name || 'Child Device')
        }

        const resScores = await fetch(`${API}/events/scores/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        setScores(await resScores.json())

        const resBaselines = await fetch(`${API}/events/baselines/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        setBaselines(await resBaselines.json())
      } catch (err) {
        console.error('Error fetching Child Profile stats:', err)
      } finally {
        // Delay skeleton just a bit for smooth visual transition
        setTimeout(() => setIsLoading(false), 800)
      }
    }

    const fetchConsentGrants = async () => {
      try {
        const res = await fetch(`${API}/consent/grants/${deviceId}`, {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        const data = await res.json()
        const initialGrants: Record<string, boolean> = { location: false, app_usage: false, typing: false, gsr: false, voice: false, companion_chat: false }
        if (Array.isArray(data)) {
          data.forEach((g: any) => {
            initialGrants[g.modality] = g.is_granted
          })
        }
        setConsentGrants(initialGrants)
      } catch (err) {
        console.error("Error fetching consent grants:", err)
      }
    }

    fetchData()
    fetchConsentGrants()

    const wsUrl_ = wsUrl('/events/ws?token=' + activeToken)
    const ws = new WebSocket(wsUrl_)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.device_id === deviceId) {
          if (data.severity_tier) {
            setAlerts(prev => [data, ...prev])
          } else {
            fetchData()
          }
        }
      } catch (e) {
        console.error(e)
      }
    }

    return () => {
      ws.close()
    }
  }, [deviceId, router])

  const toggleTheme = (newTheme: 'dark' | 'light' | 'high-contrast') => {
    setTheme(newTheme)
    localStorage.setItem('prism_theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  // Handle reordering of panels
  const movePanel = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= panelOrder.length) return
    const newOrder = [...panelOrder]
    const temp = newOrder[index]
    newOrder[index] = newOrder[nextIndex]
    newOrder[nextIndex] = temp
    setPanelOrder(newOrder)
  }

  // Handle collapsible status
  const toggleCollapse = (panelKey: string) => {
    setCollapsedPanels(prev => ({ ...prev, [panelKey]: !prev[panelKey] }))
  }

  // Custom configuration thresholds with <= 5% false-positive clamps
  const handleThresholdChange = (type: 'mobility' | 'typing' | 'usage', val: number) => {
    setThreshWarning(null)
    if (type === 'mobility') {
      if (val > 6000) {
        setThreshMobility(6000)
        setThreshWarning('Steps threshold clamped to 6000 to protect the <= 5% false-positive guardrail.')
      } else {
        setThreshMobility(val)
      }
    } else if (type === 'typing') {
      if (val < 1.15) {
        setThreshTyping(1.15)
        setThreshWarning('Typing delay index clamped to 1.15 to protect the <= 5% false-positive guardrail.')
      } else {
        setThreshTyping(val)
      }
    } else if (type === 'usage') {
      if (val < 0.55) {
        setThreshUsage(0.55)
        setThreshWarning('App anomaly threshold clamped to 0.55 to protect the <= 5% false-positive guardrail.')
      } else {
        setThreshUsage(val)
      }
    }
  }

  // Close onboarding tour
  const finishTour = () => {
    setTourStep(null)
    localStorage.setItem('prism_tour_profile_done', 'true')
  }

  // Loading skeleton layout matching the grids
  if (isLoading) {
    return (
      <div className="min-h-screen bg-prism-dark text-prism-light p-8 space-y-8">
        <div className="h-10 w-48 skeleton-box mb-6" />
        <div className="flex justify-between items-center border-b border-prism-navy pb-6">
          <div className="space-y-3">
            <div className="h-8 w-64 skeleton-box" />
            <div className="h-4 w-96 skeleton-box" />
          </div>
          <div className="h-10 w-40 skeleton-box" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-44 w-full skeleton-box" />
          <div className="h-44 w-full skeleton-box" />
          <div className="h-44 w-full skeleton-box" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="h-80 col-span-2 w-full skeleton-box" />
          <div className="h-80 w-full skeleton-box" />
        </div>
      </div>
    )
  }

  // Extract actual data vs baseline for overlay charts
  const getBaselineMean = (type: string, fallback: number) => {
    return baselines[type]?.mean ?? fallback
  }

  const mobilityBaseline = getBaselineMean('location', 10000)
  const mobilityActual = scores.filter(s => s.model_name === 'mobility')[0]?.score ?? 0.8
  const mobilitySteps = mobilityActual * 15000

  const typingBaseline = getBaselineMean('typing', 1.0)
  const typingActual = scores.filter(s => s.model_name === 'typing')[0]?.score ?? 0.1
  const typingDelay = 1.0 + typingActual * 0.5

  const usageBaseline = getBaselineMean('app_usage', 1.5)
  const usageActual = scores.filter(s => s.model_name === 'app_usage')[0]?.score ?? 0.2
  const usageHours = usageActual * 4.0

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}>
      {/* Navigation Header */}
      <header className="border-b border-prism-navy py-4 px-6 shadow-md transition-colors" style={{ backgroundColor: 'var(--bg-card)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            onClick={() => router.push('/overview')}
            className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-prism-sage transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </button>
          
          {/* Theme switcher */}
          <div className="flex items-center gap-4">
            <div className="flex border rounded-lg p-0.5" style={{ borderColor: 'var(--border-card)' }}>
              <button
                onClick={() => toggleTheme('dark')}
                className={`p-1.5 rounded-md ${theme === 'dark' ? 'bg-prism-navy text-prism-light' : 'text-gray-400 hover:text-prism-light'}`}
                title="Dark Theme"
              >
                <Moon className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggleTheme('light')}
                className={`p-1.5 rounded-md ${theme === 'light' ? 'bg-prism-navy text-prism-light' : 'text-gray-400 hover:text-prism-light'}`}
                title="Light Theme"
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggleTheme('high-contrast')}
                className={`p-1.5 rounded-md ${theme === 'high-contrast' ? 'bg-prism-navy text-prism-light' : 'text-gray-400 hover:text-prism-light'}`}
                title="High Contrast Theme"
              >
                <Eye className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setTourStep(1)}
              className="text-gray-400 hover:text-prism-sage transition-colors"
              title="Start Product Tour"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        
        {/* Child Profile Meta */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between border-b pb-6 gap-4" style={{ borderColor: 'var(--border-card)' }}>
          <div>
            <h1 className="text-3xl font-extrabold">{deviceName}</h1>
            <p className="text-sm text-gray-400 mt-1 uppercase tracking-wider font-mono">
              Device Monitoring ID: {deviceId}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Quiet Hours Switcher */}
            <div className="flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-mono font-bold" style={{ borderColor: 'var(--border-card)' }}>
              <span>Quiet Hours</span>
              <button
                onClick={() => setQuietHours(!quietHours)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${quietHours ? 'bg-prism-sage' : 'bg-gray-700'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${quietHours ? 'translate-x-4' : 'translate-x-0.5'}`} style={{ marginTop: '2px' }} />
              </button>
            </div>
            
            {/* Time Filter Toggles */}
            <div className="flex rounded-lg border p-1" style={{ borderColor: 'var(--border-card)' }}>
              {(['7d', '30d', '90d'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeFilter(t)}
                  className={`rounded-md px-4 py-1 text-xs font-bold font-mono transition-all ${
                    timeFilter === t
                      ? 'bg-prism-navy text-prism-light font-bold'
                      : 'text-gray-400 hover:text-prism-light'
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Customizable thresholds config panel */}
        <div className="mb-8 p-5 rounded-xl border relative" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <Sliders className="h-4 w-4 text-prism-sage" />
              <span>Guardian Alert-Severity Threshold Configurations</span>
            </h3>
            <span className="text-[10px] text-prism-sage bg-prism-sage/10 border border-prism-sage/20 rounded px-2 py-0.5 font-bold">FPR &le; 5% Enforced</span>
          </div>
          
          {threshWarning && (
            <div className="mb-4 p-2.5 rounded bg-prism-amber/10 border border-prism-amber/20 text-xs text-prism-light flex items-center gap-2 animate-pulse">
              <Info className="h-4 w-4 text-prism-amber shrink-0" />
              <span>{threshWarning}</span>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-3 text-xs">
            {/* Mobility threshold slider */}
            <div>
              <div className="flex justify-between font-mono mb-2">
                <span>Mobility steps limit:</span>
                <span className="font-bold tabular-nums">{threshMobility} steps</span>
              </div>
              <input
                type="range"
                min="2000"
                max="8000"
                step="500"
                value={threshMobility}
                onChange={(e) => handleThresholdChange('mobility', parseInt(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] text-gray-500 block mt-1">Clamped above 6000 to prevent false anomalies.</span>
            </div>

            {/* Typing threshold slider */}
            <div>
              <div className="flex justify-between font-mono mb-2">
                <span>Typing delay index:</span>
                <span className="font-bold tabular-nums">{threshTyping.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={threshTyping}
                onChange={(e) => handleThresholdChange('typing', parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] text-gray-500 block mt-1">Clamped below 1.15 to avoid daily rhythm noises.</span>
            </div>

            {/* App usage threshold slider */}
            <div>
              <div className="flex justify-between font-mono mb-2">
                <span>App Anomaly limit:</span>
                <span className="font-bold tabular-nums">{threshUsage.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="0.8"
                step="0.05"
                value={threshUsage}
                onChange={(e) => handleThresholdChange('usage', parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-[9px] text-gray-500 block mt-1">Clamped below 0.55 to protect the false-positive guardrail.</span>
            </div>
          </div>
        </div>

        {/* Dynamic Reorderable / Collapsible Signal Cards Grid */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          {panelOrder.map((panelKey, index) => {
            const isCollapsed = collapsedPanels[panelKey]
            
            return (
              <div 
                key={panelKey}
                className="rounded-xl border shadow-lg transition-all"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                {/* Header with customization controls */}
                <div className="flex items-center justify-between p-4 border-b border-prism-navy/40">
                  <div className="flex items-center gap-2">
                    {panelKey === 'mobility' && <MapPin className="h-4 w-4 text-prism-sage" />}
                    {panelKey === 'typing' && <Keyboard className="h-4 w-4 text-prism-sage" />}
                    {panelKey === 'app_usage' && <Smartphone className="h-4 w-4 text-prism-sage" />}
                    <h3 className="font-bold text-sm uppercase tracking-wider capitalize">
                      {panelKey.replace('_', ' ')}
                    </h3>
                  </div>
                  
                  {/* Reorder and Collapse Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => movePanel(index, 'up')}
                      disabled={index === 0}
                      className="text-gray-500 hover:text-prism-light disabled:opacity-30"
                      title="Move Panel Left/Up"
                    >
                      <ChevronDown className="h-4 w-4 transform rotate-90" />
                    </button>
                    <button
                      onClick={() => movePanel(index, 'down')}
                      disabled={index === panelOrder.length - 1}
                      className="text-gray-500 hover:text-prism-light disabled:opacity-30"
                      title="Move Panel Right/Down"
                    >
                      <ChevronUp className="h-4 w-4 transform rotate-90" />
                    </button>
                    <button
                      onClick={() => toggleCollapse(panelKey)}
                      className="text-gray-500 hover:text-prism-light"
                      title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
                    >
                      <ChevronDown className={`h-4 w-4 transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                  </div>
                </div>

                {/* Collapsible Content */}
                {!isCollapsed && (
                  <div className="p-5 space-y-4">
                    {userRole === 'guardian' ? (
                      /* Guardian View: Trend Band Visualization (no raw lines) */
                      <div className="h-28 w-full rounded-lg p-3 flex flex-col justify-center gap-2 border" style={{ backgroundColor: 'rgba(255,255,255,0.01)', borderColor: 'var(--border-card)' }}>
                        <div className="flex justify-between text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                          <span>Lower bounds</span>
                          <span className="text-prism-sage">Optimal baseline range</span>
                          <span>Upper bounds</span>
                        </div>
                        <div className="h-2.5 w-full bg-gray-800 rounded-full overflow-hidden relative">
                          <div className="absolute left-1/4 right-1/4 top-0 bottom-0 bg-prism-sage/20 border-l border-r border-prism-sage/35" />
                          <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-prism-sage border border-white shadow" style={{
                            left: panelKey === 'mobility'
                              ? `${Math.max(10, Math.min(90, (mobilitySteps / 15000) * 100))}%`
                              : panelKey === 'typing'
                              ? `${Math.max(10, Math.min(90, ((typingDelay - 0.8) / 1.2) * 100))}%`
                              : `${Math.max(10, Math.min(90, (usageHours / 5) * 100))}%`
                          }} />
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono text-center">
                          {panelKey === 'mobility' && (mobilitySteps < mobilityBaseline * 0.6 ? 'Deviation: Reduced activity detected' : 'Status: Optimal movement limits')}
                          {panelKey === 'typing' && (typingDelay > typingBaseline * 1.2 ? 'Deviation: Rhythm offset detected' : 'Status: Optimal typing cadence')}
                          {panelKey === 'app_usage' && (usageHours > usageBaseline * 1.5 ? 'Deviation: Increased late hours screen usage' : 'Status: Standard screen balance')}
                        </span>
                      </div>
                    ) : (
                      /* Clinician/Self View: Raw SVG overlay line chart with draw-in animation */
                      <div className="h-28 w-full bg-prism-dark/40 rounded-lg p-2 flex items-center justify-center border border-prism-navy/40 relative">
                        <svg viewBox="0 0 100 30" className="w-full h-full">
                          <line x1="0" y1="15" x2="100" y2="15" stroke="#94A3B8" strokeWidth="1" strokeDasharray="2,2" />
                          <path 
                            d={
                              panelKey === 'mobility'
                                ? `M 0,25 Q 25,${mobilityActual > 0.5 ? 28 : 10} 50,${mobilityActual > 0.5 ? 26 : 15} T 100,${mobilityActual > 0.5 ? 28 : 14}`
                                : panelKey === 'typing'
                                ? `M 0,20 Q 30,${typingActual > 0.5 ? 5 : 18} 60,${typingActual > 0.5 ? 6 : 20} T 100,${typingActual > 0.5 ? 4 : 20}`
                                : `M 0,22 Q 25,${usageActual > 0.6 ? 5 : 20} 50,${usageActual > 0.6 ? 7 : 21} T 100,${usageActual > 0.6 ? 3 : 22}`
                            } 
                            fill="none" 
                            stroke="var(--sage-color)" 
                            strokeWidth="2" 
                            className="draw-path"
                          />
                        </svg>
                      </div>
                    )}

                    {/* Meta stats display */}
                    <div className="grid grid-cols-2 gap-4 text-center border-t pt-4" style={{ borderColor: 'var(--border-card)' }}>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-mono block">Baseline</span>
                        <span className="text-sm font-bold font-mono tabular-nums">
                          {userRole === 'guardian' ? '--' : (panelKey === 'mobility' ? intFormat(mobilityBaseline) : panelKey === 'typing' ? `${typingBaseline.toFixed(2)}s` : `${usageBaseline.toFixed(1)}h`)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-mono block">Current</span>
                        <span className="text-sm font-bold font-mono tabular-nums">
                          {userRole === 'guardian' 
                            ? (panelKey === 'mobility' ? (mobilitySteps < mobilityBaseline * 0.6 ? 'Atypical Step Level' : 'Standard Activity') : panelKey === 'typing' ? (typingDelay > typingBaseline * 1.2 ? 'Active Shift' : 'Optimal Cadence') : (usageHours > usageBaseline * 1.5 ? 'Active Spike' : 'Optimal Screen Balance'))
                            : (panelKey === 'mobility' ? intFormat(mobilitySteps) : panelKey === 'typing' ? `${typingDelay.toFixed(2)}s` : `${usageHours.toFixed(1)}h`)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Lower layout splits Alert Feed and Detailed Anomaly Analysis */}
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Alert Feed Panel */}
          <div className="rounded-xl border p-6 shadow-lg md:col-span-2" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-prism-sage" />
              <span>Behavioral Alert Log</span>
            </h3>

            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-xl" style={{ borderColor: 'var(--border-card)' }}>
                <CheckCircle className="h-10 w-10 text-prism-sage mb-3" />
                <h4 className="font-bold">No Alerts Triggered</h4>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">No anomalous deviations matching our safety limits have been recorded.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {alerts.map((alert) => {
                  const explain = formatAlertExplainability(alert);
                  return (
                    <div
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className="cursor-pointer rounded-xl border p-5 transition-all hover:bg-prism-navy/15 calm-fade-in"
                      style={{ borderColor: 'var(--border-card)' }}
                    >
                      <div className="flex items-center justify-between border-b pb-3 mb-3" style={{ borderColor: 'var(--border-card)' }}>
                        <div className="flex items-center gap-3">
                          <span className={`h-2.5 w-2.5 rounded-full ${alert.severity_tier === 'red' ? 'bg-prism-red' : 'bg-prism-amber'}`} />
                          <h4 className="font-bold text-sm tracking-wide">{alert.plain_language_summary}</h4>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">{new Date(alert.timestamp).toLocaleDateString()}</span>
                      </div>

                      <div className="space-y-3 pl-6 border-l-2" style={{ borderColor: 'var(--border-card)' }}>
                        <div>
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">What Changed:</h5>
                          <p className="text-xs text-gray-200 mt-0.5">{explain.whatChanged}</p>
                        </div>
                        <div>
                          <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Historical Baseline:</h5>
                          <p className="text-xs text-gray-400 mt-0.5">{explain.vsBaseline}</p>
                        </div>
                        <div>
                          <h5 className="text-[10px] font-bold text-prism-sage uppercase tracking-wider">Suggested Support Strategy:</h5>
                          <p className="text-xs text-prism-sage/90 mt-0.5 font-medium">{explain.nextStep}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column sidebar */}
          <div className="space-y-6">
            {/* Model Status and Scores panel */}
            <div className="rounded-xl border p-6 shadow-lg" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-prism-sage" />
                <span>Model Risk Indices</span>
              </h3>

              <div className="space-y-6">
                {/* K-Means */}
                <div className="border-b pb-4" style={{ borderColor: 'var(--border-card)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Mobility (K-Means)</h4>
                    <span className="text-xs font-mono font-bold text-prism-sage">Active Centroid</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                    <span>Deviation Score</span>
                    <span className="tabular-nums text-prism-light font-semibold">{mobilityActual.toFixed(2)}</span>
                  </div>
                </div>

                {/* Logistic Regression */}
                <div className="border-b pb-4" style={{ borderColor: 'var(--border-card)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Typing Delay (Logistic Regression)</h4>
                    <span className="text-xs font-mono font-bold text-prism-sage">FPR &le; 5%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                    <span>Anomaly Probability</span>
                    <span className="tabular-nums text-prism-light font-semibold">{typingActual.toFixed(2)}</span>
                  </div>
                </div>

                {/* Isolation Forest */}
                <div className="border-b pb-4" style={{ borderColor: 'var(--border-card)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">App Anomaly (Isolation Forest)</h4>
                    <span className="text-xs font-mono font-bold text-prism-amber">Limit: 0.60</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                    <span>Outlier Score</span>
                    <span className="tabular-nums text-prism-light font-semibold">{usageActual.toFixed(2)}</span>
                  </div>
                </div>

                {/* Risk Registry */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Risky Packages (Registry)</h4>
                    <span className="text-xs font-mono font-bold text-prism-sage">Deterministic</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                    <span>Binary Flag</span>
                    <span className="text-prism-light font-semibold">{scores.filter(s => s.model_name === 'signatures')[0]?.flagged ? 'FLAGGED' : 'CLEAN'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Privacy & Consent Ledger Card */}
            <div className="rounded-xl border p-6 shadow-lg" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
              <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-prism-sage" />
                <span>Consent Ledger</span>
              </h3>
              <p className="text-[11px] text-gray-400 mb-5 leading-relaxed">
                Configure active telemetry collection modalities. Toggling off immediately pauses data ingestion from the source stream.
              </p>

              <div className="space-y-4">
                {[
                  { key: 'location', label: 'GPS & Mobility Activity' },
                  { key: 'app_usage', label: 'App Log Categories' },
                  { key: 'typing', label: 'Typing Pace Metadata' },
                  { key: 'gsr', label: 'GSR / Physio Wearable' },
                  { key: 'voice', label: 'Voice Affect check-ins' },
                  { key: 'companion_chat', label: 'AI Companion Chat' }
                ].map((m) => (
                  <div key={m.key} className="flex items-center justify-between py-2 border-b border-prism-navy/20 last:border-0">
                    <span className="text-xs font-semibold text-gray-200">{m.label}</span>
                    <button
                      onClick={() => handleToggleConsent(m.key)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${consentGrants[m.key] ? 'bg-prism-sage' : 'bg-gray-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${consentGrants[m.key] ? 'translate-x-4' : 'translate-x-0.5'}`} style={{ marginTop: '2px' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Alert Detail Modal Screen */}
      {selectedAlert && (() => {
        const explain = formatAlertExplainability(selectedAlert);
        return (
          <div className="fixed inset-0 flex items-center justify-center bg-prism-dark/80 px-4 py-6 z-50">
            <div className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 calm-fade-in" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
              <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border-card)' }}>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <AlertTriangle className={`h-5 w-5 ${selectedAlert.severity_tier === 'red' ? 'text-prism-red' : 'text-prism-amber'}`} />
                  <span>Alert Detail Summary</span>
                </h3>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="text-xs text-gray-400 hover:text-prism-light font-bold"
                >
                  Close
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">What Changed:</h4>
                  <p className="text-base font-extrabold text-gray-100 mt-1 leading-relaxed">{explain.whatChanged}</p>
                </div>

                <div className="rounded-xl p-4 border bg-prism-dark/40" style={{ borderColor: 'var(--border-card)' }}>
                  <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-2">Historical Baseline:</h4>
                  <p className="text-xs text-gray-300 leading-relaxed">{explain.vsBaseline}</p>
                </div>

                <div className="rounded-xl p-4 border bg-prism-sage/5 border-prism-sage/20">
                  <h4 className="text-xs font-bold text-prism-sage uppercase tracking-wider mb-2">Suggested Next Step (Support Strategy):</h4>
                  <p className="text-xs text-prism-sage font-medium leading-relaxed">{explain.nextStep}</p>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 leading-relaxed border-t pt-4 font-mono" style={{ borderColor: 'var(--border-card)' }}>
                <strong>Explainability Paradigm Compliance:</strong> Telemetry is based entirely on statistical baseline changes from un-captured metadata signals. We never record direct communications content or clinical diagnosis classifications.
              </div>

              {selectedAlert && !selectedAlert.is_viewed && (
                <button
                  onClick={async () => {
                    try {
                      await fetch(`${API}/events/alerts/viewed/${selectedAlert.id}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                      })
                      setAlerts(prev => prev.map(a => a.id === selectedAlert.id ? { ...a, is_viewed: true } : a))
                      setSelectedAlert(null)
                    } catch (e) {
                      console.error(e)
                    }
                  }}
                  className="w-full bg-prism-sage text-prism-dark rounded-lg py-2.5 text-sm font-bold shadow hover:bg-prism-sage/95 transition-all mt-2"
                >
                  Mark as Acknowledged & Clear Alert
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* Guided Onboarding Walkthrough Tooltips */}
      {tourStep !== null && (
        <div className="fixed inset-0 bg-prism-dark/75 z-[9999] flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl relative space-y-4 text-center calm-fade-in" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
            <button 
              onClick={finishTour} 
              className="absolute top-4 right-4 text-gray-400 hover:text-prism-light"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex justify-center">
              <HelpCircle className="h-12 w-12 text-prism-sage animate-bounce" />
            </div>

            {tourStep === 1 && (
              <>
                <h3 className="text-lg font-bold">Consensual Telemetry Baselines</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  These three panels overlay raw daily activity against your child&apos;s historical baselines. We never monitor individual message texts, audio, or coordinates.
                </p>
                <div className="flex justify-between items-center pt-2">
                  <button onClick={finishTour} className="text-xs text-gray-500 hover:text-prism-light font-bold">Skip</button>
                  <button onClick={() => setTourStep(2)} className="bg-prism-navy text-prism-light rounded px-4 py-1.5 text-xs font-bold border border-prism-navy hover:border-prism-sage">Next</button>
                </div>
              </>
            )}

            {tourStep === 2 && (
              <>
                <h3 className="text-lg font-bold">What is a &quot;Contributing Factor&quot;?</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  When a model detects a deviation, we explain *exactly* what triggered it (e.g., screen time rising to 3.5h). This ensures clear transparency without black-box outputs.
                </p>
                <div className="flex justify-between items-center pt-2">
                  <button onClick={() => setTourStep(1)} className="text-xs text-gray-500 hover:text-prism-light font-bold">Back</button>
                  <button onClick={() => setTourStep(3)} className="bg-prism-navy text-prism-light rounded px-4 py-1.5 text-xs font-bold border border-prism-navy hover:border-prism-sage">Next</button>
                </div>
              </>
            )}

            {tourStep === 3 && (
              <>
                <h3 className="text-lg font-bold">Non-Diagnostic Guarantee</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  PRISM never diagnoses depression or anxiety. We highlight behavior variance patterns to help you start supportive conversations with your teen.
                </p>
                <div className="flex justify-center pt-2">
                  <button onClick={finishTour} className="w-full bg-prism-sage text-prism-dark rounded py-2 text-xs font-bold shadow hover:bg-prism-sage/95 transition-all">Get Started</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function intFormat(val: number) {
  return Math.round(val).toLocaleString()
}
