'use client'

import { useEffect, useState } from 'react'
import { api, Agent, ScheduledTask } from '@/lib/api'

// Common cron presets
const CRON_PRESETS = [
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every day at 3am', value: '0 3 * * *' },
  { label: 'Every Monday at 8am', value: '0 8 * * 1' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Custom', value: 'custom' },
]

function formatLastRun(dateStr: string | null) {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function cronToHuman(expr: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === expr && p.value !== 'custom')
  return preset ? preset.label : expr
}

export default function SchedulerPage() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [running, setRunning] = useState<string | null>(null)

  const [form, setForm] = useState({
    agentId: '',
    name: '',
    prompt: '',
    cronPreset: '0 9 * * *',
    customCron: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([api.scheduler.list(), api.agents.list()])
      .then(([t, a]) => { setTasks(t); setAgents(a) })
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const cronExpr = form.cronPreset === 'custom' ? form.customCron : form.cronPreset
    if (!form.agentId || !form.name || !form.prompt || !cronExpr) return
    setSaving(true)
    try {
      const task = await api.scheduler.create({ agentId: form.agentId, name: form.name, prompt: form.prompt, cronExpr })
      setTasks((prev) => [task, ...prev])
      setForm({ agentId: '', name: '', prompt: '', cronPreset: '0 9 * * *', customCron: '' })
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

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
    if (!confirm('Delete this scheduled task?')) return
    await api.scheduler.delete(id)
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const cronExpr = form.cronPreset === 'custom' ? form.customCron : form.cronPreset

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Scheduler</h1>
            <p className="text-white/30 text-sm mt-0.5">
              Agents run tasks automatically — no user interaction needed
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            + New Task
          </button>
        </div>

        {loading ? (
          <div className="text-white/25 text-sm">Loading...</div>
        ) : tasks.length === 0 && !showForm ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white/25 text-sm mb-1">No scheduled tasks yet</p>
            <p className="text-white/15 text-xs mb-5">Example: check TikTok analytics every morning</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="group bg-surface-raised border border-surface-border rounded-xl px-5 py-4 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Enable toggle */}
                  <button
                    onClick={() => handleToggle(task)}
                    className={`mt-0.5 w-9 h-5 rounded-full flex items-center shrink-0 transition-colors ${
                      task.enabled ? 'bg-emerald-500/30' : 'bg-white/10'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full transition-transform mx-0.5 ${
                        task.enabled ? 'translate-x-4 bg-emerald-400' : 'translate-x-0 bg-white/30'
                      }`}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-white text-sm">{task.name}</p>
                      <span className="text-white/20 text-xs">·</span>
                      <span className="text-xs text-white/40">{task.agent.name}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-[11px] text-white/35 font-mono">
                        {cronToHuman(task.cronExpr)}
                      </span>
                    </div>

                    <p className="text-xs text-white/30 mt-1 truncate">{task.prompt}</p>

                    {task.lastResult && (
                      <p className="text-xs text-white/25 mt-2 line-clamp-2 bg-white/[0.03] rounded-lg px-3 py-2 leading-relaxed">
                        {task.lastResult}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-white/25">Last run</p>
                      <p className="text-xs text-white/40">{formatLastRun(task.lastRun)}</p>
                    </div>
                    <button
                      onClick={() => handleRunNow(task)}
                      disabled={running === task.id}
                      title="Run now"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-surface-border text-white/30 hover:text-white/60 hover:border-white/20 transition-colors disabled:opacity-40"
                    >
                      {running === task.id ? (
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
                      onClick={() => handleDelete(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-400 text-xs transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* New task form */}
        {showForm && (
          <div className="mt-4 bg-surface-raised border border-surface-border rounded-xl p-6">
            <h2 className="font-semibold text-white text-sm mb-5">Create Scheduled Task</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Task name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Daily TikTok report"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Agent</label>
                  <select
                    value={form.agentId}
                    onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/25 transition-colors"
                  >
                    <option value="" className="bg-surface">Select agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id} className="bg-surface">{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1.5 block">What to do</label>
                <textarea
                  value={form.prompt}
                  onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                  placeholder="e.g. Visit my TikTok Studio and tell me my average watch time and top performing video this week"
                  rows={3}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 resize-none transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Schedule</label>
                <div className="grid grid-cols-2 gap-3">
                  {CRON_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cronPreset: preset.value }))}
                      className={`text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                        form.cronPreset === preset.value
                          ? 'border-accent/60 bg-accent/10 text-white'
                          : 'border-surface-border text-white/40 hover:text-white/70 hover:border-white/15'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {form.cronPreset === 'custom' && (
                  <div className="mt-3">
                    <input
                      value={form.customCron}
                      onChange={(e) => setForm((f) => ({ ...f, customCron: e.target.value }))}
                      placeholder="0 9 * * 1-5  (cron expression)"
                      className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 font-mono transition-colors"
                    />
                  </div>
                )}
                {cronExpr && form.cronPreset !== 'custom' && (
                  <p className="mt-2 text-xs text-white/20 font-mono">{cronExpr}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {saving ? 'Creating...' : 'Create Task'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-surface-border text-white/50 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
