'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Agent, AutomationListResponse, GroupChat, Widget } from '@/lib/api'
import { AgentCard } from '@/components/AgentCard'
import { DocumentUpload, UploadedDocument } from '@/components/DocumentUpload'
import { WidgetRenderer } from '@/components/WidgetRenderer'

// ─── Widget Card ─────────────────────────────────────────────────────────────

function sizeClass(size: Widget['size']) {
  if (size === 'sm') return 'col-span-1'
  if (size === 'lg') return 'col-span-2 sm:col-span-3'
  return 'col-span-1 sm:col-span-2'
}

function heightClass(size: Widget['size']) {
  if (size === 'sm') return 'h-36'
  if (size === 'lg') return 'h-64'
  return 'h-48'
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No recent activity'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No recent activity'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

interface WidgetCardProps {
  widget: Widget
  onDelete: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: () => void
  isDragging: boolean
}

function WidgetCard({ widget, onDelete, onDragStart, onDragOver, onDrop, isDragging }: WidgetCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(widget.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(widget.id) }}
      onDrop={onDrop}
      className={`
        ${sizeClass(widget.size)} ${heightClass(widget.size)}
        relative group bg-white/[0.03] border border-white/8 rounded-2xl p-4 cursor-grab active:cursor-grabbing
        transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide truncate pr-2">{widget.title}</h3>
        <button
          onClick={() => onDelete(widget.id)}
          className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition-all flex-shrink-0 text-lg leading-none -mt-0.5"
        >
          ×
        </button>
      </div>
      <div className="overflow-hidden" style={{ height: 'calc(100% - 2rem)' }}>
        <WidgetRenderer widget={widget} />
      </div>
    </div>
  )
}

interface SnapshotStatProps {
  label: string
  value: string
  hint: string
}

function SnapshotStat({ label, value, hint }: SnapshotStatProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/45">{hint}</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [automationSummary, setAutomationSummary] = useState<AutomationListResponse>({
    automations: [],
    runsToday: 0,
    dailyLimit: 10,
  })
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)
  const [latestDocument, setLatestDocument] = useState<UploadedDocument | null>(null)
  const [agentsExpanded, setAgentsExpanded] = useState(false)
  const [upcomingEvents, setUpcomingEvents] = useState<Array<{ title: string; start_time: string; category?: string }>>([])
  const [dashboardName, setDashboardName] = useState('Dashboard')
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempName, setTempName] = useState('')

  const dragId = useRef<string | null>(null)
  const dragOverId = useRef<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('dashboardName')
    if (saved) setDashboardName(saved)
  }, [])

  useEffect(() => {
    Promise.all([
      api.agents.list(),
      api.widgets.list(),
      api.automations.list().catch(() => ({ automations: [], runsToday: 0, dailyLimit: 10 })),
      api.groupChats.list().catch(() => []),
      fetch('/api/appointments?upcoming=true&limit=10').then(r => r.json()).catch(() => []),
    ])
      .then(([a, w, auto, chats, appointments]) => {
        const agentList = Array.isArray(a) ? a : (a as { agents?: Agent[]; data?: Agent[] })?.agents ?? (a as { agents?: Agent[]; data?: Agent[] })?.data ?? []
        const widgetList = Array.isArray(w) ? w : (w as { widgets?: Widget[]; data?: Widget[] })?.widgets ?? (w as { widgets?: Widget[]; data?: Widget[] })?.data ?? []
        setAgents(agentList)
        setWidgets(widgetList)
        setAutomationSummary(auto)
        setGroupChats(chats)
        const appointmentList = Array.isArray(appointments) ? appointments : []
        const events = appointmentList.map((apt: any) => ({
          title: apt.customer_name || 'Appointment',
          start_time: apt.start_time,
          category: apt.category || 'personal',
        })).slice(0, 3)
        setUpcomingEvents(events)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleDeleteAgent(id: string) {
    if (!confirm('Remove this agent?')) return
    await api.agents.delete(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleDeleteWidget(id: string) {
    await api.widgets.delete(id)
    setWidgets((prev) => prev.filter((w) => w.id !== id))
  }

  function handleDragStart(id: string) { dragId.current = id }
  function handleDragOver(id: string) { dragOverId.current = id }

  async function handleDrop() {
    const fromId = dragId.current
    const toId = dragOverId.current
    dragId.current = null
    dragOverId.current = null
    if (!fromId || !toId || fromId === toId) return

    const reordered = [...widgets]
    const fromIdx = reordered.findIndex((w) => w.id === fromId)
    const toIdx = reordered.findIndex((w) => w.id === toId)
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const withOrder = reordered.map((w, i) => ({ ...w, order: i }))
    setWidgets(withOrder)
    await api.widgets.reorder(withOrder.map((w) => ({ id: w.id, order: w.order })))
  }

  function handleSaveName(newName: string) {
    const trimmed = newName.trim() || 'Dashboard'
    setDashboardName(trimmed)
    localStorage.setItem('dashboardName', trimmed)
    setIsEditingName(false)
  }

  function handleNameClick() {
    setTempName(dashboardName)
    setIsEditingName(true)
  }

  const activeAgents = agents.filter((a) => a.status !== 'inactive').length
  const liveAutomations = automationSummary.automations.filter((a) => a.active).length
  const recentAutomation = automationSummary.automations
    .filter((a) => a.lastRunAt)
    .sort((a, b) => new Date(b.lastRunAt as string).getTime() - new Date(a.lastRunAt as string).getTime())[0] || null

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 max-w-6xl mx-auto">
        <section className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent p-6 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName(tempName)
                      if (e.key === 'Escape') setIsEditingName(false)
                    }}
                    autoFocus
                    className="text-2xl sm:text-3xl font-semibold text-white bg-white/10 border border-white/20 rounded-lg px-3 py-1 focus:outline-none focus:border-white/40"
                  />
                  <button
                    onClick={() => handleSaveName(tempName)}
                    className="px-2 py-1 text-sm text-emerald-300 hover:text-emerald-200 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="px-2 py-1 text-sm text-white/50 hover:text-white/75 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <h1
                  onClick={handleNameClick}
                  className="text-2xl sm:text-3xl font-semibold text-white cursor-pointer hover:text-white/80 transition-colors"
                  title="Click to edit dashboard name"
                >
                  {dashboardName}
                </h1>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/cluster"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/15 text-white/75 hover:text-white hover:border-white/30 text-sm transition-colors"
              >
                Ask Cluster
              </Link>
              <Link
                href="/agents/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
              >
                Hire Agent
              </Link>
            </div>
          </div>
          {!loading ? (
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SnapshotStat
                label="Agents"
                value={`${activeAgents}`}
                hint={activeAgents === 1 ? '1 active operator' : `${activeAgents} active operators`}
              />
              <SnapshotStat
                label="Live Automations"
                value={`${liveAutomations}`}
                hint={liveAutomations > 0 ? 'Recurring work is running' : 'Set one up to remove busywork'}
              />
              <SnapshotStat
                label="Runs Today"
                value={`${automationSummary.runsToday}/${automationSummary.dailyLimit}`}
                hint="Automation capacity used"
              />
              <SnapshotStat
                label="Group Chats"
                value={`${groupChats.length}`}
                hint={groupChats.length > 0 ? 'Team channels are active' : 'Create one for shared execution'}
              />
            </div>
          ) : null}
        </section>

        {loading ? (
          <div className="flex items-center gap-2 text-white/25 text-sm py-12">
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-10">
              <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white/85 uppercase tracking-widest">Operations Board</h2>
                    <p className="text-xs text-white/45 mt-1">Drag cards to reorder what matters most this week.</p>
                  </div>
                  <span className="text-xs text-white/35">{widgets.length} widget{widgets.length === 1 ? '' : 's'}</span>
                </div>

                {widgets.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-min">
                    {widgets.map((w) => (
                      <WidgetCard
                        key={w.id}
                        widget={w}
                        onDelete={handleDeleteWidget}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        isDragging={dragId.current === w.id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center">
                    <p className="text-white/30 text-sm mb-2">No dashboard widgets yet</p>
                    <Link href="/cluster" className="text-white/50 hover:text-white/75 text-sm transition-colors">
                      Ask Cluster to build your dashboard →
                    </Link>
                  </div>
                )}
              </div>

              <aside className="rounded-2xl border border-white/10 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-5">
                <h3 className="text-sm font-semibold text-white/90 uppercase tracking-widest">Today Focus</h3>
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
                    <p className="text-[11px] text-white/45 uppercase tracking-wide">Next move</p>
                    <p className="mt-1 text-sm text-white/85">
                      {agents.length === 0
                        ? 'Hire your first specialist agent to start delegating repeatable work.'
                        : liveAutomations === 0
                          ? 'Set up one recurring automation to cut manual follow-up this week.'
                          : 'Review your latest automation run and tighten anything that failed.'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3">
                    <p className="text-[11px] text-white/45 uppercase tracking-wide">Automation pulse</p>
                    <p className="mt-1 text-sm text-white/80">
                      {recentAutomation
                        ? `${recentAutomation.name} last ran ${formatShortDate(recentAutomation.lastRunAt)}.`
                        : 'No runs yet. Create an automation to start building consistency.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <Link href="/workflows" className="rounded-lg border border-white/12 px-3 py-2 text-sm text-white/75 hover:text-white hover:border-white/25 transition-colors">
                      Open workflows
                    </Link>
                    <Link href="/cluster" className="rounded-lg border border-white/12 px-3 py-2 text-sm text-white/75 hover:text-white hover:border-white/25 transition-colors">
                      Ask Cluster for a weekly briefing
                    </Link>
                  </div>
                </div>
              </aside>
            </div>

            <section className="mb-10">
              <div
                className="flex items-center justify-between mb-5 cursor-pointer"
                onClick={() => setAgentsExpanded(!agentsExpanded)}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-white/60 transition-transform ${ agentsExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                    Your Agents ({agents.length})
                  </h2>
                </div>
                <Link href="/agents/new" className="text-xs text-white/40 hover:text-white/70 transition-colors" onClick={(e) => e.stopPropagation()}>
                  + Hire new
                </Link>
              </div>

              {agentsExpanded && (
                <>
                  {agents.length === 0 ? (
                    <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
                      <p className="text-white/25 text-sm mb-4">No agents hired yet</p>
                      <Link
                        href="/agents/new"
                        className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                      >
                        Hire your first agent
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                      {agents.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} onDelete={handleDeleteAgent} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="mb-10 rounded-2xl border border-white/10 bg-gradient-to-b from-purple-400/10 to-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Upcoming Events</h2>
                  <p className="text-sm text-white/70 mt-1">Next events on your calendar.</p>
                </div>
                <Link href="/calendar" className="text-xs text-white/50 hover:text-white/75 transition-colors">
                  View calendar →
                </Link>
              </div>

              {upcomingEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-white/50">
                  No upcoming events in the next 7 days. Your calendar is clear.
                </div>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((event, idx) => {
                    const eventDate = new Date(event.start_time)
                    const isToday = eventDate.toDateString() === new Date().toDateString()
                    const isTomorrow = eventDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
                    const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    const timeLabel = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                    const categoryColor = event.category === 'business' ? 'bg-emerald-500/10 text-emerald-200 border-emerald-300/30' :
                                        event.category === 'personal' ? 'bg-blue-500/10 text-blue-200 border-blue-300/30' :
                                        'bg-gray-500/10 text-gray-200 border-gray-300/30'
                    return (
                      <div key={idx} className="rounded-lg border border-white/12 bg-black/20 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white/90 truncate">{event.title}</p>
                          <p className="text-xs text-white/50 mt-0.5">{dateLabel} at {timeLabel}</p>
                        </div>
                        {event.category && (
                          <span className={`text-[10px] px-2 py-1 rounded-full border whitespace-nowrap ${categoryColor}`}>
                            {event.category}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Automation Pulse</h2>
                  <p className="text-sm text-white/65 mt-1">Keep recurring tasks healthy before they become manual fire drills.</p>
                </div>
                <span className="text-xs text-white/45">{automationSummary.automations.length} total automations</span>
              </div>

              {automationSummary.automations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-white/50">
                  No automations yet. Ask Cluster to create one for weekly reporting, reminders, or outreach follow-ups.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {automationSummary.automations.slice(0, 4).map((item) => (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white/90 truncate">{item.name}</p>
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full border ${item.active
                            ? 'text-emerald-200 border-emerald-300/30 bg-emerald-500/10'
                            : 'text-white/60 border-white/15 bg-white/5'}`}
                        >
                          {item.active ? 'Live' : 'Paused'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-white/50">
                        Last run: {formatShortDate(item.lastRunAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-emerald-400/10 to-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Documents Inbox</h2>
                  <p className="text-sm text-white/70 mt-1">Upload invoices, contracts, and reports for summary, search, and date extraction.</p>
                </div>
              </div>
              <DocumentUpload onUploaded={setLatestDocument} />
              {latestDocument ? (
                <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
                  Uploaded <span className="font-medium text-white">{latestDocument.fileName}</span>. AI can reference document_id <span className="font-mono text-emerald-200">{latestDocument.documentId}</span>.
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
