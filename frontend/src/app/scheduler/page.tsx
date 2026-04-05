'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Agent, ScheduledTask, TaskResult } from '@/lib/api'

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

function cronToLabel(expr: string): string {
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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-white/10'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

const INPUT = 'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors'
const SELECT = INPUT + ' appearance-none'

// ─── Structured report renderer ───────────────────────────────────────────────

function ReportView({ text }: { text: string }) {
  // Split by ## headings
  const sections = text.split(/^## /m).filter(Boolean)

  if (sections.length <= 1) {
    // Plain text fallback
    return <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{text}</p>
  }

  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        const newline = section.indexOf('\n')
        const heading = newline === -1 ? section : section.slice(0, newline).trim()
        const body = newline === -1 ? '' : section.slice(newline + 1).trim()
        return (
          <div key={i}>
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">{heading}</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{body}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Results panel ────────────────────────────────────────────────────────────

function ResultsPanel({ taskId }: { taskId: string }) {
  const [results, setResults] = useState<TaskResult[] | null>(null)
  const [selected, setSelected] = useState<TaskResult | null>(null)

  useEffect(() => {
    api.scheduler.results(taskId).then((r) => {
      setResults(r)
      if (r.length > 0) setSelected(r[0])
    })
  }, [taskId])

  if (results === null) {
    return <p className="text-xs text-white/25 py-4 text-center">Loading…</p>
  }

  if (results.length === 0) {
    return (
      <p className="text-xs text-white/25 py-4 text-center">
        No runs yet — click Run Now to test
      </p>
    )
  }

  return (
    <div className="flex gap-4 min-h-0">
      {/* Run list */}
      <div className="w-44 shrink-0 space-y-1">
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
              selected?.id === r.id ? 'bg-white/8 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className="text-[10px] font-medium">{r.status}</span>
            </div>
            <p className="text-[11px] leading-snug">{formatTime(r.runAt)}</p>
          </button>
        ))}
      </div>

      {/* Report */}
      <div className="flex-1 min-w-0 bg-white/[0.02] border border-white/5 rounded-xl px-5 py-4 overflow-y-auto max-h-96">
        {selected ? (
          <ReportView text={selected.result} />
        ) : (
          <p className="text-xs text-white/25">Select a run to see the report</p>
        )}
      </div>
    </div>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateForm({ agents, onCreated, onCancel }: {
  agents: Agent[]
  onCreated: (task: ScheduledTask) => void
  onCancel: () => void
}) {
  const [agentId, setAgentId] = useState('')
  const [description, setDescription] = useState('')
  const [repeat, setRepeat] = useState<Repeat>('daily')
  const [hour, setHour] = useState('09')
  const [minute, setMinute] = useState('00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agentId) { setError('Select an agent.'); return }
    if (!description.trim()) { setError('Describe what the agent should do.'); return }
    setSaving(true)
    setError('')
    try {
      const cronExpr = buildCron(repeat, parseInt(hour), parseInt(minute))
      const desc = description.trim()
      const words = desc.replace(/https?:\/\/\S+/g, '').trim().split(/\s+/).filter((w) => w.length > 2)
      const name = words.slice(0, 4).join(' ') || desc.slice(0, 40)
      const task = await api.scheduler.create({ agentId, name, description: desc, cronExpr })
      onCreated(task)
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
        <h2 className="text-sm font-semibold text-white">New Scheduled Task</h2>
        <button onClick={onCancel} className="text-white/25 hover:text-white/60 transition-colors">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-white/40 mb-1.5 block">Agent</label>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={SELECT}>
            <option value="" className="bg-[#111]">Select an agent…</option>
            {agents.map((a) => <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-white/40 mb-1.5 block">What should the agent do?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. check my TikTok analytics and summarise this week's performance"
            rows={3}
            className={INPUT + ' resize-none'}
          />
        </div>

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

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40">
            {saving ? 'Saving…' : 'Save Task'}
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

// ─── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onToggle, onRunNow, onDelete, runState, resultKey }: {
  task: ScheduledTask
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
  runState: 'idle' | 'running' | 'done'
  resultKey: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-surface-raised border border-surface-border rounded-xl overflow-hidden hover:border-white/10 transition-colors">
      {/* Card header */}
      <div className="flex items-start gap-4 p-5">
        <Toggle on={task.active} onChange={onToggle} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white mb-1 leading-snug">{task.name}</p>
          <div className="flex items-center gap-2 flex-wrap text-xs text-white/35">
            <span>{task.agent?.name ?? '—'}</span>
            <span className="text-white/15">·</span>
            <span>{cronToLabel(task.cronExpr)}</span>
            {!task.active && (
              <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/25 text-[10px]">Paused</span>
            )}
          </div>
          <p className="text-xs text-white/25 mt-1.5 leading-relaxed line-clamp-1">{task.description}</p>

          {runState === 'running' && (
            <p className="text-[11px] text-accent/70 mt-1.5 animate-pulse">Running… checking for result</p>
          )}
          {runState === 'done' && (
            <p className="text-[11px] text-white/30 mt-1.5">Check results panel ↓</p>
          )}
          {runState === 'idle' && task.lastRunAt && (
            <p className="text-[11px] text-white/20 mt-1.5">Last run {timeAgo(task.lastRunAt)}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Expand/collapse results */}
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Hide results' : 'Show results'}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/70 hover:border-white/20 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Run now */}
          <button
            onClick={onRunNow}
            disabled={runState !== 'idle'}
            title="Run now"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/70 hover:border-white/20 transition-colors disabled:opacity-40"
          >
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
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-400/5 transition-all opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Results panel */}
      {expanded && (
        <div className="border-t border-white/5 px-5 py-4">
          <ResultsPanel key={`${task.id}-${resultKey}`} taskId={task.id} />
        </div>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // per-task run state: 'idle' | 'running' | 'done'
  const [runStates, setRunStates] = useState<Record<string, 'idle' | 'running' | 'done'>>({})
  // bump to remount ResultsPanel after new result arrives
  const [refreshKey, setRefreshKey] = useState<Record<string, number>>({})
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  useEffect(() => {
    Promise.all([api.scheduler.list(), api.agents.list()])
      .then(([t, a]) => { setTasks(t); setAgents(a) })
      .finally(() => setLoading(false))
    return () => Object.values(pollTimers.current).forEach(clearInterval)
  }, [])

  async function handleToggle(task: ScheduledTask) {
    const updated = await api.scheduler.toggle(task.id)
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
  }

  async function handleRunNow(task: ScheduledTask) {
    setRunStates((prev) => ({ ...prev, [task.id]: 'running' }))

    // Fire and get immediate ack
    await api.scheduler.runNow(task.id).catch(console.error)

    // Poll for new result every 3s for up to 60s
    const startedAt = Date.now()
    const latestResultId = await api.scheduler.results(task.id)
      .then((r) => r[0]?.id ?? null).catch(() => null)

    pollTimers.current[task.id] = setInterval(async () => {
      const elapsed = Date.now() - startedAt
      try {
        const results = await api.scheduler.results(task.id)
        const newResult = results[0]
        if (newResult && newResult.id !== latestResultId) {
          // New result arrived
          clearInterval(pollTimers.current[task.id])
          delete pollTimers.current[task.id]
          setRefreshKey((prev) => ({ ...prev, [task.id]: (prev[task.id] ?? 0) + 1 }))
          setRunStates((prev) => ({ ...prev, [task.id]: 'idle' }))
          // Also refresh task's lastRunAt
          api.scheduler.list().then((updated) => setTasks(updated)).catch(() => {})
          return
        }
      } catch {}
      if (elapsed >= 60_000) {
        clearInterval(pollTimers.current[task.id])
        delete pollTimers.current[task.id]
        setRunStates((prev) => ({ ...prev, [task.id]: 'done' }))
      }
    }, 3_000)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    await api.scheduler.delete(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Scheduler</h1>
            <p className="text-white/30 text-sm mt-0.5">Agents run tasks automatically on a schedule</p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              + New Task
            </button>
          )}
        </div>

        {showForm && (
          <CreateForm
            agents={agents}
            onCreated={(task) => { setTasks((prev) => [task, ...prev]); setShowForm(false) }}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loading ? (
          <p className="text-white/25 text-sm">Loading...</p>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
            <svg className="w-10 h-10 text-white/15 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-white/25 text-sm mb-1">No scheduled tasks yet</p>
            <p className="text-white/15 text-xs mb-5">Example: check TikTok analytics every morning</p>
            {!showForm && (
              <button onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">
                Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onRunNow={() => handleRunNow(task)}
                onDelete={() => handleDelete(task.id)}
                runState={runStates[task.id] ?? 'idle'}
                resultKey={refreshKey[task.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
