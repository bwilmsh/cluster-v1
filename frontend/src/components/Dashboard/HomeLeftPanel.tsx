'use client'

import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react'

type DashboardTask = {
  id: string
  title: string
  status: string
  start_time: string
  end_time: string | null
}

type DashboardDueDate = {
  id: string
  title: string
  dueAt: string
  dueTime: string
  priority: string
  urgency: 'today' | 'overdue' | 'upcoming'
}

type DashboardHabit = {
  id: string
  name: string
  scheduledTime: string
  streak: number
}

type DashboardHomePayload = {
  briefing: string
  tasksToday: DashboardTask[]
  dueDates: DashboardDueDate[]
  habitsToday: DashboardHabit[]
}

function parseDate(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTimeLabel(value?: string | null) {
  if (!value) return '--:--'
  if (/^\d{2}:\d{2}/.test(value)) {
    const [hRaw = '0', mRaw = '0'] = value.split(':')
    const h = Number(hRaw)
    const m = Number(mRaw)
    const period = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`
  }

  const d = parseDate(value)
  if (!d) return value
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d)
}

function taskBadgeLabel(startTimeIso: string) {
  const date = parseDate(startTimeIso)
  if (!date) return 'Today'
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  if (date.getTime() < todayStart.getTime()) return 'Overdue'
  if (date.getTime() >= todayStart.getTime() && date.getTime() < tomorrowStart.getTime()) return 'Today'

  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)
}

function urgencyLabel(value: DashboardDueDate['urgency']) {
  if (value === 'overdue') return 'Overdue'
  if (value === 'today') return 'Today'
  return 'Upcoming'
}

function sectionBoxStyle() {
  return {
    border: '0.5px solid var(--border)',
    background: 'var(--surface)',
  }
}

function rowBoxStyle() {
  return {
    border: '0.5px solid var(--border)',
    background: 'var(--surface-elevated)',
  }
}

export default function HomeLeftPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const [payload, setPayload] = useState<DashboardHomePayload>({
    briefing: 'Loading briefing...',
    tasksToday: [],
    dueDates: [],
    habitsToday: [],
  })

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dashboard/home', { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as Partial<DashboardHomePayload> & { error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to load dashboard data')

      setPayload({
        briefing: typeof data.briefing === 'string' ? data.briefing : 'Your schedule is ready and prioritized for today.',
        tasksToday: Array.isArray(data.tasksToday) ? data.tasksToday : [],
        dueDates: Array.isArray(data.dueDates) ? data.dueDates : [],
        habitsToday: Array.isArray(data.habitsToday) ? data.habitsToday : [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const taskRows = useMemo(
    () =>
      [...payload.tasksToday].sort((a, b) => {
        const aDone = a.status === 'done' ? 1 : 0
        const bDone = b.status === 'done' ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      }),
    [payload.tasksToday],
  )

  async function toggleTask(task: DashboardTask) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    const response = await fetch(`/api/scheduler/events/${task.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(text || 'Failed to update task status')
    }

    await refresh()
  }

  async function createTaskFromInput() {
    const title = query.trim()
    if (!title || savingTask) return

    try {
      setSavingTask(true)
      setError(null)
      const response = await fetch('/api/scheduler/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          itemType: 'task',
          status: 'todo',
          priority: 'medium',
          start_time: new Date().toISOString(),
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || 'Failed to create task')
      }

      setQuery('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create task')
    } finally {
      setSavingTask(false)
    }
  }

  function onTaskInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void createTaskFromInput()
  }

  return (
    <div className="h-full overflow-auto pr-1">
      <div className="flex min-h-full flex-col gap-2.5">
        <section className="rounded-xl p-3" style={sectionBoxStyle()}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-tertiary)' }}>AI briefing</p>
          <p className="mt-1 text-[13px] leading-5" style={{ color: 'var(--text-secondary)' }}>{payload.briefing}</p>
        </section>

        <section className="flex min-h-[260px] flex-1 flex-col rounded-xl p-3" style={sectionBoxStyle()}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Today's tasks</h2>
            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{taskRows.length}</span>
          </div>

          <div className="flex-1 space-y-1.5 overflow-auto">
            {taskRows.length === 0 ? (
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>No tasks today</p>
            ) : taskRows.map((task) => {
              const done = task.status === 'done'
              return (
                <label
                  key={task.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5"
                  style={rowBoxStyle()}
                >
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => {
                      void toggleTask(task)
                    }}
                    className="mt-[2px] h-3.5 w-3.5 rounded"
                    style={{ borderColor: 'var(--border-strong)' }}
                  />
                  <span className="min-w-0 flex-1 text-[12px]" style={{ color: 'var(--text-primary)' }}>
                    <span className={done ? 'line-through text-neutral-400' : ''}>{task.title}</span>
                  </span>
                  <span
                    className="rounded px-1.5 py-[2px] text-[10px] uppercase tracking-[0.08em]"
                    style={{ border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-tertiary)' }}
                  >
                    {taskBadgeLabel(task.start_time)}
                  </span>
                </label>
              )
            })}
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onTaskInputKeyDown}
            placeholder="Add a task and press Enter"
            className="mt-2 w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
            style={{ border: '0.5px solid var(--border)', background: 'var(--surface-elevated)', color: 'var(--text-primary)' }}
            disabled={savingTask}
          />
        </section>

        <section className="rounded-xl p-3" style={sectionBoxStyle()}>
          <h2 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Due dates</h2>
          <div className="space-y-1.5">
            {payload.dueDates.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={rowBoxStyle()}>
                <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>{item.title}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatTimeLabel(item.dueTime || item.dueAt)}</span>
                <span
                  className="rounded px-1.5 py-[2px] text-[10px] uppercase tracking-[0.08em]"
                  style={{ border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-tertiary)' }}
                >
                  {urgencyLabel(item.urgency)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl p-3" style={sectionBoxStyle()}>
          <h2 className="mb-2 text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Habits today</h2>
          <div className="space-y-1.5">
            {payload.habitsToday.slice(0, 8).map((habit) => (
              <div key={habit.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={rowBoxStyle()}>
                <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--text-primary)' }}>{habit.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatTimeLabel(habit.scheduledTime)}</span>
                <span
                  className="rounded px-1.5 py-[2px] text-[10px] uppercase tracking-[0.08em]"
                  style={{ border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-tertiary)' }}
                >
                  {habit.streak} streak
                </span>
              </div>
            ))}
          </div>
        </section>

        {loading ? <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Loading dashboard data...</p> : null}
        {error ? <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{error}</p> : null}
      </div>
    </div>
  )
}
