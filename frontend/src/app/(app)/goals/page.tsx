'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api, Goal, GoalPlanResponse } from '@/lib/api'
import { toLocalISOWithOffset } from '@/lib/time'

type GoalEventRecord = {
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

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  actions?: Array<{
    id: string
    type: 'calendar'
    title: string
    date: string
    suggestedHour?: number
  }>
}

const INITIAL_MESSAGE = 'You are doing great taking this seriously. What do you want to work on next for this goal?'

function goalTag(goalId: string) {
  return `goal:${goalId}`
}

function storageKey(goalId: string) {
  return `goal-chat:${goalId}`
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No deadline'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No deadline'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d)
}

function formatTimeSlot(start: string, end?: string | null) {
  const startDate = new Date(start)
  if (Number.isNaN(startDate.getTime())) return 'No time'
  const startText = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(startDate)
  if (!end) return startText
  const endDate = new Date(end)
  if (Number.isNaN(endDate.getTime())) return startText
  const endText = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(endDate)
  return `${startText} - ${endText}`
}

function normalizePriority(value?: string | null) {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [events, setEvents] = useState<GoalEventRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [newDeadline, setNewDeadline] = useState('')
  const nameRef = useRef<HTMLInputElement | null>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: INITIAL_MESSAGE }])
  const [chatDraft, setChatDraft] = useState('')
  const [sendingChat, setSendingChat] = useState(false)
  const [weeklyPrompt, setWeeklyPrompt] = useState('How did this week go, and what should we adjust?')
  const [timeSelectorOpen, setTimeSelectorOpen] = useState<{ id: string; title: string; date: string } | null>(null)
  const [selectedStartHour, setSelectedStartHour] = useState(9)
  const [selectedEndHour, setSelectedEndHour] = useState(10)

  async function loadAll() {
    setLoading(true)
    try {
      const [goalList, eventRes] = await Promise.all([
        api.goals.list(50).catch(() => []),
        fetch('/api/scheduler/events?limit=1000').catch(() => null),
      ])

      const eventData = eventRes && eventRes.ok ? await eventRes.json().catch(() => []) : []
      setGoals(goalList)
      setEvents(Array.isArray(eventData) ? eventData : [])
      if (!selectedGoalId && goalList.length > 0) {
        setSelectedGoalId(goalList[0].id)
      }
    } catch (error) {
      console.error('Failed to load goals workspace', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (showNew) nameRef.current?.focus()
  }, [showNew])

  useEffect(() => {
    if (!selectedGoalId) return
    const raw = window.localStorage.getItem(storageKey(selectedGoalId))
    if (!raw) {
      setChatMessages([{ role: 'assistant', content: INITIAL_MESSAGE }])
      setWeeklyPrompt('How did this week go, and what should we adjust?')
      setChatDraft('')
      return
    }

    try {
      const parsed = JSON.parse(raw) as { messages?: ChatMessage[]; weeklyPrompt?: string }
      setChatMessages(Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages : [{ role: 'assistant', content: INITIAL_MESSAGE }])
      setWeeklyPrompt(typeof parsed.weeklyPrompt === 'string' ? parsed.weeklyPrompt : 'How did this week go, and what should we adjust?')
    } catch {
      setChatMessages([{ role: 'assistant', content: INITIAL_MESSAGE }])
      setWeeklyPrompt('How did this week go, and what should we adjust?')
    }
  }, [selectedGoalId])

  useEffect(() => {
    if (!selectedGoalId) return
    window.localStorage.setItem(
      storageKey(selectedGoalId),
      JSON.stringify({ messages: chatMessages, weeklyPrompt })
    )
  }, [selectedGoalId, chatMessages, weeklyPrompt])

  const selectedGoal = useMemo(() => goals.find((g) => g.id === selectedGoalId) ?? null, [goals, selectedGoalId])

  const eventsByGoal = useMemo(() => {
    const map = new Map<string, GoalEventRecord[]>()
    for (const event of events) {
      for (const tag of event.tags ?? []) {
        if (!tag.startsWith('goal:')) continue
        const id = tag.slice(5)
        const list = map.get(id) ?? []
        list.push(event)
        map.set(id, list)
      }
    }
    return map
  }, [events])

  const selectedGoalEvents = selectedGoal ? eventsByGoal.get(selectedGoal.id) ?? [] : []
  const selectedGoalTasks = selectedGoalEvents.filter((event) => event.itemType === 'task')
  const selectedCalendarBlocks = selectedGoalEvents.filter((event) => event.itemType !== 'task')

  function computeGoalPriority(goalId: string) {
    const list = (eventsByGoal.get(goalId) ?? []).filter((event) => event.itemType === 'task')
    if (list.length === 0) return 'low'
    if (list.some((event) => normalizePriority(event.priority) === 'high')) return 'high'
    if (list.some((event) => normalizePriority(event.priority) === 'medium')) return 'medium'
    return 'low'
  }

  function computeProgress(goalId: string) {
    const list = (eventsByGoal.get(goalId) ?? []).filter((event) => event.itemType === 'task')
    if (list.length === 0) return 0
    const done = list.filter((event) => event.status === 'done').length
    return Math.round((done / list.length) * 100)
  }

  async function createGoal() {
    const trimmed = newName.trim()
    if (!trimmed) {
      alert('Goal name is required')
      return
    }

    setCreating(true)
    try {
      const created = await api.goals.create(trimmed, newDeadline ? `${newDeadline}T12:00:00.000Z` : null)
      const goal = created.created

      await fetch('/api/scheduler/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Setup: ${trimmed}`,
          start_time: toLocalISOWithOffset(new Date()),
          itemType: 'task',
          priority: newPriority,
          status: 'todo',
          description: null,
          tags: [goalTag(goal.id)],
        }),
      })

      setShowNew(false)
      setNewName('')
      setSelectedGoalId(goal.id)
      await loadAll()
    } catch (error) {
      alert(`Could not create goal: ${String(error)}`)
    } finally {
      setCreating(false)
    }
  }

  async function toggleTask(task: GoalEventRecord) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    try {
      const response = await fetch(`/api/scheduler/events/${encodeURIComponent(task.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error(await response.text())
      setEvents((prev) => prev.map((event) => (event.id === task.id ? { ...event, status: nextStatus } : event)))
    } catch (error) {
      alert(`Could not update task: ${String(error)}`)
    }
  }

  async function createCalendarBlockWithTiming(block: { title: string; date: string; description?: string }, startHour: number, endHour?: number) {
    if (!selectedGoal) return
    const [year, month, day] = block.date.split('-').map(Number)
    const start = new Date(year, month - 1, day, startHour, 0, 0)
    const end = new Date(year, month - 1, day, endHour ?? startHour + 1, 0, 0)

    try {
      await fetch('/api/scheduler/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: block.title,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          description: block.description || null,
          itemType: 'event',
          tags: [goalTag(selectedGoal.id), 'goal-calendar'],
        }),
      })
      await loadAll()
      const startStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      const endStr = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `✓ Added "${block.title}" • ${startStr} – ${endStr}` },
      ])
    } catch (error) {
      alert(`Could not create calendar block: ${String(error)}`)
    }
  }

  async function sendGoalChat() {
    if (!selectedGoal) return
    const prompt = chatDraft.trim()
    if (!prompt) return

    const nextMessages: ChatMessage[] = [...chatMessages, { role: 'user', content: prompt }]
    setChatMessages(nextMessages)
    setChatDraft('')
    setSendingChat(true)

    try {
      const response: GoalPlanResponse = await api.goals.plan(selectedGoal.id, {
        message: prompt,
        history: nextMessages.map((message) => ({ role: message.role, content: message.content })),
      })

      // Build assistant message with calendar actions
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.reply || INITIAL_MESSAGE,
        actions: response.calendar_blocks?.map((block) => ({
          id: Math.random().toString(36).slice(2),
          type: 'calendar',
          title: block.title,
          date: block.start_time ? block.start_time.split('T')[0] : '',
          suggestedHour: block.start_time ? new Date(block.start_time).getHours() : undefined,
        })) ?? [],
      }
      setChatMessages((prev) => [...prev, assistantMsg])
      setWeeklyPrompt(response.check_in_prompt || weeklyPrompt)

      // Sync tasks immediately
      if (response.tasks && response.tasks.length > 0) {
        for (const task of response.tasks) {
          await fetch('/api/scheduler/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: task.title,
              start_time: task.due_date || toLocalISOWithOffset(new Date()),
              description: task.note || null,
              itemType: 'task',
              priority: task.priority || 'medium',
              status: 'todo',
              tags: [goalTag(selectedGoal.id)],
            }),
          })
        }
        await loadAll()
      }
    } catch (error) {
      alert(`Could not send message: ${String(error)}`)
    } finally {
      setSendingChat(false)
    }
  }

  return (
    <div className="h-full flex overflow-hidden">
      <aside style={{ width: 320 }} className="h-full overflow-y-auto border-r" aria-label="Goals list">
        <div className="p-4" style={{ background: 'var(--bg-secondary)', height: '100%' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Goals</h2>
            <button
              onClick={() => setShowNew(true)}
              className="rounded-md px-3 py-1 text-sm font-semibold"
              style={{ background: '#00c9a7', color: 'var(--bg-primary)' }}
            >
              + New goal
            </button>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>Active goals</p>
            <div className="mt-3 space-y-2">
              {loading ? (
                <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
              ) : (
                goals
                  .filter((goal) => goal.is_active)
                  .map((goal) => {
                    const progress = computeProgress(goal.id)
                    const priority = computeGoalPriority(goal.id)
                    const isSelected = selectedGoalId === goal.id
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => setSelectedGoalId(goal.id)}
                        className="w-full cursor-pointer p-3 text-left"
                        style={{
                          border: isSelected ? '2px solid #00c9a7' : '1px solid var(--border)',
                          background: isSelected ? 'var(--bg-primary)' : 'transparent',
                          borderRadius: 6,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{goal.goal_text}</div>
                            <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatShortDate(goal.deadline)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: priority === 'high' ? '#ef4444' : priority === 'medium' ? '#f59e0b' : '#00c9a7' }}>
                              {priority.toUpperCase()}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{progress}%</div>
                          </div>
                        </div>
                        <div className="mt-2 h-1 rounded" style={{ background: '#0b2120', overflow: 'hidden' }}>
                          <div style={{ width: `${progress}%`, height: '100%', background: '#00c9a7' }} />
                        </div>
                      </button>
                    )
                  })
              )}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-tertiary)' }}>Completed</p>
            <div className="mt-3 space-y-2 opacity-50">
              {goals.filter((goal) => !goal.is_active).map((goal) => (
                <div key={goal.id} className="p-3" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{goal.goal_text}</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatShortDate(goal.deadline)}</div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="mt-6 w-full rounded border-dashed py-3"
            style={{ border: '1px dashed var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}
          >
            + Create a new goal
          </button>

          {showNew && (
            <div className="mt-4 rounded p-3" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
              <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Create goal</div>
              <input
                ref={nameRef}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Goal name"
                className="mb-2 w-full rounded px-3 py-2"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="mb-2 flex gap-2">
                <select
                  value={newPriority}
                  onChange={(event) => setNewPriority(event.target.value as 'high' | 'medium' | 'low')}
                  className="flex-1 rounded px-2 py-2"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={newDeadline}
                  onChange={(event) => setNewDeadline(event.target.value)}
                  className="rounded px-2 py-2"
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void createGoal()} disabled={creating} className="rounded px-3 py-2" style={{ background: '#00c9a7', color: 'black' }}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="rounded border px-3 py-2" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 h-full overflow-y-auto p-6">
        {!selectedGoal ? (
          <div className="rounded p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            Select a goal to view details.
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* Minimal Header */}
            <div className="pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{selectedGoal.goal_text}</h1>
              <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Due {formatShortDate(selectedGoal.deadline)} • {computeProgress(selectedGoal.id)}% done
              </div>
            </div>

            {/* Large Chat Section */}
            <div className="flex-1 overflow-y-auto mt-3 mb-3 pr-2" style={{ minHeight: 0 }}>
              <div className="space-y-3">
                {chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className="rounded px-3 py-2 max-w-xs text-sm leading-relaxed"
                      style={{
                        background: message.role === 'assistant' ? 'var(--bg-secondary)' : 'rgba(0, 201, 167, 0.12)',
                        border: message.role === 'assistant' ? '1px solid var(--border)' : '1px solid rgba(0, 201, 167, 0.2)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {/* Calendar action cards (after assistant message) */}
                {chatMessages.length > 0 &&
                  chatMessages[chatMessages.length - 1].role === 'assistant' &&
                  chatMessages[chatMessages.length - 1].actions &&
                  chatMessages[chatMessages.length - 1].actions!.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {chatMessages[chatMessages.length - 1].actions!.map((action) => (
                        <div
                          key={action.id}
                          className="rounded p-3"
                          style={{
                            background: 'rgba(0, 201, 167, 0.06)',
                            border: '1px solid rgba(0, 201, 167, 0.15)',
                          }}
                        >
                          <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                            📅 {action.title}
                          </div>
                          <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                            {action.date}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setTimeSelectorOpen({
                                id: action.id,
                                title: action.title,
                                date: action.date,
                              })
                            }
                            className="mt-2 text-xs px-2 py-1 rounded font-semibold"
                            style={{
                              background: '#00c9a7',
                              color: 'black',
                            }}
                          >
                            Choose time
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* Compact Chat Input */}
            <div className="flex gap-2 pb-3">
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendGoalChat()
                  }
                }}
                placeholder="Message AI..."
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button type="button" onClick={() => void sendGoalChat()} disabled={sendingChat} className="rounded px-4 py-2 text-sm font-semibold" style={{ background: '#00c9a7', color: 'black' }}>
                {sendingChat ? '...' : 'Send'}
              </button>
            </div>

            {/* Compact Tasks at Bottom */}
            {selectedGoalTasks.length > 0 && (
              <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  Tasks ({selectedGoalTasks.filter((t) => t.status === 'done').length}/{selectedGoalTasks.length})
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-2">
                  {selectedGoalTasks
                    .sort((a, b) => (a.status === 'done' ? 1 : -1))
                    .map((task) => (
                      <div key={task.id} className="flex items-center gap-2 p-1 rounded" style={{ background: 'var(--bg-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={task.status === 'done'}
                          onChange={() => void toggleTask(task)}
                          style={{ accentColor: '#00c9a7' }}
                        />
                        <div
                          className="flex-1 text-xs"
                          style={{
                            color: task.status === 'done' ? 'var(--text-tertiary)' : 'var(--text-primary)',
                            textDecoration: task.status === 'done' ? 'line-through' : 'none',
                          }}
                        >
                          {task.title}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Time Selector Modal */}
      {timeSelectorOpen && (
        <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.5)', zIndex: 1000 }}>
          <div className="rounded p-4 w-80" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Schedule: {timeSelectorOpen.title}
            </h3>
            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {timeSelectorOpen.date}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                  Start
                </label>
                <select
                  value={selectedStartHour}
                  onChange={(e) => setSelectedStartHour(Number(e.target.value))}
                  className="mt-1 w-full rounded px-2 py-1 text-sm"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  {[...Array(16)].map((_, i) => {
                    const hour = 8 + i
                    const ampm = hour < 12 ? 'AM' : 'PM'
                    const display = hour === 0 ? '12 AM' : hour <= 12 ? `${hour} ${ampm}` : `${hour - 12} ${ampm}`
                    return (
                      <option key={hour} value={hour}>
                        {display}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold" style={{ color: 'var(--text-tertiary)' }}>
                  End
                </label>
                <select
                  value={selectedEndHour}
                  onChange={(e) => setSelectedEndHour(Number(e.target.value))}
                  className="mt-1 w-full rounded px-2 py-1 text-sm"
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  {[...Array(16)].map((_, i) => {
                    const hour = 8 + i
                    const ampm = hour < 12 ? 'AM' : 'PM'
                    const display = hour === 0 ? '12 AM' : hour <= 12 ? `${hour} ${ampm}` : `${hour - 12} ${ampm}`
                    return (
                      <option key={hour} value={hour}>
                        {display}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (timeSelectorOpen) {
                    void createCalendarBlockWithTiming(
                      {
                        title: timeSelectorOpen.title,
                        date: timeSelectorOpen.date,
                      },
                      selectedStartHour,
                      selectedEndHour
                    )
                  }
                  setTimeSelectorOpen(null)
                }}
                className="flex-1 rounded px-3 py-2 text-sm font-semibold"
                style={{ background: '#00c9a7', color: 'black' }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setTimeSelectorOpen(null)}
                className="flex-1 rounded px-3 py-2 text-sm"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
