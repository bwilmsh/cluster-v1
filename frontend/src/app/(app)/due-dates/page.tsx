'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AddDueDateModal } from '@/components/AddDueDateModal'
import { api, DueDateCategory, DueDateItem, DueDatePriority } from '@/lib/api'

type SectionKey = 'overdue' | 'today' | 'thisWeek' | 'later'

const SECTION_ORDER: SectionKey[] = ['overdue', 'today', 'thisWeek', 'later']

const SECTION_TITLES: Record<SectionKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  thisWeek: 'This Week',
  later: 'Then Later',
}

const SECTION_COPY: Record<SectionKey, string> = {
  overdue: 'Needs attention now',
  today: 'Due before midnight',
  thisWeek: 'Due before the week ends',
  later: 'Due after this week',
}

const CATEGORY_LABELS: Record<DueDateCategory, string> = {
  ASSIGNMENT: 'Assignment',
  EXAM: 'Exam',
  WORK: 'Work',
  PERSONAL: 'Personal',
}

const PRIORITY_LABELS: Record<DueDatePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

const PRIORITY_STYLES: Record<DueDatePriority, { background: string; border: string; text: string }> = {
  LOW: { background: 'rgba(148, 163, 184, 0.14)', border: 'rgba(148, 163, 184, 0.22)', text: '#e2e8f0' },
  MEDIUM: { background: 'rgba(96, 165, 250, 0.14)', border: 'rgba(96, 165, 250, 0.22)', text: '#bfdbfe' },
  HIGH: { background: 'rgba(251, 191, 36, 0.16)', border: 'rgba(251, 191, 36, 0.28)', text: '#fde68a' },
  URGENT: { background: 'rgba(248, 113, 113, 0.18)', border: 'rgba(248, 113, 113, 0.3)', text: '#fecaca' },
}

function startOfDay(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(value: Date, amount: number) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function startOfWeek(value: Date) {
  const date = startOfDay(value)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  return date
}

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown due date'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function formatShortDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function getDueAt(item: DueDateItem) {
  return new Date(item.dueAt)
}

function getSection(item: DueDateItem, now: Date) {
  const due = getDueAt(item)
  if (Number.isNaN(due.getTime())) return 'later'

  const today = startOfDay(now)
  const weekEnd = addDays(startOfWeek(now), 6)

  if (due.getTime() < now.getTime()) return 'overdue'
  if (sameDay(due, today)) return 'today'
  if (due <= weekEnd) return 'thisWeek'
  return 'later'
}

