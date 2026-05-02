import { getUserIntegrationContext } from './integrationContext'

export type CalendarEventRecord = {
  id: string | number
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  note?: string | null
  category?: string | null
  start_time: string
  end_time: string | null
  status: string
}

type GoogleCalendarDateField = {
  dateTime?: string
  date?: string
}

type GoogleCalendarEvent = {
  id: string
  summary?: string | null
  description?: string | null
  status?: string | null
  start?: GoogleCalendarDateField | null
  end?: GoogleCalendarDateField | null
}

type ParsedEventDetails = {
  note: string | null
  category: string | null
}

type GoogleEventWindow = {
  limit: number
  upcoming: boolean
}

type GoogleEventWriteInput = {
  title: string
  startTime: string
  endTime: string
  note?: string | null
  category?: string | null
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
  if (!raw) return { note: null, category: null }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const note = typeof parsed.note === 'string' ? parsed.note : null
    const category = typeof parsed.category === 'string' ? parsed.category : null
    if (note !== null || category !== null) {
      return { note, category }
    }
  } catch {
    // Fall back to plain text notes.
  }

  return { note: raw, category: null }
}

function buildEventDescription(note?: string | null, category?: string | null) {
  const payload: Record<string, string> = {}
  const trimmedNote = String(note ?? '').trim()
  const trimmedCategory = String(category ?? '').trim()

  if (trimmedNote) payload.note = trimmedNote
  if (trimmedCategory) payload.category = trimmedCategory

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : ''
}

function normalizeGoogleDateField(field?: GoogleCalendarDateField | null) {
  if (!field) return null
  const iso = field.dateTime ?? (field.date ? `${field.date}T00:00:00` : null)
  if (!iso) return null
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function eventToRecord(event: GoogleCalendarEvent): CalendarEventRecord | null {
  const startTime = normalizeGoogleDateField(event.start)
  const endTime = normalizeGoogleDateField(event.end)
  if (!startTime) return null

  const details = parseEventDetails(event.description ?? null)
  return {
    id: event.id,
    customer_id: null,
    customer_name: event.summary?.trim() || 'Event',
    customer_email: null,
    note: details.note,
    category: details.category,
    start_time: startTime,
    end_time: endTime,
    status: event.status ?? 'confirmed',
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

  if (window.upcoming) {
    params.set('timeMin', new Date().toISOString())
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
  const response = await googleCalendarRequest(userId, 'calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: input.title,
      description: buildEventDescription(input.note ?? null, input.category ?? null),
      start: { dateTime: input.startTime },
      end: { dateTime: input.endTime },
    }),
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
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.summary = input.title
  if (input.note !== undefined || input.category !== undefined) {
    body.description = buildEventDescription(input.note ?? null, input.category ?? null)
  }
  if (input.startTime !== undefined) body.start = { dateTime: input.startTime }
  if (input.endTime !== undefined) body.end = { dateTime: input.endTime }

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
