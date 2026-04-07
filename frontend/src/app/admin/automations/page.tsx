'use client'

import { useEffect, useState } from 'react'
import { api, AutomationTemplate } from '@/lib/api'

export default function AdminAutomationsPage() {
  const [pending, setPending] = useState<AutomationTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    const p = await api.automations.admin.pending()
    setPending(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(id: string) {
    await api.automations.admin.approve(id)
    await load()
  }

  async function reject(id: string) {
    if (!confirm('Reject and delete this custom automation template?')) return
    await api.automations.admin.reject(id)
    await load()
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-white mb-1">Admin: Custom Automations</h1>
      <p className="text-sm text-zinc-500 mb-6">Review user-submitted custom automations for promotion to official prebuilts.</p>

      {loading && <div className="text-zinc-500 text-sm">Loading…</div>}
      {!loading && pending.length === 0 && (
        <div className="text-zinc-500 text-sm">No pending custom automations.</div>
      )}

      <div className="space-y-3">
        {pending.map((t) => (
          <div key={t.id} className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">{t.name}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{t.description}</div>
                <div className="text-xs text-zinc-600 mt-1">
                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 hover:text-white"
                >
                  {expanded === t.id ? 'Hide steps' : 'View steps'}
                </button>
                <button
                  onClick={() => approve(t.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-green-700 text-white hover:bg-green-600"
                >
                  Approve
                </button>
                <button
                  onClick={() => reject(t.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-900 text-red-300 hover:bg-red-800"
                >
                  Reject
                </button>
              </div>
            </div>

            {expanded === t.id && (
              <div className="border-t border-zinc-800 p-4">
                <div className="text-xs text-zinc-400 mb-2">Steps</div>
                <div className="space-y-1">
                  {((t.definition as any)?.steps ?? []).map((step: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs rounded-lg bg-zinc-800/50 p-2">
                      <span className="text-zinc-500 w-4">{i + 1}.</span>
                      <div>
                        <span className="text-violet-400 font-mono">{step.type}/{step.action}</span>
                        {step.url && <div className="text-zinc-400 truncate max-w-md">{step.url}</div>}
                        {step.instructions && <div className="text-zinc-300">{step.instructions}</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {(t.definition as any)?.variables?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-zinc-400 mb-1">Variables</div>
                    {(t.definition as any).variables.map((v: any) => (
                      <div key={v.key} className="text-xs text-zinc-500">{v.key}: {v.label} ({v.type})</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
