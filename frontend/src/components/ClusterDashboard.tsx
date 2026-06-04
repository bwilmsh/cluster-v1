'use client'

import { useEffect, useMemo, useState } from 'react'
import Calendar from 'react-calendar'

type Appointment = {
  id: number | string
  start_time: string
  end_time?: string
  status?: string
  customer_name?: string
  customer_email?: string
  note?: string
  category?: string
  location?: string
  itemType?: 'event' | 'task' | null
}

type GoogleIntegrationInfo = {
  accountEmail?: string | null
  accountName?: string | null
  expiresAt?: string | null
}

type CreationMode = 'event' | 'task'

const EVENT_CATEGORIES = ['Business', 'Personal', 'Chore']

function EventDrawer({
  open,
  anchor,
  dateLabel,
  eventTitle,
  eventNote,
  eventTime,
  eventEndTime,
  eventLocation,
  eventCategory,
  creationMode,
  saveEventError,
  savingEvent,
  onClose,
  onSubmit,
  onEventTitleChange,
  onEventNoteChange,
  onEventTimeChange,
  onEventEndTimeChange,
  onEventLocationChange,
  onEventCategoryChange,
  onCreationModeChange,
}: {
  open: boolean
  anchor: { x: number; y: number }
  dateLabel: string
  eventTitle: string
  eventNote: string
  eventTime: string
  eventEndTime: string
  eventLocation: string
  eventCategory: string
  creationMode: CreationMode
  saveEventError: string | null
  savingEvent: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onEventTitleChange: (value: string) => void
  onEventNoteChange: (value: string) => void
  onEventTimeChange: (value: string) => void
  onEventEndTimeChange: (value: string) => void
  onEventLocationChange: (value: string) => void
  onEventCategoryChange: (value: string) => void
  onCreationModeChange: (value: CreationMode) => void
}) {
  return (
    <aside
      className={`cluster-event-drawer ${open ? 'is-open' : ''}`}
      aria-hidden={!open}
      style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
    >
      <div className="cluster-event-drawer-shell">
        <div className="cluster-event-drawer-header">
          <div>
            <p className="cluster-event-drawer-kicker">New {creationMode === 'task' ? 'Task' : 'Event'}</p>
            <h3>Add {creationMode === 'task' ? 'Task' : 'Event'} for {dateLabel}</h3>
          </div>
          <button type="button" className="cluster-event-drawer-close" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onCreationModeChange('event')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${creationMode === 'event' ? 'bg-accent text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Event
            </button>
            <button
              type="button"
              onClick={() => onCreationModeChange('task')}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${creationMode === 'task' ? 'bg-accent text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Task
            </button>
          </div>
          <p className="mt-2 px-1 text-xs text-white/35">
            {creationMode === 'task'
              ? 'Tasks use the same time and details, but they are labeled and grouped separately.'
              : 'Events are standard calendar entries.'}
          </p>
        </div>

        <form className="cluster-event-form" onSubmit={onSubmit}>
          <label>
            <span>Event Name</span>
            <input
              type="text"
              value={eventTitle}
              onChange={(e) => onEventTitleChange(e.target.value)}
              placeholder="Lunch with Sarah"
              required
            />
          </label>

          <label>
            <span>Notes</span>
            <textarea
              value={eventNote}
              onChange={(e) => onEventNoteChange(e.target.value)}
              placeholder="Add details, links, agenda, or reminders"
              rows={3}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label>
              <span>Start time</span>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => onEventTimeChange(e.target.value)}
                required
              />
            </label>

            {creationMode === 'event' ? (
              <label>
                <span>End time</span>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => onEventEndTimeChange(e.target.value)}
                  required
                />
              </label>
            ) : (
              <label>
                <span className="text-white/50">End time</span>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => onEventEndTimeChange(e.target.value)}
                  aria-hidden
                />
              </label>
            )}
          </div>

          <label>
            <span>Location</span>
            <input
              type="text"
              value={eventLocation}
              onChange={(e) => onEventLocationChange(e.target.value)}
              placeholder="Office, cafe, Zoom link, or address"
            />
          </label>

          <label>
            <span>Category</span>
            <select value={eventCategory} onChange={(e) => onEventCategoryChange(e.target.value)}>
              {EVENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          {saveEventError ? <p className="cluster-error">{saveEventError}</p> : null}

          <div className="cluster-drawer-actions">
            <button type="button" className="cluster-drawer-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cluster-drawer-primary" disabled={savingEvent}>
              {savingEvent ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </aside>
  )
}

function normalizeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    for (const key of ['data', 'items', 'results', 'appointments', 'memories']) {
      if (Array.isArray(record[key])) return record[key] as T[]
    }
  }
  return []
}

