'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Agent, AutomationListResponse, GroupChat } from '@/lib/api'

type EventRec = {
  id: string
  title: string
  start_time: string
  end_time?: string
  itemType?: string
}

const PALETTE = {
  bg: '#faf9f6',
  textPrimary: '#1a1a1a',
  textSecondary: '#4a4a4a',
  textTertiary: '#8a8a8a',
  textQuaternary: '#b5b5b5',
  border: 'rgba(0,0,0,0.10)',
  borderStrong: 'rgba(0,0,0,0.18)',
  accent: '#00c9a7',
}

const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const tensWord = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function spellTwoDigit(n: number): string {
  if (n === 0) return ''
  if (n < 10) return ones[n]
  if (n < 20) return teens[n - 10]
  const t = Math.floor(n / 10)
  const o = n % 10
  if (o === 0) return tensWord[t]
  return `${tensWord[t]}-${ones[o]}`
}

function spellYear(y: number): string {
  if (y < 2000 || y >= 2100) return String(y)
  if (y === 2000) return 'two thousand'
  if (y < 2010) return `two thousand ${ones[y - 2000]}`
  return `twenty ${spellTwoDigit(y - 2000)}`
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function MagazineDashboard() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [automations, setAutomations] = useState<AutomationListResponse>({
    automations: [],
    runsToday: 0,
    dailyLimit: 10,
  })
  const [groupChats, setGroupChats] = useState<GroupChat[]>([])
  const [events, setEvents] = useState<EventRec[]>([])
  const [workflowCount, setWorkflowCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.agents.list(),
      api.automations.list(),
      api.groupChats.list(),
      fetch('/api/scheduler/events').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/workflows').then((r) => (r.ok ? r.json() : null)),
    ]).then((results) => {
      const [aRes, autoRes, chatsRes, evRes, wfRes] = results
      if (aRes.status === 'fulfilled') {
        const a = aRes.value as unknown
        const list = Array.isArray(a)
          ? (a as Agent[])
          : ((a as { agents?: Agent[]; data?: Agent[] })?.agents ??
              (a as { agents?: Agent[]; data?: Agent[] })?.data ??
              [])
        setAgents(list)
      }
      if (autoRes.status === 'fulfilled') {
        setAutomations(autoRes.value as AutomationListResponse)
      }
      if (chatsRes.status === 'fulfilled') {
        setGroupChats((chatsRes.value as GroupChat[]) ?? [])
      }
      if (evRes.status === 'fulfilled') {
        const v = evRes.value
        setEvents(Array.isArray(v) ? (v as EventRec[]) : [])
      }
      if (wfRes.status === 'fulfilled' && wfRes.value != null) {
        const w = wfRes.value as unknown
        const list = Array.isArray(w)
          ? w
          : ((w as { workflows?: unknown[]; data?: unknown[] })?.workflows ??
              (w as { workflows?: unknown[]; data?: unknown[] })?.data ??
              null)
        setWorkflowCount(Array.isArray(list) ? list.length : null)
      }
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const todayStart = startOfDay(now)

  const upcomingEvents = events
    .filter((e) => e.itemType !== 'task' && new Date(e.start_time) >= todayStart)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5)

  const todaysEventCount = events.filter(
    (e) => e.itemType !== 'task' && isSameDay(new Date(e.start_time), now)
  ).length

  const activeAgents = agents.filter((a) => a.status !== 'inactive').length
  const liveAutomations = automations.automations.filter((a) => a.active).length
  const totalAutomations = automations.automations.length

  const recentAutomation = automations.automations
    .filter((a) => a.lastRunAt)
    .sort(
      (a, b) =>
        new Date(b.lastRunAt as string).getTime() -
        new Date(a.lastRunAt as string).getTime()
    )[0]

  return (
    <div
      className="min-h-full"
      style={{
        background: PALETTE.bg,
        color: PALETTE.textPrimary,
      }}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: '1100px', padding: '72px 32px 96px' }}
      >
        <div className="lg:flex lg:items-start">
          {/* Hero column */}
          <div className="lg:flex-1 lg:pr-12">
            <HeroDate now={now} />
            <Divider />
            <UpcomingSection events={upcomingEvents} loading={loading} />
            <Divider />
            <AgentsSection agents={agents} loading={loading} />
            <Divider />
            <RecentSection automation={recentAutomation} loading={loading} />
          </div>

          {/* Hairline divider (desktop only) */}
          <div
            className="hidden lg:block self-stretch"
            style={{ width: '1px', background: PALETTE.border }}
          />

          {/* Widget rail */}
          <aside
            className="mt-16 lg:mt-0 lg:pl-12"
            style={{ width: '100%', maxWidth: '320px' }}
          >
            <WidgetRail
              activeAgents={activeAgents}
              totalAgents={agents.length}
              todaysEventCount={todaysEventCount}
              workflowCount={workflowCount}
              liveAutomations={liveAutomations}
              totalAutomations={totalAutomations}
              runsToday={automations.runsToday}
              dailyLimit={automations.dailyLimit}
              groupChatsCount={groupChats.length}
              loading={loading}
            />
          </aside>
        </div>
      </div>
    </div>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────

