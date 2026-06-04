'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { api, Goal, GoalPlanResponse } from '@/lib/api'

type GoalTaskEvent = {
  id: string
  title: string
  start_time: string
  end_time?: string | null
  status?: string | null
  priority?: string | null
  description?: string | null
  tags?: string[]
  itemType?: string | null
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const INITIAL_ASSISTANT_MESSAGE = 'What are you trying to achieve with this goal?'

function toDateInputValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toStoredDeadline(value: string) {
  return value ? `${value}T12:00:00.000Z` : null
}

function formatGoalDeadline(value: string | null) {
  if (!value) return 'No deadline set'
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return 'No deadline set'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(deadline)
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function goalTag(goalId: string) {
  return `goal:${goalId}`
}

function isDone(status?: string | null) {
  return status === 'done'
}

function isGoalTask(task: GoalTaskEvent, goalId: string) {
  return Boolean(task.tags?.includes(goalTag(goalId)))
}

function storageKey(goalId: string) {
  return `goal-workspace:${goalId}`
}

function startOfWeek(date: Date) {
  const value = new Date(date)
  const day = value.getDay()
  const diff = value.getDate() - day + (day === 0 ? -6 : 1)
  value.setDate(diff)
  value.setHours(0, 0, 0, 0)
  return value
}

function addDays(date: Date, days: number) {
  const value = new Date(date)
  value.setDate(value.getDate() + days)
  return value
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export default function GoalPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [goal, setGoal] = useState<Goal | null>(null)
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState('')
  const [loadingGoal, setLoadingGoal] = useState(true)
  const [savingGoal, setSavingGoal] = useState(false)
  const [tasks, setTasks] = useState<GoalTaskEvent[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
  const [draft, setDraft] = useState('')
  const [checkInDraft, setCheckInDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [checkInPrompt, setCheckInPrompt] = useState('')
  const [scheduleSummary, setScheduleSummary] = useState('')

  async function refreshTasks(goalId: string) {
    setLoadingTasks(true)
    try {
      const response = await fetch('/api/scheduler/events?limit=500')
      if (!response.ok) throw new Error(await response.text())
      const data = (await response.json()) as unknown
      const list = Array.isArray(data) ? data : []
      setTasks(
        list
          .filter((item) => {
            const task = item as GoalTaskEvent
            return task.itemType === 'task' && isGoalTask(task, goalId)
          })
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      )
    } catch (error) {
      console.error('Failed to load goal tasks', error)
    } finally {
      setLoadingTasks(false)
    }
  }

  useEffect(() => {
    const id = params.id
    if (!id) return

    setLoadingGoal(true)
    api.goals
      .get(id)
      .then((data) => {
        setGoal(data)
        setTitle(data.goal_text)
        setDeadline(toDateInputValue(data.deadline))
      })
      .catch((error) => {
        console.error('Failed to load goal', error)
        router.push('/goals')
      })
      .finally(() => setLoadingGoal(false))
  }, [params.id, router])

  useEffect(() => {
    const goalId = params.id
    if (!goalId) return

    void refreshTasks(goalId)

    try {
      const raw = window.localStorage.getItem(storageKey(goalId))
      if (!raw) {
        setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
        setCheckInPrompt('')
        setScheduleSummary('')
        setCheckInDraft('')
        return
      }

      const parsed = JSON.parse(raw) as {
        messages?: ChatMessage[]
        checkInPrompt?: string
        scheduleSummary?: string
        checkInDraft?: string
      }
      setMessages(Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages : [{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
      setCheckInPrompt(typeof parsed.checkInPrompt === 'string' ? parsed.checkInPrompt : '')
      setScheduleSummary(typeof parsed.scheduleSummary === 'string' ? parsed.scheduleSummary : '')
      setCheckInDraft(typeof parsed.checkInDraft === 'string' ? parsed.checkInDraft : '')
    } catch {
      setMessages([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
    }
  }, [params.id])

  useEffect(() => {
    const goalId = params.id
    if (!goalId) return

    window.localStorage.setItem(
      storageKey(goalId),
      JSON.stringify({ messages, checkInPrompt, scheduleSummary, checkInDraft })
    )
  }, [messages, checkInPrompt, scheduleSummary, checkInDraft, params.id])

  const activeTasks = useMemo(() => tasks.filter((task) => !isDone(task.status)), [tasks])
  const completedTasks = useMemo(() => tasks.filter((task) => isDone(task.status)), [tasks])
  const completionRate = tasks.length === 0 ? 0 : Math.round((completedTasks.length / tasks.length) * 100)

  const tasksByDate = useMemo(() => {
    const map = new Map<string, GoalTaskEvent[]>()
    for (const task of tasks) {
      const dateKey = new Date(task.start_time).toISOString().slice(0, 10)
      const current = map.get(dateKey) ?? []
      current.push(task)
      map.set(dateKey, current)
    }
    return map
  }, [tasks])

  const weekDays = useMemo(() => {
    const today = new Date()
    const weekStart = startOfWeek(today)
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  }, [])

  async function handleSaveGoal() {
    if (!goal) return
    const trimmed = title.trim()
    if (!trimmed) {
      alert('Goal title is required')
      return
    }

    setSavingGoal(true)
    try {
      const updated = await api.goals.update(goal.id, {
        goal_text: trimmed,
        deadline: deadline ? toStoredDeadline(deadline) : null,
      })
      setGoal(updated.goal)
      setTitle(updated.goal.goal_text)
      setDeadline(toDateInputValue(updated.goal.deadline))
    } catch (error) {
      alert(`Could not update goal: ${String(error)}`)
    } finally {
      setSavingGoal(false)
    }
  }

  async function submitGoalPrompt(prompt: string) {
    if (!goal) return
    const trimmed = prompt.trim()
    if (!trimmed) return

    setSending(true)
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(nextHistory)
    setDraft('')
    setCheckInDraft('')

    try {
      const response: GoalPlanResponse = await api.goals.plan(goal.id, {
        message: trimmed,
        history: nextHistory.map((message) => ({ role: message.role, content: message.content })),
      })

      const updatedMessages = [...nextHistory, { role: 'assistant' as const, content: response.reply || INITIAL_ASSISTANT_MESSAGE }]
      setMessages(updatedMessages as ChatMessage[])
      setCheckInPrompt(response.check_in_prompt)
      setScheduleSummary(response.schedule_summary)
      await refreshTasks(goal.id)
    } catch (error) {
      alert(`Could not update goal plan: ${String(error)}`)
    } finally {
      setSending(false)
    }
  }

  async function toggleTask(task: GoalTaskEvent) {
    const nextStatus = isDone(task.status) ? 'todo' : 'done'
    try {
      const response = await fetch(`/api/scheduler/events/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await response.text())
      if (goal) await refreshTasks(goal.id)
    } catch (error) {
      alert(`Could not update task: ${String(error)}`)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
              Goal workspace
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: 'var(--text-primary)' }}>
                {loadingGoal ? 'Loading goal...' : title || 'Goal'}
              </h1>
              {goal && (
                <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: goal.is_active ? 'var(--accent)' : 'var(--border)', color: goal.is_active ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                  {goal.is_active ? 'Active' : 'Archived'}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {loadingGoal ? 'Loading deadline...' : formatGoalDeadline(goal?.deadline ?? null)}
            </p>
          </div>

          <Link
            href="/goals"
            className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Back to goals
          </Link>

          <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Goal title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-2xl border px-4 py-3 text-lg font-semibold outline-none transition-colors"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Deadline
              </span>
              <input
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </label>

            <button
              type="button"
              onClick={() => void handleSaveGoal()}
              disabled={savingGoal}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'var(--bg-primary)', opacity: savingGoal ? 0.75 : 1 }}
            >
              {savingGoal ? 'Saving...' : 'Save goal'}
            </button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
          <section className="space-y-5">
            <section className="rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                    AI chat
                  </p>
                  <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Break the goal down
                  </h2>
                </div>
                <div className="text-right text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <p>{checkInPrompt || INITIAL_ASSISTANT_MESSAGE}</p>
                  {scheduleSummary ? <p className="mt-1 max-w-56">{scheduleSummary}</p> : null}
                </div>
              </div>

              <div className="mt-5 space-y-3 rounded-2xl border p-4" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className="rounded-2xl px-4 py-3 text-sm leading-6"
                    style={{
                      background: message.role === 'assistant' ? 'var(--bg-secondary)' : 'rgba(79, 184, 168, 0.1)',
                      border: `1px solid ${message.role === 'assistant' ? 'var(--border)' : 'rgba(79, 184, 168, 0.25)'}`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                      {message.role === 'assistant' ? 'AI' : 'You'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>

              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitGoalPrompt(draft)
                }}
              >
                <label className="grid gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Your answer
                  </span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={4}
                    placeholder={checkInPrompt || INITIAL_ASSISTANT_MESSAGE}
                    className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setDraft(checkInDraft)}
                    className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                  >
                    Restore check-in
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent)', color: 'var(--bg-primary)', opacity: sending ? 0.75 : 1 }}
                  >
                    {sending ? 'Thinking...' : 'Send to AI'}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                    Progress
                  </p>
                  <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Checklist completion
                  </h2>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {completedTasks.length}/{tasks.length || 0}
                </p>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full border" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${completionRate}%`, background: 'var(--accent)' }}
                />
              </div>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                    Total tasks
                  </p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {tasks.length}
                  </p>
                </div>
                <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                    Completed
                  </p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {completedTasks.length}
                  </p>
                </div>
                <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                    Remaining
                  </p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {activeTasks.length}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                    Tasks
                  </p>
                  <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Auto-generated checklist
                  </h2>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {loadingTasks ? 'Loading...' : `${tasks.length} linked tasks`}
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {loadingTasks ? (
                  <div className="rounded-2xl border border-dashed px-4 py-8 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                    Loading goal tasks...
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed px-4 py-8 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                    Answer the AI prompt and the checklist will appear here.
                  </div>
                ) : (
                  tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => void toggleTask(task)}
                      className="w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                      style={{ background: 'var(--bg-primary)', borderColor: isDone(task.status) ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {task.title}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {task.description || formatShortDate(task.start_time)}
                          </p>
                        </div>
                        <span className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ borderColor: isDone(task.status) ? 'rgba(34, 197, 94, 0.35)' : 'var(--border)', color: isDone(task.status) ? '#22c55e' : 'var(--text-tertiary)' }}>
                          {isDone(task.status) ? 'Done' : 'Todo'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                  Calendar
                </p>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  How this fits the week
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                {weekDays.map((day) => {
                  const key = day.toISOString().slice(0, 10)
                  const dayTasks = tasksByDate.get(key) ?? []
                  const isToday = sameDay(day, new Date())

                  return (
                    <div key={key} className="rounded-2xl border p-3" style={{ background: 'var(--bg-primary)', borderColor: isToday ? 'var(--accent)' : 'var(--border)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                            {isToday ? 'Today' : day.toLocaleDateString(undefined, { weekday: 'short' })}
                          </p>
                          <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                        <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                          {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {dayTasks.length === 0 ? (
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Nothing scheduled.
                          </p>
                        ) : (
                          dayTasks.map((task) => (
                            <div key={task.id} className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                              {task.title}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-3xl border p-5 md:p-6" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                  Weekly check-in
                </p>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Keep the plan adaptive
                </h2>
              </div>

              <p className="mt-3 text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                {checkInPrompt || INITIAL_ASSISTANT_MESSAGE}
              </p>

              <textarea
                value={checkInDraft}
                onChange={(event) => setCheckInDraft(event.target.value)}
                rows={4}
                placeholder="Tell the AI what happened this week..."
                className="mt-4 w-full rounded-2xl border px-4 py-3 outline-none transition-colors"
                style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void submitGoalPrompt(checkInDraft)}
                  disabled={sending}
                  className="rounded-2xl px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent)', color: 'var(--bg-primary)', opacity: sending ? 0.75 : 1 }}
                >
                  {sending ? 'Updating...' : 'Submit check-in'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}