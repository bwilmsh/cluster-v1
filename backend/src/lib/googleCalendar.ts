import { getUserIntegrationContext } from './integrationContext'

export type CalendarEventRecord = {
  id: string | number
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  note?: string | null
  category?: string | null
  location?: string | null
  itemType?: 'event' | 'task' | null
  start_time: string
  end_time: string | null
  status: string
  allDay: boolean
}

type GoogleCalendarDateField = {
  dateTime?: string
  date?: string
}

type GoogleCalendarEvent = {
  id: string
  summary?: string | null
  description?: string | null
  location?: string | null
  status?: string | null
  start?: GoogleCalendarDateField | null
  end?: GoogleCalendarDateField | null
}

type ParsedEventDetails = {
  note: string | null
  category: string | null
  location: string | null
  itemType: 'event' | 'task' | null
}

type GoogleEventWindow = {
  limit: number
  upcoming: boolean
  timeMin?: string
  timeMax?: string
}

type GoogleEventWriteInput = {
  title: string
  startTime: string
  endTime?: string | null
  note?: string | null
  category?: string | null
  location?: string | null
  itemType?: 'event' | 'task'
}

function getGoogleCalendarTimeZone() {
  return process.env.GOOGLE_CALENDAR_TIMEZONE || process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function getGoogleCalendarBaseUrl() {
  return 'https://www.googleapis.com/calendar/v3'
}

async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const context = await getUserIntegrationContext(userId).catch(() => ({ tokens: {} }))
  const token = context.tokens['google_access_token']
  return typeof token === 'string' && token.trim() ? token : null
}

function parseEventDetails(description?: string | null): ParsedEventDetails {
  const raw = String(description ?? '').trim()
  if (!raw) return { note: null, category: null, location: null, itemType: null }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const note = typeof parsed.note === 'string' ? parsed.note : null
    const category = typeof parsed.category === 'string' ? parsed.category : null
    const location = typeof parsed.location === 'string' ? parsed.location : null
    const itemType = parsed.itemType === 'event' || parsed.itemType === 'task' ? parsed.itemType : null
    if (note !== null || category !== null || location !== null || itemType !== null) {
      return { note, category, location, itemType }
    }
  } catch {
    const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) {
      const record: Record<string, string> = {}
      for (const part of parts) {
        const index = part.indexOf(':')
        if (index <= 0) continue
        const key = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        if (key) record[key] = value
      }

      const note = record.note ?? record.Input ?? null
      const category = record.category ?? record.TaskCategory ?? null
      const location = record.location ?? record.Location ?? null
      const itemType = record.itemType === 'event' || record.itemType === 'task'
        ? record.itemType
        : record.ItemType === 'event' || record.ItemType === 'task'
          ? record.ItemType
          : null

      if (note !== null || category !== null || location !== null || itemType !== null) {
        return {
          note,
          category,
          location,
          itemType,
        }
      }
    }
  }

  return { note: raw, category: null, location: null, itemType: null }
}

function buildEventDescription(note?: string | null, category?: string | null, location?: string | null, itemType?: 'event' | 'task') {
  const payload: Record<string, string> = {}
  const trimmedNote = String(note ?? '').trim()
  const trimmedCategory = String(category ?? '').trim()
  const trimmedLocation = String(location ?? '').trim()

  if (trimmedNote) payload.note = trimmedNote
  if (trimmedCategory) payload.category = trimmedCategory
  if (trimmedLocation) payload.location = trimmedLocation
  if (itemType) payload.itemType = itemType

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : ''
}

function normalizeGoogleDateField(field?: GoogleCalendarDateField | null) {
  if (!field) return { iso: null, allDay: false }

  if (field.dateTime) {
    const parsed = new Date(field.dateTime)
    return {
      iso: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      allDay: false,
    }
  }

  if (field.date) {
    const parsed = new Date(`${field.date}T00:00:00`)
    return {
      iso: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
      allDay: true,
    }
  }

  return { iso: null, allDay: false }
}

function eventToRecord(event: GoogleCalendarEvent): CalendarEventRecord | null {
  const startField = normalizeGoogleDateField(event.start)
  const endField = normalizeGoogleDateField(event.end)
  const startTime = startField.iso
  const endTime = endField.iso
  if (!startTime) return null

  const details = parseEventDetails(event.description ?? null)
  return {
    id: event.id,
    customer_id: null,
    customer_name: event.summary?.trim() || 'Event',
    customer_email: null,
    note: details.note,
    category: details.category,
    location: event.location?.trim() || details.location,
    itemType: details.itemType,
    start_time: startTime,
    end_time: endTime,
    status: event.status ?? 'confirmed',
    allDay: startField.allDay || endField.allDay,
  }
}

