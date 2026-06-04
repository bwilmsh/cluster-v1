'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, Goal } from '@/lib/api'
import { toLocalISOWithOffset } from '../../../lib/time'
import { useRef } from 'react'

type TaskPriority = 'high' | 'medium' | 'low'
type TaskStatus = 'todo' | 'done'

type TaskRecord = {
  id: string
  title: string
  start_time: string
  end_time?: string | null
  priority?: string | null
  status?: string | null
  description?: string | null
  itemType?: string | null
  tags?: string[]
}

type TaskDraft = {
  id?: string
  title: string
  dueDate: string
  timeEnabled: boolean
  startTime: string
  endTime: string
  priority: TaskPriority
  status: TaskStatus
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const PRIORITY_TINT: Record<TaskPriority, string> = {
  high: 'rgba(239, 68, 68, 0.14)',
  medium: 'rgba(245, 158, 11, 0.14)',
  low: 'rgba(79, 184, 168, 0.14)',
}

const PRIORITY_BORDER: Record<TaskPriority, string> = {
  high: 'rgba(239, 68, 68, 0.34)',
  medium: 'rgba(245, 158, 11, 0.34)',
  low: 'rgba(79, 184, 168, 0.34)',
}

const PRIORITY_TEXT: Record<TaskPriority, string> = {
  high: '#f87171',
  medium: '#fbbf24',
  low: 'var(--accent)',
}

function CalendarMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2 6.5H14M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function localDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function localTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizePriority(value?: string | null): TaskPriority {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function normalizeStatus(value?: string | null): TaskStatus {
  return value === 'done' ? 'done' : 'todo'
}

function hasTimeBlock(task: TaskRecord) {
  const start = new Date(task.start_time)
  return (start.getHours() !== 0 || start.getMinutes() !== 0 || start.getSeconds() !== 0) || Boolean(task.end_time)
}

function formatDue(task: TaskRecord) {
  const start = new Date(task.start_time)
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(start)

  if (!hasTimeBlock(task)) return dateText

  const startText = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(start)

  if (!task.end_time) return `${dateText} · ${startText}`

  const end = new Date(task.end_time)
  const endText = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(end)

  return `${dateText} · ${startText} - ${endText}`
}

function formatGoalDeadline(value: string | null | undefined) {
  if (!value) return 'No deadline set'
  const deadline = new Date(value)
  if (Number.isNaN(deadline.getTime())) return 'No deadline set'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(deadline)
}

function goalTag(goalId: string) {
  return `goal:${goalId}`
}

export default function TasksPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTask, setSavingTask] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [currentGoal, setCurrentGoal] = useState<Goal | null>(null)
  const openedTaskIdRef = useRef<string | null>(null)

  async function loadTasks() {
    const response = await fetch('/api/scheduler/events?limit=500')
    if (!response.ok) throw new Error(await response.text())
    const data = (await response.json()) as unknown
    const list = Array.isArray(data) ? data : []
    return (list.filter((item) => {
      const record = item as TaskRecord
      return record.itemType === 'task' || record.status === 'todo' || record.status === 'done'
    }) as TaskRecord[])
  }

  async function refresh() {
    setLoading(true)
    try {
      const [taskList, currentGoalValue] = await Promise.all([
        loadTasks(),
        api.goals.current().catch(() => null),
      ])
      setTasks(taskList)
      setCurrentGoal(currentGoalValue)
    } catch (error) {
      console.error('Failed to load tasks page data', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const statusRankA = normalizeStatus(a.status) === 'done' ? 1 : 0
      const statusRankB = normalizeStatus(b.status) === 'done' ? 1 : 0
      if (statusRankA !== statusRankB) return statusRankA - statusRankB

      const dueA = new Date(a.start_time).getTime()
      const dueB = new Date(b.start_time).getTime()
      if (dueA !== dueB) return dueA - dueB

      const priorityRank = { high: 0, medium: 1, low: 2 }
      return priorityRank[normalizePriority(a.priority)] - priorityRank[normalizePriority(b.priority)]
    })
  }, [tasks])

  const todoTasks = orderedTasks.filter((task) => normalizeStatus(task.status) === 'todo')
  const doneTasks = orderedTasks.filter((task) => normalizeStatus(task.status) === 'done')
  const goalTasks = currentGoal ? orderedTasks.filter((task) => task.tags?.includes(goalTag(currentGoal.id))) : []
  const goalCompleted = goalTasks.filter((task) => normalizeStatus(task.status) === 'done').length
  const goalProgress = goalTasks.length === 0 ? 0 : Math.round((goalCompleted / goalTasks.length) * 100)

  const taskStats = {
    total: tasks.length,
    todo: todoTasks.length,
    done: doneTasks.length,
  }

  function openCreateTask() {
    setDraft({
      title: '',
      dueDate: localDateInputValue(new Date()),
      timeEnabled: false,
      startTime: '09:00',
      endTime: '10:00',
      priority: 'medium',
      status: 'todo',
    })
    setModalOpen(true)
  }

  function openEditTask(task: TaskRecord) {
    const start = new Date(task.start_time)
    const end = task.end_time ? new Date(task.end_time) : null
    const timeEnabled = hasTimeBlock(task)

    setDraft({
      id: task.id,
      title: task.title,
      dueDate: localDateInputValue(start),
      timeEnabled,
      startTime: timeEnabled ? localTimeInputValue(start) : '09:00',
      endTime: timeEnabled && end ? localTimeInputValue(end) : '10:00',
      priority: normalizePriority(task.priority),
      status: normalizeStatus(task.status),
    })
    setModalOpen(true)
  }

  useEffect(() => {
    const taskId = searchParams.get('task')?.trim() ?? ''
    if (!taskId || loading || tasks.length === 0) return
    if (openedTaskIdRef.current === taskId) return
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    openEditTask(task)
    openedTaskIdRef.current = taskId
  }, [loading, searchParams, tasks])

  async function saveTask() {
    if (!draft) return

    const title = draft.title.trim()
    if (!title) {
      alert('Task title is required')
      return
    }

    const startTime = draft.timeEnabled ? draft.startTime : '00:00'
    const startDate = new Date(`${draft.dueDate}T${startTime}`)
    if (Number.isNaN(startDate.getTime())) {
      alert('Please choose a valid due date')
      return
    }

    const payload: Record<string, unknown> = {
      title,
      start_time: toLocalISOWithOffset(startDate),
      itemType: 'task',
      priority: draft.priority,
      status: draft.status,
      description: null,
    }

    if (draft.timeEnabled) {
      const endDate = new Date(`${draft.dueDate}T${draft.endTime}`)
      if (Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
        alert('The time block must end after it starts')
        return
      }
      payload.end_time = toLocalISOWithOffset(endDate)
    }

    setSavingTask(true)
    try {
      const response = await fetch(
        draft.id ? `/api/scheduler/events/${encodeURIComponent(draft.id)}` : '/api/scheduler/events',
        {
          method: draft.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      if (!response.ok) throw new Error(await response.text())
      setModalOpen(false)
      setDraft(null)
      await refresh()
    } catch (error) {
      alert(`Could not save task: ${String(error)}`)
    } finally {
      setSavingTask(false)
    }
  }

  async function toggleTaskStatus(task: TaskRecord) {
    const nextStatus = normalizeStatus(task.status) === 'done' ? 'todo' : 'done'
    try {
      const response = await fetch(`/api/scheduler/events/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await response.text())
      await refresh()
    } catch (error) {
      alert(`Could not update task: ${String(error)}`)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-tertiary)' }}>
              Checklist and goals
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Tasks
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
              A prioritized checklist ordered by due date. Timed tasks are pushed into the calendar automatically.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                Progress
              </p>
              <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                {taskStats.done} done
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {taskStats.todo} todo · {taskStats.total} total
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateTask}
              className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              <PlusIcon className="h-4 w-4" />
              Add task
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-3xl border p-8 text-sm" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
            Loading tasks...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <section className="rounded-3xl border p-4 md:p-5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Checklist
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    Sorted by due date, with completed items below.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                      Todo
                    </h3>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{todoTasks.length}</span>
                  </div>
                  <div className="space-y-3">
                    {todoTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                        Your open tasks will appear here.
                      </div>
                    ) : (
                      todoTasks.map((task) => {
                        const priority = normalizePriority(task.priority)
                        const timeBlocked = hasTimeBlock(task)
                        return (
                          <article
                            key={task.id}
                            draggable
                            onDragStart={() => setDraggingTaskId(task.id)}
                            onDragEnd={() => setDraggingTaskId(null)}
                            className="rounded-2xl border p-4 transition-transform"
                            style={{
                              background: draggingTaskId === task.id ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                              borderColor: draggingTaskId === task.id ? PRIORITY_TEXT[priority] : 'var(--border)',
                              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.12)',
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => void toggleTaskStatus(task)}
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                                style={{
                                  borderColor: 'var(--border-strong)',
                                  background: 'transparent',
                                  color: 'var(--text-tertiary)',
                                }}
                                aria-label={`Mark ${task.title} as done`}
                                title="Mark done"
                              >
                                <CheckIcon className="h-3.5 w-3.5" />
                              </button>

                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => openEditTask(task)}
                                  className="block w-full text-left text-sm font-semibold leading-5 transition-colors"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {task.title}
                                </button>

                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                                    {timeBlocked && <CalendarMiniIcon className="h-3.5 w-3.5" />}
                                    <span>{formatDue(task)}</span>
                                  </span>
                                  <span className="inline-flex items-center rounded-full border px-2.5 py-1 capitalize" style={{ borderColor: PRIORITY_BORDER[priority], color: PRIORITY_TEXT[priority], background: PRIORITY_TINT[priority] }}>
                                    {PRIORITY_LABELS[priority]}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border px-2.5 py-1 capitalize" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
                                    todo
                                  </span>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                      Completed
                    </h3>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{doneTasks.length}</span>
                  </div>
                  <div className="space-y-3">
                    {doneTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-tertiary)' }}>
                        Finished tasks land here.
                      </div>
                    ) : (
                      doneTasks.map((task) => {
                        const priority = normalizePriority(task.priority)
                        const timeBlocked = hasTimeBlock(task)
                        return (
                          <article
                            key={task.id}
                            draggable
                            onDragStart={() => setDraggingTaskId(task.id)}
                            onDragEnd={() => setDraggingTaskId(null)}
                            className="rounded-2xl border p-4 transition-transform"
                            style={{
                              background: 'var(--bg-primary)',
                              borderColor: 'var(--border)',
                              opacity: 0.72,
                              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.08)',
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <button
                                type="button"
                                onClick={() => void toggleTaskStatus(task)}
                                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                                style={{
                                  borderColor: 'var(--accent)',
                                  background: 'var(--accent-muted)',
                                  color: 'var(--accent)',
                                }}
                                aria-label={`Mark ${task.title} as todo`}
                                title="Mark todo"
                              >
                                <CheckIcon className="h-3.5 w-3.5" />
                              </button>

                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => openEditTask(task)}
                                  className="block w-full text-left text-sm font-semibold leading-5 line-through transition-colors"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {task.title}
                                </button>

                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                                    {timeBlocked && <CalendarMiniIcon className="h-3.5 w-3.5" />}
                                    <span>{formatDue(task)}</span>
                                  </span>
                                  <span className="inline-flex items-center rounded-full border px-2.5 py-1 capitalize" style={{ borderColor: PRIORITY_BORDER[priority], color: PRIORITY_TEXT[priority], background: PRIORITY_TINT[priority] }}>
                                    {PRIORITY_LABELS[priority]}
                                  </span>
                                  <span className="inline-flex items-center rounded-full border px-2.5 py-1 capitalize" style={{ borderColor: 'rgba(34, 197, 94, 0.35)', color: '#22c55e', background: 'rgba(34, 197, 94, 0.12)' }}>
                                    done
                                  </span>
                                </div>
                              </div>
                            </div>
                          </article>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>

            <aside className="flex flex-col gap-5">
              <section className="rounded-3xl border p-5" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                      Goals
                    </p>
                    <h2 className="mt-2 text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Dedicated goal page
                    </h2>
                    <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Create a goal from the goals page, then open it to set the title and deadline.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push('/goals')}
                    className="inline-flex items-center rounded-2xl px-3 py-2 text-sm font-semibold transition-colors"
                    style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
                  >
                    New Goal
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border p-4" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
                  <div className="grid gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                      Current goal
                    </p>
                    <p className="text-sm leading-6" style={{ color: 'var(--text-primary)' }}>
                      {currentGoal?.goal_text ?? 'No active goal yet.'}
                    </p>
                    <div className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      <span>{formatGoalDeadline(currentGoal?.deadline)}</span>
                      {currentGoal && (
                        <button
                          type="button"
                          onClick={() => router.push(`/goals/${currentGoal.id}`)}
                          className="rounded-full border px-3 py-1 font-semibold transition-colors"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                        >
                          Open
                        </button>
                      )}
                    </div>
                  </div>

                    {currentGoal && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <div className="flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <span>Goal progress</span>
                            <span>{goalCompleted}/{goalTasks.length || 0}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                            <div className="h-full rounded-full" style={{ width: `${goalProgress}%`, background: 'var(--accent)' }} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                            Goal tasks
                          </p>
                          {goalTasks.length === 0 ? (
                            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                              Tasks generated from the goal chat will appear here.
                            </p>
                          ) : (
                            goalTasks.slice(0, 4).map((task) => (
                              <div key={task.id} className="rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                                <div className="flex items-center justify-between gap-3">
                                  <span className={normalizeStatus(task.status) === 'done' ? 'line-through' : ''}>{task.title}</span>
                                  <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--text-tertiary)' }}>
                                    {normalizeStatus(task.status)}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>

      {modalOpen && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="w-full max-w-xl rounded-3xl border p-6 shadow-2xl" style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--text-tertiary)' }}>
                  {draft.id ? 'Edit task' : 'Create task'}
                </p>
                <h2 className="mt-2 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {draft.id ? 'Update task' : 'Add a task'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false)
                  setDraft(null)
                }}
                className="rounded-full px-3 py-1 text-sm transition-colors"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Title
                </span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                  placeholder="Write the task title"
                  className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Due date
                  </span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) => setDraft((current) => (current ? { ...current, dueDate: event.target.value } : current))}
                    className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Priority
                  </span>
                  <select
                    value={draft.priority}
                    onChange={(event) => setDraft((current) => (current ? { ...current, priority: event.target.value as TaskPriority } : current))}
                    className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                    style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Time block
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    If you add a time, the task is automatically created on the calendar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((current) => (current ? { ...current, timeEnabled: !current.timeEnabled } : current))}
                  className="inline-flex h-9 w-16 items-center rounded-full border p-1 transition-colors"
                  style={{
                    borderColor: draft.timeEnabled ? 'var(--accent)' : 'var(--border-strong)',
                    background: draft.timeEnabled ? 'var(--accent-muted)' : 'transparent',
                  }}
                  aria-pressed={draft.timeEnabled}
                >
                  <span
                    className="h-7 w-7 rounded-full transition-transform"
                    style={{
                      background: draft.timeEnabled ? 'var(--accent)' : 'var(--text-tertiary)',
                      transform: draft.timeEnabled ? 'translateX(1.5rem)' : 'translateX(0)',
                    }}
                  />
                </button>
              </div>

              {draft.timeEnabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Start time
                    </span>
                    <input
                      type="time"
                      value={draft.startTime}
                      onChange={(event) => setDraft((current) => (current ? { ...current, startTime: event.target.value } : current))}
                      className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      End time
                    </span>
                    <input
                      type="time"
                      value={draft.endTime}
                      onChange={(event) => setDraft((current) => (current ? { ...current, endTime: event.target.value } : current))}
                      className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </label>
                </div>
              )}

              <label className="grid gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Status
                </span>
                <select
                  value={draft.status}
                  onChange={(event) => setDraft((current) => (current ? { ...current, status: event.target.value as TaskStatus } : current))}
                  className="rounded-2xl border px-4 py-3 outline-none transition-colors"
                  style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="todo">Todo</option>
                  <option value="done">Done</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false)
                  setDraft(null)
                }}
                className="rounded-2xl border px-4 py-3 text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTask()}
                disabled={savingTask}
                className="rounded-2xl px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed"
                style={{ background: 'var(--accent)', color: 'var(--bg-primary)', opacity: savingTask ? 0.75 : 1 }}
              >
                {savingTask ? 'Saving...' : draft.id ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
