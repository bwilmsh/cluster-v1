'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Agent, Automation, AutomationRun, AutomationStep } from '@/lib/api'

// ─── Cron helpers ─────────────────────────────────────────────────────────────

type Repeat = 'daily' | 'weekly' | 'weekdays' | 'hourly'

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily',    label: 'Every day' },
  { value: 'weekly',   label: 'Every week (Sunday)' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'hourly',   label: 'Every hour' },
]

function buildCron(repeat: Repeat, hour: number, min: number): string {
  switch (repeat) {
    case 'daily':    return `${min} ${hour} * * *`
    case 'weekly':   return `${min} ${hour} * * 0`
    case 'weekdays': return `${min} ${hour} * * 1-5`
    case 'hourly':   return `0 * * * *`
  }
}

function cronToLabel(expr: string | null): string {
  if (!expr) return '—'
  if (expr === '0 * * * *') return 'Every hour'
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (dow === '1-5') return `Mon–Fri at ${time}`
  if (dow === '0')   return `Weekly at ${time}`
  return `Daily at ${time}`
}

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function duration(run: AutomationRun): string {
  if (!run.completedAt) return '—'
  const secs = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
  if (secs < 60) return `${secs}s`
  return `${Math.round(secs / 60)}m`
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

const INPUT = 'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors'
const SELECT = INPUT + ' appearance-none'

// ─── Tool icon label ─────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_web: 'Searched web',
  browse_website: 'Browsed site',
  read_page_content: 'Read page',
  send_email: 'Sent email',
  fill_form: 'Filled form',
  click_element: 'Clicked element',
  screenshot_page: 'Took screenshot',
}

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/_/g, ' ')
}

// ─── Steps breakdown ─────────────────────────────────────────────────────────

