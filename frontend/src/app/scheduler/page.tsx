'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Agent, DeliveryMethod, GroupChat, ScheduledTask, TaskResult } from '@/lib/api'

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
  if (!expr) return 'Unknown schedule'
  if (expr === '0 * * * *') return 'Every hour'
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (dow === '1-5') return `Mon–Fri at ${time}`
  if (dow === '0')   return `Weekly at ${time}`
  return `Daily at ${time}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 2)   return 'Just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-white/10'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

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

// ─── Plan approval panel ──────────────────────────────────────────────────────

function PlanApprovalPanel({
  taskId,
  onApproved,
  onDismiss,
}: {
  taskId: string
  onApproved: (task: ScheduledTask) => void
  onDismiss: () => void
}) {
  const [task, setTask] = useState<ScheduledTask | null>(null)
  const [countdown, setCountdown] = useState(60)
  const [editing, setEditing] = useState(false)
  const [editedPlan, setEditedPlan] = useState('')
  const [saving, setSaving] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll until agentPlan is set
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const t = await api.scheduler.get(taskId)
        if (t.agentPlan) {
          setTask(t)
          clearInterval(pollRef.current!)
          // If already auto-approved (backend beat us), just notify
          if (t.planApproved) {
            onApproved(t)
          }
        }
      } catch {}
    }, 2000)
    return () => clearInterval(pollRef.current!)
  }, [taskId])

  // Start countdown once plan arrives
  useEffect(() => {
    if (!task?.agentPlan || task.planApproved) return
    setCountdown(60)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!)
          // Auto-approval already handled server-side; just refresh
          api.scheduler.get(taskId).then(onApproved).catch(() => {})
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current!)
  }, [task?.agentPlan])

  async function handleApprove() {
    setSaving(true)
    try {
      // Save edited plan first if in edit mode
      if (editing && editedPlan.trim()) {
        await api.scheduler.updatePlan(taskId, editedPlan.trim())
      }
      const updated = await api.scheduler.approvePlan(taskId)
      clearInterval(countdownRef.current!)
      onApproved(updated)
    } catch {} finally {
      setSaving(false)
    }
  }

  function startEdit() {
    setEditedPlan(task?.agentPlan ?? '')
    setEditing(true)
  }

  return (
    <div className="bg-surface-raised border border-accent/30 rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-white">Reviewing execution plan</p>
          <p className="text-xs text-white/30 mt-0.5">
            {task?.name ? `"${task.name}"` : 'Agent is generating a plan…'}
          </p>
        </div>
        <button onClick={onDismiss} className="text-white/25 hover:text-white/50 text-sm transition-colors">✕</button>
      </div>

      {!task?.agentPlan ? (
        <div className="flex items-center gap-3 py-4">
          <svg className="w-4 h-4 animate-spin text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <p className="text-sm text-white/40">Generating plan…</p>
        </div>
      ) : (
        <>
          {editing ? (
            <textarea
              value={editedPlan}
              onChange={(e) => setEditedPlan(e.target.value)}
              rows={6}
              className={INPUT + ' resize-none mb-4 font-mono text-xs leading-relaxed'}
            />
          ) : (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 mb-4">
              <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">{task.agentPlan}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleApprove}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
            >
              {saving ? 'Approving…' : 'Approve'}
            </button>

            {!editing && (
              <button
                onClick={startEdit}
                className="px-4 py-2 rounded-lg border border-surface-border text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Edit plan
              </button>
            )}

            {editing && (
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg border border-surface-border text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                Cancel edit
              </button>
            )}

            <span className="ml-auto text-xs text-white/20">
              Auto-approves in {countdown}s
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Task form ─────────────────────────────────────────────────────────────────

interface FormState {
  agentId: string
  description: string
  repeat: Repeat
  hour: string
  minute: string
  emailDelivery: boolean
  emailTo: string
  chatDelivery: boolean
  chatId: string
}

const DEFAULT_FORM: FormState = {
  agentId: '',
  description: '',
  repeat: 'daily',
  hour: '09',
  minute: '00',
  emailDelivery: false,
  emailTo: '',
  chatDelivery: false,
  chatId: '',
}

function TaskForm({
  agents,
  groupChats,
  onCreated,
  onCancel,
}: {
  agents: Agent[]
  groupChats: GroupChat[]
  onCreated: (taskId: string) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.agentId) { setError('Please select an agent.'); return }
    if (!form.description.trim()) { setError('Please describe what the agent should do.'); return }

    setSaving(true)
    try {
      const description = form.description.trim()
      const name = description.length > 45 ? description.slice(0, 42) + '…' : description
      const cronExpr = buildCron(form.repeat, parseInt(form.hour), parseInt(form.minute))

      const resultDelivery: DeliveryMethod[] = []
      if (form.emailDelivery && form.emailTo.trim()) {
        resultDelivery.push({ type: 'email', to: form.emailTo.trim() })
      }
      if (form.chatDelivery && form.chatId) {
        resultDelivery.push({ type: 'groupchat', groupChatId: form.chatId })
      }

      const task = await api.scheduler.create({ agentId: form.agentId, name, description, cronExpr, resultDelivery })
      onCreated(task.id)
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
        <Field label="Which agent runs this task?">
          <select value={form.agentId} onChange={(e) => set('agentId', e.target.value)} className={SELECT}>
            <option value="" className="bg-[#111]">Select an agent…</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>
            ))}
          </select>
        </Field>

        <Field label="What should the agent do?">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="e.g. check my TikTok analytics and summarise this week's performance"
            rows={3}
            className={INPUT + ' resize-none'}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Repeat">
            <select value={form.repeat} onChange={(e) => set('repeat', e.target.value as Repeat)} className={SELECT}>
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-[#111]">{o.label}</option>
              ))}
            </select>
          </Field>

          {form.repeat !== 'hourly' && (
            <Field label="Time">
              <div className="flex gap-2">
                <select value={form.hour} onChange={(e) => set('hour', e.target.value)} className={SELECT}>
                  {hours.map((h) => <option key={h} value={h} className="bg-[#111]">{h}</option>)}
                </select>
                <span className="flex items-center text-white/30 text-sm font-medium">:</span>
                <select value={form.minute} onChange={(e) => set('minute', e.target.value)} className={SELECT}>
                  {minutes.map((m) => <option key={m} value={m} className="bg-[#111]">{m}</option>)}
                </select>
              </div>
            </Field>
          )}
        </div>

        {/* Delivery */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-white/40">Deliver results (optional)</p>

          <div className="rounded-xl border border-surface-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white/70">Email results</p>
              <Toggle on={form.emailDelivery} onChange={(v) => set('emailDelivery', v)} />
            </div>
            {form.emailDelivery && (
              <input
                type="email"
                value={form.emailTo}
                onChange={(e) => set('emailTo', e.target.value)}
                placeholder="your@email.com"
                className={INPUT}
              />
            )}
          </div>

          {groupChats.length > 0 && (
            <div className="rounded-xl border border-surface-border px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/70">Post to group chat</p>
                <Toggle on={form.chatDelivery} onChange={(v) => set('chatDelivery', v)} />
              </div>
              {form.chatDelivery && (
                <select value={form.chatId} onChange={(e) => set('chatId', e.target.value)} className={SELECT}>
                  <option value="" className="bg-[#111]">Select a chat…</option>
                  {groupChats.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#111]">{c.name}</option>
                  ))}
                </select>
              )}
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
            {saving ? 'Creating…' : 'Create Task'}
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

// ─── Results drawer ───────────────────────────────────────────────────────────

function ResultsDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const [results, setResults] = useState<TaskResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.scheduler.results(taskId).then(setResults).finally(() => setLoading(false))
  }, [taskId])

  return (
    <div className="mt-4 bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-white/40">Run history</p>
        <button onClick={onClose} className="text-white/20 hover:text-white/50 text-xs transition-colors">Close</button>
      </div>

      {loading ? (
        <p className="text-xs text-white/20 py-2">Loading…</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-white/20 py-2">No runs yet.</p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.id} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className="text-[10px] text-white/30">{formatDate(r.runAt)}</span>
                <span className={`text-[10px] ${r.status === 'success' ? 'text-emerald-400/60' : 'text-rose-400/60'}`}>{r.status}</span>
              </div>
              <p className="text-xs text-white/45 leading-relaxed line-clamp-3">{r.result}</p>
            </div>
          ))}
        </div>
      )}
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
  const [showResults, setShowResults] = useState(false)
  const agentName = task.agent?.name ?? 'Unknown Agent'
  const isRunning = running || task.lastRunStatus === 'running'
  const isFailed = task.lastRunStatus === 'failed'
  const isPending = !task.planApproved

  return (
    <div className={`group bg-surface-raised border rounded-xl p-5 hover:border-white/10 transition-colors ${isFailed ? 'border-rose-500/20' : 'border-surface-border'}`}>
      <div className="flex items-start gap-4">
        {/* Active toggle — disabled until plan approved */}
        <div className={isPending ? 'opacity-30 pointer-events-none' : ''}>
          <Toggle on={task.active} onChange={onToggle} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-medium text-white leading-snug">{task.name}</p>

            {isPending && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/15 text-accent/80">Pending approval</span>
            )}
            {isRunning && !isPending && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Running
              </span>
            )}
            {isFailed && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400">Failed</span>
            )}
            {!task.active && !isPending && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/25">Paused</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-white/35">{agentName}</span>
            <span className="text-white/15 text-xs">·</span>
            <span className="text-xs text-white/35">{cronToLabel(task.cronExpr ?? '')}</span>
          </div>

          {task.lastRunResult && (
            <div className="mt-3 bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[11px] text-white/30">Last result · {formatDate(task.lastRunAt)}</p>
                <button
                  onClick={() => setShowResults((v) => !v)}
                  className="text-[10px] text-white/20 hover:text-white/50 transition-colors"
                >
                  {showResults ? 'Hide history' : 'View history'}
                </button>
              </div>
              <p className="text-xs text-white/50 leading-relaxed line-clamp-3">{task.lastRunResult}</p>
            </div>
          )}

          {!task.lastRunResult && task.lastRunAt && (
            <p className="text-xs text-white/20 mt-2">Last run {formatDate(task.lastRunAt)} · no result</p>
          )}

          {!task.lastRunResult && !task.lastRunAt && task.planApproved && (
            <button
              onClick={() => setShowResults((v) => !v)}
              className="text-[10px] text-white/20 hover:text-white/50 transition-colors mt-2 block"
            >
              {showResults ? 'Hide history' : 'View history'}
            </button>
          )}

          {showResults && <ResultsDrawer taskId={task.id} onClose={() => setShowResults(false)} />}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRunNow}
            disabled={running || isPending}
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
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [pendingPlanTaskId, setPendingPlanTaskId] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.scheduler.list(), api.agents.list(), api.groupChats.list()])
      .then(([t, a, g]) => { setTasks(t); setAgents(a); setGroupChats(g) })
      .finally(() => setLoading(false))
  }, [])

  async function handleToggle(task: ScheduledTask) {
    const updated = await api.scheduler.activate(task.id)
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
    if (pendingPlanTaskId === id) setPendingPlanTaskId(null)
  }

  function handlePlanApproved(updatedTask: ScheduledTask) {
    setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)))
    setPendingPlanTaskId(null)
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
          {!showForm && !pendingPlanTaskId && (
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
              groupChats={groupChats}
              onCreated={(taskId) => {
                setShowForm(false)
                setPendingPlanTaskId(taskId)
                // Add a placeholder task to the list that will update once plan is approved
                api.scheduler.get(taskId).then((t) => setTasks((prev) => [t, ...prev])).catch(() => {})
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Plan approval panel */}
        {pendingPlanTaskId && (
          <PlanApprovalPanel
            taskId={pendingPlanTaskId}
            onApproved={handlePlanApproved}
            onDismiss={() => setPendingPlanTaskId(null)}
          />
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