function HeroDate({ now }: { now: Date }) {
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' })
  const month = now.toLocaleDateString(undefined, { month: 'long' })
  const day = now.getDate()
  const year = spellYear(now.getFullYear())
  return (
    <header style={{ marginBottom: '12px' }}>
      <h1
        style={{
          fontSize: 'clamp(56px, 8vw, 104px)',
          fontWeight: 900,
          lineHeight: 0.9,
          letterSpacing: '-0.04em',
          color: PALETTE.textPrimary,
          margin: 0,
        }}
      >
        {weekday}
      </h1>
      <p
        style={{
          fontSize: '18px',
          fontWeight: 300,
          marginTop: '14px',
          color: PALETTE.textSecondary,
          letterSpacing: '0.01em',
        }}
      >
        {month} {day}, {year}
      </p>
    </header>
  )
}

function Divider() {
  return (
    <div
      style={{
        height: '1px',
        background: PALETTE.border,
        margin: '48px 0',
      }}
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        color: PALETTE.textTertiary,
        marginBottom: '24px',
        margin: '0 0 24px 0',
      }}
    >
      {children}
    </h2>
  )
}

// ─── Upcoming ───────────────────────────────────────────────────────

function UpcomingSection({
  events,
  loading,
}: {
  events: EventRec[]
  loading: boolean
}) {
  return (
    <section>
      <SectionLabel>Upcoming</SectionLabel>
      {loading ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>
          —
        </p>
      ) : events.length === 0 ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>
          Nothing scheduled.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((e) => {
            const start = new Date(e.start_time)
            const today = isSameDay(start, new Date())
            const tomorrow = isSameDay(start, new Date(Date.now() + 86400000))
            const dayLabel = today
              ? 'Today'
              : tomorrow
                ? 'Tomorrow'
                : start.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
            const time = start.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            return (
              <li
                key={e.id}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '20px',
                  padding: '14px 0',
                  borderBottom: `1px solid ${PALETTE.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 400,
                    fontVariantNumeric: 'tabular-nums',
                    color: PALETTE.textTertiary,
                    width: '120px',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {dayLabel}
                  </span>
                  <span style={{ marginLeft: '8px', color: PALETTE.textSecondary }}>
                    {time}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 400,
                    color: PALETTE.textPrimary,
                  }}
                >
                  {e.title}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ─── Agents ─────────────────────────────────────────────────────────

function AgentsSection({
  agents,
  loading,
}: {
  agents: Agent[]
  loading: boolean
}) {
  return (
    <section>
      <SectionLabel>Agents</SectionLabel>
      {loading ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>—</p>
      ) : agents.length === 0 ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>
          No agents hired yet.{' '}
          <Link
            href="/agents/new"
            style={{
              color: PALETTE.accent,
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Hire one
          </Link>
          .
        </p>
      ) : (
        <p
          style={{
            fontSize: '17px',
            lineHeight: 1.7,
            color: PALETTE.textPrimary,
            margin: 0,
          }}
        >
          {agents.slice(0, 8).map((a, i) => (
            <React.Fragment key={a.id}>
              {i > 0 && (
                <span
                  style={{
                    color: PALETTE.textQuaternary,
                    margin: '0 10px',
                  }}
                >
                  ·
                </span>
              )}
              <Link
                href={`/agents/${a.id}`}
                className="border-b border-transparent hover:border-current transition-colors"
                style={{
                  color: PALETTE.textPrimary,
                  textDecoration: 'none',
                  paddingBottom: '1px',
                }}
              >
                {a.name}
              </Link>
            </React.Fragment>
          ))}
          {agents.length > 8 && (
            <span style={{ color: PALETTE.textTertiary, marginLeft: '10px' }}>
              + {agents.length - 8} more
            </span>
          )}
        </p>
      )}
    </section>
  )
}

// ─── Recent ─────────────────────────────────────────────────────────

function RecentSection({
  automation,
  loading,
}: {
  automation: { name: string; lastRunAt?: string | null } | undefined
  loading: boolean
}) {
  return (
    <section>
      <SectionLabel>Recent activity</SectionLabel>
      {loading ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>—</p>
      ) : !automation || !automation.lastRunAt ? (
        <p style={{ color: PALETTE.textTertiary, fontSize: '14px', margin: 0 }}>
          No automation runs yet.
        </p>
      ) : (
        <p
          style={{
            fontSize: '15px',
            color: PALETTE.textPrimary,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: PALETTE.textTertiary }}>Last run · </span>
          <span style={{ fontWeight: 700 }}>{automation.name}</span>
          <span style={{ color: PALETTE.textSecondary }}>
            {' '}
            —{' '}
            {new Date(automation.lastRunAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        </p>
      )}
    </section>
  )
}

// ─── Widget rail ────────────────────────────────────────────────────

function WidgetRail({
  activeAgents,
  totalAgents,
  todaysEventCount,
  workflowCount,
  liveAutomations,
  totalAutomations,
  runsToday,
  dailyLimit,
  groupChatsCount,
  loading,
}: {
  activeAgents: number
  totalAgents: number
  todaysEventCount: number
  workflowCount: number | null
  liveAutomations: number
  totalAutomations: number
  runsToday: number
  dailyLimit: number
  groupChatsCount: number
  loading: boolean
}) {
  return (
    <div>
      <SectionLabel>Pulse</SectionLabel>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <Widget
          label="Agents"
          value={loading ? '—' : `${activeAgents}`}
          context={loading ? '' : `of ${totalAgents} hired`}
          href="/agents/new"
        />
        <Widget
          label="Events today"
          value={loading ? '—' : `${todaysEventCount}`}
          context={loading ? '' : 'on the calendar'}
          href="/calendar"
        />
        <Widget
          label="Workflows"
          value={loading || workflowCount === null ? '—' : `${workflowCount}`}
          context={
            workflowCount === null ? 'not configured' : 'configured'
          }
          href="/workflows"
        />
        <Widget
          label="Automations"
          value={loading ? '—' : `${liveAutomations}`}
          context={loading ? '' : `live · ${totalAutomations} total`}
          href="/scheduler"
        />
        <Widget
          label="Runs today"
          value={loading ? '—' : `${runsToday}`}
          context={loading ? '' : `of ${dailyLimit} daily`}
          href="/scheduler"
        />
        <Widget
          label="Group chats"
          value={loading ? '—' : `${groupChatsCount}`}
          context={loading ? '' : groupChatsCount === 0 ? 'create one' : 'rooms'}
          href="/groupchats"
        />
        <Widget label="Goals" value="—" context="phase 2" muted />
      </ul>
    </div>
  )
}

function Widget({
  label,
  value,
  context,
  href,
  muted,
}: {
  label: string
  value: string
  context: string
  href?: string
  muted?: boolean
}) {
  const row = (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        padding: '14px 0',
        borderBottom: `1px solid ${PALETTE.border}`,
        opacity: muted ? 0.5 : 1,
      }}
    >
      <span
        style={{
          color: muted ? PALETTE.textQuaternary : PALETTE.accent,
          fontSize: '8px',
          lineHeight: 1,
          marginTop: '8px',
          flexShrink: 0,
        }}
      >
        ●
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: PALETTE.textTertiary,
          }}
        >
          {label}
        </div>
        <div
          style={{
            marginTop: '4px',
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: PALETTE.textPrimary,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            {value}
          </span>
          <span
            style={{
              fontSize: '12px',
              color: PALETTE.textTertiary,
              fontWeight: 400,
            }}
          >
            {context}
          </span>
        </div>
      </div>
    </div>
  )

  if (!href || muted) {
    return <li>{row}</li>
  }
  return (
    <li>
      <Link
        href={href}
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
      >
        {row}
      </Link>
    </li>
  )
}