function StepsView({ steps }: { steps: AutomationStep[] }) {
  if (!steps.length) return <p className="text-xs text-white/25">No steps recorded.</p>

  return (
    <div className="space-y-2">
      {steps.map((step, i) => {
        const mainInput = Object.values(step.input)[0] ?? ''
        return (
          <div key={i} className="flex items-start gap-3">
            <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
              step.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/70 font-medium">
                {toolLabel(step.tool)}
                {mainInput ? <span className="text-white/35 font-normal"> — {String(mainInput).slice(0, 80)}</span> : null}
              </p>
              <p className="text-[11px] text-white/30 leading-relaxed mt-0.5 line-clamp-2">{step.output}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Report renderer ─────────────────────────────────────────────────────────

function ReportView({ text }: { text: string }) {
  const sections = text.split(/^## /m).filter(Boolean)
  if (sections.length <= 1) {
    return <p className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap">{text}</p>
  }
  return (
    <div className="space-y-5">
      {sections.map((section, i) => {
        const nl = section.indexOf('\n')
        const heading = nl === -1 ? section.trim() : section.slice(0, nl).trim()
        const body = nl === -1 ? '' : section.slice(nl + 1).trim()
        return (
          <div key={i}>
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">{heading}</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Runs panel ───────────────────────────────────────────────────────────────

function RunsPanel({ automationId, refreshTick }: { automationId: string; refreshTick: number }) {
  const [runs, setRuns] = useState<AutomationRun[] | null>(null)
  const [selected, setSelected] = useState<AutomationRun | null>(null)
  const [activeTab, setActiveTab] = useState<'report' | 'steps'>('report')

  useEffect(() => {
    api.automations.runs(automationId).then((r) => {
      setRuns(r)
      setSelected((prev) => {
        // Keep selection if it still exists, otherwise select latest
        if (prev) {
          const updated = r.find((x) => x.id === prev.id)
          return updated ?? r[0] ?? null
        }
        return r[0] ?? null
      })
    })
  }, [automationId, refreshTick])

  if (runs === null) return <p className="text-xs text-white/25 py-4 text-center">Loading…</p>

  if (runs.length === 0) {
    return (
      <p className="text-xs text-white/25 py-6 text-center">
        No runs yet — click Run Now to test this automation
      </p>
    )
  }

  return (
    <div className="flex gap-4 min-h-0">
      {/* Run list */}
      <div className="w-48 shrink-0 space-y-1 overflow-y-auto max-h-96">
        {runs.map((run) => (
          <button
            key={run.id}
            onClick={() => { setSelected(run); setActiveTab('report') }}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
              selected?.id === run.id ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {run.status === 'running' ? (
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${run.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              )}
              <span className="text-[10px] font-medium capitalize">{run.status}</span>
              <span className="text-[10px] text-white/25 ml-auto">{duration(run)}</span>
            </div>
            <p className="text-[11px] leading-snug text-white/50">{formatDateTime(run.startedAt)}</p>
          </button>
        ))}
      </div>

      {/* Run detail */}
      {selected && (
        <div className="flex-1 min-w-0 bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/5">
            {(['report', 'steps'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-medium transition-colors capitalize ${
                  activeTab === tab ? 'text-white border-b border-accent' : 'text-white/35 hover:text-white/60'
                }`}
              >
                {tab} {tab === 'steps' ? `(${selected.steps?.length ?? 0})` : ''}
              </button>
            ))}
          </div>

          <div className="px-5 py-4 overflow-y-auto max-h-80">
            {activeTab === 'report' ? (
              selected.finalResult
                ? <ReportView text={selected.finalResult} />
                : <p className="text-xs text-white/25">{selected.status === 'running' ? 'Running…' : 'No result'}</p>
            ) : (
              <StepsView steps={selected.steps ?? []} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({ agents, onCreated, onCancel }: {
  agents: Agent[]
  onCreated: (a: Automation) => void
  onCancel: () => void
}) {
  const [agentId, setAgentId] = useState('')
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [triggerType, setTriggerType] = useState<'manual' | 'schedule'>('schedule')
  const [repeat, setRepeat] = useState<Repeat>('daily')
  const [hour, setHour] = useState('09')
  const [minute, setMinute] = useState('00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agentId) { setError('Select an agent.'); return }
    if (!name.trim()) { setError('Enter a name.'); return }
    if (!goal.trim()) { setError('Describe the automation goal.'); return }
    setSaving(true)
    setError('')
    try {
      const cronExpr = triggerType === 'schedule' ? buildCron(repeat, parseInt(hour), parseInt(minute)) : undefined
      const automation = await api.automations.create({ agentId, name: name.trim(), goal: goal.trim(), triggerType, cronExpr })
      onCreated(automation)
    } catch {
      setError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = ['00', '15', '30', '45']

  return (
    <div className="bg-surface-raised border border-surface-border rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-white">New Automation</h2>
        <button onClick={onCancel} className="text-white/25 hover:text-white/60 transition-colors">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={SELECT}>
              <option value="" className="bg-[#111]">Select an agent…</option>
              {agents.map((a) => <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily analytics report"
              className={INPUT}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-white/40 mb-1.5 block">Goal</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Search for the latest news about [topic], summarise the top 5 stories, and identify any action items"
            rows={4}
            className={INPUT + ' resize-none'}
          />
          <p className="text-[11px] text-white/20 mt-1">Be specific. The agent will execute this autonomously using web search and browse tools.</p>
        </div>

        <div>
          <label className="text-xs font-medium text-white/40 mb-1.5 block">Trigger</label>
          <div className="flex gap-2 mb-3">
            {(['schedule', 'manual'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTriggerType(t)}
                className={`px-4 py-2 rounded-lg text-sm transition-colors capitalize ${
                  triggerType === t
                    ? 'bg-accent text-white'
                    : 'border border-surface-border text-white/40 hover:text-white/70'
                }`}
              >
                {t === 'schedule' ? 'On a schedule' : 'Manual only'}
              </button>
            ))}
          </div>

          {triggerType === 'schedule' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-white/40 mb-1.5 block">Repeat</label>
                <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className={SELECT}>
                  {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-[#111]">{o.label}</option>)}
                </select>
              </div>
              {repeat !== 'hourly' && (
                <div>
                  <label className="text-xs font-medium text-white/40 mb-1.5 block">Time</label>
                  <div className="flex gap-2">
                    <select value={hour} onChange={(e) => setHour(e.target.value)} className={SELECT}>
                      {hours.map((h) => <option key={h} value={h} className="bg-[#111]">{h}</option>)}
                    </select>
                    <span className="flex items-center text-white/30 text-sm">:</span>
                    <select value={minute} onChange={(e) => setMinute(e.target.value)} className={SELECT}>
                      {minutes.map((m) => <option key={m} value={m} className="bg-[#111]">{m}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40">
            {saving ? 'Creating…' : 'Create Automation'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-surface-border text-white/40 hover:text-white/70 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Automation card ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-500/10 text-emerald-400',
  failed:  'bg-rose-500/10 text-rose-400',
  running: 'bg-accent/10 text-accent',
}

function AutomationCard({ automation, onToggle, onRun, onDelete, runState, refreshTick }: {
  automation: Automation
  onToggle: () => void
  onRun: () => void
  onDelete: () => void
  runState: 'idle' | 'running' | 'done'
  refreshTick: number
}) {
  const [expanded, setExpanded] = useState(false)
  const statusStyle = automation.lastRunStatus ? STATUS_STYLES[automation.lastRunStatus] ?? '' : ''

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden group hover:border-white/10 transition-colors">
      <div className="flex items-start gap-4 p-5">
        <Toggle on={automation.active} onChange={onToggle} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-medium text-white leading-snug">{automation.name}</p>
            {automation.lastRunStatus && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusStyle}`}>
                {automation.lastRunStatus}
              </span>
            )}
            {runState === 'running' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/10 text-accent animate-pulse">running…</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs text-white/35 mb-1.5">
            <span>{automation.agent?.name ?? '—'}</span>
            <span className="text-white/15">·</span>
            <span>{automation.triggerType === 'schedule' ? cronToLabel(automation.cronExpr) : 'Manual'}</span>
            {!automation.active && <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/25 text-[10px]">Paused</span>}
          </div>

          <p className="text-xs text-white/25 leading-relaxed line-clamp-2">{automation.goal}</p>

          {automation.lastRunAt && runState === 'idle' && (
            <p className="text-[11px] text-white/20 mt-1.5">Last run {timeAgo(automation.lastRunAt)}</p>
          )}
          {runState === 'done' && (
            <p className="text-[11px] text-white/30 mt-1.5">Check runs below ↓</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Expand */}
          <button onClick={() => setExpanded((v) => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/70 hover:border-white/20 transition-colors"
            title="View runs">
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Run now */}
          <button onClick={onRun} disabled={runState !== 'idle'}
            title="Run now"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/70 hover:border-white/20 transition-colors disabled:opacity-40">
            {runState === 'running' ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Delete */}
          <button onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-400/5 transition-all"
            title="Delete">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-5 py-4">
          <RunsPanel automationId={automation.id} refreshTick={refreshTick} />
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [runStates, setRunStates] = useState<Record<string, 'idle' | 'running' | 'done'>>({})
  const [refreshTicks, setRefreshTicks] = useState<Record<string, number>>({})
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  useEffect(() => {
    Promise.all([api.automations.list(), api.agents.list()])
      .then(([a, ag]) => { setAutomations(a); setAgents(ag) })
      .finally(() => setLoading(false))
    return () => Object.values(pollTimers.current).forEach(clearInterval)
  }, [])

  async function handleToggle(a: Automation) {
    const updated = await api.automations.toggle(a.id)
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? updated : x)))
  }

  async function handleRun(a: Automation) {
    setRunStates((prev) => ({ ...prev, [a.id]: 'running' }))
    await api.automations.run(a.id).catch(console.error)

    // Get baseline run count to detect new run
    const baselineRuns = await api.automations.runs(a.id).catch(() => [] as AutomationRun[])
    const baselineLatestId = baselineRuns[0]?.id ?? null

    const startedAt = Date.now()
    pollTimers.current[a.id] = setInterval(async () => {
      const elapsed = Date.now() - startedAt
      try {
        const runs = await api.automations.runs(a.id)
        const latest = runs[0]
        // New run appeared, or existing run finished
        if ((latest && latest.id !== baselineLatestId) ||
            (latest?.id === baselineLatestId && latest.status !== 'running')) {
          if (latest.status !== 'running') {
            clearInterval(pollTimers.current[a.id])
            delete pollTimers.current[a.id]
            setRefreshTicks((prev) => ({ ...prev, [a.id]: (prev[a.id] ?? 0) + 1 }))
            setRunStates((prev) => ({ ...prev, [a.id]: 'idle' }))
            // Refresh automation list to update lastRunStatus
            api.automations.list().then(setAutomations).catch(() => {})
            return
          }
        }
      } catch {}
      if (elapsed >= 120_000) {
        clearInterval(pollTimers.current[a.id])
        delete pollTimers.current[a.id]
        setRefreshTicks((prev) => ({ ...prev, [a.id]: (prev[a.id] ?? 0) + 1 }))
        setRunStates((prev) => ({ ...prev, [a.id]: 'done' }))
      }
    }, 3_000)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    await api.automations.delete(id)
    setAutomations((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Automations</h1>
            <p className="text-white/30 text-sm mt-0.5">
              Agents execute goals autonomously — searching, browsing, and compiling reports
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
              + New Automation
            </button>
          )}
        </div>

        {showForm && (
          <CreateForm
            agents={agents}
            onCreated={(a) => { setAutomations((prev) => [a, ...prev]); setShowForm(false) }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <p className="text-white/25 text-sm">Loading...</p>
        ) : automations.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
            <svg className="w-10 h-10 text-white/15 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-white/25 text-sm mb-1">No automations yet</p>
            <p className="text-white/15 text-xs mb-5">
              Example: search for industry news every morning and compile a briefing
            </p>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
                Create your first automation
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <AutomationCard
                key={a.id}
                automation={a}
                onToggle={() => handleToggle(a)}
                onRun={() => handleRun(a)}
                onDelete={() => handleDelete(a.id)}
                runState={runStates[a.id] ?? 'idle'}
                refreshTick={refreshTicks[a.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
