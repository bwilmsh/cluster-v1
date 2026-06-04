'use client'
import React, { useEffect, useMemo, useState } from 'react'
import EventModal from '../Scheduler/EventModal'
import TaskList from './TaskList'
import EventList from './EventList'
import { toLocalISOWithOffset } from '../../lib/time'

type Item = {
  id: string
  title: string
  description?: string
  start_time: string
  end_time?: string
  location?: string
  status?: string
  priority?: string
  assignee?: string
  tags?: string[]
  itemType?: string
  createdAt?: string
}

function startOfWeekMon(d: Date) {
  const x = new Date(d)
  const day = x.getDay()
  const diff = x.getDate() - day + (day === 0 ? -6 : 1)
  x.setDate(diff)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function TodayView() {
  const [items, setItems] = useState<Item[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<any>(null)

  async function load() {
    setLoadError(null)
    try {
      const r = await fetch('/api/scheduler/events')
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load Today data', err)
      setLoadError("Couldn't load — retry")
    }
  }

  useEffect(() => {
    load()
  }, [])

  const now = useMemo(() => new Date(), [])
  const weekStart = useMemo(() => startOfWeekMon(now), [now])
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart)
    e.setDate(weekStart.getDate() + 6)
    e.setHours(23, 59, 59, 999)
    return e
  }, [weekStart])
  const todayEnd = useMemo(() => endOfDay(now), [now])

  const tasks = useMemo(
    () =>
      items
        .filter((i) => i.itemType === 'task' && i.status !== 'done')
        .sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return tb - ta
        }),
    [items]
  )

  const todaysEvents = useMemo(
    () =>
      items
        .filter((i) => i.itemType !== 'task' && isSameDay(new Date(i.start_time), now))
        .sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ),
    [items, now]
  )

  const restOfWeekEvents = useMemo(
    () =>
      items
        .filter((i) => {
          if (i.itemType === 'task') return false
          const d = new Date(i.start_time)
          return d > todayEnd && d <= weekEnd
        })
        .sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        ),
    [items, todayEnd, weekEnd]
  )

  async function createTaskQuick(title: string) {
    const tempId = `temp-${Date.now()}`
    const nowDate = new Date()
    const nowIso = toLocalISOWithOffset(nowDate)
    const optimistic: Item = {
      id: tempId,
      title,
      itemType: 'task',
      status: 'todo',
      start_time: nowIso,
      createdAt: nowDate.toISOString(),
    }
    setItems((prev) => [optimistic, ...prev])
    try {
      const r = await fetch('/api/scheduler/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          itemType: 'task',
          status: 'todo',
          start_time: nowIso,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      await load()
    } catch (err) {
      console.error('Create task failed', err)
      setItems((prev) => prev.filter((p) => p.id !== tempId))
      alert('Could not add task: ' + String(err))
    }
  }

  function openCreateTaskModal() {
    setEditing({
      itemType: 'task',
      status: 'todo',
      start_time: toLocalISOWithOffset(new Date()),
    })
  }

  async function toggleTaskDone(id: string) {
    const prev = items
    setItems((curr) => curr.filter((i) => i.id !== id))
    try {
      const r = await fetch(`/api/scheduler/events/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!r.ok) throw new Error(await r.text())
    } catch (err) {
      console.error('Toggle done failed', err)
      setItems(prev)
      alert('Could not complete task: ' + String(err))
    }
  }

  function openEditItem(id: string) {
    const it = items.find((i) => i.id === id)
    if (!it) return
    setEditing({
      id: it.id,
      title: it.title,
      description: it.description,
      start_time: it.start_time,
      end_time: it.end_time,
      location: it.location,
      status: it.status,
      priority: it.priority,
      assignee: it.assignee,
      tags: it.tags,
      itemType: it.itemType,
    })
  }

  async function handleModalSave(payload: any) {
    try {
      const isCreate = !editing?.id
      const merged = isCreate
        ? { ...payload, itemType: editing?.itemType ?? payload.itemType ?? 'event' }
        : payload
      const url = isCreate
        ? '/api/scheduler/events'
        : `/api/scheduler/events/${encodeURIComponent(editing.id)}`
      const r = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      })
      if (!r.ok) throw new Error(await r.text())
      setEditing(null)
      await load()
    } catch (err) {
      alert('Save failed: ' + String(err))
    }
  }

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const dateISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div
          className="w-[3px] h-10 rounded-sm shrink-0"
          style={{ background: 'var(--accent)' }}
        />
        <div>
          <time
            dateTime={dateISO}
            className="text-[13px] tabular-nums block leading-tight"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {dateLabel}
          </time>
          <h1
            className="text-2xl font-bold leading-tight mt-0.5"
            style={{ color: 'var(--text-primary)' }}
          >
            Today
          </h1>
        </div>
      </div>

      {loadError && (
        <div
          className="rounded-lg p-3 flex items-center justify-between text-sm"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <span>{loadError}</span>
          <button
            onClick={load}
            className="text-sm px-3 py-1 rounded"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Two-column grid; stacks on narrow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TaskList
          tasks={tasks}
          onCreate={createTaskQuick}
          onOpenFullModal={openCreateTaskModal}
          onToggleDone={toggleTaskDone}
          onEdit={openEditItem}
        />
        <EventList
          todaysEvents={todaysEvents}
          restOfWeekEvents={restOfWeekEvents}
          onEdit={openEditItem}
        />
      </div>

      {editing && (
        <EventModal
          event={editing}
          onSave={handleModalSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
