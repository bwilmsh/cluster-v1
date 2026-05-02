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
}

const EVENT_CATEGORIES = ['Business', 'Personal', 'Chore']

function EventDrawer({
  open,
  anchor,
  dateLabel,
  eventTitle,
  eventNote,
  eventTime,
  eventCategory,
  saveEventError,
  savingEvent,
  onClose,
  onSubmit,
  onEventTitleChange,
  onEventNoteChange,
  onEventTimeChange,
  onEventCategoryChange,
}: {
  open: boolean
  anchor: { x: number; y: number }
  dateLabel: string
  eventTitle: string
  eventNote: string
  eventTime: string
  eventCategory: string
  saveEventError: string | null
  savingEvent: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onEventTitleChange: (value: string) => void
  onEventNoteChange: (value: string) => void
  onEventTimeChange: (value: string) => void
  onEventCategoryChange: (value: string) => void
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
            <p className="cluster-event-drawer-kicker">New Event</p>
            <h3>Add Event for {dateLabel}</h3>
          </div>
          <button type="button" className="cluster-event-drawer-close" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
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

          <label>
            <span>Time</span>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => onEventTimeChange(e.target.value)}
              required
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

export function ClusterDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState<string>(toDateInputValue(new Date()))
  const [eventTime, setEventTime] = useState<string>('09:00')
  const [eventTitle, setEventTitle] = useState<string>('')
  const [eventNote, setEventNote] = useState<string>('')
  const [eventCategory, setEventCategory] = useState<string>('Business')
  const [showEventModal, setShowEventModal] = useState(false)
  const [drawerAnchor, setDrawerAnchor] = useState<{ x: number; y: number }>({ x: 320, y: 180 })
  const [savingEvent, setSavingEvent] = useState(false)
  const [saveEventError, setSaveEventError] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)
  const [resettingEvents, setResettingEvents] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const integrationResponse = await fetch('/api/oauth/google/status')
        const integrationPayload = (await integrationResponse.json().catch(() => null)) as { connected?: boolean } | null
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
    const sevenDaysOut = now + 7 * 24 * 60 * 60 * 1000

    return appointments
      .filter((event) => {
        const start = new Date(event.start_time).getTime()
        return Number.isFinite(start) && start >= now && start <= sevenDaysOut
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 6)
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
    setEventTitle('')
    setEventNote('')
    setEventCategory('Business')
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

    const normalizedTitle = eventTitle.trim()
    if (!normalizedTitle) {
      setSaveEventError('Event name is required.')
      return
    }

    setSavingEvent(true)
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          date: eventDate,
          time: eventTime,
          note: eventNote.trim(),
          category: normalizedCategory(eventCategory),
          customer_name: normalizedTitle,
        }),
      })

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Could not create event.'
        setSaveEventError(message)
        return
      }

      await fetchEvents().then(setAppointments)
      setEventTitle('')
      setEventNote('')
      setEventCategory('Business')
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
          <button type="button" className="cluster-calendar-add-button" onClick={openAddEventForSelectedDate}>
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
          <div>
            <p className="cluster-main-kicker">Upcoming Events</p>
            <h3>Next 7 days</h3>
          </div>
          <div className="cluster-upcoming-events-actions">
            {!hasGoogleCalendar ? (
              <a href="/api/oauth/google/start" className="cluster-calendar-connect-button">
                Connect Google Calendar
              </a>
            ) : (
              <span className="cluster-upcoming-events-connected">Google connected</span>
            )}
          </div>
        </div>

        {upcomingEvents.length === 0 ? (
          <p className="cluster-empty">No upcoming events in the next 7 days.</p>
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
                  </div>
                  {event.category ? <span className={categoryBadgeClassName(event.category)}>{event.category}</span> : null}
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
        eventCategory={eventCategory}
        saveEventError={saveEventError}
        savingEvent={savingEvent}
        onClose={() => setShowEventModal(false)}
        onSubmit={handleAddEvent}
        onEventTitleChange={setEventTitle}
        onEventNoteChange={setEventNote}
        onEventTimeChange={setEventTime}
        onEventCategoryChange={setEventCategory}
      />
    </div>
  )
}
