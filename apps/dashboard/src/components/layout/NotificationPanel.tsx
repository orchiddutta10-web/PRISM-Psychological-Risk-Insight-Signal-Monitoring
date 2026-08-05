'use client'

import React from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx'

export interface NotifAlert {
  id: string
  severity: 'low' | 'medium' | 'high'
  title: string
  summary: string
  factors?: string[]
  device?: string
  time: string
  read?: boolean
}

interface NotificationPanelProps {
  open: boolean
  alerts: NotifAlert[]
  onClose: () => void
  onRead: (id: string) => void
}

const sevMeta: Record<NotifAlert['severity'], { tone: string; label: string; dot: string }> = {
  low: { tone: 'ok', label: '● Low', dot: 'bg-(--status-ok)' },
  medium: { tone: 'warn', label: '● Moderate', dot: 'bg-(--status-warn)' },
  high: { tone: 'alert', label: '● High', dot: 'bg-(--status-alert)' },
}

/** Slide-over alerts panel (extracted from overview's inline alert drawer). */
export function NotificationPanel({ open, alerts, onClose, onRead }: NotificationPanelProps) {
  if (!open) return null

  const unread = alerts.filter((a) => !a.read).length

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="anim-slide-right absolute right-0 top-0 flex h-full w-full max-w-[400px] flex-col border-l border-(--border) bg-(--bg-card) shadow-2xl">
        <div className="flex items-center justify-between border-b border-(--border) px-6 py-5">
          <div>
            <p className="text-base font-extrabold text-(--text-primary)">Alerts</p>
            <p className="mt-0.5 text-xs text-(--text-secondary)">
              {unread} unread · {alerts.length} total
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--bg-main) text-(--text-secondary) transition-colors hover:text-(--text-primary)"
            aria-label="Close alerts"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-3xl">✓</p>
              <p className="text-sm font-bold text-(--text-primary)">No alerts yet</p>
              <p className="text-xs text-(--text-secondary)">You&apos;re all caught up.</p>
            </div>
          ) : (
            alerts.map((a, i) => {
              const meta = sevMeta[a.severity]
              return (
                <button
                  key={a.id}
                  onClick={() => onRead(a.id)}
                  className={cx(
                    'block w-full border-b border-(--border) px-6 py-4 text-left transition-colors',
                    !a.read && 'bg-(--bg-main)'
                  )}
                  style={{ animation: `fadeUp 0.3s ${i * 0.04}s both` }}
                >
                  <div className="flex items-start gap-3">
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', meta.dot, !a.read && 'ring-2 ring-(--border-strong)')} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="text-[13px] font-bold text-(--text-primary)">{a.title}</span>
                        <span className="shrink-0 text-[11px] text-(--text-muted)">{a.time}</span>
                      </div>
                      <p className="mb-2.5 text-xs leading-relaxed text-(--text-secondary)">{a.summary}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-(--border-strong) px-2.5 py-0.5 text-[10px] font-bold text-(--text-primary)">
                          {meta.label}
                        </span>
                        {a.device && (
                          <span className="rounded-full border border-(--border) px-2.5 py-0.5 text-[10px] text-(--text-secondary)">
                            {a.device}
                          </span>
                        )}
                      </div>
                      {a.factors && a.factors.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {a.factors.map((f, fi) => (
                            <li key={fi} className="flex items-center gap-2 text-[11px] text-(--text-muted)">
                              <span className="h-1 w-1 shrink-0 rounded-full bg-(--text-muted)" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
