'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Agent, AutomationListResponse, GroupChat } from '@/lib/api'
import { AgentCard } from '@/components/AgentCard'
import { DocumentUpload, UploadedDocument } from '@/components/DocumentUpload'

type DashboardSectionId = 'todayFocus' | 'upcomingEvents' | 'automationPulse' | 'documentsInbox'

type SectionVisibility = Record<DashboardSectionId, boolean>

const DEFAULT_SECTION_VISIBILITY: SectionVisibility = {
  todayFocus: true,
  upcomingEvents: true,
  automationPulse: true,
  documentsInbox: true,
}

const SECTION_LABELS: Record<DashboardSectionId, string> = {
  todayFocus: 'Today Focus',
  upcomingEvents: 'Upcoming Events',
  automationPulse: 'Automation Pulse',
  documentsInbox: 'Documents Inbox',
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
  const [automationSummary, setAutomationSummary] = useState<AutomationListResponse>({
    automations: [],
    runsToday: 0,
    dailyLimit: 10,
  })
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)
  const [latestDocument, setLatestDocument] = useState<UploadedDocument | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<Array<{ title: string; start_time: string; category?: string }>>([])
  const [dashboardName, setDashboardName] = useState('Dashboard')
  const [isEditingName, setIsEditingName] = useState(false)
  const [agentsExpanded, setAgentsExpanded] = useState(true)
  const [tempName, setTempName] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(DEFAULT_SECTION_VISIBILITY)
  const addMenuRef = useRef<HTMLDivElement | null>(null)

  async function loadUpcomingEvents() {
    try {
      const response = await fetch('/api/appointments?upcoming=true&limit=10')
      const appointments = await response.json().catch(() => [])
      const appointmentList = Array.isArray(appointments) ? appointments : []
      return appointmentList.map((apt: any) => ({
        title: apt.customer_name || 'Appointment',
        start_time: apt.start_time,
        category: apt.category || 'personal',
      })).slice(0, 3)
    } catch {
      return []
    }
  }

  const handleThemeToggle = () => {
    const htmlElement = document.documentElement
    const currentTheme = htmlElement.classList.contains('light-mode') ? 'light' : 'dark'
    const newTheme = currentTheme === 'light' ? 'dark' : 'light'
    
    if (newTheme === 'light') {
      htmlElement.classList.add('light-mode')
      htmlElement.classList.remove('dark-mode')
    } else {
      htmlElement.classList.add('dark-mode')
      htmlElement.classList.remove('light-mode')
    }
    
    localStorage.setItem('theme', newTheme)
  }

  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const theme = localStorage.getItem('theme') as 'light' | 'dark' | null
    setCurrentTheme(theme || 'dark')
  }, [])

  useEffect(() => {
    // Listen for theme changes on the document
    const observer = new MutationObserver(() => {
      const htmlElement = document.documentElement
      const isLight = htmlElement.classList.contains('light-mode')
      setCurrentTheme(isLight ? 'light' : 'dark')
    })

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('dashboardName')
    if (saved) setDashboardName(saved)
    const savedSections = localStorage.getItem('dashboardSections')
    if (savedSections) {
      try {
        const parsed = JSON.parse(savedSections) as Partial<SectionVisibility>
        setSectionVisibility({ ...DEFAULT_SECTION_VISIBILITY, ...parsed })
      } catch {
        setSectionVisibility(DEFAULT_SECTION_VISIBILITY)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('dashboardSections', JSON.stringify(sectionVisibility))
  }, [sectionVisibility])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!addMenuRef.current) return
      if (!addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false)
      }
    }

    if (showAddMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAddMenu])

  useEffect(() => {
    Promise.all([
      api.agents.list(),
      api.automations.list().catch(() => ({ automations: [], runsToday: 0, dailyLimit: 10 })),
      api.groupChats.list().catch(() => []),
      loadUpcomingEvents(),
    ])
      .then(([a, auto, chats, appointments]) => {
        const agentList = Array.isArray(a) ? a : (a as { agents?: Agent[]; data?: Agent[] })?.agents ?? (a as { agents?: Agent[]; data?: Agent[] })?.data ?? []
        setAgents(agentList)
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

  useEffect(() => {
    let cancelled = false

    async function refreshUpcoming() {
      const events = await loadUpcomingEvents()
      if (!cancelled) {
        setUpcomingEvents(events)
      }
    }

    const intervalId = window.setInterval(refreshUpcoming, 60_000)
    const handleFocus = () => refreshUpcoming()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshUpcoming()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function hideSection(sectionId: DashboardSectionId) {
    setSectionVisibility((prev) => ({ ...prev, [sectionId]: false }))
  }

  function showSection(sectionId: DashboardSectionId) {
    setSectionVisibility((prev) => ({ ...prev, [sectionId]: true }))
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
  const hiddenSections = (Object.keys(sectionVisibility) as DashboardSectionId[]).filter((key) => !sectionVisibility[key])

  return (
    <div className="h-full overflow-y-auto relative">
      <div className="fixed top-5 right-5 sm:top-6 sm:right-6 z-30 flex items-center gap-3">
        {/* Theme toggle button */}
        <button
          type="button"
          onClick={handleThemeToggle}
          className="w-11 h-11 rounded-full border border-white/20 dark:border-white/20 light:border-gray-300 bg-black/45 dark:bg-black/45 light:bg-gray-200/40 text-white dark:text-white light:text-gray-800 text-lg leading-none hover:bg-black/70 dark:hover:bg-black/70 light:hover:bg-gray-200/60 hover:border-white/35 dark:hover:border-white/35 light:hover:border-gray-300 transition-colors flex items-center justify-center"
          aria-label={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${currentTheme === 'light' ? 'dark' : 'light'} mode`}
        >
          {currentTheme === 'light' ? '🌙' : '☀️'}
        </button>

        {/* Add menu button */}
        <div ref={addMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowAddMenu((prev) => !prev)}
            className="w-11 h-11 rounded-full border border-white/20 bg-black/45 text-white text-2xl leading-none hover:bg-black/70 hover:border-white/35 transition-colors"
            aria-label="Add to dashboard"
            title="Add to dashboard"
          >
            +
          </button>

          {showAddMenu ? (
            <div className="mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-[#0d1117]/95 backdrop-blur p-3 shadow-2xl absolute right-0">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 mb-2">Restore Sections</p>
              {hiddenSections.length === 0 ? (
                <p className="text-xs text-white/45">All sections are visible.</p>
              ) : (
                <div className="space-y-1.5">
                  {hiddenSections.map((sectionId) => (
                    <button
                      key={sectionId}
                      type="button"
                      onClick={() => showSection(sectionId)}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 hover:bg-white/[0.07] hover:border-white/20 transition-colors"
                    >
                      + {SECTION_LABELS[sectionId]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

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
            <div className="flex flex-wrap items-center gap-2.5 pr-14 sm:pr-16">
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
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {loading ? (
          <div className="flex items-center gap-2 text-white/25 text-sm py-12">
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <>
            {sectionVisibility.todayFocus ? (
            <section className="mb-10 rounded-2xl border border-white/10 bg-gradient-to-b from-cyan-400/10 to-white/[0.02] p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white/90 uppercase tracking-widest">Today Focus</h3>
                  <button
                    type="button"
                    onClick={() => hideSection('todayFocus')}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    aria-label="Remove Today Focus section"
                    title="Remove section"
                  >
                    ×
                  </button>
                </div>
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
                    <Link href="/scheduler" className="rounded-lg border border-white/12 px-3 py-2 text-sm text-white/75 hover:text-white hover:border-white/25 transition-colors">
                      Open automations
                    </Link>
                  </div>
                </div>
              </section>
              ) : null}

            {sectionVisibility.upcomingEvents ? (
            <section className="mb-10 rounded-2xl border border-white/10 bg-gradient-to-b from-purple-400/10 to-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Upcoming Events</h2>
                  <p className="text-sm text-white/70 mt-1">Next events on your calendar.</p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href="/calendar" className="text-xs text-white/50 hover:text-white/75 transition-colors">
                    View calendar →
                  </Link>
                  <button
                    type="button"
                    onClick={() => hideSection('upcomingEvents')}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    aria-label="Remove Upcoming Events section"
                    title="Remove section"
                  >
                    ×
                  </button>
                </div>
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
            ) : null}

            {sectionVisibility.automationPulse ? (
            <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Automation Pulse</h2>
                  <p className="text-sm text-white/65 mt-1">Keep recurring tasks healthy before they become manual fire drills.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/45">{automationSummary.automations.length} total automations</span>
                  <button
                    type="button"
                    onClick={() => hideSection('automationPulse')}
                    className="text-white/40 hover:text-white/80 transition-colors"
                    aria-label="Remove Automation Pulse section"
                    title="Remove section"
                  >
                    ×
                  </button>
                </div>
              </div>

              {automationSummary.automations.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 px-4 py-5 text-sm text-white/50">
                  No automations yet. Create one for weekly reporting, reminders, or outreach follow-ups.
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
            ) : null}

            {sectionVisibility.documentsInbox ? (
            <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-emerald-400/10 to-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-xs font-semibold text-white/45 uppercase tracking-widest">Documents Inbox</h2>
                  <p className="text-sm text-white/70 mt-1">Upload invoices, contracts, and reports for summary, search, and date extraction.</p>
                </div>
                <button
                  type="button"
                  onClick={() => hideSection('documentsInbox')}
                  className="text-white/40 hover:text-white/80 transition-colors"
                  aria-label="Remove Documents Inbox section"
                  title="Remove section"
                >
                  ×
                </button>
              </div>
              <DocumentUpload onUploaded={setLatestDocument} />
              {latestDocument ? (
                <div className="mt-3 rounded-xl border border-emerald-400/15 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
                  Uploaded <span className="font-medium text-white">{latestDocument.fileName}</span>. AI can reference document_id <span className="font-mono text-emerald-200">{latestDocument.documentId}</span>.
                </div>
              ) : null}
            </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
