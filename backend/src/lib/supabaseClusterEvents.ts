type SupabaseClusterEvent = {
  id: string
  title: string
  description?: string | null
  start_time: string
  end_time?: string | null
  location?: string | null
  google_event_id?: string | null
  itemType?: string | null
  status?: string | null
  priority?: string | null
  reminderTime?: string | null
  reminderSent?: boolean
  assignee?: string | null
  tags?: string[]
  createdAt?: string
  updatedAt?: string
}

type SupabaseClusterEventRow = {
  id: string
  title: string
  description?: string | null
  start_time: string
  end_time?: string | null
  location?: string | null
  google_event_id?: string | null
  itemType?: string | null
  status?: string | null
  priority?: string | null
  reminderTime?: string | null
  reminderSent?: boolean
  assignee?: string | null
  tags?: string[] | null
  createdAt?: string | null
  updatedAt?: string | null
}

type SupabaseConfig = {
  url: string
  key: string
}

function normalizeIsoDateTime(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function headers(key: string, prefer?: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

async function request(config: SupabaseConfig, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      ...headers(config.key, undefined),
      ...(init?.headers ?? {}),
    },
  })
}

function buildPayload(event: SupabaseClusterEvent): Record<string, unknown> {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    start_time: event.start_time,
    end_time: event.end_time ?? null,
    location: event.location ?? null,
    google_event_id: event.google_event_id ?? null,
    itemType: event.itemType ?? null,
    status: event.status ?? 'todo',
    priority: event.priority ?? 'medium',
    reminderTime: event.reminderTime ?? null,
    reminderSent: event.reminderSent ?? false,
    assignee: event.assignee ?? null,
    tags: event.tags ?? [],
    createdAt: event.createdAt ?? new Date().toISOString(),
    updatedAt: event.updatedAt ?? new Date().toISOString(),
  }
}

export async function createSupabaseClusterEvent(
  config: SupabaseConfig,
  event: SupabaseClusterEvent,
): Promise<{ ok: true; appointment: SupabaseClusterEventRow } | { ok: false; status: number; details: string }> {
  const response = await request(config, '/rest/v1/Event', {
    method: 'POST',
    headers: headers(config.key, 'return=representation'),
    body: JSON.stringify(buildPayload(event)),
  })

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  const rows = (await response.json().catch(() => [])) as SupabaseClusterEventRow[] | SupabaseClusterEventRow
  const appointment = Array.isArray(rows) ? rows[0] : rows

  return {
    ok: true as const,
    appointment,
  }
}

export async function updateSupabaseClusterEvent(
  config: SupabaseConfig,
  event: SupabaseClusterEvent,
): Promise<{ ok: true } | { ok: false; status: number; details: string }> {
  const response = await request(config, `/rest/v1/Event?id=eq.${encodeURIComponent(event.id)}`, {
    method: 'PATCH',
    headers: headers(config.key, 'return=representation'),
    body: JSON.stringify(buildPayload(event)),
  })

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  return { ok: true as const }
}

export async function deleteSupabaseClusterEvent(
  config: SupabaseConfig,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; details: string }> {
  const response = await request(config, `/rest/v1/Event?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(config.key, 'return=representation'),
  })

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  return { ok: true as const }
}

export async function listSupabaseClusterEvents(
  config: SupabaseConfig,
  limit = 500,
): Promise<{ ok: true; data: SupabaseClusterEventRow[] } | { ok: false; status: number; details: string }> {
  const response = await request(config, `/rest/v1/Event?select=id,title,description,start_time,end_time,location,google_event_id,itemType,status,priority,reminderTime,reminderSent,assignee,tags,createdAt,updatedAt&order=start_time.asc&limit=${Math.min(Math.max(limit, 1), 500)}`)

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  const rows = (await response.json().catch(() => [])) as SupabaseClusterEventRow[]
  return {
    ok: true as const,
    data: (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      start_time: normalizeIsoDateTime(row.start_time) ?? row.start_time,
      end_time: normalizeIsoDateTime(row.end_time) ?? row.end_time,
      createdAt: normalizeIsoDateTime(row.createdAt) ?? row.createdAt,
      updatedAt: normalizeIsoDateTime(row.updatedAt) ?? row.updatedAt,
      reminderTime: normalizeIsoDateTime(row.reminderTime) ?? row.reminderTime,
    })),
  }
}