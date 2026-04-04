'use client'

import { useEffect, useState } from 'react'
import { api, Agent, ScheduledTask } from '@/lib/api'

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 2)  return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
      // Short name: first 4–5 meaningful words
      const words = desc.replace(/https?:\/\/\S+/g, '').trim().split(/\s+/).filter(w => w.length > 2)
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
          <select value={agentId} onChange={e => setAgentId(e.target.value)} className={SELECT}>
            <option value="" className="bg-[#111]">Select an agent…</option>
            {agents.map(a => <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-white/40 mb-1.5 block">What should the agent do?</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. check my TikTok analytics and summarise this week's performance"
            rows={3}
            className={INPUT + ' resize-none'}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-white/40 mb-1.5 block">Repeat</label>
            <select value={repeat} onChange={e => setRepeat(e.target.value as Repeat)} className={SELECT}>
              {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-[#111]">{o.label}</option>)}
            </select>
          </div>

          {repeat !== 'hourly' && (
            <div>
              <label className="text-xs font-medium text-white/40 mb-1.5 block">Time</label>
              <div className="flex gap-2">
                <select value={hour} onChange={e => setHour(e.target.value)} className={SELECT}>
                  {hours.map(h => <option key={h} value={h} className="bg-[#111]">{h}</option>)}
                </select>
                <span className="flex items-center text-white/30 text-sm">:</span>
                <select value={minute} onChange={e => setMinute(e.target.value)} className={SELECT}>
                  {minutes.map(m => <option key={m} value={m} className="bg-[#111]">{m}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save Task'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-lg border border-surface-border text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onToggle, onRunNow, onDelete, running }: {
  task: ScheduledTask
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
  running: boolean
}) {
  return (
    <div className="group bg-surface-raised border border-surface-border rounded-xl p-5 hover:border-white/10 transition-colors">
      <div className="flex items-start gap-4">
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

          <p className="text-xs text-white/25 mt-1.5 leading-relaxed line-clamp-2">{task.description}</p>

          {task.lastRunResult && (
            <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-white/25 mb-1">Last run {timeAgo(task.lastRunAt)}</p>
              <p className="text-xs text-white/50 leading-relaxed line-clamp-3">{task.lastRunResult}</p>
            </div>
          )}

          {!task.lastRunResult && task.lastRunAt && (
            <p className="text-xs text-white/20 mt-2">Last run {timeAgo(task.lastRunAt)} · no result</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRunNow}
            disabled={running}
            title="Run now"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/70 hover:border-white/20 transition-colors disabled:opacity-40"
          >
            {running ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-white/20 hover:text-rose-400 hover:bg-rose-400/5 transition-all"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.scheduler.list(), api.agents.list()])
      .then(([t, a]) => { setTasks(t); setAgents(a) })
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(task: ScheduledTask) {
    const updated = await api.scheduler.toggle(task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
  }

  async function handleRunNow(task: ScheduledTask) {
    setRunning(task.id)
    try {
      const updated = await api.scheduler.runNow(task.id)
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t))
    } finally {
      setRunning(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    await api.scheduler.delete(id)
    setTasks(prev => prev.filter(t => t.id !== id))
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
            onCreated={(task) => { setTasks(prev => [task, ...prev]); setShowForm(false) }}
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
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
              >
                Create your first task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => handleToggle(task)}
                onRunNow={() => handleRunNow(task)}
                onDelete={() => handleDelete(task.id)}
                running={running === task.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
