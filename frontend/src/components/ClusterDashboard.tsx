'use client'

import { supabase } from './supabaseClient'
import { useEffect, useMemo, useState } from 'react'
import Calendar from 'react-calendar'

type Appointment = {
  id: number | string
  start_time: string
  end_time?: string
  status?: string
  customer_name?: string
  note?: string
  category?: string
}

type EventRow = {
  id: number | string
  title?: string | null
  event_time?: string | null
  category?: string | null
}

const EVENT_CATEGORIES = ['Work', 'Personal', 'Medical', 'Travel', 'Family', 'Other']

function EventDrawer({
  open,
  dateLabel,
  eventNote,
  eventTime,
  eventCategory,
  saveEventError,
  savingEvent,
  onClose,
  onSubmit,
  onEventNoteChange,
  onEventTimeChange,
  onEventCategoryChange,
}: {
  open: boolean
  dateLabel: string
  eventNote: string
  eventTime: string
  eventCategory: string
  saveEventError: string | null
  savingEvent: boolean
  onClose: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onEventNoteChange: (value: string) => void
  onEventTimeChange: (value: string) => void
  onEventCategoryChange: (value: string) => void
}) {
  return (
    <aside className={`cluster-event-drawer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
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
              value={eventNote}
              onChange={(e) => onEventNoteChange(e.target.value)}
              placeholder="What is this event?"
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

function buildIsoFromDateTime(date: string, time: string): string {
  return `${date}T${time}:00`
}

async function fetchEvents(): Promise<Appointment[]> {
  const { data, error } = await supabase.from('events').select('*')
  if (error) {
    throw error
  }

  return (data ?? []).map((row) => {
    const eventRow = row as EventRow
    return {
      id: eventRow.id,
      start_time: String(eventRow.event_time ?? ''),
      note: eventRow.title ?? undefined,
      category: eventRow.category ?? undefined,
    }
  })
}

function normalizedCategory(value?: string) {
  return String(value ?? '').trim().toLowerCase()
}

function categoryPriority(value?: string) {
  return normalizedCategory(value) === 'business' ? 0 : 1
}

function categoryBadgeClassName(value?: string) {
  const category = normalizedCategory(value)
  if (category === 'business') return 'cluster-event-category-badge is-business'
  if (category === 'personal') return 'cluster-event-category-badge is-personal'
  if (category === 'chore') return 'cluster-event-category-badge is-chore'
  return 'cluster-event-category-badge'
}

export function ClusterDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState<string>(toDateInputValue(new Date()))
  const [eventTime, setEventTime] = useState<string>('09:00')
  const [eventNote, setEventNote] = useState<string>('')
  const [eventCategory, setEventCategory] = useState<string>('Personal')
  const [showEventModal, setShowEventModal] = useState(false)
  const [savingEvent, setSavingEvent] = useState(false)
  const [saveEventError, setSaveEventError] = useState<string | null>(null)
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const events = await fetchEvents()
        setAppointments(events)
      } catch {
        setError('Could not load events from Supabase.')
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
    for (const appt of appointments) {
      const d = new Date(appt.start_time)
      if (!Number.isNaN(d.getTime())) {
        set.add(dateKey(d))
      }
    }
    return set
  }, [appointments])

  const selectedDateAppointments = useMemo(() => {
    const day = dateKey(selectedDate)
    return appointments
      .filter((a) => {
        const d = new Date(a.start_time)
        return !Number.isNaN(d.getTime()) && dateKey(d) === day
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [appointments, selectedDate])

  const upcomingEvents = useMemo(() => {
    const now = Date.now()
    return appointments
      .filter((a) => {
        const d = new Date(a.start_time)
        return !Number.isNaN(d.getTime()) && d.getTime() >= now
      })
      .sort((a, b) => {
        const byCategory = categoryPriority(a.category) - categoryPriority(b.category)
        if (byCategory !== 0) return byCategory
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      })
      .slice(0, 8)
  }, [appointments])

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

    setSavingEvent(true)
    try {
      const eventTimeIso = buildIsoFromDateTime(eventDate, eventTime)
      const { error } = await supabase.from('events').insert([
        {
          title: eventNote.trim(),
          event_time: eventTimeIso,
          category: normalizedCategory(eventCategory) || 'personal',
        },
      ])

      if (error) {
        setSaveEventError(error.message)
        return
      }

      await fetchEvents().then(setAppointments)

      setEventNote('')
      setEventCategory('Personal')
      setShowEventModal(false)
    } catch (saveError) {
      setSaveEventError(saveError instanceof Error ? saveError.message : 'Could not create event.')
    } finally {
      setSavingEvent(false)
    }
  }

  async function handleDeleteEvent(eventToDelete: Appointment) {
    const eventId = String(eventToDelete.id)

    setError(null)
    setDeletingEventId(eventId)

    try {
      const { error } = await supabase.from('events').delete().eq('id', eventId)

      if (error) {
        throw error
      }

      await fetchEvents().then(setAppointments)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete event.')
    } finally {
      setDeletingEventId(null)
    }
  }

  return (
    <div className="cluster-dashboard-root">
      <aside className="cluster-dashboard-sidebar">
        <div>
          <h2>Upcoming Events</h2>
          <p className="cluster-sidebar-subtitle">Next scheduled items on your calendar</p>
        </div>

        <div className="cluster-memory-list">
          {loading && <p className="cluster-empty">Loading upcoming events...</p>}
          {!loading && upcomingEvents.length === 0 && (
            <p className="cluster-empty">No upcoming events yet.</p>
          )}
          {upcomingEvents.map((event) => (
            <article key={event.id} className="cluster-memory-item">
              <div className="cluster-memory-item-header">
                <div>
                  <div className="cluster-memory-name-row">
                    <p className="cluster-memory-name">{event.note || 'Event'}</p>
                    {event.category ? <span className={categoryBadgeClassName(event.category)}>{event.category}</span> : null}
                  </div>
                  <p className="cluster-memory-text">
                    {new Date(event.start_time).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    at {fmtTime(event.start_time)}
                  </p>
                  {event.end_time ? (
                    <time className="cluster-memory-time" dateTime={event.end_time}>
                      Ends at {fmtTime(event.end_time)}
                    </time>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="cluster-event-delete-button"
                  onClick={() => handleDeleteEvent(event)}
                  disabled={deletingEventId === String(event.id)}
                  aria-label={`Delete ${event.note || 'event'}`}
                  title="Delete event"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h4.5a.75.75 0 0 1 0 1.5h-1.06l-.75 12.13A2.25 2.25 0 0 1 15.44 20.5H8.56a2.25 2.25 0 0 1-2.24-2.37L5.57 6H4.5a.75.75 0 0 1 0-1.5H9v-.75Zm1.5.75v.75h3v-.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75Zm-2.94 2.25.7 11.76a.75.75 0 0 0 .75.7h6.88a.75.75 0 0 0 .75-.7l.7-11.76H7.56ZM10 9a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5A.75.75 0 0 1 10 9Zm4 0a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5A.75.75 0 0 1 14 9Z" />
                  </svg>
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>

      <main className="cluster-dashboard-main">
        <header className="cluster-main-header">
          <div>
            <h1>Cluster Dashboard</h1>
            <p>Calendar view with booked dates from /api/appointments</p>
          </div>
          {error && <p className="cluster-error">{error}</p>}
        </header>

        <section className={`cluster-calendar-wrap ${showEventModal ? 'cluster-calendar-wrap-with-drawer' : ''}`}>
          <div className="cluster-calendar-panel">
            <Calendar
              value={selectedDate}
              onChange={(value) => {
                if (value instanceof Date) {
                  setSelectedDate(value)
                }
              }}
              onClickDay={(value) => {
                setSelectedDate(value)
                setEventDate(toDateInputValue(value))
                setEventTime('09:00')
                setEventCategory('Personal')
                setSaveEventError(null)
                setShowEventModal(true)
              }}
              tileClassName={calendarTileClass}
              tileContent={calendarTileContent}
              className="cluster-calendar"
            />
            <p className="cluster-sidebar-subtitle">Click a date to add an event.</p>
          </div>

          <EventDrawer
            open={showEventModal}
            dateLabel={fmtDate(new Date(`${eventDate}T00:00`))}
            eventNote={eventNote}
            eventTime={eventTime}
            eventCategory={eventCategory}
            saveEventError={saveEventError}
            savingEvent={savingEvent}
            onClose={() => setShowEventModal(false)}
            onSubmit={handleAddEvent}
            onEventNoteChange={setEventNote}
            onEventTimeChange={setEventTime}
            onEventCategoryChange={setEventCategory}
          />
        </section>

        <section className="cluster-day-schedule">
          <h3>Appointments on {fmtDate(selectedDate)}</h3>
          {loading && <p className="cluster-empty">Loading schedule...</p>}
          {!loading && selectedDateAppointments.length === 0 && (
            <p className="cluster-empty">No booked appointments for this date.</p>
          )}
          {selectedDateAppointments.map((appt) => (
            <div key={appt.id} className="cluster-appointment-item">
              <div>
                <strong>{fmtTime(appt.start_time)}</strong>
                {appt.end_time ? <span> - {fmtTime(appt.end_time)}</span> : null}
              </div>
              <div className="cluster-appointment-meta">
                <span>Status: {appt.status || 'scheduled'}</span>
                {appt.category ? <span>Category: {appt.category}</span> : null}
                {appt.customer_name ? <span>Customer: {appt.customer_name}</span> : null}
                {appt.note ? <span>Event: {appt.note}</span> : null}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
