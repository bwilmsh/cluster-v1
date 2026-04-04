'use client'

import { useEffect, useState } from 'react'
import { api, Agent, ScheduledTask } from '@/lib/api'

// ─── Cron helpers ─────────────────────────────────────────────────────────────

type Repeat = 'once' | 'daily' | 'weekly' | 'weekdays' | 'hourly'

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'once',     label: 'Once' },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekly',   label: 'Every week (Sunday)' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'hourly',   label: 'Every hour' },
]

function buildCron(repeat: Repeat, hour: number, min: number): string {
  switch (repeat) {
    case 'once':     return `${min} ${hour} * * *`   // daily at time; disabled after first run
    case 'daily':    return `${min} ${hour} * * *`
    case 'weekly':   return `${min} ${hour} * * 0`
    case 'weekdays': return `${min} ${hour} * * 1-5`
    case 'hourly':   return `0 * * * *`
  }
}

function cronToLabel(expr: string): string {
  if (!expr) return 'Unknown schedule'
  if (expr === '0 * * * *') return 'Every hour'
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  const hh = hour.padStart(2, '0')
  const mm = min.padStart(2, '0')
  const time = `${hh}:${mm}`
  if (dow === '1-5') return `Mon–Fri at ${time}`
  if (dow === '0')   return `Weekly at ${time}`
  return `Daily at ${time}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(Math.abs(diff) / 60000)
  if (mins < 2)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-white/40 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

const INPUT = 'w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors'
const SELECT = INPUT + ' appearance-none'

// ─── Task form ─────────────────────────────────────────────────────────────────

interface FormState {
  agentId: string
  url: string
  description: string
  repeat: Repeat
  hour: string
  minute: string
  needsLogin: boolean
  username: string
  password: string
}

const DEFAULT_FORM: FormState = {
  agentId: '',
  url: '',
  description: '',
  repeat: 'daily',
  hour: '09',
  minute: '00',
  needsLogin: false,
  username: '',
  password: '',
}

function TaskForm({
  agents,
  onSave,
  onCancel,
}: {
  agents: Agent[]
  onSave: (task: ScheduledTask) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof FormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.agentId) { setError('Please select an agent.'); return }
    if (!form.description.trim()) { setError('Please describe what the agent should do.'); return }

    setSaving(true)
    try {
      // Save credentials if provided
      if (form.url && form.needsLogin && form.username && form.password) {
        const domain = (() => { try { return new URL(form.url).hostname } catch { return form.url } })()
        await api.credentials.create({
          siteName: domain,
          siteUrl: form.url,
          username: form.username,
          password: form.password,
        })
      }

      // Build prompt: prepend URL if given
      const prompt = form.url
        ? `Visit ${form.url} and ${form.description.trim()}`
        : form.description.trim()

      // Build name from description (first ~40 chars)
      const name = prompt.length > 45 ? prompt.slice(0, 42) + '…' : prompt

      const cronExpr = buildCron(form.repeat, parseInt(form.hour), parseInt(form.minute))
      const task = await api.scheduler.create({
        agentId: form.agentId,
        name,
        prompt,
        cronExpr,
      })

      onSave(task)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

  return (
    <div className="bg-surface-raised border border-surface-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-white text-sm">New Scheduled Task</h2>
        <button onClick={onCancel} className="text-white/25 hover:text-white/60 text-sm transition-colors">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Agent */}
        <Field label="Which agent runs this task?">
          <select
            value={form.agentId}
            onChange={(e) => set('agentId', e.target.value)}
            className={SELECT}
          >
            <option value="" className="bg-[#111]">Select an agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>
            ))}
          </select>
        </Field>

        {/* Website URL */}
        <Field label="Website to visit (optional)">
          <input
            type="url"
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://studio.tiktok.com/creator"
            className={INPUT}
          />
        </Field>

        {/* Credentials toggle — only shown when URL is entered */}
        {form.url && (
          <div className="rounded-xl border border-surface-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/70">This site needs a login</p>
                <p className="text-xs text-white/30 mt-0.5">Credentials are saved encrypted</p>
              </div>
              <Toggle on={form.needsLogin} onChange={(v) => set('needsLogin', v)} />
            </div>

            {form.needsLogin && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <input
                  value={form.username}
                  onChange={(e) => set('username', e.target.value)}
                  placeholder="Username / Email"
                  className={INPUT}
                />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Password"
                  className={INPUT}
                />
              </div>
            )}
          </div>
        )}

        {/* Task description */}
        <Field label="What should the agent do?">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. check my average watch time and best performing video this week and summarise it"
            rows={3}
            className={INPUT + ' resize-none'}
          />
        </Field>

        {/* Repeat + Time */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Repeat">
            <select
              value={form.repeat}
              onChange={(e) => set('repeat', e.target.value as Repeat)}
              className={SELECT}
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[#111]">{o.label}</option>
              ))}
            </select>
          </Field>

          {form.repeat !== 'hourly' && (
            <Field label="Time">
              <div className="flex gap-2">
                <select
                  value={form.hour}
                  onChange={(e) => set('hour', e.target.value)}
                  className={SELECT}
                >
                  {hours.map((h) => (
                    <option key={h} value={h} className="bg-[#111]">{h}</option>
                  ))}
                </select>
                <span className="flex items-center text-white/30 text-sm font-medium">:</span>
                <select
                  value={form.minute}
                  onChange={(e) => set('minute', e.target.value)}
                  className={SELECT}
                >
                  {minutes.map((m) => (
                    <option key={m} value={m} className="bg-[#111]">{m}</option>
                  ))}
                </select>
              </div>
            </Field>
          )}
        </div>

        {/* Summary line */}
        <p className="text-xs text-white/25 -mt-1">
          {form.repeat === 'once'    && `Runs once at ${form.hour}:${form.minute}`}
          {form.repeat === 'daily'   && `Runs every day at ${form.hour}:${form.minute}`}
          {form.repeat === 'weekly'  && `Runs every Sunday at ${form.hour}:${form.minute}`}
          {form.repeat === 'weekdays'&& `Runs Mon–Fri at ${form.hour}:${form.minute}`}
          {form.repeat === 'hourly'  && 'Runs every hour on the hour'}
        </p>

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

function TaskCard({
  task,
  onToggle,
  onRunNow,
  onDelete,
  running,
}: {
  task: ScheduledTask
  onToggle: () => void
  onRunNow: () => void
  onDelete: () => void
  running: boolean
}) {
  const agentName = task.agent?.name ?? 'Unknown Agent'

  return (
    <div className="group bg-surface-raised border border-surface-border rounded-xl p-5 hover:border-white/10 transition-colors">
      <div className="flex items-start gap-4">
        {/* Enable toggle */}
        <Toggle on={task.enabled} onChange={onToggle} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-medium text-white leading-snug">{task.name}</p>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/35">{agentName}</span>
            <span className="text-white/15 text-xs">·</span>
            <span className="text-xs text-white/35">{cronToLabel(task.cronExpr ?? '')}</span>
            {!task.enabled && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/25">Paused</span>
            )}
          </div>

          {/* Last result */}
          {task.lastResult && (
            <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-white/30 mb-1">Last result · {formatDate(task.lastRun)}</p>
              <p className="text-xs text-white/50 leading-relaxed line-clamp-3">{task.lastResult}</p>
            </div>
          )}

          {!task.lastResult && task.lastRun && (
            <p className="text-xs text-white/20 mt-2">Last run {formatDate(task.lastRun)} · no result</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
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
            title="Delete task"
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
    const updated = await api.scheduler.update(task.id, { enabled: !task.enabled })
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
  }

  async function handleRunNow(task: ScheduledTask) {
    setRunning(task.id)
    try {
      const updated = await api.scheduler.runNow(task.id)
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
    } finally {
      setRunning(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    await api.scheduler.delete(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Scheduler</h1>
            <p className="text-white/30 text-sm mt-0.5">
              Agents run tasks automatically, 24/7 — no computer needed
            </p>
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

        {/* New task form */}
        {showForm && (
          <div className="mb-6">
            <TaskForm
              agents={agents}
              onSave={(task) => {
                setTasks((prev) => [task, ...prev])
                setShowForm(false)
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div className="text-white/25 text-sm">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white/25 text-sm mb-1">No scheduled tasks yet</p>
            <p className="text-white/15 text-xs mb-5">
              Example: check TikTok analytics every morning and send a summary
            </p>
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
            {tasks.map((task) => (
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
