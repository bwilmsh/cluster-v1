'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, Agent, Automation, AutomationRun } from '@/lib/api'
import { LoadingDots } from '@/components/LoadingDots'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Repeat = 'manual' | 'daily' | 'weekly' | 'weekdays' | 'hourly'

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'weekdays', label: 'Mon–Fri' },
  { value: 'hourly', label: 'Every hour' },
]

function buildCron(repeat: Repeat, hour: number, min: number): string | undefined {
  switch (repeat) {
    case 'manual': return undefined
    case 'daily': return `${min} ${hour} * * *`
    case 'weekly': return `${min} ${hour} * * 0`
    case 'weekdays': return `${min} ${hour} * * 1-5`
    case 'hourly': return `0 * * * *`
  }
}

function cronToLabel(expr: string | null): string {
  if (!expr) return 'Manual'
  if (expr === '0 * * * *') return 'Every hour'
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (dow === '1-5') return `Mon–Fri ${time}`
  if (dow === '0') return `Weekly ${time}`
  return `Daily ${time}`
}

function timeAgo(d: string | null | undefined) {
  if (!d) return 'never'
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-emerald-400',
  failed: 'bg-red-400',
  running: 'bg-yellow-400 animate-pulse',
  skipped: 'bg-white/20',
}

const STATUS_TEXT: Record<string, string> = {
  success: 'text-emerald-400',
  failed: 'text-red-400',
  running: 'text-yellow-400',
  skipped: 'text-white/30',
}

// ─── New Automation Modal ─────────────────────────────────────────────────────