async function googleCalendarRequest(
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response | null> {
  const token = await getGoogleAccessToken(userId)
  if (!token) return null

  return fetch(`${getGoogleCalendarBaseUrl()}/${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
}

export async function listGoogleCalendarEvents(userId: string, window: GoogleEventWindow): Promise<{
  ok: true
  data: CalendarEventRecord[]
} | {
  ok: false
  status: number
  details: string
}> {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(Math.min(Math.max(window.limit, 1), 500)),
    showDeleted: 'false',
  })

  if (window.timeMin) {
    params.set('timeMin', window.timeMin)
  } else if (window.upcoming) {
    params.set('timeMin', new Date().toISOString())
  }

  if (window.timeMax) {
    params.set('timeMax', window.timeMax)
  }

  const response = await googleCalendarRequest(userId, `calendars/primary/events?${params.toString()}`)
  if (!response) {
    return { ok: false as const, status: 503, details: 'Google Calendar is not connected.' }
  }

  if (!response.ok) {
    const details = await response.text()
    return { ok: false as const, status: response.status, details }
  }

  const payload = (await response.json()) as { items?: GoogleCalendarEvent[] }
  const items = Array.isArray(payload.items) ? payload.items : []
  const data = items.map(eventToRecord).filter((value): value is CalendarEventRecord => value !== null)
  return { ok: true as const, data }
}

export async function createGoogleCalendarEvent(
  userId: string,
  input: GoogleEventWriteInput,
): Promise<{
  ok: true
  appointment: CalendarEventRecord
} | {
  ok: false
  status: number
  details: string
}> {
  const timeZone = getGoogleCalendarTimeZone()
  const body: Record<string, unknown> = {
    summary: input.title,
    description: buildEventDescription(input.note ?? null, input.category ?? null, input.location ?? null, input.itemType ?? null),
    location: String(input.location ?? '').trim() || undefined,
    start: { dateTime: input.startTime, timeZone },
  }

  if (input.endTime) {
    body.end = { dateTime: input.endTime, timeZone }
  }

  const response = await googleCalendarRequest(userId, 'calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!response) {
    return { ok: false as const, status: 503, details: 'Google Calendar is not connected.' }
  }

  if (!response.ok) {
    const details = await response.text()
    return { ok: false as const, status: response.status, details }
  }

  const event = (await response.json()) as GoogleCalendarEvent
  const appointment = eventToRecord(event)
  if (!appointment) {
    return { ok: false as const, status: 500, details: 'Google Calendar did not return a valid event.' }
  }

  return { ok: true as const, appointment }
}

export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  input: Partial<GoogleEventWriteInput>,
): Promise<{
  ok: true
  appointment: CalendarEventRecord
} | {
  ok: false
  status: number
  details: string
}> {
  const timeZone = getGoogleCalendarTimeZone()
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.summary = input.title
  if (input.note !== undefined || input.category !== undefined) {
    body.description = buildEventDescription(input.note ?? null, input.category ?? null, input.location ?? null, input.itemType ?? null)
  }
  if (input.location !== undefined) body.location = String(input.location ?? '').trim() || null
  if (input.startTime !== undefined) body.start = { dateTime: input.startTime, timeZone }
  if (input.endTime !== undefined) body.end = { dateTime: input.endTime, timeZone }

  const response = await googleCalendarRequest(userId, `calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })

  if (!response) {
    return { ok: false as const, status: 503, details: 'Google Calendar is not connected.' }
  }

  if (!response.ok) {
    const details = await response.text()
    return { ok: false as const, status: response.status, details }
  }

  const event = (await response.json()) as GoogleCalendarEvent
  const appointment = eventToRecord(event)
  if (!appointment) {
    return { ok: false as const, status: 500, details: 'Google Calendar did not return a valid event.' }
  }

  return { ok: true as const, appointment }
}

export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string,
): Promise<{
  ok: true
} | {
  ok: false
  status: number
  details: string
}> {
  const response = await googleCalendarRequest(userId, `calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })

  if (!response) {
    return { ok: false as const, status: 503, details: 'Google Calendar is not connected.' }
  }

  if (!response.ok) {
    const details = await response.text()
    return { ok: false as const, status: response.status, details }
  }

  return { ok: true as const }
}
