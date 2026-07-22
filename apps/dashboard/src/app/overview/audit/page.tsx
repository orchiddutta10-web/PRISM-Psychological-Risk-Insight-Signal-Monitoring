'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ArrowLeft, Search, Filter, Database, FileText, User } from 'lucide-react'

interface AuditEntry {
  id: string
  actor_id: string | null
  action: string
  resource: string
  context: {
    ip: string | null
    status_code: number
  }
  timestamp: string
}

export default function AuditLogPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [searchActor, setSearchActor] = useState('')
  const [filterAction, setFilterAction] = useState('ALL')
  const [unauthorized, setUnauthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const activeToken = localStorage.getItem('prism_token')
    const guardianJson = localStorage.getItem('prism_guardian')
    
    if (!activeToken || !guardianJson) {
      router.push('/')
      return
    }

    const guardian = JSON.parse(guardianJson)
    if (guardian.role !== 'guardian-admin') {
      setUnauthorized(true)
      setIsLoading(false)
      return
    }

    setToken(activeToken)

    const fetchAuditEntries = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/v1/audit/entries', {
          headers: { 'Authorization': `Bearer ${activeToken}` }
        })
        if (res.status === 403) {
          setUnauthorized(true)
          return
        }
        const data = await res.json()
        setEntries(data)
      } catch (err) {
        console.error('Error fetching audit log entries:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAuditEntries()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-prism-dark text-prism-light">
        <div className="text-center font-mono">Loading compliance ledger...</div>
      </div>
    )
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-prism-dark text-prism-light px-6">
        <div className="w-full max-w-md text-center rounded-2xl border border-prism-red bg-prism-red/10 p-8 shadow-xl space-y-4">
          <h2 className="text-2xl font-bold text-prism-red">Access Forbidden</h2>
          <p className="text-sm text-gray-400">
            You do not have the <code className="bg-prism-dark px-1.5 py-0.5 rounded text-prism-light">guardian-admin</code> role required to access the compliance log ledger.
          </p>
          <button
            onClick={() => router.push('/overview')}
            className="w-full rounded-lg bg-prism-navy py-2 text-sm font-bold text-prism-light border border-prism-navy hover:border-prism-sage transition-all mt-4"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  // Filter logic
  const actionsList = ['ALL', ...Array.from(new Set(entries.map(e => e.action)))]
  const filteredEntries = entries.filter(entry => {
    const matchesActor = searchActor ? (entry.actor_id || '').toLowerCase().includes(searchActor.toLowerCase()) : true
    const matchesAction = filterAction === 'ALL' ? true : entry.action === filterAction
    return matchesActor && matchesAction
  })

  return (
    <div className="min-h-screen bg-prism-dark text-prism-light">
      {/* Navigation Header */}
      <header className="border-b border-prism-navy bg-prism-indigo py-4 px-6 shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            onClick={() => router.push('/overview')}
            className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-prism-sage transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </button>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-prism-sage" />
            <span className="font-bold tracking-wider font-mono">COMPLIANCE LEDGER</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 border-b border-prism-navy pb-6">
          <h1 className="text-3xl font-extrabold flex items-center gap-2">
            <Database className="h-8 w-8 text-prism-sage" />
            <span>Immutable Audit Log Entries</span>
          </h1>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed">
            Immutable log of all data-access events and signal telemetry uploads. Cryptographically secured and encrypted at rest.
          </p>
        </div>

        {/* Filters */}
        <div className="grid gap-4 md:grid-cols-3 mb-6 bg-prism-indigo p-4 rounded-xl border border-prism-navy shadow-sm">
          {/* Search Actor */}
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search Actor ID..."
              className="w-full rounded-lg border border-prism-navy bg-prism-dark py-2 pl-10 pr-4 text-sm text-prism-light placeholder-gray-500 focus:border-prism-sage focus:outline-none"
              value={searchActor}
              onChange={(e) => setSearchActor(e.target.value)}
            />
          </div>

          {/* Filter Action */}
          <div className="relative flex items-center">
            <Filter className="absolute left-3 h-4 w-4 text-gray-400" />
            <select
              className="w-full rounded-lg border border-prism-navy bg-prism-dark py-2 pl-10 pr-4 text-sm text-prism-light focus:border-prism-sage focus:outline-none appearance-none"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              {actionsList.map(act => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>

          {/* Total entries summary */}
          <div className="flex items-center justify-end text-xs text-gray-400 font-mono">
            Showing <strong className="text-prism-light mx-1 tabular-nums">{filteredEntries.length}</strong> / {entries.length} records
          </div>
        </div>

        {/* Audit Grid */}
        <div className="overflow-x-auto rounded-xl border border-prism-navy bg-prism-indigo shadow-md">
          <table className="min-w-full divide-y divide-prism-navy text-left text-sm">
            <thead className="bg-prism-dark/40 text-xs font-bold uppercase tracking-wider text-gray-300">
              <tr>
                <th className="py-4 px-6 font-mono">Timestamp</th>
                <th className="py-4 px-6">Actor Subject</th>
                <th className="py-4 px-6">Action</th>
                <th className="py-4 px-6">Resource Endpoint</th>
                <th className="py-4 px-6">IP / Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-prism-navy/60 font-mono text-xs">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400 font-semibold">
                    No matching audit entries found.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-prism-navy/10 transition-colors">
                    <td className="py-4 px-6 tabular-nums text-gray-400">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-prism-light font-semibold">
                      {entry.actor_id ? (
                        <span className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-prism-sage" />
                          {entry.actor_id}
                        </span>
                      ) : (
                        <span className="text-gray-500">SYSTEM / GUEST</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-block rounded px-2 py-0.5 font-bold ${
                        entry.action.startsWith('WRITE') 
                          ? 'bg-prism-amber/10 text-prism-amber border border-prism-amber/20'
                          : 'bg-prism-sage/10 text-prism-sage border border-prism-sage/20'
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-gray-300">
                      {entry.resource}
                    </td>
                    <td className="py-4 px-6 text-gray-400 tabular-nums">
                      {entry.context.ip || '127.0.0.1'} | {entry.context.status_code || 200}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
