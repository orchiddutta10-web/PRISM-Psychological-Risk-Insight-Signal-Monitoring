'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { Reveal } from '@/lib/motion'
import { API, getGuardian } from '@/lib/api'
import { cx } from '@/lib/cx'

interface Persona {
  id: string
  name: string
  display_name: string
  description: string
}

export default function CompanionPage() {
  const router = useRouter()
  const [guardianName, setGuardianName] = useState('Guardian')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('prism_token')
    if (!token) {
      router.push('/')
      return
    }
    const g = getGuardian()
    if (g?.full_name) setGuardianName(g.full_name)

    const fetchPersonas = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API}/companion/personas`)
        if (!res.ok) throw new Error('Failed to load companion personas.')
        const data = await res.json()
        setPersonas(data)
        setSelectedPersona(data[0] || null)
      } catch (err: any) {
        setError(err.message || 'Unable to load companion personas.')
      } finally {
        setLoading(false)
      }
    }

    fetchPersonas()
  }, [router])

  return (
    <PageContainer>
      <PageHeader
        eyebrow="AI Companion"
        title="Companion personas for supportive conversations"
        subtitle="Review the five persona styles your teen can choose from in the PRISM app. These companion prompts are designed to keep support safe, consent-aware, and aligned with the teen's comfort."
      />

      {/* How it works + Safety + Session library */}
      <Reveal>
        <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_320px]">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">How it works</p>
                <h2 className="mt-0.5 text-[18px] font-extrabold text-(--text-primary)">Five distinct companion styles, one shared safety core.</h2>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-(--text-secondary)">
              PRISM companion personas share a common safety wrapper, but each one uses a different supportive tone and structure. The teen&apos;s device uses these personas during in-app chat, while the guardian dashboard lets you review the available styles and the consent state that enables them.
            </p>
          </Card>

          <Card className="p-6">
            <div className="mb-4 flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">Safety first</p>
                <h2 className="mt-0.5 text-[18px] font-extrabold text-(--text-primary)">Shared safety rules are embedded across all personas.</h2>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-(--text-secondary)">
              Every companion persona is built on the same safety wrapper, with explicit disclosure that the AI is not a licensed therapist and crisis detection baked into the flow. This page shows the personality styles while the actual chat remains teen-facing.
            </p>
          </Card>

          <Card className="p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">Your session library</p>
            <h2 className="mt-1 text-[18px] font-extrabold text-(--text-primary)">Child device companion sessions</h2>
            <p className="mt-2.5 text-[14px] leading-relaxed text-(--text-secondary)">
              The guardian dashboard can review persona setup and consent, but companion chat sessions are anchored to the registered child device itself.
            </p>
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-(--border) bg-(--bg-main) p-4">
              <div>
                <p className="text-xs text-(--text-muted)">Guardian</p>
                <p className="mt-1 text-sm font-bold text-(--text-primary)">{guardianName}</p>
              </div>
              <Badge tone="neutral">Dashboard view</Badge>
            </div>
          </Card>
        </section>
      </Reveal>

      {/* Personas */}
      <Reveal delay={0.08}>
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-(--text-muted)">Companion personas</p>
              <h2 className="mt-1 text-[22px] font-extrabold text-(--text-primary)">Choose the style you want to review</h2>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-(--text-secondary)">
              <MessageCircle size={16} />
              <span>Loaded from PRISM companion API</span>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </div>
          ) : error ? (
            <Card className="border-red-500/30 bg-red-500/5 p-6">
              <p className="text-[15px] font-semibold text-red-600 dark:text-red-400">{error}</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {personas.map((persona) => {
                  const active = persona.id === selectedPersona?.id
                  return (
                    <button
                      key={persona.id}
                      onClick={() => setSelectedPersona(persona)}
                      className={cx(
                        'rounded-2xl border p-5 text-left transition-all',
                        active
                          ? 'border-indigo-500 bg-(--bg-card) shadow-[0_18px_45px_rgba(37,99,235,0.12)]'
                          : 'border-(--border) bg-(--bg-card) hover:border-(--border-strong)'
                      )}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">{persona.display_name}</p>
                      <h3 className="mt-2 text-[16px] font-extrabold leading-snug text-(--text-primary)">{persona.description}</h3>
                      <p className="mt-3 text-[13px] leading-relaxed text-(--text-secondary)">
                        Review this persona&apos;s approach and tone in the companion chat flow.
                      </p>
                    </button>
                  )
                })}
              </div>

              {selectedPersona && (
                <Card className="p-6">
                  <div className="mb-4 flex items-center gap-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <MessageCircle size={18} />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-(--text-muted)">{selectedPersona.display_name}</p>
                      <h3 className="mt-0.5 text-[20px] font-extrabold text-(--text-primary)">{selectedPersona.description}</h3>
                    </div>
                  </div>
                  <p className="text-[15px] leading-relaxed text-(--text-secondary)">
                    {selectedPersona.display_name} uses a unique supportive style within the PRISM companion ecosystem. The teen chooses this persona in-app, and the companion chat keeps the same shared safety boundaries no matter which persona is active.
                  </p>
                </Card>
              )}
            </>
          )}
        </section>
      </Reveal>
    </PageContainer>
  )
}
