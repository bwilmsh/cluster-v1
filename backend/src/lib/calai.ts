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
}

type CalAiEvent = {
  id: string
  title?: string | null
  description?: string | null
  location?: string | null
  status?: string | null
  startTime?: string | null
  endTime?: string | null
  start?: string | null
  end?: string | null
}

type ParsedEventDetails = {
  note: string | null
  category: string | null
  location: string | null
  itemType: 'event' | 'task' | null
}

type CalEventWindow = {
  limit: number
  upcoming: boolean
}

type CalEventWriteInput = {
  title: string
  startTime: string
  endTime?: string | null
  note?: string | null
  category?: string | null
  location?: string | null
  itemType?: 'event' | 'task'
}

function getCalApiKey(): string | null {
  const key = process.env.CAL_API_KEY || process.env.CAL_AI_API_KEY
  return typeof key === 'string' && key.trim() ? key : null
}

function getCalApiBaseUrl(): string {
  return process.env.CAL_API_BASE_URL || 'https://api.cal.com'
}

function getCalApiVersion(): string {
  return process.env.CAL_API_VERSION || '2026-02-25'
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

function normalizeIsoDateTime(dateStr?: string | null) {
  if (!dateStr) return null
  try {
    // Parse the ISO string - it may include timezone info
    const parsed = new Date(dateStr)
    if (Number.isNaN(parsed.getTime())) return null
    
    // Return as ISO string - preserves the actual moment in time
    return parsed.toISOString()
  } catch {
    return null
  }
}

function eventToRecord(event: CalAiEvent): CalendarEventRecord | null {
  const startTime = normalizeIsoDateTime(event.startTime || event.start)
  if (!startTime) return null

  const endTime = normalizeIsoDateTime(event.endTime || event.end)
  const details = parseEventDetails(event.description ?? null)

  return {
    id: event.id,
    customer_id: null,
    customer_name: event.title?.trim() || 'Event',
    customer_email: null,
    note: details.note,
    category: details.category,
    location: event.location?.trim() || details.location,
    itemType: details.itemType,
    start_time: startTime,
    end_time: endTime,
    status: event.status ?? 'confirmed',
  }
}

async function calApiRequest(
  path: string,
  init?: RequestInit,
): Promise<Response | null> {
  const apiKey = getCalApiKey()
  if (!apiKey) return null

  const baseUrl = getCalApiBaseUrl()
  const version = getCalApiVersion()
  const url = `${baseUrl}${path}`

  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Cal-Api-Version': version,
      ...(init?.headers ?? {}),
    },
  })
}

export async function listCalendarEvents(window: CalEventWindow): Promise<{
  ok: true
  data: CalendarEventRecord[]
} | {
  ok: false
  status: number
  details: string
}> {
  const params = new URLSearchParams({
    limit: String(Math.min(Math.max(window.limit, 1), 500)),
    orderBy: 'startTime',
  })

  if (window.upcoming) {
    const now = new Date()
    params.set('fromDate', now.toISOString())
  }

  try {
    const response = await calApiRequest(`/v2/events?${params.toString()}`)
    if (!response) {
      return { ok: false as const, status: 503, details: 'Cal AI is not configured.' }
    }

    if (!response.ok) {
      const details = await response.text()
      return { ok: false as const, status: response.status, details }
    }

    const payload = (await response.json()) as { data?: CalAiEvent[]; events?: CalAiEvent[] }
    const items = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.events) ? payload.events : []
    const data = items.map(eventToRecord).filter((value): value is CalendarEventRecord => value !== null)
    return { ok: true as const, data }
  } catch (error) {
    return { ok: false as const, status: 500, details: String(error) }
  }
}

export async function createCalendarEvent(
  input: CalEventWriteInput,
): Promise<{
  ok: true
  appointment: CalendarEventRecord
} | {
  ok: false
  status: number
  details: string
}> {
  const body = {
    title: input.title,
    description: buildEventDescription(input.note ?? null, input.category ?? null, input.location ?? null, input.itemType ?? null),
    location: String(input.location ?? '').trim() || undefined,
    startTime: input.startTime,
    endTime: input.endTime || undefined,
  }

  try {
    const response = await calApiRequest('/v2/events', {
      method: 'POST',
      body: JSON.stringify(body),
    })

    if (!response) {
      return { ok: false as const, status: 503, details: 'Cal AI is not configured.' }
    }

    if (!response.ok) {
      const details = await response.text()
      return { ok: false as const, status: response.status, details }
    }

    const payload = (await response.json()) as { data?: CalAiEvent; event?: CalAiEvent }
    const event = payload.data || payload.event
    if (!event) {
      return { ok: false as const, status: 500, details: 'Cal AI did not return a valid event.' }
    }

    const appointment = eventToRecord(event)
    if (!appointment) {
      return { ok: false as const, status: 500, details: 'Cal AI event could not be processed.' }
    }

    return { ok: true as const, appointment }
  } catch (error) {
    return { ok: false as const, status: 500, details: String(error) }
  }
}

export async function updateCalendarEvent(
  eventId: string,
  input: Partial<CalEventWriteInput>,
): Promise<{
  ok: true
  appointment: CalendarEventRecord
} | {
  ok: false
  status: number
  details: string
}> {
  const body: Record<string, unknown> = {}
  if (input.title !== undefined) body.title = input.title
  if (input.note !== undefined || input.category !== undefined) {
    body.description = buildEventDescription(input.note ?? null, input.category ?? null, input.location ?? null, input.itemType ?? null)
  }
  if (input.location !== undefined) body.location = String(input.location ?? '').trim() || null
  if (input.startTime !== undefined) body.startTime = input.startTime
  if (input.endTime !== undefined) body.endTime = input.endTime

  try {
    const response = await calApiRequest(`/v2/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

    if (!response) {
      return { ok: false as const, status: 503, details: 'Cal AI is not configured.' }
    }

    if (!response.ok) {
      const details = await response.text()
      return { ok: false as const, status: response.status, details }
    }

    const payload = (await response.json()) as { data?: CalAiEvent; event?: CalAiEvent }
    const event = payload.data || payload.event
    if (!event) {
      return { ok: false as const, status: 500, details: 'Cal AI did not return a valid event.' }
    }

    const appointment = eventToRecord(event)
    if (!appointment) {
      return { ok: false as const, status: 500, details: 'Cal AI event could not be processed.' }
    }

    return { ok: true as const, appointment }
  } catch (error) {
    return { ok: false as const, status: 500, details: String(error) }
  }
}

export async function deleteCalendarEvent(
  eventId: string,
): Promise<{
  ok: true
} | {
  ok: false
  status: number
  details: string
}> {
  try {
    const response = await calApiRequest(`/v2/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
    })

    if (!response) {
      return { ok: false as const, status: 503, details: 'Cal AI is not configured.' }
    }

    if (!response.ok) {
      const details = await response.text()
      return { ok: false as const, status: response.status, details }
    }

    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, status: 500, details: String(error) }
  }
}
