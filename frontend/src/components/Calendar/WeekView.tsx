'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readSSE } from '@/lib/sse'
import { useRouter, useSearchParams } from 'next/navigation'
import Calendar from 'react-calendar'

type Appointment = {
  id: number | string
  title?: string
  start_time: string
  end_time?: string | null
  status?: string
  customer_name?: string
  customer_email?: string
  note?: string
  category?: string
  location?: string
  itemType?: 'event' | 'task' | null
  source?: 'google' | 'cluster' | string
  habitId?: string | null
  habitLocked?: boolean
  habitOccurrenceAt?: string | null
}

const START_HOUR = 0
const END_HOUR = 24
const HOUR_COUNT = END_HOUR - START_HOUR
const DEFAULT_HOUR_HEIGHT = 40
const MIN_HOUR_HEIGHT = 30
const MAX_HOUR_HEIGHT = 120
const ZOOM_STEP = 15
const TIME_COL = 76
const VIEW_START_MIN = START_HOUR * 60
const VIEW_END_MIN = END_HOUR * 60
const INITIAL_SCROLL_HOUR = 6
const SLOT_SNAP = 30
const DRAG_SNAP_MIN = 15
const DRAG_THRESHOLD_PX = 5
const POPOVER_W = 300
const POPOVER_H = 260
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SIDEBAR_COLLAPSED_KEY = 'clusterSidebarCollapsed'

type CalendarTarget = 'cluster' | 'google'
type ItemKind = 'event' | 'task'

type PopoverState = {
  day: Date
  startMin: number
  endMin: number
  x: number
  y: number
}