function dateKey(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fmtDate(value: Date): string {
  return value.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function toDateInputValue(value: Date): string {
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizedCategory(value?: string): string {
  return String(value ?? '').trim().toLowerCase()
}

function categoryBadgeClassName(value?: string): string {
  const category = normalizedCategory(value)
  if (category === 'business') return 'cluster-event-category-badge is-business'
  if (category === 'personal') return 'cluster-event-category-badge is-personal'
  if (category === 'chore') return 'cluster-event-category-badge is-chore'
  return 'cluster-event-category-badge'
}

async function fetchEvents(): Promise<Appointment[]> {
  const response = await fetch('/api/appointments?limit=500', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
    const message = typeof payload?.error === 'string' ? payload.error : 'Failed to load appointments'
    const details = typeof payload?.details === 'string' ? payload.details : ''
    throw new Error(details ? `${message}: ${details}` : message)
  }

  const raw = (await response.json()) as unknown
  return normalizeArray<Appointment>(raw)
}

function addMinutesToTime(time: string, minutes: number): string {
  const parsed = new Date(`1970-01-01T${time}`)
  if (Number.isNaN(parsed.getTime())) return time
  parsed.setMinutes(parsed.getMinutes() + minutes)
  const hours = String(parsed.getHours()).padStart(2, '0')
  const mins = String(parsed.getMinutes()).padStart(2, '0')
  return `${hours}:${mins}`
}

function compareDateTime(dateValue: string, startTime: string, endTime: string) {
  const start = new Date(`${dateValue}T${startTime}`)
  const end = new Date(`${dateValue}T${endTime}`)
  return start.getTime() - end.getTime()
}

function localDateTimeToIso(dateValue: string, timeValue: string): string | null {
  const cleanDate = String(dateValue).trim()
  const cleanTime = String(timeValue).trim()
  if (!cleanDate || !cleanTime) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null

  const withSeconds = /^\d{2}:\d{2}:\d{2}$/.test(cleanTime) ? cleanTime : /^\d{2}:\d{2}$/.test(cleanTime) ? `${cleanTime}:00` : null
  if (!withSeconds) return null

  const candidate = `${cleanDate}T${withSeconds}`
  const parsed = new Date(candidate)
  if (Number.isNaN(parsed.getTime())) return null
  return candidate
}

export function ClusterDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creationMode, setCreationMode] = useState<CreationMode>('event')
  const [eventDate, setEventDate] = useState<string>(toDateInputValue(new Date()))
  const [eventTime, setEventTime] = useState<string>('09:00')
  const [eventEndTime, setEventEndTime] = useState<string>('10:00')
  const [eventTitle, setEventTitle] = useState<string>('')
  const [eventNote, setEventNote] = useState<string>('')
  const [eventLocation, setEventLocation] = useState<string>('')
  const [eventCategory, setEventCategory] = useState<string>('Business')
  const [showEventModal, setShowEventModal] = useState(false)
  const [drawerAnchor, setDrawerAnchor] = useState<{ x: number; y: number }>({ x: 320, y: 180 })
  const [savingEvent, setSavingEvent] = useState(false)
  const [hoveredTimePreview, setHoveredTimePreview] = useState<Date | null>(null)
  const [saveEventError, setSaveEventError] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [resettingEvents, setResettingEvents] = useState(false)
  const [showUpcomingDropdown, setShowUpcomingDropdown] = useState(false)

  const UPCOMING_COLLAPSE_THRESHOLD = 2

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const integrationResponse = await fetch('/api/oauth/google/status')
        const integrationPayload = (await integrationResponse.json().catch(() => null)) as {
          connected?: boolean
          integration?: GoogleIntegrationInfo | null
        } | null
        if (!cancelled) {
          setHasGoogleCalendar(Boolean(integrationPayload?.connected))
        }

        const events = await fetchEvents()
        if (cancelled) return
        setAppointments(events)
      } catch {
        if (cancelled) return
        setError('Could not load calendar events.')
      } finally {
        if (cancelled) return
        setLoading(false)
      }
    }

    loadData()

    const intervalId = window.setInterval(loadData, 60_000)
    const handleFocus = () => loadData()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData()
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

  useEffect(() => {
    setEventDate(toDateInputValue(selectedDate))
  }, [selectedDate])

  const bookedDateSet = useMemo(() => {
    const set = new Set<string>()
    for (const event of appointments) {
      const d = new Date(event.start_time)
      if (!Number.isNaN(d.getTime())) set.add(dateKey(d))
    }
    return set
  }, [appointments])

  const selectedDateAppointments = useMemo(() => {
    const key = dateKey(selectedDate)
    return appointments
      .filter((event) => {
        const d = new Date(event.start_time)
        return !Number.isNaN(d.getTime()) && dateKey(d) === key
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [appointments, selectedDate])

  const eventsByHour = useMemo(() => {
    const map = new Map<number, Appointment[]>()
    for (const event of selectedDateAppointments) {
      const d = new Date(event.start_time)
      if (Number.isNaN(d.getTime())) continue
      const hour = d.getHours()
      const items = map.get(hour) ?? []
      items.push(event)
      map.set(hour, items)
    }
    return map
  }, [selectedDateAppointments])

  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    const twoDaysOut = now + 2 * 24 * 60 * 60 * 1000

    return appointments
      .filter((event) => {
        const start = new Date(event.start_time).getTime()
        return Number.isFinite(start) && start >= now && start <= twoDaysOut
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [appointments])

  const selectedDateEvents = useMemo(() => {
    const selectedKey = dateKey(selectedDate)
    return appointments
      .filter((event) => {
        const d = new Date(event.start_time)
        return !Number.isNaN(d.getTime()) && dateKey(d) === selectedKey
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [appointments, selectedDate])

  const calendarTileClass = ({ date, view }: { date: Date; view: string }): string | null => {
    if (view !== 'month') return null
    return bookedDateSet.has(dateKey(date)) ? 'cluster-booked-date' : null
  }

  const calendarTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month' || !bookedDateSet.has(dateKey(date))) return null
    return <span className="cluster-booked-dot" />
  }

  function openAddEventForSelectedDate(date: Date = selectedDate) {
    setEventDate(toDateInputValue(date))
    setEventTime('09:00')
    setEventEndTime('10:00')
    setEventTitle('')
    setEventNote('')
    setEventLocation('')
    setEventCategory('Business')
    setCreationMode('event')
    setSaveEventError(null)
    setShowEventModal(true)
  }

  async function handleAddEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveEventError(null)

    if (!eventDate || !eventTime) {
      setSaveEventError('Event date and time are required.')
      return
    }

    if (creationMode === 'event' && compareDateTime(eventDate, eventTime, eventEndTime) >= 0) {
      setSaveEventError('End time must be after start time.')
      return
    }

    const normalizedTitle = eventTitle.trim()
    if (!normalizedTitle) {
      setSaveEventError('Event name is required.')
      return
    }

    setSavingEvent(true)
    try {
      const startIso = localDateTimeToIso(eventDate, eventTime)
      if (!startIso) {
        setSaveEventError('Invalid start date/time.')
        return
      }

      const payloadBody: Record<string, unknown> = {
        itemType: creationMode,
        start_time: startIso,
        date: eventDate,
        time: eventTime,
        note: eventNote.trim(),
        category: normalizedCategory(eventCategory),
        location: eventLocation.trim(),
        customer_name: normalizedTitle,
      }

      if (creationMode === 'event') {
        const endIso = localDateTimeToIso(eventDate, eventEndTime)
        if (!endIso) {
          setSaveEventError('Invalid end date/time.')
          return
        }
        payloadBody.end_time = endIso
      }

      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payloadBody),
      })

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Could not create event.'
        const details = typeof payload?.details === 'string' ? payload.details : undefined
        const combined = details ? `${message}: ${details}` : message
        console.error('Create event failed', { status: response.status, payload })
        setSaveEventError(combined)
        return
      }

      await fetchEvents().then(setAppointments)
      setEventTitle('')
      setEventNote('')
      setEventLocation('')
      setEventCategory('Business')
      setEventEndTime('10:00')
      setCreationMode('event')
      setShowEventModal(false)
    } catch (saveError) {
      setSaveEventError(saveError instanceof Error ? saveError.message : 'Could not create event.')
    } finally {
      setSavingEvent(false)
    }
  }

  async function handleDeleteEvent(eventToDelete: Appointment) {
    const eventId = String(eventToDelete.id)
    setDeletingEventId(eventId)

    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
        const message = typeof payload?.error === 'string' ? payload.error : 'Could not delete event.'
        throw new Error(message)
      }

      await fetchEvents().then(setAppointments)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete event.')
    } finally {
      setDeletingEventId(null)
    }
  }

  async function handleResetEvents() {
    if (!window.confirm('Reset all calendar events? This cannot be undone.')) {
      return
    }

    setError(null)
    setResettingEvents(true)

    try {
      const response = await fetch('/api/appointments', {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      })

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Could not reset calendar events.'
        throw new Error(message)
      }

      setAppointments([])
      setShowEventModal(false)
      setHoveredTimePreview(null)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Could not reset calendar events.')
    } finally {
      setResettingEvents(false)
    }
  }

  return (
    <div className="cluster-day-calendar-root">
      <header className="cluster-day-calendar-header">
        <div>
          <p className="cluster-main-kicker">Calendar</p>
          <p className="cluster-sidebar-subtitle">Tap a day to select it, then add or review events below.</p>
          <h1>Month calendar</h1>
        </div>
        <div className="cluster-day-calendar-controls">
          <button type="button" className="cluster-calendar-add-button" onClick={() => openAddEventForSelectedDate()}>
            Add event
          </button>
          <button type="button" className="cluster-calendar-reset-button" onClick={handleResetEvents} disabled={resettingEvents}>
            {resettingEvents ? 'Resetting...' : 'Reset Events'}
          </button>
        </div>
      </header>

      {error ? <p className="cluster-error">{error}</p> : null}

      <section className="cluster-month-shell">
        <div className="cluster-month-intro">
          <div>
            <p className="cluster-main-kicker">Month view</p>
            <h2>Pick a date to plan, add, or review.</h2>
            <p className="cluster-sidebar-subtitle">This view stays on the month grid so it’s easier to scan what’s coming up.</p>
          </div>
          <div className="cluster-month-summary">
            <div>
              <span className="cluster-month-summary-label">Selected date</span>
              <strong>{fmtDate(selectedDate)}</strong>
            </div>
            <div>
              <span className="cluster-month-summary-label">Events on that day</span>
              <strong>{selectedDateEvents.length}</strong>
            </div>
          </div>
        </div>
        <Calendar
          value={selectedDate}
          onChange={(value) => {
            if (value instanceof Date) {
              setSelectedDate(value)
            }
          }}
          onClickDay={(value, event) => {
            setSelectedDate(value)
            if (event.detail >= 2) {
              openAddEventForSelectedDate(value)
            }
          }}
          tileClassName={calendarTileClass}
          tileContent={calendarTileContent}
          className="cluster-calendar"
        />
      </section>

      <section className="cluster-upcoming-events-panel">
        <div className="cluster-upcoming-events-header">
          <div className="space-y-4">
            <div>
              <p className="cluster-main-kicker">Upcoming Events</p>
              <h3>Next 2 days</h3>
            </div>
          </div>
        </div>

        {upcomingEvents.length === 0 ? (
          <p className="cluster-empty">No upcoming events in the next 2 days.</p>
        ) : upcomingEvents.length > UPCOMING_COLLAPSE_THRESHOLD ? (
          <div>
            <button
              type="button"
              onClick={() => setShowUpcomingDropdown((s) => !s)}
              className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors mb-2"
            >
              {showUpcomingDropdown ? `▲ Hide ${upcomingEvents.length} events` : `▼ Show ${upcomingEvents.length} upcoming events`}
            </button>

            {showUpcomingDropdown ? (
              <div className="cluster-upcoming-events-list">
                {upcomingEvents.map((event) => {
                  const eventDate = new Date(event.start_time)
                  const isToday = eventDate.toDateString() === new Date().toDateString()
                  const isTomorrow = eventDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
                  const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  const timeLabel = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                  return (
                    <div key={String(event.id)} className="cluster-upcoming-event-row">
                      <div className="min-w-0 flex-1">
                        <p className="cluster-upcoming-event-title">{event.customer_name || 'Event'}</p>
                        <p className="cluster-upcoming-event-meta">{dateLabel} at {timeLabel}</p>
                        {event.location ? <p className="mt-0.5 text-xs text-white/35 truncate">{event.location}</p> : null}
                      </div>
                      {event.itemType ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${event.itemType === 'task' ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/5 text-white/45'}`}>
                          {event.itemType}
                        </span>
                      ) : null}
                      {event.category ? <span className={categoryBadgeClassName(event.category)}>{event.category}</span> : null}

                      <button
                        type="button"
                        onClick={() => handleDeleteEvent(event)}
                        disabled={deletingEventId === String(event.id)}
                        className="ml-3 inline-flex items-center justify-center rounded-md p-1 text-white/60 hover:text-white hover:bg-white/5"
                        aria-label="Delete event"
                        title="Delete event"
                      >
                        {deletingEventId === String(event.id) ? (
                          'Deleting...'
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 11v6" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="cluster-upcoming-events-list">
            {upcomingEvents.map((event) => {
              const eventDate = new Date(event.start_time)
              const isToday = eventDate.toDateString() === new Date().toDateString()
              const isTomorrow = eventDate.toDateString() === new Date(Date.now() + 86400000).toDateString()
              const dateLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              const timeLabel = eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
              return (
                <div key={String(event.id)} className="cluster-upcoming-event-row">
                  <div className="min-w-0 flex-1">
                    <p className="cluster-upcoming-event-title">{event.customer_name || 'Event'}</p>
                    <p className="cluster-upcoming-event-meta">{dateLabel} at {timeLabel}</p>
                    {event.location ? <p className="mt-0.5 text-xs text-white/35 truncate">{event.location}</p> : null}
                  </div>
                  {event.itemType ? (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${event.itemType === 'task' ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border-white/10 bg-white/5 text-white/45'}`}>
                      {event.itemType}
                    </span>
                  ) : null}
                  {event.category ? <span className={categoryBadgeClassName(event.category)}>{event.category}</span> : null}

                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(event)}
                    disabled={deletingEventId === String(event.id)}
                    className="ml-3 inline-flex items-center justify-center rounded-md p-1 text-white/60 hover:text-white hover:bg-white/5"
                    aria-label="Delete event"
                    title="Delete event"
                  >
                    {deletingEventId === String(event.id) ? (
                      'Deleting...'
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 11v6" />
                      </svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <EventDrawer
        open={showEventModal}
        anchor={drawerAnchor}
        dateLabel={fmtDate(new Date(`${eventDate}T00:00`))}
        eventTitle={eventTitle}
        eventNote={eventNote}
        eventTime={eventTime}
        eventEndTime={eventEndTime}
        eventLocation={eventLocation}
        eventCategory={eventCategory}
        creationMode={creationMode}
        saveEventError={saveEventError}
        savingEvent={savingEvent}
        onClose={() => setShowEventModal(false)}
        onSubmit={handleAddEvent}
        onEventTitleChange={setEventTitle}
        onEventNoteChange={setEventNote}
        onEventTimeChange={setEventTime}
        onEventEndTimeChange={setEventEndTime}
        onEventLocationChange={setEventLocation}
        onEventCategoryChange={setEventCategory}
        onCreationModeChange={setCreationMode}
      />
    </div>
  )
}
