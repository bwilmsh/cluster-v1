'use client'

import { useEffect, useRef, useState } from 'react'
import { api, Agent, Automation, AutomationRun, AutomationStep, PreflightResult, PreflightRequirement } from '@/lib/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Repeat = 'daily' | 'weekly' | 'weekdays' | 'hourly'

const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily',    label: 'Every day' },
  { value: 'weekly',   label: 'Every week' },
  { value: 'weekdays', label: 'Mon–Fri' },
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
  if (!expr) return 'Manual'
  if (expr === '0 * * * *') return 'Every hour'
  const parts = expr.split(' ')
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
  if (dow === '1-5') return `Mon–Fri ${time}`
  if (dow === '0')   return `Weekly ${time}`
  return `Daily ${time}`
}

function timeAgo(d: string | null | undefined) {
  if (!d) return 'never'
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function runDuration(run: AutomationRun) {
  if (!run.completedAt) return null
  const s = Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-white/10'}`}>
      <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  )
}

const INPUT = 'w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors'
const SELECT = INPUT + ' appearance-none'

const STATUS_DOT: Record<string, string> = {
  success: 'bg-emerald-400',
  failed:  'bg-rose-400',
  running: 'bg-accent animate-pulse',
}
const STATUS_TEXT: Record<string, string> = {
  success: 'text-emerald-400',
  failed:  'text-rose-400',
  running: 'text-accent',
}

// ─── Report renderer ──────────────────────────────────────────────────────────

