import { Router, Request, Response } from 'express'

export const appointmentsRouter = Router()

type SupabaseAppointment = {
  id: number
  customer_id: number
  start_time: string
  end_time: string
  status: string
  customers?: { name?: string; email?: string; notes?: string } | null
}

type AppointmentDetails = {
  note?: string | null
  category?: string | null
}

type SyncAppointmentBody = {
  customer_name?: string
  customer_email?: string
  start_time?: string
  end_time?: string
  status?: string
  category?: string
  cal_booking_uid?: string
  cal_booking_id?: string | number
  event_type_id?: string | number
}

type CreateAppointmentBody = {
  date?: string
  time?: string
  note?: string
  category?: string
  start_time?: string
  end_time?: string
  duration_minutes?: number
}

type SupabaseCustomer = {
  id: number
  name: string
  email: string
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  return { supabaseUrl, supabaseKey }
}

function supabaseHeaders(supabaseKey: string, prefer?: string) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  }
}

function normalizeAppointmentStatus(status?: string) {
  const value = String(status ?? 'scheduled').trim().toLowerCase()
  if (value === 'completed' || value === 'cancelled' || value === 'canceled' || value === 'no_show') {
    return value === 'canceled' ? 'cancelled' : value
  }
  if (value === 'accepted' || value === 'confirmed' || value === 'success' || value === 'booked') {
    return 'scheduled'
  }
  return 'scheduled'
}

function normalizeEventCategory(category?: string) {
  const value = String(category ?? 'personal').trim().toLowerCase()
  if (value === 'business' || value === 'chore') return value
  return 'personal'
}

function parseIsoOrNull(value?: string) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

