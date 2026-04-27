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
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

type CalendarViewMode = 'month' | 'day'

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

function hourLabel(hour: number): string {
  const sample = new Date()
  sample.setHours(hour, 0, 0, 0)
  return sample.toLocaleTimeString(undefined, { hour: 'numeric' })
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
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
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
  const [hoveredTimePreview, setHoveredTimePreview] = useState<{ hour: number; minute: number } | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const events = await fetchEvents()
        setAppointments(events)
      } catch {
        setError('Could not load calendar events.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
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

  const calendarTileClass = ({ date, view }: { date: Date; view: string }): string | null => {
    if (view !== 'month') return null
    return bookedDateSet.has(dateKey(date)) ? 'cluster-booked-date' : null
  }

  const calendarTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month' || !bookedDateSet.has(dateKey(date))) return null
    return <span className="cluster-booked-dot" />
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

  function setPopupAnchor(pointerX: number, pointerY: number) {
    const drawerWidth = 360
    const drawerHeight = 460
    const margin = 12
    const preferredX = pointerX + 22
    const preferredY = pointerY - Math.round(drawerHeight * 0.45)

    const maxX = window.innerWidth - drawerWidth - margin
    const maxY = window.innerHeight - drawerHeight - margin

    setDrawerAnchor({
      x: Math.min(Math.max(margin, preferredX), Math.max(margin, maxX)),
      y: Math.min(Math.max(margin, preferredY), Math.max(margin, maxY)),
    })
  }

  function minuteFromPointerInSlot(pointerEvent: React.MouseEvent<HTMLElement>) {
    const target = pointerEvent.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const clickOffsetY = pointerEvent.clientY - rect.top
    const ratio = rect.height > 0 ? clickOffsetY / rect.height : 0
    return Math.max(0, Math.min(59, Math.round(ratio * 59)))
  }

  function openAddEventAtHour(hour: number, clickEvent: React.MouseEvent<HTMLElement>) {
    setPopupAnchor(clickEvent.clientX, clickEvent.clientY)
    const minute = minuteFromPointerInSlot(clickEvent)

    setEventDate(toDateInputValue(selectedDate))
    setEventTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    setEventTitle('')
    setEventNote('')
    setEventCategory('Business')
    setSaveEventError(null)
    setShowEventModal(true)
  }

  return (
    <div className="cluster-day-calendar-root">
      <header className="cluster-day-calendar-header">
        <div>
          <p className="cluster-main-kicker">Calendar</p>
          <p className="cluster-sidebar-subtitle">click to add reminder or calendar</p>
          <h1>{viewMode === 'month' ? 'Select a Date' : fmtDate(selectedDate)}</h1>
        </div>
        <div className="cluster-day-calendar-controls">
          {viewMode === 'day' ? (
            <button type="button" className="cluster-day-back-button" onClick={() => setViewMode('month')}>
              Back to Month
            </button>
          ) : null}
          <button type="button" className="cluster-calendar-reset-button" onClick={handleResetEvents} disabled={resettingEvents}>
            {resettingEvents ? 'Resetting...' : 'Reset Events'}
          </button>
        </div>
      </header>

      {error ? <p className="cluster-error">{error}</p> : null}

      {viewMode === 'month' ? (
        <section className="cluster-month-shell">
          <Calendar
            value={selectedDate}
            onChange={(value) => {
              if (value instanceof Date) {
                setSelectedDate(value)
                setViewMode('day')
              }
            }}
            onClickDay={(value) => {
              setSelectedDate(value)
              setViewMode('day')
            }}
            tileClassName={calendarTileClass}
            tileContent={calendarTileContent}
            className="cluster-calendar"
          />
          <p className="cluster-sidebar-subtitle">Pick a date to open the hourly chart.</p>
        </section>
      ) : (
        <section className="cluster-day-shell">
          {loading ? <p className="cluster-empty">Loading day schedule...</p> : null}

          {!loading ? (
            <div className="cluster-hour-grid" aria-label="Hourly planner">
              {HOURS.map((hour) => {
                const slotEvents = eventsByHour.get(hour) ?? []
                return (
                  <button
                    key={hour}
                    type="button"
                    className="cluster-hour-slot"
                    onClick={(e) => openAddEventAtHour(hour, e)}
                    onMouseMove={(e) => {
                      setHoveredTimePreview({ hour, minute: minuteFromPointerInSlot(e) })
                    }}
                    onMouseLeave={() => setHoveredTimePreview(null)}
                  >
                    <span className="cluster-hour-label">{hourLabel(hour)}</span>
                    <div className="cluster-hour-content">
                      {slotEvents.length === 0 ? (
                        <p className="cluster-hour-empty" />
                      ) : (
                        slotEvents.map((event) => (
                          <span key={event.id} className="cluster-hour-event-pill">
                            {event.customer_name || 'Event'}
                          </span>
                        ))
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : null}

          <section className="cluster-day-schedule">
            <h3>Events on {fmtDate(selectedDate)}</h3>
            {!loading && selectedDateAppointments.length === 0 ? (
              <p className="cluster-empty">No events yet. Click an hour to create one.</p>
            ) : null}
            {selectedDateAppointments.map((event) => (
              <div key={event.id} className="cluster-appointment-item">
                <div className="cluster-appointment-time">
                  <strong>{fmtTime(event.start_time)}</strong>
                </div>
                <div className="cluster-appointment-meta">
                  {event.customer_name ? <span>{event.customer_name}</span> : null}
                  {event.category ? <span className={categoryBadgeClassName(event.category)}>{event.category}</span> : null}
                  {event.note ? <span>{event.note}</span> : null}
                </div>
                <button
                  type="button"
                  className="cluster-event-delete-button"
                  onClick={() => handleDeleteEvent(event)}
                  disabled={deletingEventId === String(event.id)}
                  aria-label={`Delete ${event.customer_name || 'calendar event'}`}
                  title="Delete event"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h4.5a.75.75 0 0 1 0 1.5h-1.06l-.75 12.13A2.25 2.25 0 0 1 15.44 20.5H8.56a2.25 2.25 0 0 1-2.24-2.37L5.57 6H4.5a.75.75 0 0 1 0-1.5H9v-.75Zm1.5.75v.75h3v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75Zm-2.94 2.25.7 11.76a.75.75 0 0 0 .75.7h6.88a.75.75 0 0 0 .75-.7l.7-11.76H7.56ZM10 9a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5A.75.75 0 0 1 10 9Zm4 0a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5A.75.75 0 0 1 14 9Z" />
                  </svg>
                </button>
              </div>
            ))}
          </section>
        </section>
      )}

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
