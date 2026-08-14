'use client'

import React, { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { Badge } from './ui/Badge'

export type Status = 'good' | 'warning' | 'critical'

interface MetricCardProps {
  title: string
  value: number | string
  unit?: string
  icon: React.ReactElement<{ size?: number | string }>
  status: Status
  progress?: number // 0-100
  lastUpdated: string // formatted string
}

const statusMeta: Record<Status, { badge: 'ok' | 'warn' | 'alert'; bar: string; label: string }> = {
  good: { badge: 'ok', bar: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]', label: 'On track' },
  warning: { badge: 'warn', bar: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]', label: 'Needs review' },
  critical: { badge: 'alert', bar: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]', label: 'Attention' },
}

export function MetricCard({
  title,
  value,
  unit = '',
  icon,
  status,
  progress = 0,
  lastUpdated,
}: MetricCardProps) {
  const meta = statusMeta[status]
  
  // 3D Parallax Tilt Effects
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  
  const mouseXSpring = useSpring(x, { stiffness: 150, damping: 15 })
  const mouseYSpring = useSpring(y, { stiffness: 150, damping: 15 })
  
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ['7deg', '-7deg'])
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ['-7deg', '7deg'])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const xPct = mouseX / width - 0.5
    const yPct = mouseY / height - 0.5
    x.set(xPct)
    y.set(yPct)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="h-full flex flex-col justify-between group rounded-2xl border border-white/5 bg-zinc-900/50 backdrop-blur-md p-6 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-colors hover:bg-zinc-800/80 cursor-default"
      >
        <div style={{ transform: "translateZ(30px)" }} className="flex h-full flex-col gap-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-zinc-400 group-hover:text-white transition-colors">
              <div className="p-2 bg-white/5 rounded-xl shrink-0 border border-white/10 shadow-inner">
                {React.cloneElement(icon, { size: 18 })}
              </div>
              <span className="text-sm font-bold text-white tracking-wide">{title}</span>
            </div>
            <Badge tone={meta.badge} title={meta.label} className="shadow-sm border-white/10 bg-white/5">
              {status === 'good' && <CheckCircle size={10} />}
              {status === 'warning' && <AlertTriangle size={10} />}
              {status === 'critical' && <Info size={10} />}
              <span className="sr-only">{meta.label}</span>
            </Badge>
          </div>

          <div>
            <div className="font-mono text-4xl font-extrabold tracking-tight text-white tabular-nums drop-shadow-sm">
              {value}
              {unit && <span className="ml-2 text-sm font-semibold text-zinc-400 font-sans tracking-normal">{unit}</span>}
            </div>
          </div>

          <div className="mt-auto space-y-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40 border border-white/5 shadow-inner relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                className={`absolute left-0 top-0 h-full rounded-full ${meta.bar}`}
              />
            </div>
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Last updated: <span className="text-zinc-300">{lastUpdated}</span>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default MetricCard