function parseDateAndTimeOrNull(date?: string, time?: string) {
  const d = String(date ?? '').trim()
  const t = String(time ?? '').trim()
  if (!d || !t) return null
  const parsed = new Date(`${d}T${t}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function createPersonalEventIdentity() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    name: 'Event',
    email: `personal-event-${suffix}@cluster.local`,
  }
}

function parseAppointmentDetails(notes?: string | null): AppointmentDetails {
  const raw = String(notes ?? '').trim()
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const note = typeof record.note === 'string' ? record.note : null
      const category = typeof record.category === 'string' ? record.category : null
      if (note !== null || category !== null) {
        return { note, category }
      }
    }
  } catch {
    // Fall through to legacy plain-text note handling.
  }

  return { note: raw }
}

function buildAppointmentDetails(note?: string, category?: string) {
  const payload: AppointmentDetails = {}
  const trimmedNote = String(note ?? '').trim()
  const trimmedCategory = String(category ?? '').trim()

  if (trimmedNote) payload.note = trimmedNote
  if (trimmedCategory) payload.category = trimmedCategory

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
}

appointmentsRouter.get('/', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.json({
      data: [],
      warning: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env.',
    })
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 500)
    const nowOnly = String(req.query.upcoming ?? 'false') === 'true'

    const query = new URLSearchParams({
      select: 'id,customer_id,start_time,end_time,status,customers(name,email,notes)',
      order: 'start_time.asc',
      limit: String(limit),
    })

    if (nowOnly) {
      query.set('start_time', `gte.${new Date().toISOString()}`)
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/appointments?${query.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const details = await response.text()
      return res.status(response.status).json({
        error: 'Failed to fetch appointments from Supabase',
        details,
      })
    }

    const rows = (await response.json()) as SupabaseAppointment[]
    const data = rows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customers?.name ?? null,
      customer_email: row.customers?.email ?? null,
      ...parseAppointmentDetails(row.customers?.notes ?? null),
      start_time: row.start_time,
      end_time: row.end_time,
      status: row.status,
    }))

    return res.json(data)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.delete('/:id', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const appointmentId = Number(req.params.id)
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ error: 'appointment id must be a positive integer' })
    }

    const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=eq.${appointmentId}`, {
      method: 'DELETE',
      headers: supabaseHeaders(supabaseKey),
    })

    if (!appointmentResponse.ok) {
      const details = await appointmentResponse.text()
      return res.status(appointmentResponse.status).json({
        error: 'Failed to delete appointment from Supabase',
        details,
      })
    }

    return res.json({ success: true, deleted: true, id: appointmentId })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.post('/', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const body = req.body as CreateAppointmentBody
    const parsedFromStart = parseIsoOrNull(String(body.start_time ?? '').trim())
    const parsedFromDateTime = parseDateAndTimeOrNull(body.date, body.time)
    const startDate = parsedFromStart ?? parsedFromDateTime
    if (!startDate) {
      return res.status(400).json({
        error: 'Provide a valid start_time (ISO 8601) or both date and time',
      })
    }

    const endFromBody = parseIsoOrNull(String(body.end_time ?? '').trim())
    const durationMinutes = Math.min(Math.max(Number(body.duration_minutes ?? 60), 5), 24 * 60)
    const endDate = endFromBody ?? new Date(startDate.getTime() + durationMinutes * 60 * 1000)

    if (endDate.getTime() <= startDate.getTime()) {
      return res.status(400).json({ error: 'end_time must be after start_time' })
    }

    const note = String(body.note ?? '').trim()
    const category = String(body.category ?? '').trim()
    const identity = createPersonalEventIdentity()

    const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify({
        name: identity.name,
        email: identity.email,
        notes: buildAppointmentDetails(note, category),
      }),
    })

    if (!customerResponse.ok) {
      const details = await customerResponse.text()
      return res.status(customerResponse.status).json({
        error: 'Failed to create personal-event customer record',
        details,
      })
    }

    const customerRows = (await customerResponse.json()) as SupabaseCustomer[] | SupabaseCustomer
    const customer = Array.isArray(customerRows) ? customerRows[0] : customerRows

    if (!customer?.id) {
      return res.status(500).json({
        error: 'Customer creation did not return a customer record',
      })
    }

    const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify({
        customer_id: customer.id,
        start_time: formatIsoDate(startDate),
        end_time: formatIsoDate(endDate),
        status: 'scheduled',
      }),
    })

    if (!appointmentResponse.ok) {
      const details = await appointmentResponse.text()
      return res.status(appointmentResponse.status).json({
        error: 'Failed to save event in Supabase',
        details,
      })
    }

    const appointmentRows = (await appointmentResponse.json()) as SupabaseAppointment[] | SupabaseAppointment
    const appointment = Array.isArray(appointmentRows) ? appointmentRows[0] : appointmentRows

    return res.status(201).json({
      success: true,
      appointment: {
        id: appointment.id,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_email: customer.email,
        note: note || null,
        category: category || null,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
      },
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.post('/sync', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const body = req.body as SyncAppointmentBody
    const customerName = String(body.customer_name ?? '').trim()
    const customerEmail = String(body.customer_email ?? '').trim().toLowerCase()
    const startInput = String(body.start_time ?? '').trim()
    const endInput = String(body.end_time ?? '').trim()

    if (!customerName || !customerEmail || !startInput) {
      return res.status(400).json({
        error: 'customer_name, customer_email, and start_time are required',
      })
    }

    const startDate = parseIsoOrNull(startInput)
    if (!startDate) {
      return res.status(400).json({ error: 'start_time must be a valid ISO 8601 timestamp' })
    }

    const endDate = parseIsoOrNull(endInput) ?? new Date(startDate.getTime() + 60 * 60 * 1000)
    if (endDate.getTime() <= startDate.getTime()) {
      return res.status(400).json({ error: 'end_time must be after start_time' })
    }

    const status = normalizeAppointmentStatus(body.status)
    const category = normalizeEventCategory(body.category)

    const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers?on_conflict=email`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'resolution=merge-duplicates,return=representation'),
      body: JSON.stringify({
        name: customerName,
        email: customerEmail,
        notes: buildAppointmentDetails(undefined, category),
      }),
    })

    if (!customerResponse.ok) {
      const details = await customerResponse.text()
      return res.status(customerResponse.status).json({
        error: 'Failed to upsert customer in Supabase',
        details,
      })
    }

    const customerRows = (await customerResponse.json()) as SupabaseCustomer[] | SupabaseCustomer
    const customer = Array.isArray(customerRows) ? customerRows[0] : customerRows

    if (!customer?.id) {
      return res.status(500).json({
        error: 'Customer upsert did not return a customer record',
      })
    }

    const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify({
        customer_id: customer.id,
        start_time: formatIsoDate(startDate),
        end_time: formatIsoDate(endDate),
        status,
      }),
    })

    if (!appointmentResponse.ok) {
      const details = await appointmentResponse.text()
      return res.status(appointmentResponse.status).json({
        error: 'Failed to save appointment in Supabase',
        details,
      })
    }

    const appointmentRows = (await appointmentResponse.json()) as SupabaseAppointment[] | SupabaseAppointment
    const appointment = Array.isArray(appointmentRows) ? appointmentRows[0] : appointmentRows

    return res.status(201).json({
      success: true,
      synced: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
      appointment,
      category,
      cal_booking_uid: body.cal_booking_uid ?? null,
      cal_booking_id: body.cal_booking_id ?? null,
      event_type_id: body.event_type_id ?? null,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})
