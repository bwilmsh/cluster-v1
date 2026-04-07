'use client'

import { useEffect, useState } from 'react'
import {
  api, Agent, Automation, AutomationTemplate, AutomationRun, AutomationTemplateVariable,
  BuildAutomationResult, MissingRequirement, RequirementsResult,
} from '@/lib/api'

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

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  social_media: 'Social Media',
  email: 'Email',
  analytics: 'Analytics',
  content: 'Content',
  alerts: 'Alerts',
}

const STATUS_COLORS: Record<string, string> = {
  success: 'text-green-400',
  failed: 'text-red-400',
  running: 'text-yellow-400',
  ai_recovered: 'text-blue-400',
  skipped: 'text-zinc-500',
}

// ─── Configure Modal ──────────────────────────────────────────────────────────

function ConfigureModal({
  template,
  agents,
  onSave,
  onClose,
}: {
  template: AutomationTemplate
  agents: Agent[]
  onSave: (data: {
    agentId: string
    variables: Record<string, string>
    schedule?: string
    deliveryType: string
    deliveryTarget?: string
  }) => void
  onClose: () => void
}) {
  const def = template.definition
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const v of def.variables ?? []) {
      init[v.key] = String(v.default ?? '')
    }
    return init
  })
  const [repeat, setRepeat] = useState<Repeat>('manual')
  const [hour, setHour] = useState(8)
  const [min, setMin] = useState(0)
  const [deliveryType, setDeliveryType] = useState(def.delivery_options?.[0] ?? 'chat')
  const [saving, setSaving] = useState(false)
  const [reqCheck, setReqCheck] = useState<RequirementsResult | null>(null)

  useEffect(() => {
    if ((def.requires ?? []).length === 0) {
      setReqCheck({ ok: true, missing: [] })
      return
    }
    api.automations.templateRequirements(template.id)
      .then(setReqCheck)
      .catch(() => {})
  }, [template.id])

  function handleSave() {
    setSaving(true)
    const schedule = repeat === 'manual' ? undefined : buildCron(repeat, hour, min)
    onSave({ agentId, variables: vars, schedule, deliveryType })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-zinc-800 p-4">
          <span className="text-2xl">{iconEmoji(template.icon)}</span>
          <div>
            <div className="font-semibold text-white">{template.name}</div>
            <div className="text-xs text-zinc-400">{template.description}</div>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-white">✕</button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Agent */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Variables */}
          {(def.variables ?? []).map((v: AutomationTemplateVariable) => (
            <div key={v.key}>
              <label className="block text-xs text-zinc-400 mb-1">
                {v.label}{v.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {v.type === 'select' ? (
                <select
                  value={vars[v.key] ?? ''}
                  onChange={(e) => setVars({ ...vars, [v.key]: e.target.value })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                >
                  {(v.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={v.type === 'number' ? 'number' : 'text'}
                  value={vars[v.key] ?? ''}
                  onChange={(e) => setVars({ ...vars, [v.key]: e.target.value })}
                  placeholder={v.placeholder ?? ''}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600"
                />
              )}
            </div>
          ))}

          {/* Schedule */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Schedule</label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as Repeat)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              {REPEAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {repeat !== 'manual' && repeat !== 'hourly' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">Hour</label>
                <input
                  type="number" min={0} max={23} value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">Minute</label>
                <input
                  type="number" min={0} max={59} value={min}
                  onChange={(e) => setMin(Number(e.target.value))}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          {/* Delivery */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Deliver results to</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              {(def.delivery_options ?? ['chat']).map((opt: string) => (
                <option key={opt} value={opt}>
                  {{ chat: 'Agent Chat', group_chat: 'Group Chat', email: 'Email', sheets: 'Google Sheets', slack: 'Slack' }[opt] ?? opt}
                </option>
              ))}
            </select>
          </div>

          {/* Requirements check */}
          {(def.requires ?? []).length > 0 && (
            <RequirementsBlock reqCheck={reqCheck} rawRequires={def.requires} />
          )}

          <div className="text-xs text-zinc-500">Estimated run time: {def.estimated_duration}</div>
        </div>

        <div className="border-t border-zinc-800 p-4 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !agentId}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? 'Activating…' : reqCheck && !reqCheck.ok ? 'Activate (requirements missing)' : 'Activate Automation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Run History Panel ────────────────────────────────────────────────────────

function RunHistoryPanel({ automationId, onClose }: { automationId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.automations.runs(automationId).then(setRuns).finally(() => setLoading(false))
  }, [automationId])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
          <div className="font-semibold text-white">Run History</div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-3">
          {loading && <div className="text-zinc-500 text-sm">Loading…</div>}
          {!loading && runs.length === 0 && <div className="text-zinc-500 text-sm">No runs yet.</div>}
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-800 overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/50 text-left"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${STATUS_COLORS[run.status] ?? 'text-zinc-400'}`}>
                    {run.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {new Date(run.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-zinc-600 text-xs">{expanded === run.id ? '▲' : '▼'}</span>
              </button>

              {expanded === run.id && (
                <div className="border-t border-zinc-800 p-3 space-y-3">
                  {/* Steps */}
                  {Array.isArray(run.steps) && run.steps.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-zinc-500 mb-2">Steps</div>
                      {(run.steps as any[]).map((step: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 font-medium ${STATUS_COLORS[step.status] ?? 'text-zinc-400'}`}>
                            {step.status === 'success' ? '✓' : step.status === 'ai_recovered' ? '⚡' : step.status === 'failed' ? '✗' : '−'}
                          </span>
                          <div>
                            <span className="text-zinc-300">{step.type} / {step.action}</span>
                            {step.error && <div className="text-red-400/80 mt-0.5">{step.error}</div>}
                            {step.ai_recovery_note && <div className="text-blue-400/80 mt-0.5">{step.ai_recovery_note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Final result */}
                  {run.finalResult && (
                    <div className="rounded-lg bg-zinc-800/60 p-3 text-xs text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {run.finalResult}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Requirements Block ───────────────────────────────────────────────────────

function RequirementsBlock({
  reqCheck,
  rawRequires,
}: {
  reqCheck: RequirementsResult | null
  rawRequires: string[]
}) {
  // While loading, show raw list
  if (!reqCheck) {
    return (
      <div className="rounded-lg border border-yellow-800/40 bg-yellow-950/30 p-3 text-xs text-yellow-300">
        <div className="font-medium mb-1">Requires</div>
        {rawRequires.map((r) => (
          <div key={r} className="text-yellow-400/80">· {r.replace(/_/g, ' ')}</div>
        ))}
      </div>
    )
  }

  if (reqCheck.ok) {
    return (
      <div className="rounded-lg border border-green-800/40 bg-green-950/30 p-3 text-xs text-green-400 flex items-center gap-2">
        <span>✓</span>
        <span>All requirements connected</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs space-y-2">
      <div className="font-medium text-red-400">Missing requirements — automation will be blocked until resolved</div>
      {reqCheck.missing.map((m) => (
        <div key={m.key} className="flex items-start justify-between gap-2">
          <div>
            <span className="text-red-300">✗ {m.label} required</span>
            <div className="text-red-400/60 mt-0.5">
              {m.type === 'credentials'
                ? 'Add in Settings → Credentials'
                : 'Connect in Integrations'}
            </div>
          </div>
          <a
            href={m.settingsPath}
            className="shrink-0 rounded px-2 py-1 bg-red-900/40 text-red-300 hover:bg-red-800/60 transition-colors"
          >
            Set up →
          </a>
        </div>
      ))}
    </div>
  )
}

// ─── Missing Requirements Badge (inline on automation card) ───────────────────

function MissingBadge({ missing }: { missing: MissingRequirement[] }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2">
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
        className="flex items-center gap-1.5 text-xs text-red-400 font-medium"
      >
        <span className="rounded-full bg-red-900/40 px-2 py-0.5">⚠ Missing requirements</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {missing.map((m) => (
            <div key={m.key} className="flex items-center justify-between text-xs">
              <span className="text-red-300/80">{m.label} not connected</span>
              <a
                href={m.settingsPath}
                className="text-violet-400 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {m.type === 'credentials' ? 'Add credentials →' : 'Connect →'}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Icon helper ──────────────────────────────────────────────────────────────

function iconEmoji(icon: string): string {
  const map: Record<string, string> = {
    tiktok: '🎵', instagram: '📸', youtube: '▶️', chart: '📊', gmail: '📧',
    sheets: '📋', eye: '👁', trending: '🔥', bell: '🔔', star: '⭐',
    custom: '⚙️',
  }
  return map[icon] ?? '🤖'
}

// ─── Build Custom Tab ─────────────────────────────────────────────────────────

function BuildCustomTab({ agents, onCreated }: { agents: Agent[]; onCreated: () => void }) {
  const [description, setDescription] = useState('')
  const [building, setBuilding] = useState(false)
  const [result, setResult] = useState<BuildAutomationResult | null>(null)
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleBuild() {
    if (!description.trim()) return
    setBuilding(true)
    setResult(null)
    setError('')
    try {
      const r = await api.automations.build(description)
      if (r.error) setError(r.error)
      else setResult(r)
    } catch {
      setError('Build service unavailable')
    } finally {
      setBuilding(false)
    }
  }

  async function handleSave() {
    if (!result || !agentId) return
    setSaving(true)
    try {
      await api.automations.createCustom({
        agentId,
        name: result.name ?? description.slice(0, 50),
        description: result.description ?? description,
        steps: result.steps ?? [],
        variables: result.variables ?? [],
      })
      setResult(null)
      setDescription('')
      onCreated()
    } catch {
      setError('Failed to save automation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="text-sm text-zinc-400">
        Describe what you want the automation to do in plain English. AI will convert it into structured steps you can review and edit.
      </div>

      <div>
        <label className="block text-xs text-zinc-400 mb-1">Agent</label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
        >
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Every morning at 8am, check my Gmail for unread emails from the last 24 hours, find anything about invoices or contracts, and send me a summary in the agent chat"
          rows={4}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none"
        />
      </div>

      <button
        onClick={handleBuild}
        disabled={building || !description.trim()}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
      >
        {building ? 'Generating steps…' : 'Generate Steps'}
      </button>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
          <div className="border-b border-zinc-800 p-4">
            <div className="font-semibold text-white">{result.name}</div>
            <div className="text-xs text-zinc-400 mt-0.5">{result.description}</div>
            <div className="text-xs text-zinc-500 mt-1">Est. {result.estimated_duration}</div>
          </div>

          <div className="p-4 space-y-2">
            <div className="text-xs text-zinc-400 mb-2">Steps (review before saving)</div>
            {(result.steps ?? []).map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-zinc-800/50 p-3 text-sm">
                <span className="text-zinc-500 text-xs mt-0.5 w-4">{i + 1}.</span>
                <div>
                  <span className="text-violet-400 font-mono text-xs">{step.type}/{step.action}</span>
                  {step.url && <div className="text-zinc-400 text-xs mt-0.5 truncate">{step.url}</div>}
                  {step.instructions && <div className="text-zinc-300 text-xs mt-0.5">{step.instructions}</div>}
                  {step.endpoint && <div className="text-zinc-400 text-xs mt-0.5">{step.provider} → {step.endpoint}</div>}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800 p-4 flex gap-2 justify-end">
            <div className="text-xs text-zinc-500 flex-1 self-center">
              Custom automations are flagged for admin review before becoming official prebuilts.
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Activate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'browse' | 'mine' | 'build'

export default function AutomationsPage() {
  const [tab, setTab] = useState<Tab>('browse')
  const [templates, setTemplates] = useState<AutomationTemplate[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [runsToday, setRunsToday] = useState(0)
  const [dailyLimit, setDailyLimit] = useState(10)
  const [category, setCategory] = useState('all')
  const [configTemplate, setConfigTemplate] = useState<AutomationTemplate | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  // Map of automationId → requirements result (loaded lazily after automations load)
  const [reqMap, setReqMap] = useState<Record<string, RequirementsResult>>({})

  async function load() {
    const [tpl, { automations: a, runsToday: r, dailyLimit: d }, ag] = await Promise.all([
      api.automations.templates(),
      api.automations.list(),
      api.agents.list(),
    ])
    setTemplates(tpl)
    setAutomations(a)
    setAgents(ag)
    setRunsToday(r)
    setDailyLimit(d)
    setLoading(false)

    // Fetch requirements for each automation in the background
    const checks = await Promise.all(
      a.map((auto) => api.automations.requirements(auto.id).catch(() => ({ ok: true, missing: [] } as RequirementsResult)))
    )
    const map: Record<string, RequirementsResult> = {}
    a.forEach((auto, i) => { map[auto.id] = checks[i] })
    setReqMap(map)
  }

  useEffect(() => { load() }, [])

  const categories = ['all', ...Array.from(new Set(templates.map((t) => t.category)))]

  const filtered = category === 'all' ? templates : templates.filter((t) => t.category === category)

  async function handleActivate(data: {
    agentId: string
    variables: Record<string, string>
    schedule?: string
    deliveryType: string
    deliveryTarget?: string
  }) {
    if (!configTemplate) return
    await api.automations.create({
      templateId: configTemplate.id,
      agentId: data.agentId,
      variables: data.variables,
      schedule: data.schedule,
      deliveryType: data.deliveryType,
      deliveryTarget: data.deliveryTarget,
    })
    setConfigTemplate(null)
    setTab('mine')
    await load()
  }

  async function handleRun(id: string) {
    // Block immediately if we already know requirements are missing
    const knownReq = reqMap[id]
    if (knownReq && !knownReq.ok) {
      // Scroll to the card — the MissingBadge already shows details
      return
    }

    setRunningIds((s) => new Set(s).add(id))
    try {
      const r = await api.automations.run(id)
      if (r.missing && r.missing.length > 0) {
        // Server confirmed missing — update reqMap so card shows badge
        setReqMap((prev) => ({ ...prev, [id]: { ok: false, missing: r.missing! } }))
      } else if (r.error) {
        alert(r.error)
      } else {
        setRunsToday(r.runsToday ?? runsToday)
      }
    } finally {
      setRunningIds((s) => { const n = new Set(s); n.delete(id); return n })
      setTimeout(load, 3000)
    }
  }

  async function handleToggle(id: string) {
    await api.automations.toggle(id)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    await api.automations.delete(id)
    await load()
  }

  return (
    <div className="flex flex-col h-full p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Automations</h1>
          <div className="text-sm text-zinc-500">
            {runsToday}/{dailyLimit} runs today
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {([['browse', 'Browse Prebuilts'], ['mine', 'My Automations'], ['build', 'Build Custom']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-zinc-800 text-white font-medium'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
            {t === 'mine' && automations.length > 0 && (
              <span className="ml-1.5 rounded-full bg-violet-600 px-1.5 text-xs">{automations.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Browse Tab */}
          {tab === 'browse' && (
            <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
              {/* Category filter */}
              <div className="flex gap-2 flex-wrap">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      category === c
                        ? 'bg-violet-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {CATEGORY_LABELS[c] ?? c}
                  </button>
                ))}
              </div>

              {/* Template grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((t) => {
                  const alreadyActive = automations.some((a) => a.templateId === t.id)
                  return (
                    <div
                      key={t.id}
                      className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 flex flex-col gap-2 hover:border-zinc-600 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-2xl leading-none">{iconEmoji(t.icon)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-sm">{t.name}</div>
                          <div className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{t.description}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                          {CATEGORY_LABELS[t.category] ?? t.category}
                        </span>
                        <span className="text-zinc-600 text-xs">{t.definition?.estimated_duration}</span>
                      </div>

                      <button
                        onClick={() => setConfigTemplate(t)}
                        className={`mt-auto rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          alreadyActive
                            ? 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-white'
                            : 'bg-violet-600 text-white hover:bg-violet-500'
                        }`}
                      >
                        {alreadyActive ? 'Add another' : 'Activate'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {filtered.length === 0 && (
                <div className="text-zinc-500 text-sm">No templates in this category yet.</div>
              )}
            </div>
          )}

          {/* My Automations Tab */}
          {tab === 'mine' && (
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              {automations.length === 0 && (
                <div className="text-zinc-500 text-sm">
                  No automations yet.{' '}
                  <button onClick={() => setTab('browse')} className="text-violet-400 hover:underline">
                    Browse prebuilts
                  </button>{' '}
                  or{' '}
                  <button onClick={() => setTab('build')} className="text-violet-400 hover:underline">
                    build a custom one
                  </button>
                  .
                </div>
              )}

              {automations.map((a) => {
                const req = reqMap[a.id]
                const blocked = req ? !req.ok : false
                return (
                  <div
                    key={a.id}
                    className={`rounded-xl border bg-zinc-900 p-4 ${blocked ? 'border-red-800/50' : 'border-zinc-700'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl">{iconEmoji(a.template?.icon ?? 'custom')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white text-sm">{a.name}</span>
                          {!a.active && (
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">Paused</span>
                          )}
                          {a.lastRunStatus === 'skipped' && (
                            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">Skipped</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 flex gap-3">
                          <span>{a.agent?.name ?? 'Unknown agent'}</span>
                          <span>{cronToLabel(a.schedule)}</span>
                          <span>→ {a.deliveryType}</span>
                        </div>
                        {a.lastRunAt && (
                          <div className="text-xs mt-1 flex items-center gap-1.5">
                            <span className={STATUS_COLORS[a.lastRunStatus ?? ''] ?? 'text-zinc-500'}>
                              {a.lastRunStatus}
                            </span>
                            <span className="text-zinc-600">{timeAgo(a.lastRunAt)}</span>
                          </div>
                        )}
                        {/* Requirements badge — shown only when check is done and something is missing */}
                        {blocked && req && (
                          <MissingBadge missing={req.missing} />
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRun(a.id)}
                          disabled={runningIds.has(a.id) || blocked}
                          title={blocked ? 'Missing requirements — see details below' : 'Run now'}
                          className={`rounded-lg px-2 py-1 text-xs disabled:opacity-40 ${
                            blocked
                              ? 'text-red-400/50 cursor-not-allowed'
                              : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                          }`}
                        >
                          {runningIds.has(a.id) ? '…' : '▶'}
                        </button>
                        <button
                          onClick={() => setHistoryId(a.id)}
                          title="Run history"
                          className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => handleToggle(a.id)}
                          title={a.active ? 'Pause' : 'Resume'}
                          className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        >
                          {a.active ? '⏸' : '▶️'}
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          title="Delete"
                          className="rounded-lg px-2 py-1 text-xs text-red-500/60 hover:bg-zinc-800 hover:text-red-400"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Build Custom Tab */}
          {tab === 'build' && (
            <div className="flex-1 overflow-y-auto">
              <BuildCustomTab agents={agents} onCreated={() => { setTab('mine'); load() }} />
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {configTemplate && (
        <ConfigureModal
          template={configTemplate}
          agents={agents}
          onSave={handleActivate}
          onClose={() => setConfigTemplate(null)}
        />
      )}
      {historyId && (
        <RunHistoryPanel automationId={historyId} onClose={() => setHistoryId(null)} />
      )}
    </div>
  )
}
