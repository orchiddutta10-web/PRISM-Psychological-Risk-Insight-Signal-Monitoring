'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Folder, File, ChevronRight, ChevronDown, RefreshCw, Moon, Sun, Monitor, Code } from 'lucide-react'
import { useAuth } from '../lib/auth-context'

interface FileNode {
  type: 'file' | 'directory'
  name: string
  path: string
  size: number
  modified: string
  children?: FileNode[]
}

export default function CodebasePage() {
  const router = useRouter()
  const { logout, isAuthLoaded } = useAuth()
  const [tree, setTree] = useState<FileNode[]>([])
  const [rootPath, setRootPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const saved = localStorage.getItem('prism_theme') as any
    if (saved) { setTheme(saved); document.documentElement.setAttribute('data-theme', saved) }
    fetchCodebase()
  }, [])

  const fetchCodebase = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/codebase')
      const data = await res.json()
      if (data.success) {
        setTree(data.tree)
        setRootPath(data.rootPath)
      }
    } catch (error) {
      console.error('Failed to fetch codebase:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }))
  }

  const applyTheme = (t: 'light' | 'dark') => {
    setTheme(t); localStorage.setItem('prism_theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }

  const dk = theme === 'dark'
  const C = {
    bg:     dk ? '#0A0A0A' : '#F4F4F2',
    card:   dk ? '#1C1C1E' : '#FFFFFF',
    nav:    dk ? '#111111' : '#FFFFFF',
    border: dk ? '#2C2C2E' : '#EBEBEB',
    text:   dk ? '#FFFFFF' : '#0A0A0A',
    sub:    dk ? '#8E8E93' : '#6B6B6B',
    muted:  dk ? '#48484A' : '#AEAEB2',
    hover:  dk ? '#2C2C2E' : '#F4F4F2',
    accent: dk ? '#FFFFFF' : '#0A0A0A',
    accentTxt: dk ? '#0A0A0A' : '#FFFFFF',
  }

  const renderTree = (nodes: FileNode[], padding: number = 0) => {
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {nodes.map(node => {
          const isDir = node.type === 'directory'
          const isExpanded = expandedFolders[node.path]
          return (
            <div key={node.path} style={{ display: 'flex', flexDirection: 'column' }}>
              <div 
                style={{ 
                  display: 'flex', alignItems: 'center', padding: '6px 12px', paddingLeft: padding * 20 + 12,
                  cursor: isDir ? 'pointer' : 'default', background: 'transparent',
                  borderBottom: `1px solid ${C.border}`, transition: 'background 0.15s'
                }}
                onClick={() => isDir && toggleFolder(node.path)}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.hover}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  {isDir ? (isExpanded ? <ChevronDown size={14} color={C.muted} /> : <ChevronRight size={14} color={C.muted} />) : <div style={{ width: 14 }} />}
                  {isDir ? <Folder size={16} color={dk ? '#A5B4FC' : '#4F46E5'} /> : <File size={16} color={C.sub} />}
                  <span style={{ fontSize: 13, fontWeight: isDir ? 600 : 400, color: C.text }}>{node.name}</span>
                </div>
                {!isDir && node.modified && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: C.muted }}>{(node.size / 1024).toFixed(1)} KB</span>
                    <span style={{ fontSize: 11, color: C.sub }}>{new Date(node.modified).toLocaleString()}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(52, 211, 153, 0.15)', color: dk ? '#6EE7B7' : '#059669', fontWeight: 600 }}>Working</span>
                  </div>
                )}
              </div>
              {isDir && isExpanded && node.children && renderTree(node.children, padding + 1)}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", transition: 'background 0.2s, color 0.2s' }}>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 58, background: C.nav, borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
          <div style={{ position: 'relative', width: 28, height: 28 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${C.text}` }} />
            <div style={{ position: 'absolute', top: 6, left: 6, width: 12, height: 12, borderRadius: '50%', border: `1.5px solid ${C.text}`, opacity: 0.35 }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', monospace", fontWeight: 800, fontSize: 16, letterSpacing: '0.16em', color: C.text }}>PRISM</span>
        </div>

        {[
          { label: 'Overview', active: false, href: '/overview' },
          { label: 'Signals', active: false, href: '/signals' },
          { label: 'Companion', active: false, href: '/companion' },
          { label: 'Chatbot', active: false, href: '/chatbot' },
          { label: 'Guardian', active: false, href: '/guardian' },
          { label: 'Alerts', active: false, href: '/alerts' },
        ].map(tab => (
          <button type="button" key={tab.label} onClick={() => router.push(tab.href)} style={{
            padding: '6px 14px', marginRight: 4, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: tab.active ? 700 : 500, background: tab.active ? C.hover : 'transparent',
            color: tab.active ? C.text : C.sub, transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => applyTheme(theme === 'light' ? 'dark' : 'light')} style={{
            width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub,
          }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <div style={{ width: 1, height: 24, background: C.border, margin: '0 8px' }} />
          <button onClick={() => logout()} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.sub,
          }}>
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Code size={24} color={dk ? '#A5B4FC' : '#4F46E5'} /> Codebase Tracker
            </h1>
            <p style={{ fontSize: 14, color: C.sub, marginTop: 8 }}>Monitoring PRISM platform directory: <code style={{ background: C.hover, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{rootPath}</code></p>
          </div>
          <button onClick={fetchCodebase} disabled={loading} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'all 0.15s'
          }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> 
            {loading ? 'Scanning...' : 'Refresh'}
          </button>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: C.hover, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted }}>File Explorer</span>
            <div style={{ display: 'flex', gap: 24 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted }}>Size</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted }}>Last Modified</span>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted }}>Status</span>
            </div>
          </div>
          
          <div style={{ minHeight: 400, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${C.text}`, borderRightColor: 'transparent', animation: 'spin-slow 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: C.sub }}>Analyzing repository structure...</span>
              </div>
            ) : (
              renderTree(tree)
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin-slow { 100% { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.muted}; }
      `}} />
    </div>
  )
}