function NewAutomationModal({
  agents,
  onSave,
  onClose,
}: {
  agents: Agent[]
  onSave: () => void
  onClose: () => void
}) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [goal, setGoal] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('daily')
  const [hour, setHour] = useState(8)
  const [min, setMin] = useState(0)
  const [deliveryType, setDeliveryType] = useState('chat')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!goal.trim() || !agentId) return
    setSaving(true)
    setError(null)
    try {
      const schedule = buildCron(repeat, hour, min)
      await api.automations.create({
        agentId,
        goal: goal.trim(),
        schedule,
        deliveryType,
      })
      onSave()
    } catch {
      setError('Failed to create automation. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-surface-raised overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="font-semibold text-white text-sm">New Automation</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Agent */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Goal */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">What should this automation do?</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Every morning, pull my top 5 unread emails and summarize them. Search for the latest news about my industry. Post a daily update to Slack."
              rows={4}
              className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none"
            />
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Schedule</label>
            <div className="flex gap-2">
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
                className="flex-1 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              >
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {repeat !== 'manual' && repeat !== 'hourly' && (
                <input
                  type="time"
                  value={`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    setHour(h); setMin(m)
                  }}
                  className="rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                />
              )}
            </div>
          </div>

          {/* Delivery */}
          <div>
            <label className="block text-xs text-white/40 mb-1.5">Deliver result to</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
            >
              <option value="chat">Chat (in-app)</option>
              <option value="email">Email</option>
              <option value="slack">Slack</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !goal.trim() || !agentId}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Run History Panel ────────────────────────────────────────────────────────

function RunHistoryPanel({
  automation,
  onClose,
}: {
  automation: Automation
  onClose: () => void
}) {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null)

  useEffect(() => {
    api.automations.runs(automation.id).then(setRuns).catch(() => setRuns([]))
  }, [automation.id])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-surface-border bg-surface-raised overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-white text-sm">Run History</h2>
            <p className="text-xs text-white/35 mt-0.5">{automation.name}</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">✕</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {runs === null ? (
            <div className="flex items-center justify-center py-12">
              <LoadingDots />
            </div>
          ) : runs.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-12">No runs yet.</p>
          ) : (
            <div className="divide-y divide-surface-border">
              {runs.map((run) => (
                <div key={run.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[run.status] ?? 'bg-white/20'}`} />
                      <span className={`text-xs font-medium uppercase tracking-wide ${STATUS_TEXT[run.status] ?? 'text-white/40'}`}>
                        {run.status}
                      </span>
                    </div>
                    <span className="text-xs text-white/30 shrink-0">{timeAgo(run.startedAt)}</span>
                  </div>
                  {run.finalResult && (
                    <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap ml-3.5">{run.finalResult}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Automation Card ──────────────────────────────────────────────────────────

function AutomationCard({
  automation,
  onRun,
  onToggle,
  onDelete,
  onHistory,
  running,
}: {
  automation: Automation
  onRun: () => void
  onToggle: () => void
  onDelete: () => void
  onHistory: () => void
  running: boolean
}) {
  const status = automation.lastRunStatus ?? null

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {status && (
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[status] ?? 'bg-white/20'}`} />
            )}
            <p className="font-medium text-white text-sm leading-tight truncate">{automation.name}</p>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {automation.agent && (
              <span className="text-xs text-white/35">{automation.agent.name}</span>
            )}
            <span className="text-white/15 text-xs">·</span>
            <span className="text-xs text-white/35">{cronToLabel(automation.schedule ?? null)}</span>
            {automation.lastRunAt && (
              <>
                <span className="text-white/15 text-xs">·</span>
                <span className={`text-xs ${STATUS_TEXT[status ?? ''] ?? 'text-white/35'}`}>
                  {timeAgo(automation.lastRunAt)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Active toggle */}
        <button
          onClick={onToggle}
          className={`shrink-0 w-9 h-5 rounded-full transition-colors relative ${automation.active ? 'bg-accent' : 'bg-white/10'}`}
          title={automation.active ? 'Pause' : 'Activate'}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${automation.active ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {/* Last result preview */}
      {automation.lastRunResult && (
        <div className="mt-3 rounded-xl bg-white/[0.03] border border-surface-border px-3 py-2">
          <p className="text-xs text-white/40 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {automation.lastRunResult}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-surface-border">
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white/70 hover:text-white transition-colors"
        >
          {running ? (
            <>
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
              Running…
            </>
          ) : (
            <>
              <span className="text-[10px]">▶</span>
              Run now
            </>
          )}
        </button>

        <button
          onClick={onHistory}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/70 hover:text-white transition-colors"
        >
          History
        </button>

        <button
          onClick={onDelete}
          className="ml-auto px-3 py-1.5 rounded-lg bg-white/5 hover:bg-red-500/15 text-xs text-white/35 hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [showNew, setShowNew] = useState(false)
  const [historyFor, setHistoryFor] = useState<Automation | null>(null)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const [autosResp, ags] = await Promise.all([
      api.automations.list(),
      api.agents.list(),
    ])
    setAutomations(autosResp.automations)
    setAgents(ags)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleRun(id: string) {
    setRunningIds((prev) => new Set(prev).add(id))
    try {
      await api.automations.run(id)
      // Poll for result after a short delay
      setTimeout(() => load(), 3000)
    } catch {}
    setTimeout(() => {
      setRunningIds((prev) => { const s = new Set(prev); s.delete(id); return s })
      load()
    }, 5000)
  }

  async function handleToggle(id: string) {
    await api.automations.toggle(id)
    load()
  }

  async function handleDelete(id: string) {
    const auto = automations?.find((a) => a.id === id)
    if (!confirm(`Delete "${auto?.name}"? This cannot be undone.`)) return
    await api.automations.delete(id)
    load()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">Automations</h1>
          {automations && automations.length > 0 && (
            <span className="text-xs text-white/30">{automations.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="px-3 py-1.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
        >
          + New
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {automations === null ? (
          <div className="flex items-center justify-center h-full">
            <LoadingDots />
          </div>
        ) : automations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <p className="text-white/30 text-sm">No automations yet.</p>
            <p className="text-xs text-white/20 max-w-xs">
              Automations run tasks on a schedule — morning reports, email summaries, web research, and more.
            </p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] text-white/60 hover:text-white text-xs transition-colors"
            >
              Create your first automation
            </button>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {automations.map((auto) => (
              <AutomationCard
                key={auto.id}
                automation={auto}
                running={runningIds.has(auto.id)}
                onRun={() => handleRun(auto.id)}
                onToggle={() => handleToggle(auto.id)}
                onDelete={() => handleDelete(auto.id)}
                onHistory={() => setHistoryFor(auto)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showNew && agents.length > 0 && (
        <NewAutomationModal
          agents={agents}
          onSave={() => { setShowNew(false); load() }}
          onClose={() => setShowNew(false)}
        />
      )}
      {showNew && agents.length === 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-border bg-surface-raised p-6 text-center">
            <p className="text-white text-sm mb-2">No agents yet</p>
            <p className="text-white/40 text-xs mb-4">Hire an agent before creating an automation.</p>
            <button onClick={() => setShowNew(false)} className="text-xs text-white/50 hover:text-white/80">Close</button>
          </div>
        </div>
      )}
      {historyFor && (
        <RunHistoryPanel
          automation={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  )
}