function startOfWeek(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekRange(start: Date) {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return `${startLabel} - ${endLabel}`
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}

function formatTimeRange(start: Date, end: Date) {
  const sH = start.getHours()
  const eH = end.getHours()
  const sM = String(start.getMinutes()).padStart(2, '0')
  const eM = String(end.getMinutes()).padStart(2, '0')
  const sP = sH >= 12 ? 'PM' : 'AM'
  const eP = eH >= 12 ? 'PM' : 'AM'
  const sh = sH % 12 || 12
  const eh = eH % 12 || 12
  if (sP === eP) return `${sh}:${sM} – ${eh}:${eM} ${eP}`
  return `${sh}:${sM} ${sP} – ${eh}:${eM} ${eP}`
}

function minToHHMM(total: number) {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hhmmToMin(s: string) {
  const [h, m] = s.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function buildLocalIso(day: Date, totalMinutes: number) {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(totalMinutes)
  return dateToLocalIsoTz(d)
}

function dateToLocalIsoTz(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMin = -d.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMin)
  const offset = `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${offset}`
}

function formatCalendarDateParam(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type SourceKind = 'google' | 'task' | 'habit'

function classifySource(a: Appointment): SourceKind {
  const cat = (a.category || '').toLowerCase()
  const note = (a.note || '').toLowerCase()
  if (
    cat.includes('habit') ||
    cat.includes('recurring') ||
    note.includes('#habit') ||
    note.includes('#recurring')
  ) {
    return 'habit'
  }
  if (a.source === 'cluster') return 'task'
  if (a.source === 'google') return 'google'
  if (a.itemType === 'task') return 'task'
  return 'google'
}

const SOURCE_STYLE: Record<SourceKind, { bg: string; border: string; text: string }> = {
  google: { bg: 'var(--calendar-google-bg)', border: 'var(--calendar-google-border)', text: 'var(--text-primary)' },
  task: { bg: 'var(--calendar-task-bg)', border: 'var(--calendar-task-border)', text: 'var(--text-primary)' },
  habit: { bg: 'var(--calendar-habit-bg)', border: 'var(--calendar-habit-border)', text: 'var(--text-primary)' },
}

const EVENT_COLORS = [
  '#2b7cf6', // blue
  '#0aa98a', // teal
  '#8e44ff', // purple
  '#f97316', // orange
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f59e0b', // amber
]

const EVENT_BORDER_COLORS = [
  '#1e5fd6',
  '#08886f',
  '#6f2ad1',
  '#d65f0a',
  '#c4302f',
  '#0b98a6',
  '#b06f05',
]

function idToIndex(id: number | string) {
  if (typeof id === 'number') return Math.abs(id) % EVENT_COLORS.length
  const s = String(id)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return Math.abs(h) % EVENT_COLORS.length
}

function isLightHex(hex: string) {
  const c = hex.replace('#', '')
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.7
}

function extractAppointments(payload: unknown): Appointment[] {
  if (Array.isArray(payload)) return payload as Appointment[]
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    for (const key of ['data', 'items', 'results', 'appointments']) {
      const val = obj[key]
      if (Array.isArray(val)) return val as Appointment[]
    }
  }
  return []
}

function normalizeSchedulerAppointments(payload: unknown): Appointment[] {
  return extractAppointments(payload).map((item) => ({
    ...item,
    source: 'cluster',
    customer_name: item.customer_name ?? item.title,
    note: item.note ?? item.title,
  }))
}

type DragState = {
  id: number | string
  pointerId: number
  startX: number
  startY: number
  offsetMin: number
  offsetDays: number
  dragging: boolean
}

export default function WeekView({ showDeleteAllEvents = true }: { showDeleteAllEvents?: boolean }) {
  const router = useRouter()
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date())
  const [viewDate, setViewDate] = useState<Date>(() => new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [hourHeight, setHourHeight] = useState(DEFAULT_HOUR_HEIGHT)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [editEvent, setEditEvent] = useState<{ appt: Appointment; x: number; y: number } | null>(null)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'year'>('week')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [aiStreaming, setAiStreaming] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiQuery, setAiQuery] = useState('')
  const [aiResponseTarget, setAiResponseTarget] = useState('')
  const [aiHighlightedId, setAiHighlightedId] = useState<number | string | null>(null)
  const [aiPopup, setAiPopup] = useState<null | { response: string }>(null)
  const [miniCalendarOpen, setMiniCalendarOpen] = useState(false)

  const sendAiQuery = useCallback(async () => {
    const trimmed = aiQuery.trim()
    if (!trimmed || aiStreaming) return
    setAiPopup({ response: '' })
    setAiResponseTarget('')
    const weekStartLocal = startOfWeek(viewDate)
    const weekEndLocal = new Date(weekStartLocal)
    weekEndLocal.setDate(weekStartLocal.getDate() + 7)
    const calendarContext = appointments
      .filter((appt) => appt.start_time)
      .map((appt) => ({ appt, start: new Date(appt.start_time) }))
      .filter(({ start }) => !Number.isNaN(start.getTime()) && start >= weekStartLocal && start < weekEndLocal)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 24)
      .map(({ appt, start }) => {
        const end = appt.end_time ? new Date(appt.end_time) : new Date(start.getTime() + 30 * 60_000)
        const dayLabel = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        const timeLabel = formatTimeRange(start, end)
        const title = appt.note || appt.customer_name || appt.title || 'Event'
        return `${dayLabel} ${timeLabel} - ${title}`
      })
      .join('\n') || 'No visible calendar events in the current week.'
    // detect calendar-focused prompts and highlight matching events
    try {
      const q = trimmed.toLowerCase()
      if (q.includes('calendar') || q.includes('events') || q.includes("what's on")) {
        let targetDate: Date | null = null
        if (q.includes('tomorrow')) {
          targetDate = new Date()
          targetDate.setDate(targetDate.getDate() + 1)
        } else if (q.includes('today')) {
          targetDate = new Date()
        }
        if (targetDate) {
          // find events for that day
          const matches = appointments
            .filter((a) => a.start_time)
            .filter((a) => isSameDay(new Date(a.start_time), targetDate!))
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
          if (matches.length > 0) {
            const appt = matches[0]
            setAiHighlightedId(appt.id)
          } else {
            setAiHighlightedId(null)
          }
        }
      }
    } catch (err) {
      console.warn('AI highlight check failed', err)
    }
    setAiStreaming(true)
    setAiError(null)
    try {
      // readSSE yields streaming events with { delta?: string, done?: boolean }
      // cast to any to iterate
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const ev of (readSSE('/api/cluster/chat', { message: trimmed, calendar_context: calendarContext }) as any)) {
        if (ev?.delta) {
          setAiResponseTarget((prev) => `${prev}${ev.delta}`)
        }
        if (ev?.calendar_refresh) {
          void loadAppointments()
        }
        if (ev?.done) break
      }
    } catch (err: any) {
      setAiError(String(err?.message ?? err))
    } finally {
      setAiStreaming(false)
    }
  }, [aiQuery, aiStreaming, viewDate, appointments])
  const [resettingEvents, setResettingEvents] = useState(false)
  const scrollNodeRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const initializedRef = useRef(false)
  const prevHourHeightRef = useRef(DEFAULT_HOUR_HEIGHT)
  const dragFrameRef = useRef<number | null>(null)
  const dragPointRef = useRef<{ x: number; y: number } | null>(null)
  const openedEventIdRef = useRef<string | null>(null)
  const searchParams = useSearchParams()

  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollNodeRef.current = node
    if (node && !initializedRef.current) {
      node.scrollTop = INITIAL_SCROLL_HOUR * DEFAULT_HOUR_HEIGHT
      initializedRef.current = true
    }
  }, [])

  useEffect(() => {
    const node = scrollNodeRef.current
    const prev = prevHourHeightRef.current
    if (node && prev !== hourHeight) {
      node.scrollTop = (node.scrollTop / prev) * hourHeight
      prevHourHeightRef.current = hourHeight
    }
  }, [hourHeight])

  function zoomOut() {
    setHourHeight((h) => Math.max(MIN_HOUR_HEIGHT, h - ZOOM_STEP))
  }
  function zoomIn() {
    setHourHeight((h) => Math.min(MAX_HOUR_HEIGHT, h + ZOOM_STEP))
  }

  function jumpToToday() {
    setViewDate(new Date())
  }

  function moveWeek(offsetDays: number) {
    setViewDate((date) => {
      const next = new Date(date)
      next.setDate(next.getDate() + offsetDays)
      return next
    })
  }

  function cycleViewMode() {
    const cycle: ('week' | 'month' | 'year')[] = ['week', 'month', 'year']
    const idx = cycle.indexOf(viewMode)
    setViewMode(cycle[(idx + 1) % cycle.length])
  }

  const filteredAppointments = useMemo(() => {
    if (!searchQuery.trim()) return appointments
    const query = searchQuery.toLowerCase()
    return appointments.filter((a) => {
      const title = (a.note || a.customer_name || a.title || '').toLowerCase()
      const email = (a.customer_email || '').toLowerCase()
      const location = (a.location || '').toLowerCase()
      return title.includes(query) || email.includes(query) || location.includes(query)
    })
  }, [appointments, searchQuery])

  // Drag-and-drop / click-to-edit pointer tracking
  useEffect(() => {
    if (!dragState) return
    const startX = dragState.startX
    const startY = dragState.startY
    const pid = dragState.pointerId

    function colWidth() {
      const node = gridRef.current
      if (!node) return 100
      return (node.clientWidth - TIME_COL) / 7
    }

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pid) return
      dragPointRef.current = { x: e.clientX, y: e.clientY }
      if (dragFrameRef.current !== null) return

      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null
        const point = dragPointRef.current
        if (!point) return

        const dx = point.x - startX
        const dy = point.y - startY
        const moved = Math.hypot(dx, dy) > DRAG_THRESHOLD_PX
        const offsetMin = Math.round((dy / hourHeight) * 60 / DRAG_SNAP_MIN) * DRAG_SNAP_MIN
        const offsetDays = Math.round(dx / colWidth())
        setDragState((s) => (s ? { ...s, offsetMin, offsetDays, dragging: s.dragging || moved } : null))
      })
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pid) return
      setDragState((s) => {
        if (!s) return null
        if (s.dragging && (s.offsetMin !== 0 || s.offsetDays !== 0)) {
          void saveEventMove(s.id, s.offsetMin, s.offsetDays)
        } else if (!s.dragging) {
          const appt = appointments.find((a) => a.id === s.id)
          if (appt) setEditEvent({ appt, x: e.clientX, y: e.clientY })
        }
        return null
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current)
        dragFrameRef.current = null
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState?.id, dragState?.pointerId, hourHeight, appointments])

  async function saveEventMove(id: number | string, offsetMin: number, offsetDays: number) {
    const appt = appointments.find((a) => a.id === id)
    if (!appt) return
    const origStart = new Date(appt.start_time)
    const origEnd = appt.end_time ? new Date(appt.end_time) : null
    const newStart = new Date(origStart)
    newStart.setDate(newStart.getDate() + offsetDays)
    newStart.setMinutes(newStart.getMinutes() + offsetMin)
    const newEnd = origEnd ? new Date(origEnd) : null
    if (newEnd) {
      newEnd.setDate(newEnd.getDate() + offsetDays)
      newEnd.setMinutes(newEnd.getMinutes() + offsetMin)
    }
    const newStartIso = dateToLocalIsoTz(newStart)
    const newEndIso = newEnd ? dateToLocalIsoTz(newEnd) : null
    const isClusterEvent = appt.source === 'cluster'
    const updateUrl = isClusterEvent
      ? `/api/scheduler/events/${encodeURIComponent(String(id))}`
      : `/api/appointments/${encodeURIComponent(String(id))}`

    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, start_time: newStartIso, end_time: newEndIso } : a,
      ),
    )

    try {
      const res = await fetch(updateUrl, {
        method: isClusterEvent ? 'PUT' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          start_time: newStartIso,
          end_time: newEndIso ?? undefined,
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`)
      }
      await loadAppointments()
    } catch (err) {
      // revert on failure
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, start_time: appt.start_time, end_time: appt.end_time ?? null }
            : a,
        ),
      )
      const detail = err instanceof Error ? err.message : 'unknown error'
      alert(`Failed to move event: ${detail}`)
    }
  }

  async function saveEventEdit(id: number | string, patch: { title?: string; startMin: number; endMin: number; day: Date }) {
    const startIso = buildLocalIso(patch.day, patch.startMin)
    const endIso = buildLocalIso(patch.day, patch.endMin)
    const prev = appointments.find((a) => a.id === id)
    const appt = appointments.find((a) => a.id === id)
    if (!appt) return
    const isClusterEvent = appt.source === 'cluster'
    const updateUrl = isClusterEvent
      ? `/api/scheduler/events/${encodeURIComponent(String(id))}`
      : `/api/appointments/${encodeURIComponent(String(id))}`

    setAppointments((list) =>
      list.map((a) =>
        a.id === id
          ? { ...a, start_time: startIso, end_time: endIso, note: patch.title ?? a.note }
          : a,
      ),
    )
    setEditEvent(null)
    try {
      const res = await fetch(updateUrl, {
        method: isClusterEvent ? 'PUT' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: patch.title,
          start_time: startIso,
          end_time: endIso,
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`)
      }
      await loadAppointments()
    } catch (err) {
      if (prev) {
        setAppointments((list) => list.map((a) => (a.id === id ? prev : a)))
      }
      const detail = err instanceof Error ? err.message : 'unknown error'
      alert(`Failed to update event: ${detail}`)
    }
  }

  async function deleteEvent(id: number | string) {
    const appt = appointments.find((a) => a.id === id)
    if (!appt) return
    if (!confirm('Delete this event?')) return

    const isClusterEvent = appt.source === 'cluster'
    const deleteUrl = isClusterEvent
      ? `/api/scheduler/events/${encodeURIComponent(String(id))}`
      : `/api/appointments/${encodeURIComponent(String(id))}`

    const original = appointments
    setAppointments((prev) => prev.filter((a) => a.id !== id))
    setEditEvent(null)

    try {
      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`)
      }
      await loadAppointments()
    } catch (err) {
      setAppointments(original)
      const detail = err instanceof Error ? err.message : 'unknown error'
      alert(`Failed to delete event: ${detail}`)
    }
  }

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const eventId = searchParams.get('event')?.trim() ?? ''
    if (!eventId || appointments.length === 0) return
    if (openedEventIdRef.current === eventId) return

    const appt = appointments.find((item) => String(item.id) === eventId)
    if (!appt) return


  useEffect(() => {
    if (searchParams.get('event')) return
    const rawDate = searchParams.get('date')?.trim()
    if (!rawDate) return
    const [year, month, day] = rawDate.split('-').map(Number)
    if ([year, month, day].some((part) => Number.isNaN(part))) return
    const nextDate = new Date(year, month - 1, day)
    if (Number.isNaN(nextDate.getTime())) return

    setViewDate((current) => {
      return isSameDay(current, nextDate) ? current : nextDate
    })
  }, [searchParams])
    const start = new Date(appt.start_time)
    if (!Number.isNaN(start.getTime())) {
      setViewDate(start)
    }

    const x = Math.min(Math.max(window.innerWidth / 2 - POPOVER_W / 2, 12), window.innerWidth - POPOVER_W - 12)
    const y = Math.min(Math.max(window.innerHeight / 2 - POPOVER_H / 2, 12), window.innerHeight - POPOVER_H - 12)
    setEditEvent({ appt, x, y })
    openedEventIdRef.current = eventId
  }, [appointments, searchParams])

  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
    try {
      const [appointmentsRes, schedulerRes] = await Promise.all([
        fetch('/api/appointments?limit=500', {
          credentials: 'include',
          signal,
        }),
        fetch('/api/scheduler/events?limit=500', {
          credentials: 'include',
          signal,
        }),
      ])

      const next = new Map<string, Appointment>()

      if (appointmentsRes.ok) {
        for (const item of extractAppointments(await appointmentsRes.json())) {
          next.set(String(item.id), item)
        }
      }

      if (schedulerRes.ok) {
        for (const item of normalizeSchedulerAppointments(await schedulerRes.json())) {
          next.set(String(item.id), item)
        }
      }

      if (next.size > 0) {
        setAppointments(Array.from(next.values()))
      }
    } catch {
      // ignore aborts and network errors
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadAppointments(controller.signal)
    return () => controller.abort()
  }, [loadAppointments])

  const weekStart = useMemo(() => startOfWeek(viewDate), [viewDate])
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return d
      }),
    [weekStart],
  )

  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  const gridCols = `${TIME_COL}px repeat(7, minmax(0, 1fr))`
  const bodyHeight = HOUR_COUNT * hourHeight
  const weekLabel = formatWeekRange(weekStart)

  useEffect(() => {
    if (!aiPopup) return
    if (aiPopup.response === aiResponseTarget) return

    const timer = window.setInterval(() => {
      setAiPopup((current) => {
        if (!current) return current
        const nextLength = Math.min(current.response.length + 1, aiResponseTarget.length)
        if (nextLength === current.response.length) return current
        return { response: aiResponseTarget.slice(0, nextLength) }
      })
    }, 60)

    return () => window.clearInterval(timer)
  }, [aiPopup, aiResponseTarget])

  function eventsForDay(day: Date) {
    return filteredAppointments.filter((a) => {
      if (!a.start_time) return false
      const start = new Date(a.start_time)
      if (Number.isNaN(start.getTime())) return false
      return isSameDay(start, day)
    })
  }

  function eventGeometry(appt: Appointment) {
    const start = new Date(appt.start_time)
    const end = appt.end_time
      ? new Date(appt.end_time)
      : new Date(start.getTime() + 30 * 60_000)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    const startMin = start.getHours() * 60 + start.getMinutes()
    const endMin = end.getHours() * 60 + end.getMinutes()
    const clampedStart = Math.max(VIEW_START_MIN, startMin)
    const clampedEnd = Math.min(VIEW_END_MIN, endMin)
    if (clampedEnd <= clampedStart) return null
    return {
      start,
      end,
      top: ((clampedStart - VIEW_START_MIN) / 60) * hourHeight,
      height: Math.max(20, ((clampedEnd - clampedStart) / 60) * hourHeight),
    }
  }

  function handleSlotClick(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    if ((e.target as HTMLElement).closest('[data-event="true"]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const minutes = (y / hourHeight) * 60 + VIEW_START_MIN
    const startMin = Math.max(
      VIEW_START_MIN,
      Math.min(VIEW_END_MIN - SLOT_SNAP, Math.round(minutes / SLOT_SNAP) * SLOT_SNAP),
    )
    const endMin = Math.min(VIEW_END_MIN, startMin + 60)
    const px = Math.min(e.clientX, window.innerWidth - POPOVER_W - 12)
    const py = Math.min(e.clientY, window.innerHeight - POPOVER_H - 12)
    setPopover({ day: new Date(day), startMin, endMin, x: px, y: py })
  }

  async function handleCreate(input: {
    title: string
    startMin: number
    endMin: number
    itemType: ItemKind
    target: CalendarTarget
    day: Date
  }) {
    const tempId = `temp-${Date.now()}`
    const startISO = buildLocalIso(input.day, input.startMin)
    const endISO = buildLocalIso(input.day, input.endMin)
    const optimistic: Appointment = {
      id: tempId,
      start_time: startISO,
      end_time: endISO,
      note: input.title,
      itemType: input.itemType,
      category: input.target === 'google' ? 'google' : '',
      source: input.target === 'cluster' ? 'cluster' : 'google',
    }
    setAppointments((prev) => [...prev, optimistic])
    setPopover(null)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: input.title,
          start_time: startISO,
          end_time: endISO,
          itemType: input.itemType,
          source: input.target,
          category: input.target === 'google' ? 'google' : undefined,
        }),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail ? `HTTP ${res.status}: ${detail.slice(0, 200)}` : `HTTP ${res.status}`)
      }
      // Drop the optimistic stub then re-fetch so local state matches the
      // server's canonical record (correct ID, correct UTC-normalized times,
      // correct source tag).
      setAppointments((prev) => prev.filter((a) => a.id !== tempId))
      await loadAppointments()
    } catch (err) {
      setAppointments((prev) => prev.filter((a) => a.id !== tempId))
      const detail = err instanceof Error ? err.message : 'unknown error'
      alert(`Failed to create event: ${detail}`)
    }
  }

  async function handleDeleteAllEvents() {
    if (resettingEvents) return
    if (!confirm('Delete all calendar events? This will wipe the stored calendar data and cannot be undone.')) return

    setResettingEvents(true)
    try {
      const responses = await Promise.all([
        fetch('/api/appointments', {
          method: 'DELETE',
          credentials: 'include',
        }),
        fetch('/api/scheduler/events', {
          method: 'DELETE',
          credentials: 'include',
        }),
      ])

      const failedResponse = responses.find((response) => !response.ok)
      if (failedResponse) {
        const detail = await failedResponse.text().catch(() => '')
        throw new Error(detail ? `HTTP ${failedResponse.status}: ${detail.slice(0, 200)}` : `HTTP ${failedResponse.status}`)
      }

      setAppointments([])
      await loadAppointments()
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'unknown error'
      alert(`Failed to delete all events: ${detail}`)
    } finally {
      setResettingEvents(false)
    }
  }

  return (
    <div className="cluster-week-shell relative" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="cluster-week-toolbar">
        <div className="cluster-week-toolbar-left">
          <div className="cluster-week-nav-group">
            <button type="button" className="cluster-week-pill" onClick={jumpToToday}>
              Today
            </button>
            <div className="cluster-week-stepper">
              <button type="button" className="cluster-week-icon-button" onClick={() => moveWeek(-7)} aria-label="Previous week">
                ‹
              </button>
              <button type="button" className="cluster-week-icon-button" onClick={() => moveWeek(7)} aria-label="Next week">
                ›
              </button>
            </div>
          </div>

          <div className="cluster-week-heading">
            <p className="cluster-main-kicker">Calendar</p>
            <h1>{weekLabel}</h1>
          </div>
        </div>

        <div className="cluster-week-toolbar-right">
          <div className="cluster-week-search-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="cluster-week-icon-button"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Search"
              title="Search events"
            >
              ⌕
            </button>
            {searchOpen && (
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="cluster-week-search-input"
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  width: '200px',
                }}
                autoFocus
              />
            )}
          </div>
          <button
            type="button"
            className="cluster-week-view-chip"
            onClick={cycleViewMode}
            aria-label="Change view"
            title="Cycle through Week, Month, Year"
          >
            {viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
          </button>
          {showDeleteAllEvents ? (
            <button
              type="button"
              className="cluster-calendar-reset-button cluster-week-view-chip"
              onClick={handleDeleteAllEvents}
              disabled={resettingEvents}
              aria-label="Delete all events"
              title="Delete all events"
            >
              {resettingEvents ? 'Deleting…' : 'Delete all events'}
            </button>
          ) : null}
          <button type="button" className="cluster-week-icon-button" aria-label="Apps">
            ⠿
          </button>
          <div className="cluster-week-zoom-group">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={zoomOut}
              disabled={hourHeight <= MIN_HOUR_HEIGHT}
              className="cluster-week-icon-button"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={zoomIn}
              disabled={hourHeight >= MAX_HOUR_HEIGHT}
              className="cluster-week-icon-button"
            >
              +
            </button>
          </div>
        </div>
      </div>
      {aiPopup ? (
        <div className={`cluster-ai-popup ${aiStreaming ? 'is-streaming' : ''}`} role="dialog" aria-live="polite">
          <div className="cluster-ai-popup-response">
            <span>{aiPopup.response}</span>
            {aiStreaming ? <span className="cluster-ai-popup-caret">▍</span> : null}
          </div>
          {aiError ? <div className="cluster-ai-popup-error">{aiError}</div> : null}
        </div>
      ) : null}

      <div
        className="cluster-week-mini-calendar-fab"
        onMouseEnter={() => setMiniCalendarOpen(true)}
        onMouseLeave={() => setMiniCalendarOpen(false)}
      >
        <button
          type="button"
          className="cluster-week-mini-calendar-button"
          aria-label="Open month calendar"
          title="Open month calendar"
          onClick={() => setMiniCalendarOpen((open) => !open)}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
            <path d="M2 6.5H14M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </button>

        {miniCalendarOpen ? (
          <div className="cluster-week-mini-calendar-popover" onClick={(e) => e.stopPropagation()}>
            <div className="cluster-week-mini-calendar-header">
              <span>Jump to date</span>
              <strong>{viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
            </div>
            <Calendar
              className="cluster-calendar cluster-week-mini-calendar"
              value={viewDate}
              onClickDay={(value) => {
                setMiniCalendarOpen(false)
                setViewDate(value)
                router.push(`/calendar?date=${formatCalendarDateParam(value)}`)
              }}
              minDetail="month"
              maxDetail="month"
              showNavigation={false}
              showFixedNumberOfWeeks
            />
          </div>
        ) : null}
      </div>

      <div className="cluster-week-frame">
        <div
          className="cluster-week-header grid flex-shrink-0"
          style={{
            gridTemplateColumns: gridCols,
            background: 'var(--bg-primary)',
            borderBottom: '1px solid var(--calendar-line)',
          }}
        >
          <div className="cluster-week-time-gutter" />
          {days.map((day, i) => {
            const today = isSameDay(day, currentTime)
            return (
              <div
                key={i}
                className={`cluster-week-day-head ${today ? 'is-today' : ''}`}
                style={{ borderLeft: '1px solid var(--calendar-line)' }}
              >
                <div className="cluster-week-day-name">{DAY_NAMES[day.getDay()]}</div>
                <div className="cluster-week-day-number">{day.getDate()}</div>
              </div>
            )
          })}
        </div>

        <div ref={setScrollNode} className="cluster-week-scroll flex-1 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
          <div ref={gridRef} className="grid cluster-week-grid" style={{ gridTemplateColumns: gridCols, height: bodyHeight }}>
            <div className="relative">
              {Array.from({ length: HOUR_COUNT }, (_, i) => {
                const hour = START_HOUR + i
                return (
                  <div
                    key={hour}
                    className="cluster-week-hour-label absolute left-0 right-0 pr-3 text-right text-[11px] font-medium"
                    style={{
                      top: i * hourHeight + 4,
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {formatHourLabel(hour)}
                  </div>
                )
              })}
            </div>

            {days.map((day, i) => {
              const today = isSameDay(day, currentTime)
              const showNow = today && nowMinutes >= VIEW_START_MIN && nowMinutes <= VIEW_END_MIN
              const nowTop = showNow ? ((nowMinutes - VIEW_START_MIN) / 60) * hourHeight : 0
              return (
                <div
                  key={i}
                  className={`cluster-week-day-column relative cursor-pointer ${today ? 'is-today' : ''}`}
                  style={{ borderLeft: '1px solid var(--calendar-line)' }}
                  onClick={(e) => handleSlotClick(e, day)}
                >
                  {Array.from({ length: HOUR_COUNT - 1 }, (_, h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute left-0 right-0"
                      style={{
                        top: (h + 1) * hourHeight,
                        borderTop: '1px solid var(--calendar-line-strong)',
                        opacity: 0.85,
                      }}
                    />
                  ))}

                  {eventsForDay(day).map((appt) => {
                    const geom = eventGeometry(appt)
                    if (!geom) return null
                    const isDueDate = appt.category === 'due-date'
                    const title = isDueDate
                      ? appt.customer_name || appt.note || appt.title || 'Due date'
                      : appt.note || appt.customer_name || appt.title || 'Event'
                    const kind = classifySource(appt)
                    const palette = SOURCE_STYLE[kind]
                    // Determine a solid color for the event. Habits always use the dedicated habit color.
                    let assignedBg: string
                    let assignedBorder: string
                    if (kind === 'habit') {
                      assignedBg = '#8e44ff'
                      assignedBorder = '#6f2ad1'
                    } else {
                      const idx = idToIndex(appt.id)
                      assignedBg = EVENT_COLORS[idx]
                      assignedBorder = EVENT_BORDER_COLORS[idx]
                    }
                    const assignedText = isLightHex(assignedBg) ? '#071018' : '#ffffff'
                    const isDragging = !isDueDate && dragState?.id === appt.id && dragState.dragging
                    const dragOffsetMin = isDragging ? dragState!.offsetMin : 0
                    const dragOffsetDays = isDragging ? dragState!.offsetDays : 0
                    const isHabit = appt.habitId != null || String(appt.itemType) === 'habit'
                    const isLockedHabit = Boolean(appt.habitLocked && isHabit)
                    const isAiHighlighted = aiHighlightedId != null && String(aiHighlightedId) === String(appt.id)
                    const displayStart = isDragging
                      ? new Date(geom.start.getTime() + dragOffsetMin * 60_000)
                      : geom.start
                    const displayEnd = isDragging
                      ? new Date(geom.end.getTime() + dragOffsetMin * 60_000)
                      : geom.end
                    const range = formatTimeRange(displayStart, displayEnd)
                    const compact = geom.height < 38
                    const translateY = (dragOffsetMin / 60) * hourHeight
                    return (
                      <div
                        key={appt.id}
                        data-event="true"
                        data-source={kind}
                        onPointerDown={(e) => {
                          if (isDueDate) return
                          if (e.button !== 0) return
                          e.stopPropagation()
                          e.preventDefault()
                          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                          setDragState({
                            id: appt.id,
                            pointerId: e.pointerId,
                            startX: e.clientX,
                            startY: e.clientY,
                            offsetMin: 0,
                            offsetDays: 0,
                            dragging: false,
                          })
                        }}
                        className="absolute select-none overflow-hidden rounded-lg leading-tight shadow-sm"
                        style={{
                          top: geom.top + 1,
                          height: geom.height - 2,
                          left: 4,
                          right: 4,
                          /* use assigned solid colors */
                          background: assignedBg,
                          color: assignedText,
                          borderLeft: `3px solid ${assignedBorder}`,
                          border: isDueDate ? '1px dashed rgba(255,255,255,0.18)' : undefined,
                          padding: compact ? '2px 6px' : '4px 8px',
                          zIndex: isDragging ? 6 : 2,
                          cursor: isDueDate ? 'default' : isDragging ? 'grabbing' : 'grab',
                          opacity: isDragging ? 0.92 : 1,
                          boxShadow: isDragging
                            ? '0 8px 16px rgba(0,0,0,0.35)'
                            : isAiHighlighted
                              ? '0 14px 36px rgba(13,148,136,0.18)'
                              : undefined,
                          transform: isDragging
                            ? `translate(${dragOffsetDays * 100}%, ${translateY}px)`
                            : isAiHighlighted
                              ? 'translateY(-2px) scale(1.02)'
                              : undefined,
                          transition: isDragging ? 'none' : 'transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease',
                          willChange: isDragging ? 'transform, opacity' : 'auto',
                          transformOrigin: 'center center',
                          touchAction: 'none',
                        }}
                        title={`${title} • ${range}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="truncate text-[12px] font-semibold">{title}</div>
                          {isLockedHabit ? (
                            <span
                              className="shrink-0 rounded-full border border-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] opacity-90"
                              title="This habit occurrence is locked in place"
                            >
                              Locked
                            </span>
                          ) : null}
                          {isDueDate && (
                            <span className="shrink-0 rounded-full border border-current/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] opacity-90">
                              Due
                            </span>
                          )}
                        </div>
                        {!compact && <div className="truncate text-[10px] opacity-90">{range}</div>}
                      </div>
                    )
                  })}

                  {showNow && (
                    <div className="pointer-events-none absolute left-0 right-0" style={{ top: nowTop, zIndex: 5 }}>
                      <div
                        style={{
                          height: 0,
                          borderTop: '3px solid var(--accent)',
                          boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.18)',
                        }}
                      />
                      <div
                        className="absolute"
                        style={{
                          top: -5,
                          left: -5,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {popover && (
        <NewEventPopover
          state={popover}
          onCancel={() => setPopover(null)}
          onCreate={handleCreate}
        />
      )}

      {editEvent && (
        <EditEventPopover
          appt={editEvent.appt}
          x={editEvent.x}
          y={editEvent.y}
          onCancel={() => setEditEvent(null)}
          onSave={(patch) => saveEventEdit(editEvent.appt.id, patch)}
          onDelete={() => deleteEvent(editEvent.appt.id)}
        />
      )}

      {/* Ask AI bar (bottom-left overlay of calendar) */}
      <div className="cluster-ask-ai-bar" role="search" aria-label="Ask AI">
        <input
          type="text"
          placeholder="Ask AI to plan your day, move events or schedule a goal..."
          value={aiQuery}
          onChange={(e) => setAiQuery(e.target.value)}
          onKeyDown={(e) => {
            // Prevent parent handlers from treating this as the calendar search
            e.stopPropagation()
            if (e.key === 'Enter') {
              e.preventDefault()
              void sendAiQuery()
            }
          }}
          aria-label="Ask AI"
        />
        <button
          type="button"
          className={`cluster-ask-ai-button ${aiStreaming ? 'is-streaming' : ''}`}
          onClick={() => {
            void sendAiQuery()
          }}
          disabled={aiStreaming || !aiQuery.trim()}
          aria-label="Send to AI"
        >
          {aiStreaming ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function NewEventPopover({
  state,
  onCancel,
  onCreate,
}: {
  state: PopoverState
  onCancel: () => void
  onCreate: (input: {
    title: string
    startMin: number
    endMin: number
    itemType: ItemKind
    target: CalendarTarget
    day: Date
  }) => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [startStr, setStartStr] = useState(() => minToHHMM(state.startMin))
  const [endStr, setEndStr] = useState(() => minToHHMM(state.endMin))
  const [itemType, setItemType] = useState<ItemKind>('event')
  const [target, setTarget] = useState<CalendarTarget>('cluster')
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function submit() {
    if (submitting) return
    const trimmed = title.trim()
    if (!trimmed) {
      titleRef.current?.focus()
      return
    }
    const startMin = hhmmToMin(startStr)
    const endMin = hhmmToMin(endStr)
    if (startMin == null || endMin == null) return
    if (endMin <= startMin) return
    setSubmitting(true)
    await onCreate({
      title: trimmed,
      startMin,
      endMin,
      itemType,
      target,
      day: state.day,
    })
    setSubmitting(false)
  }

  const dateLabel = state.day.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        className="fixed z-50 rounded-xl shadow-2xl"
        style={{
          left: state.x,
          top: state.y,
          width: POPOVER_W,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mb-2 text-[11px] uppercase tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          New {itemType} • {dateLabel}
        </div>

        <input
          ref={titleRef}
          type="text"
          value={title}
          placeholder="Title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          className="mb-3 w-full rounded-md px-2 py-2 text-sm outline-none"
          style={{
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
              Start
            </span>
            <input
              type="time"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
              End
            </span>
            <input
              type="time"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </label>
        </div>

        <div className="mb-3 flex gap-2">
          {(['event', 'task'] as ItemKind[]).map((opt) => {
            const active = itemType === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setItemType(opt)}
                className="flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-primary)',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {opt}
              </button>
            )
          })}
        </div>

        <label className="mb-3 flex flex-col gap-1">
          <span className="text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
            Calendar
          </span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as CalendarTarget)}
            className="rounded-md px-2 py-1.5 text-sm outline-none"
            style={{
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <option value="cluster">Cluster</option>
            <option value="google">Google Calendar</option>
          </select>
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: 'transparent',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !title.trim()}
            className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              border: '1px solid var(--accent)',
            }}
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </>
  )
}

function EditEventPopover({
  appt,
  x,
  y,
  onCancel,
  onSave,
  onDelete,
}: {
  appt: Appointment
  x: number
  y: number
  onCancel: () => void
  onSave: (patch: { title?: string; startMin: number; endMin: number; day: Date }) => void | Promise<void>
  onDelete: () => void | Promise<void>
}) {
  const startDate = new Date(appt.start_time)
  const endDate = appt.end_time ? new Date(appt.end_time) : new Date(startDate.getTime() + 30 * 60_000)
  const initialDay = new Date(startDate)
  initialDay.setHours(0, 0, 0, 0)

  const [title, setTitle] = useState(appt.note || appt.customer_name || '')
  const [startStr, setStartStr] = useState(
    () => minToHHMM(startDate.getHours() * 60 + startDate.getMinutes()),
  )
  const [endStr, setEndStr] = useState(
    () => minToHHMM(endDate.getHours() * 60 + endDate.getMinutes()),
  )
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  async function submit() {
    if (submitting) return
    const startMin = hhmmToMin(startStr)
    const endMin = hhmmToMin(endStr)
    if (startMin == null || endMin == null) return
    if (endMin <= startMin) return
    setSubmitting(true)
    await onSave({ title: title.trim() || undefined, startMin, endMin, day: initialDay })
    setSubmitting(false)
  }

  const px = Math.min(x, window.innerWidth - POPOVER_W - 12)
  const py = Math.min(y, window.innerHeight - POPOVER_H - 12)
  const dateLabel = startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onCancel} />
      <div
        className="fixed z-50 rounded-xl shadow-2xl"
        style={{
          left: px,
          top: py,
          width: POPOVER_W,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          padding: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mb-2 text-[11px] uppercase tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Edit • {dateLabel}
        </div>

        <input
          ref={titleRef}
          type="text"
          value={title}
          placeholder="Title"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          className="mb-3 w-full rounded-md px-2 py-2 text-sm outline-none"
          style={{
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
              Start
            </span>
            <input
              type="time"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase" style={{ color: 'var(--text-tertiary)' }}>
              End
            </span>
            <input
              type="time"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              className="rounded-md px-2 py-1.5 text-sm outline-none"
              style={{
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
          </label>
        </div>

        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-3 py-1.5 text-xs font-medium"
            style={{
              background: 'transparent',
              color: 'var(--danger)',
              border: '1px solid var(--border)',
            }}
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{
                background: 'var(--accent)',
                color: 'var(--text-on-accent)',
                border: '1px solid var(--accent)',
              }}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