function formatRelativeDue(item: DueDateItem, now: Date) {
  const due = getDueAt(item)
  if (Number.isNaN(due.getTime())) return 'Due date unavailable'

  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000))
  const absDays = Math.abs(diffDays)

  if (diffMs < 0) {
    if (absDays <= 1) return 'overdue by 1 day'
    return `overdue by ${absDays} days`
  }

  if (sameDay(due, now)) return 'today'
  if (diffDays === 1) return 'tomorrow'
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`

  return `due on ${formatShortDate(item.dueAt)}`
}

function SectionBadge({ label, value, tone, text }: { label: string; value: number; tone: string; text: string }) {
  return (
    <div className="rounded-2xl border px-3 py-2" style={{ background: tone, borderColor: 'rgba(255,255,255,0.08)', color: text }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

function DueDateCard({
  item,
  section,
  onEdit,
  onComplete,
}: {
  item: DueDateItem
  section: SectionKey
  onEdit: () => void
  onComplete: () => void
}) {
  const dueAt = getDueAt(item)
  const priorityStyle = PRIORITY_STYLES[item.priority]
  const isOverdue = section === 'overdue'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onEdit()
        }
      }}
      className="group cursor-pointer rounded-[24px] border p-4 outline-none transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-teal-300/40"
      style={{
        background: isOverdue ? 'linear-gradient(180deg, rgba(248, 113, 113, 0.12), rgba(248, 113, 113, 0.04))' : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))',
        borderColor: isOverdue ? 'rgba(248, 113, 113, 0.24)' : 'rgba(255,255,255,0.08)',
        boxShadow: isOverdue ? '0 16px 36px rgba(248, 113, 113, 0.08)' : '0 16px 36px rgba(0, 0, 0, 0.14)',
      }}
    >
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onComplete()
          }}
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors"
          style={{
            borderColor: isOverdue ? 'rgba(248, 113, 113, 0.35)' : 'rgba(255,255,255,0.14)',
            background: item.status === 'COMPLETED' ? 'rgba(34, 197, 94, 0.18)' : 'rgba(255,255,255,0.04)',
            color: item.status === 'COMPLETED' ? '#86efac' : 'rgba(255,255,255,0.55)',
          }}
          aria-label={`Mark ${item.title} complete`}
        >
          ✓
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                background: 'rgba(45, 212, 191, 0.12)',
                border: '1px solid rgba(45, 212, 191, 0.2)',
                color: '#75f0e0',
              }}
            >
              {CATEGORY_LABELS[item.category]}
            </span>
            <span className="truncate text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {item.title}
            </span>
          </div>

          {item.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
              {item.description}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span>{formatDateTime(item.dueAt)}</span>
            <span>•</span>
            <span>{formatRelativeDue(item, new Date())}</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{
                background: priorityStyle.background,
                border: `1px solid ${priorityStyle.border}`,
                color: priorityStyle.text,
              }}
            >
              {PRIORITY_LABELS[item.priority]}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {item.status === 'OVERDUE' ? 'Overdue' : 'Pending'}
            </span>
            <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {dueAt.toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function DueDateSection({
  section,
  items,
  onEdit,
  onComplete,
}: {
  section: SectionKey
  items: DueDateItem[]
  onEdit: (item: DueDateItem) => void
  onComplete: (item: DueDateItem) => void
}) {
  const overdue = section === 'overdue'

  return (
    <section
      className="rounded-[28px] border p-4 md:p-5"
      style={{
        background: overdue ? 'linear-gradient(180deg, rgba(248, 113, 113, 0.1), rgba(255,255,255,0.02))' : 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
        borderColor: overdue ? 'rgba(248, 113, 113, 0.2)' : 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: overdue ? 'rgba(248, 113, 113, 0.75)' : 'var(--text-tertiary)' }}>
            {SECTION_COPY[section]}
          </p>
          <h2 className="mt-1 text-xl font-semibold md:text-2xl" style={{ color: overdue ? '#fca5a5' : 'var(--text-primary)' }}>
            {SECTION_TITLES[section]}
          </h2>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: overdue ? 'rgba(248, 113, 113, 0.22)' : 'rgba(255,255,255,0.08)', color: overdue ? '#fecaca' : 'var(--text-secondary)' }}>
          {items.length}
        </span>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <DueDateCard key={item.id} item={item} section={section} onEdit={() => onEdit(item)} onComplete={() => onComplete(item)} />
        ))}
      </div>
    </section>
  )
}

export default function DueDatesPage() {
  const [items, setItems] = useState<DueDateItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<DueDateItem | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const response = await api.dueDates.list()
        if (!active) return
        setItems(response.data)
        if (response.warning) {
          setError(response.warning)
        }
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to load due dates')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [reloadKey])

  const grouped = useMemo(() => {
    const now = new Date()
    const buckets: Record<SectionKey, DueDateItem[]> = {
      overdue: [],
      today: [],
      thisWeek: [],
      later: [],
    }

    for (const item of items) {
      const section = getSection(item, now)
      buckets[section].push(item)
    }

    for (const key of SECTION_ORDER) {
      buckets[key].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    }

    return buckets
  }, [items])

  const counts = useMemo(
    () => ({
      overdue: grouped.overdue.length,
      today: grouped.today.length,
      thisWeek: grouped.thisWeek.length,
      later: grouped.later.length,
    }),
    [grouped]
  )

  const visibleSections = SECTION_ORDER.filter((section) => grouped[section].length > 0)

  function openCreate() {
    setSelectedItem(null)
    setEditorOpen(true)
  }

  function openEdit(item: DueDateItem) {
    setSelectedItem(item)
    setEditorOpen(true)
  }

  async function completeDueDate(item: DueDateItem) {
    try {
      await api.dueDates.complete(item.id)
      setItems((current) => current.filter((entry) => entry.id !== item.id))
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete due date')
    }
  }

  return (
    <div className="relative h-full overflow-y-auto p-4 md:p-6">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(circle at top left, rgba(45, 212, 191, 0.14), transparent 36%)',
            'radial-gradient(circle at 80% 12%, rgba(168, 139, 250, 0.12), transparent 28%)',
            'radial-gradient(circle at 100% 100%, rgba(96, 165, 250, 0.1), transparent 34%)',
          ].join(', '),
        }}
      />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-5">
        <header className="rounded-[32px] border p-5 md:p-7" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', boxShadow: '0 24px 64px rgba(0, 0, 0, 0.16)' }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--text-tertiary)' }}>
                Deadline dashboard
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--text-primary)' }}>
                Due Dates
              </h1>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                Track assignments, exams, work deadlines, and personal deadlines in one clean view.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition-colors"
              style={{
                background: 'var(--accent)',
                color: 'white',
              }}
            >
              + Add Due Date
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SectionBadge label="Overdue" value={counts.overdue} tone="rgba(248, 113, 113, 0.16)" text="#fecaca" />
            <SectionBadge label="Today" value={counts.today} tone="rgba(251, 191, 36, 0.16)" text="#fde68a" />
            <SectionBadge label="This Week" value={counts.thisWeek} tone="rgba(45, 212, 191, 0.14)" text="#99f6e4" />
            <SectionBadge label="Upcoming" value={counts.later} tone="rgba(96, 165, 250, 0.14)" text="#bfdbfe" />
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border px-4 py-3 text-sm" style={{ background: 'rgba(248, 113, 113, 0.08)', borderColor: 'rgba(248, 113, 113, 0.22)', color: '#fecaca' }}>
              {error}
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="rounded-[28px] border p-6 text-sm" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Loading due dates...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[28px] border p-8 text-center" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Nothing due yet
            </h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Add your first deadline and it will show up here immediately.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={openCreate}
                className="rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors"
                style={{ borderColor: 'rgba(45, 212, 191, 0.28)', color: '#75f0e0' }}
              >
                Add Due Date
              </button>
              <Link href="/tasks" className="rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                Open Tasks
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {visibleSections.map((section) => (
              <DueDateSection key={section} section={section} items={grouped[section]} onEdit={openEdit} onComplete={completeDueDate} />
            ))}
          </div>
        )}
      </div>

      <AddDueDateModal
        isOpen={editorOpen}
        item={selectedItem}
        onClose={() => {
          setEditorOpen(false)
          setSelectedItem(null)
        }}
        onSave={() => setReloadKey((value) => value + 1)}
      />
    </div>
  )
}