function ReportView({ text }: { text: string }) {
  const sections = text.split(/^## /m).filter(Boolean)
  if (sections.length <= 1) {
    return <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{text}</p>
  }
  return (
    <div className="space-y-6">
      {sections.map((sec, i) => {
        const nl = sec.indexOf('\n')
        const heading = nl === -1 ? sec.trim() : sec.slice(0, nl).trim()
        const body = nl === -1 ? '' : sec.slice(nl + 1).trim()
        return (
          <div key={i}>
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">{heading}</p>
            <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">{body || '—'}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Steps view ───────────────────────────────────────────────────────────────

const TOOL_LABEL: Record<string, string> = {
  search_web:       'Searched web',
  browse_website:   'Browsed site',
  read_page_content:'Read page',
  send_email:       'Sent email',
  fill_form:        'Filled form',
  click_element:    'Clicked element',
  screenshot_page:  'Screenshot',
}

function StepsView({ steps }: { steps: AutomationStep[] }) {
  if (!steps.length) return <p className="text-sm text-white/30 py-4">No tool calls were recorded.</p>

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const label = TOOL_LABEL[step.tool] ?? step.tool.replace(/_/g, ' ')
        const mainInput = Object.values(step.input ?? {})[0] ?? ''
        return (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                step.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
              }`}>{i + 1}</span>
              {i < steps.length - 1 && <div className="w-px flex-1 bg-white/8 mt-1" />}
            </div>
            <div className="pb-3 flex-1 min-w-0">
              <p className="text-sm text-white/80 font-medium">
                {label}
                {mainInput && <span className="text-white/35 font-normal"> — {String(mainInput).slice(0, 100)}</span>}
              </p>
              {step.output && (
                <p className="text-xs text-white/40 mt-1 leading-relaxed line-clamp-3">{step.output}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Pre-flight panel ─────────────────────────────────────────────────────────

const INTEGRATION_LABELS: Record<string, string> = {
  google: 'Google (Gmail / Sheets / Calendar)',
  slack: 'Slack',
  notion: 'Notion',
  email: 'Email (SMTP)',
}

function RequirementRow({ req }: { req: PreflightRequirement }) {
  const ok = req.connected
  const label = req.label || INTEGRATION_LABELS[req.name] || req.name

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/6 last:border-0">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        ok ? 'bg-emerald-500/20' : req.required ? 'bg-rose-500/20' : 'bg-amber-500/15'
      }`}>
        {ok ? (
          <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : req.required ? (
          <svg className="w-3 h-3 text-rose-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${ok ? 'text-white/80' : req.required ? 'text-rose-300' : 'text-amber-300'}`}>
            {label}
          </p>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            req.required ? 'bg-white/8 text-white/40' : 'bg-white/5 text-white/30'
          }`}>
            {req.required ? 'required' : 'optional'}
          </span>
          {!ok && (
            <a href="/integrations" className="text-[11px] text-accent hover:text-accent-hover underline underline-offset-2 transition-colors">
              Connect →
            </a>
          )}
        </div>
        <p className="text-xs text-white/40 mt-0.5">{req.reason}</p>
        {!ok && req.workaround && (
          <p className="text-xs text-white/25 mt-0.5 italic">Without it: {req.workaround}</p>
        )}
      </div>
    </div>
  )
}

function PreflightPanel({ automation, onConfirm, onCancel }: {
  automation: Automation
  onConfirm: () => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    api.automations.preflight(automation.id)
      .then(setResult)
      .catch(() => setResult({
        requirements: [], web_access: true, will_send_emails: false, will_modify_data: false,
        estimated_steps: 5, notes: 'Could not analyse requirements.',
        has_blockers: false, blockers: [], warnings: [], connected_integrations: [],
      }))
      .finally(() => setLoading(false))
  }, [automation.id])

  function handleConfirm() {
    setConfirming(true)
    onConfirm()
  }

  const hasBlockers = result?.has_blockers ?? false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#111] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 shrink-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <svg className="w-4 h-4 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className="text-sm font-semibold text-white">Pre-flight Check</p>
          </div>
          <p className="text-xs text-white/35 ml-6.5 truncate">{automation.name}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 max-h-[60vh]">
          {loading ? (
            <div className="flex items-center gap-2.5 py-6 justify-center">
              <svg className="w-4 h-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm text-white/40">Analysing requirements…</span>
            </div>
          ) : result ? (
            <div className="space-y-4">

              {/* Status banner */}
              <div className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl ${
                hasBlockers ? 'bg-rose-500/12 border border-rose-500/25' : 'bg-emerald-500/10 border border-emerald-500/20'
              }`}>
                {hasBlockers ? (
                  <>
                    <svg className="w-4 h-4 text-rose-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-rose-300">
                      {result.blockers.length} required {result.blockers.length === 1 ? 'integration is' : 'integrations are'} missing
                    </p>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-emerald-300">Ready to run</p>
                  </>
                )}
              </div>

              {/* Agent's notes */}
              {result.notes && (
                <p className="text-xs text-white/45 leading-relaxed">{result.notes}</p>
              )}

              {/* Requirements */}
              {result.requirements.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-1">Integrations</p>
                  <div>
                    {result.requirements.map((r, i) => <RequirementRow key={i} req={r} />)}
                  </div>
                </div>
              )}

              {/* Run info */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/4 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-white/30 mb-0.5">Est. steps</p>
                  <p className="text-sm font-medium text-white/70">{result.estimated_steps}</p>
                </div>
                <div className="bg-white/4 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-white/30 mb-0.5">Web search</p>
                  <p className={`text-sm font-medium ${result.web_access ? 'text-emerald-400' : 'text-white/40'}`}>
                    {result.web_access ? 'Yes' : 'No'}
                  </p>
                </div>
                {result.will_send_emails && (
                  <div className="bg-amber-500/10 rounded-lg px-3 py-2 col-span-2">
                    <p className="text-xs text-amber-300">⚠ This run will send emails</p>
                  </div>
                )}
                {result.will_modify_data && (
                  <div className="bg-amber-500/10 rounded-lg px-3 py-2 col-span-2">
                    <p className="text-xs text-amber-300">⚠ This run will write or modify data</p>
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/8 flex gap-2.5 shrink-0">
          <button onClick={onCancel} disabled={confirming}
            className="flex-1 py-2 rounded-lg border border-white/10 text-white/50 hover:text-white/80 text-sm transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || hasBlockers || confirming}
            className="flex-1 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {confirming ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Starting…
              </>
            ) : hasBlockers ? 'Missing requirements' : 'Confirm & Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Run detail pane ──────────────────────────────────────────────────────────

function RunDetail({ run }: { run: AutomationRun }) {
  const [tab, setTab] = useState<'report' | 'steps'>('report')
  const steps = Array.isArray(run.steps) ? run.steps as AutomationStep[] : []

  return (
    <div className="flex flex-col h-full">
      {/* Run header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-white/20'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white capitalize">{run.status}</p>
          <p className="text-xs text-white/30">{fmtTime(run.startedAt)}{run.completedAt ? ` · ${runDuration(run)}` : ' · running…'}</p>
        </div>
        <p className="text-xs text-white/25">{steps.length} step{steps.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/8 shrink-0">
        {(['report', 'steps'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs font-medium transition-colors capitalize ${
              tab === t ? 'text-white border-b-2 border-accent -mb-px' : 'text-white/35 hover:text-white/60'
            }`}>
            {t}{t === 'steps' ? ` (${steps.length})` : ''}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === 'report' ? (
          run.finalResult
            ? <ReportView text={run.finalResult} />
            : <p className="text-sm text-white/30 pt-4">{run.status === 'running' ? 'Running… results will appear when complete.' : 'No result was saved.'}</p>
        ) : (
          <StepsView steps={steps} />
        )}
      </div>
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
    if (!goal.trim()) { setError('Describe the goal.'); return }
    setSaving(true)
    setError('')
    try {
      const cronExpr = triggerType === 'schedule' ? buildCron(repeat, parseInt(hour), parseInt(minute)) : undefined
      const automation = await api.automations.create({ agentId, name: name.trim(), goal: goal.trim(), triggerType, cronExpr })
      onCreated(automation)
    } catch { setError('Something went wrong.') }
    finally { setSaving(false) }
  }

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))

  return (
    <div className="bg-surface-raised border border-surface-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white">New Automation</p>
        <button onClick={onCancel} className="text-white/25 hover:text-white/60 transition-colors text-lg leading-none">✕</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-white/40 mb-1 block">Agent</label>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={SELECT}>
              <option value="" className="bg-[#111]">Select…</option>
              {agents.map((a) => <option key={a.id} value={a.id} className="bg-[#111]">{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/40 mb-1 block">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Daily briefing" className={INPUT} />
          </div>
        </div>

        <div>
          <label className="text-[11px] text-white/40 mb-1 block">Goal — be specific, the agent executes this autonomously</label>
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
            placeholder="Search for the top AI news stories today, summarise the 5 most important ones, and flag any that require action"
            className={INPUT + ' resize-none'} />
        </div>

        <div>
          <label className="text-[11px] text-white/40 mb-1.5 block">Trigger</label>
          <div className="flex gap-2 mb-3">
            {(['schedule', 'manual'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTriggerType(t)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                  triggerType === t ? 'bg-accent text-white' : 'border border-white/10 text-white/40 hover:text-white/70'
                }`}>
                {t === 'schedule' ? 'On a schedule' : 'Manual only'}
              </button>
            ))}
          </div>

          {triggerType === 'schedule' && (
            <div className="flex gap-3">
              <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className={SELECT + ' flex-1'}>
                {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-[#111]">{o.label}</option>)}
              </select>
              {repeat !== 'hourly' && (
                <div className="flex items-center gap-1.5">
                  <select value={hour} onChange={(e) => setHour(e.target.value)} className={SELECT + ' w-20'}>
                    {hours.map((h) => <option key={h} value={h} className="bg-[#111]">{h}</option>)}
                  </select>
                  <span className="text-white/30 text-sm">:</span>
                  <select value={minute} onChange={(e) => setMinute(e.target.value)} className={SELECT + ' w-20'}>
                    {['00', '15', '30', '45'].map((m) => <option key={m} value={m} className="bg-[#111]">{m}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cost estimate */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-white/4 border border-white/8">
          <svg className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p className="text-[11px] text-white/35 leading-relaxed">
            Each run uses approximately <span className="text-white/55">4–8 API calls</span> and takes 30–90 seconds.
            Limit: <span className="text-white/55">3 runs/day</span>.
          </p>
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40">
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/40 hover:text-white/70 text-sm transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [runsToday, setRunsToday] = useState(0)
  const [dailyLimit, setDailyLimit] = useState(3)

  // Left panel: selected automation
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Right panel: runs for selected automation
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null)

  // Per-automation run state for polling
  const [runStates, setRunStates] = useState<Record<string, 'idle' | 'running'>>({})
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  // Pre-flight modal state
  const [preflightAutomation, setPreflightAutomation] = useState<Automation | null>(null)

  function refreshAutomations() {
    api.automations.list().then(({ automations: a, runsToday: r, dailyLimit: l }) => {
      setAutomations(a)
      setRunsToday(r)
      setDailyLimit(l)
    }).catch(() => {})
  }

  useEffect(() => {
    Promise.all([api.automations.list(), api.agents.list()])
      .then(([{ automations: a, runsToday: r, dailyLimit: l }, ag]) => {
        setAutomations(a)
        setRunsToday(r)
        setDailyLimit(l)
        setAgents(ag)
      })
      .finally(() => setLoading(false))
    return () => Object.values(pollTimers.current).forEach(clearInterval)
  }, [])

  // Load runs whenever selected automation changes
  useEffect(() => {
    if (!selectedId) { setRuns([]); setSelectedRun(null); return }
    setRunsLoading(true)
    api.automations.runs(selectedId)
      .then((r) => { setRuns(r); setSelectedRun(r[0] ?? null) })
      .finally(() => setRunsLoading(false))
  }, [selectedId])

  async function handleToggle(a: Automation) {
    const updated = await api.automations.toggle(a.id)
    setAutomations((prev) => prev.map((x) => (x.id === a.id ? updated : x)))
  }

  // Step 1: "Run Now" clicked — show pre-flight modal first
  function handleRunClick(a: Automation) {
    setSelectedId(a.id)
    setPreflightAutomation(a)
  }

  // Step 2: Pre-flight confirmed — actually fire the run
  async function handleRunConfirmed(a: Automation) {
    setPreflightAutomation(null)
    setRunStates((prev) => ({ ...prev, [a.id]: 'running' }))

    const result = await api.automations.run(a.id).catch(() => ({ error: 'Request failed' } as { error: string; dailyLimit?: number; runsToday?: number }))

    if (result.error) {
      setRunStates((prev) => ({ ...prev, [a.id]: 'idle' }))
      alert(result.error)
      if (typeof result.dailyLimit === 'number') setRunsToday(result.dailyLimit)
      return
    }

    if ('runsToday' in result && typeof result.runsToday === 'number') setRunsToday(result.runsToday)

    // Poll until the new run completes
    const baseline = runs.filter((r) => r.automationId === a.id).map((r) => r.id)
    const started = Date.now()

    pollTimers.current[a.id] = setInterval(async () => {
      try {
        const latest = await api.automations.runs(a.id)
        const newRun = latest.find((r) => !baseline.includes(r.id))
        const targetRun = newRun ?? latest[0]

        if (selectedId === a.id) {
          setRuns(latest)
          if (targetRun) setSelectedRun(targetRun)
        }

        if (targetRun && targetRun.status !== 'running') {
          clearInterval(pollTimers.current[a.id])
          delete pollTimers.current[a.id]
          setRunStates((prev) => ({ ...prev, [a.id]: 'idle' }))
          refreshAutomations()
          return
        }
      } catch {}

      if (Date.now() - started > 180_000) {
        clearInterval(pollTimers.current[a.id])
        delete pollTimers.current[a.id]
        setRunStates((prev) => ({ ...prev, [a.id]: 'idle' }))
      }
    }, 3_000)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    await api.automations.delete(id)
    setAutomations((prev) => prev.filter((a) => a.id !== id))
    if (selectedId === id) { setSelectedId(null); setRuns([]) }
    refreshAutomations()
  }

  const selected = automations.find((a) => a.id === selectedId) ?? null

  return (
    <>
    {preflightAutomation && (
      <PreflightPanel
        automation={preflightAutomation}
        onConfirm={() => handleRunConfirmed(preflightAutomation)}
        onCancel={() => setPreflightAutomation(null)}
      />
    )}
    <div className="h-full flex overflow-hidden">

      {/* ── Left panel: automation list ─────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-surface-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 border-b border-surface-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Automations</p>
            <button onClick={() => setShowForm((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors">
              + New
            </button>
          </div>

          {/* Daily limit indicator */}
          {(() => {
            const pct = Math.min(runsToday / dailyLimit, 1)
            const atLimit = runsToday >= dailyLimit
            const nearLimit = runsToday >= dailyLimit - 1 && !atLimit
            if (runsToday === 0) return null
            return (
              <div className={`mb-3 px-3 py-2 rounded-lg text-[11px] ${
                atLimit ? 'bg-rose-500/15 text-rose-400' : nearLimit ? 'bg-amber-500/15 text-amber-400' : 'bg-white/5 text-white/40'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span>{atLimit ? 'Daily limit reached' : nearLimit ? 'Approaching daily limit' : 'Daily runs'}</span>
                  <span className="font-medium">{runsToday}/{dailyLimit}</span>
                </div>
                <div className="w-full h-1 rounded-full bg-white/10">
                  <div className={`h-1 rounded-full transition-all ${atLimit ? 'bg-rose-400' : nearLimit ? 'bg-amber-400' : 'bg-accent'}`}
                    style={{ width: `${pct * 100}%` }} />
                </div>
                {atLimit && <p className="mt-1 text-[10px] opacity-70">Resets at midnight UTC</p>}
              </div>
            )
          })()}

          {showForm && (
            <CreateForm
              agents={agents}
              onCreated={(a) => { setAutomations((prev) => [a, ...prev]); setShowForm(false); setSelectedId(a.id) }}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-white/25 text-xs px-4 py-6">Loading…</p>
          ) : automations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-white/25 text-xs mb-1">No automations yet</p>
              <p className="text-white/15 text-[11px]">Click + New to create one</p>
            </div>
          ) : (
            automations.map((a) => {
              const isSelected = selectedId === a.id
              const isRunning = runStates[a.id] === 'running'
              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={`group px-4 py-3.5 border-b border-white/5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/6' : 'hover:bg-white/3'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className={`text-sm font-medium leading-snug truncate ${isSelected ? 'text-white' : 'text-white/80'}`}>
                          {a.name}
                        </p>
                        {isRunning && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
                        )}
                        {!isRunning && a.lastRunStatus && (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[a.lastRunStatus] ?? 'bg-white/20'}`} />
                        )}
                      </div>
                      <p className="text-[11px] text-white/30 truncate">{a.agent?.name} · {cronToLabel(a.cronExpr)}</p>
                      <p className="text-[11px] text-white/20 mt-0.5 truncate">{a.goal}</p>
                    </div>

                    {/* Actions — show on hover */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Toggle on={a.active} onChange={() => handleToggle(a)} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRunClick(a) }}
                        disabled={isRunning}
                        className="w-6 h-6 flex items-center justify-center rounded text-white/30 hover:text-white/70 disabled:opacity-30 transition-colors"
                        title="Run now"
                      >
                        {isRunning ? (
                          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(a.id) }}
                        className="w-6 h-6 flex items-center justify-center rounded text-white/20 hover:text-rose-400 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel: run history + results ──────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <svg className="w-12 h-12 text-white/10 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <p className="text-white/20 text-sm">Select an automation</p>
              <p className="text-white/10 text-xs mt-1">Results appear here</p>
            </div>
          </div>
        ) : (
          <>
            {/* Run list column */}
            <div className="w-52 shrink-0 border-r border-white/8 flex flex-col overflow-hidden">
              <div className="px-3 py-3 border-b border-white/8 shrink-0">
                <p className="text-xs font-semibold text-white/60 truncate">{selected.name}</p>
                <p className="text-[11px] text-white/30 mt-0.5">{selected.agent?.name} · {cronToLabel(selected.cronExpr)}</p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {runsLoading ? (
                  <p className="text-[11px] text-white/25 px-3 py-4">Loading runs…</p>
                ) : runs.length === 0 ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-[11px] text-white/25 mb-3">No runs yet</p>
                    <button
                      onClick={() => handleRunClick(selected)}
                      disabled={runStates[selected.id] === 'running'}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors disabled:opacity-40"
                    >
                      {runStates[selected.id] === 'running' ? 'Running…' : 'Run Now'}
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Run now button at top */}
                    <div className="px-3 py-2 border-b border-white/5">
                      <button
                        onClick={() => handleRunClick(selected)}
                        disabled={runStates[selected.id] === 'running'}
                        className="w-full py-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 text-accent text-xs font-medium transition-colors disabled:opacity-40"
                      >
                        {runStates[selected.id] === 'running' ? (
                          <span className="flex items-center justify-center gap-1.5">
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Running…
                          </span>
                        ) : '▶ Run Now'}
                      </button>
                    </div>

                    {runs.map((run) => (
                      <button key={run.id} onClick={() => setSelectedRun(run)}
                        className={`w-full text-left px-3 py-2.5 border-b border-white/5 transition-colors ${
                          selectedRun?.id === run.id ? 'bg-white/6' : 'hover:bg-white/3'
                        }`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[run.status] ?? 'bg-white/20'}`} />
                          <span className={`text-[11px] font-medium capitalize ${STATUS_TEXT[run.status] ?? 'text-white/50'}`}>{run.status}</span>
                          {runDuration(run) && <span className="text-[10px] text-white/20 ml-auto">{runDuration(run)}</span>}
                        </div>
                        <p className="text-[11px] text-white/35">{fmtTime(run.startedAt)}</p>
                        <p className="text-[10px] text-white/20 mt-0.5">{(run.steps as any[])?.length ?? 0} steps</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Result detail */}
            <div className="flex-1 overflow-hidden">
              {selectedRun ? (
                <RunDetail run={selectedRun} />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-white/20 text-sm">Select a run to see the result</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  )
}
