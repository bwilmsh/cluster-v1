import { Router, Request, Response } from 'express'
import { getDefaultUser, prisma } from '../db'
import { createGoogleCalendarEvent, updateGoogleCalendarEvent, deleteGoogleCalendarEvent } from '../lib/googleCalendar'
import { createSupabaseClusterEvent, updateSupabaseClusterEvent, deleteSupabaseClusterEvent, listSupabaseClusterEvents } from '../lib/supabaseClusterEvents'
import { suggestHabitSlot } from '../lib/groq'

export const schedulerRouter = Router()

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  return { url, key }
}

async function fetchSupabaseEvent(id: string) {
  const { url, key } = getSupabaseConfig()
  if (!url || !key) return null

  const response = await fetch(`${url}/rest/v1/Event?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) return null

  const rows = (await response.json().catch(() => [])) as Array<Record<string, any>>
  return rows[0] ?? null
}

async function patchSupabaseEvent(id: string, data: Record<string, unknown>) {
  const { url, key } = getSupabaseConfig()
  if (!url || !key) return { ok: false as const, status: 503, details: 'Supabase is not configured' }

  const response = await fetch(`${url}/rest/v1/Event?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  return { ok: true as const }
}

async function deleteSupabaseEvent(id: string) {
  const { url, key } = getSupabaseConfig()
  if (!url || !key) return { ok: false as const, status: 503, details: 'Supabase is not configured' }

  const response = await fetch(`${url}/rest/v1/Event?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      Prefer: 'return=representation',
    },
  })

  if (!response.ok) {
    return { ok: false as const, status: response.status, details: await response.text() }
  }

  return { ok: true as const }
}

function hasTimezoneInfo(val: any) {
  if (typeof val !== 'string') return false
  return /Z$|[+-]\d{2}:\d{2}$/.test(val)
}

function isParsableDate(val: any) {
  if (typeof val !== 'string') return false
  const d = new Date(val)
  return !isNaN(d.getTime())
}

function normalizeToUTC(val: string) {
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

async function appendHabitSkipDate(habitId: string, dateKey: string) {
  const habit = await prisma.habit.findUnique({
    where: { id: habitId },
    select: { id: true, skippedDates: true },
  }).catch(() => null)

  if (!habit) return

  const skippedDates = Array.isArray(habit.skippedDates)
    ? habit.skippedDates.map((value) => String(value)).filter(Boolean)
    : []

  if (skippedDates.includes(dateKey)) return

  await prisma.habit.update({
    where: { id: habit.id },
    data: { skippedDates: [...skippedDates, dateKey] },
  }).catch(() => null)
}

function combineDateTimeWithOffset(date: string, time: string, offset?: string) {
  if (!date || !time) return null
  let ts = `${date}T${time}`
  if (offset && /[+-]\d{2}:\d{2}/.test(offset)) ts = `${ts}${offset}`
  const d = new Date(ts)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function normalizeSupabaseEvent(record: Record<string, any>) {
  return {
    ...record,
    start_time: record.start_time ? new Date(record.start_time) : new Date(),
    end_time: record.end_time ? new Date(record.end_time) : null,
    reminderTime: record.reminderTime ? new Date(record.reminderTime) : null,
    createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
    updatedAt: record.updatedAt ? new Date(record.updatedAt) : new Date(),
    habitOccurrenceAt: record.habitOccurrenceAt ? new Date(record.habitOccurrenceAt) : null,
  }
}

schedulerRouter.get('/events', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(String(req.query.limit ?? 200))
    const events = await prisma.event.findMany({
      orderBy: { start_time: 'asc' },
      take: limit,
    })

    const { url, key } = getSupabaseConfig()
    if (!url || !key) {
      return res.json(events)
    }

    const remote = await listSupabaseClusterEvents({ url, key }, limit)
    if (!remote.ok) {
      return res.json(events)
    }

    const merged = new Map<string, unknown>()
    for (const event of remote.data) merged.set(String(event.id), event)
    for (const event of events) merged.set(String(event.id), event)
    return res.json(Array.from(merged.values()))
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

schedulerRouter.delete('/events', async (_req: Request, res: Response) => {
  try {
    let deletedLocalEvents = 0
    let deletedRemoteEvents = 0

    const localDelete = await prisma.event.deleteMany({})
    deletedLocalEvents = localDelete.count

    const { url, key } = getSupabaseConfig()
    if (url && key) {
      const remoteEvents = await listSupabaseClusterEvents({ url, key }, 500)
      if (!remoteEvents.ok) {
        return res.status(remoteEvents.status).json({
          error: 'Failed to load cluster events for reset',
          details: remoteEvents.details,
        })
      }

      for (const event of remoteEvents.data) {
        const deleted = await deleteSupabaseClusterEvent({ url, key }, String(event.id))
        if (!deleted.ok) {
          return res.status(deleted.status).json({
            error: 'Failed to delete cluster events from Supabase',
            details: deleted.details,
          })
        }
        deletedRemoteEvents += 1
      }
    }

    return res.json({
      success: true,
      reset: true,
      deletedLocalEvents,
      deletedRemoteEvents,
      totalDeleted: deletedLocalEvents + deletedRemoteEvents,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

schedulerRouter.post('/events', async (req: Request, res: Response) => {
  try {
    const payload = req.body || {}

    if (payload.start_time) {
      if (!hasTimezoneInfo(payload.start_time)) return res.status(400).json({ error: 'start_time must be an ISO 8601 timestamp with timezone.' })
      if (!isParsableDate(payload.start_time)) return res.status(400).json({ error: 'start_time is not a valid ISO date/time.' })
      payload.start_time = normalizeToUTC(payload.start_time)
    } else if (payload.date && payload.time) {
      const normalized = combineDateTimeWithOffset(payload.date, payload.time, payload.client_tz_offset)
      if (!normalized) return res.status(400).json({ error: 'Could not combine date and time into a valid timestamp.' })
      payload.start_time = normalized
    }

    if (payload.end_time) {
      if (!hasTimezoneInfo(payload.end_time)) return res.status(400).json({ error: 'end_time must be an ISO 8601 timestamp with timezone.' })
      payload.end_time = normalizeToUTC(payload.end_time)
    } else if (payload.end_date && payload.end_time) {
      const normalizedEnd = combineDateTimeWithOffset(payload.end_date, payload.end_time, payload.client_tz_offset)
      if (normalizedEnd) payload.end_time = normalizedEnd
    }

    // If no explicit start time provided, ask Groq for a suggestion and apply it
    if (!payload.start_time) {
      try {
        const dateForSuggestion = String(payload.date ?? new Date().toISOString().slice(0, 10))
        const durationMinutes = Number(payload.duration_minutes ?? 30) || 30
        const dayStartIso = combineDateTimeWithOffset(dateForSuggestion, '00:00', payload.client_tz_offset) || `${dateForSuggestion}T00:00:00Z`
        const dayStart = new Date(dayStartIso)
        const dayEnd = addDays(dayStart, 1)

        const dayEvents = await prisma.event.findMany({
          where: { start_time: { gte: dayStart, lt: dayEnd } },
          select: { title: true, start_time: true, end_time: true, description: true, itemType: true },
        })

        const groqEvents = dayEvents.map((e) => ({
          title: e.title ?? null,
          start_time: e.start_time ? e.start_time.toISOString() : new Date().toISOString(),
          end_time: e.end_time ? e.end_time.toISOString() : null,
          description: e.description ?? null,
          itemType: e.itemType ?? null,
        }))

        const suggestion = await suggestHabitSlot({
          habitName: String(payload.title ?? 'Event'),
          durationMinutes,
          habitNote: typeof payload.description === 'string' ? payload.description : null,
          events: groqEvents,
        })

        if (suggestion) {
          const normalized = combineDateTimeWithOffset(dateForSuggestion, suggestion.startTime, payload.client_tz_offset)
          if (normalized) {
            payload.start_time = normalized
            const startObj = new Date(normalized)
            payload.end_time = new Date(startObj.getTime() + durationMinutes * 60 * 1000).toISOString()
            payload.scheduleReason = suggestion.reason
          }
        }
      } catch (err) {
        // fail silently and continue with default behavior
        console.error('Groq suggestion failed:', err)
      }
    }

    const event = await prisma.event.create({
      data: {
        title: payload.title || 'Untitled Event',
        description: payload.description || null,
        start_time: new Date(payload.start_time),
        end_time: payload.end_time ? new Date(payload.end_time) : null,
        scheduleReason: payload.scheduleReason ?? null,
        location: payload.location || null,
        itemType: payload.itemType ?? 'event',
        status: payload.status || 'todo',
        priority: payload.priority || 'medium',
        reminderTime: payload.reminderTime ? new Date(payload.reminderTime) : null,
        assignee: payload.assignee || null,
        tags: payload.tags || [],
      },
    })

    try {
      const user = await getDefaultUser()
      const title = String(payload.title ?? 'Event')
      const note = String(payload.description ?? '')
      let googleEventId: string | null = null
      const g = await createGoogleCalendarEvent(user.id, {
        title,
        startTime: event.start_time.toISOString(),
        endTime: event.end_time?.toISOString() ?? null,
        note: note || null,
        location: payload.location ?? null,
        itemType: payload.itemType ?? undefined,
      })
      if (g.ok) {
        googleEventId = g.appointment.id
        await prisma.event.update({
          where: { id: event.id },
          data: { google_event_id: googleEventId },
        }).catch(() => {})
      }

      const { url, key } = getSupabaseConfig()
      if (url && key) {
        const mirrorResult = await createSupabaseClusterEvent({ url, key }, {
          id: event.id,
          title: event.title,
          description: event.description,
          start_time: event.start_time.toISOString(),
          end_time: event.end_time ? event.end_time.toISOString() : null,
          scheduleReason: event.scheduleReason ?? null,
          location: event.location,
          google_event_id: googleEventId,
          itemType: event.itemType,
          status: event.status,
          priority: event.priority,
          reminderTime: event.reminderTime ? event.reminderTime.toISOString() : null,
          reminderSent: event.reminderSent,
          assignee: event.assignee,
          tags: event.tags,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        })

        if (!mirrorResult.ok) {
          if (googleEventId) {
            await deleteGoogleCalendarEvent(user.id, googleEventId).catch(() => null)
          }
          await prisma.event.delete({ where: { id: event.id } }).catch(() => null)
          return res.status(502).json({
            error: 'Failed to mirror cluster event to Supabase',
            details: mirrorResult.details,
          })
        }
      }
    } catch (err) {
      console.error('Google Calendar sync failed:', err)
    }

    return res.status(201).json(event)
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

schedulerRouter.put('/events/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const payload = req.body || {}
    const updateData: any = {}
    const previousEvent = await prisma.event.findUnique({ where: { id } })
    const supabaseFallbackEvent = previousEvent ?? await fetchSupabaseEvent(id)

    if (!previousEvent && !supabaseFallbackEvent) {
      return res.status(404).json({ error: 'Event not found' })
    }

    if (payload.title) updateData.title = payload.title
    if (payload.description !== undefined) updateData.description = payload.description
    if (payload.location !== undefined) updateData.location = payload.location
    if (payload.itemType !== undefined) updateData.itemType = payload.itemType
    if (payload.status !== undefined) updateData.status = payload.status
    if (payload.priority !== undefined) updateData.priority = payload.priority
    if (payload.assignee !== undefined) updateData.assignee = payload.assignee
    if (payload.tags !== undefined) updateData.tags = payload.tags
    if (payload.reminderTime !== undefined) updateData.reminderTime = payload.reminderTime ? new Date(payload.reminderTime) : null

    if (payload.start_time) {
      if (!hasTimezoneInfo(payload.start_time)) return res.status(400).json({ error: 'start_time must be an ISO 8601 timestamp with timezone.' })
      if (!isParsableDate(payload.start_time)) return res.status(400).json({ error: 'start_time is not a valid ISO date/time.' })
      updateData.start_time = new Date(normalizeToUTC(payload.start_time))
    } else if (payload.date && payload.time) {
      const normalized = combineDateTimeWithOffset(payload.date, payload.time, payload.client_tz_offset)
      if (!normalized) return res.status(400).json({ error: 'Could not combine date and time into a valid timestamp.' })
      updateData.start_time = new Date(normalized)
    }

    if (payload.end_time) {
      if (!hasTimezoneInfo(payload.end_time)) return res.status(400).json({ error: 'end_time must be an ISO 8601 timestamp with timezone.' })
      updateData.end_time = new Date(normalizeToUTC(payload.end_time))
    } else if (payload.end_date && payload.end_time) {
      const normalizedEnd = combineDateTimeWithOffset(payload.end_date, payload.end_time, payload.client_tz_offset)
      if (normalizedEnd) updateData.end_time = new Date(normalizedEnd)
    }

    if (previousEvent?.habitId && (updateData.start_time || updateData.end_time)) {
      updateData.habitLocked = true
      updateData.habitOccurrenceAt = previousEvent.habitOccurrenceAt ?? previousEvent.start_time
    }

    let event: any
    if (previousEvent) {
      event = await prisma.event.update({
        where: { id },
        data: updateData,
      })
    } else {
      const supabaseUpdate: Record<string, unknown> = { ...updateData }
      if (supabaseUpdate.start_time instanceof Date) supabaseUpdate.start_time = (supabaseUpdate.start_time as Date).toISOString()
      if (supabaseUpdate.end_time instanceof Date) supabaseUpdate.end_time = (supabaseUpdate.end_time as Date).toISOString()
      if (supabaseUpdate.reminderTime instanceof Date) supabaseUpdate.reminderTime = (supabaseUpdate.reminderTime as Date).toISOString()
      const mirrored = await patchSupabaseEvent(id, supabaseUpdate)
      if (!mirrored.ok) {
        return res.status(mirrored.status).json({ error: 'Failed to update event in Supabase', details: mirrored.details })
      }
      event = normalizeSupabaseEvent({
        ...(supabaseFallbackEvent ?? {}),
        ...supabaseUpdate,
      })
    }

    try {
      const user = await getDefaultUser()
      const googleId = event.google_event_id
      const title = event.title
      const note = event.description || ''
      if (googleId) {
        await updateGoogleCalendarEvent(user.id, String(googleId), {
          title,
          startTime: event.start_time.toISOString(),
          endTime: event.end_time?.toISOString() ?? null,
          note: note || null,
          location: event.location ?? null,
          itemType: event.itemType ?? undefined,
        }).catch(() => {})
      } else {
        const g = await createGoogleCalendarEvent(user.id, {
          title,
          startTime: event.start_time.toISOString(),
          endTime: event.end_time?.toISOString() ?? null,
          note: note || null,
          location: event.location ?? null,
          itemType: event.itemType ?? undefined,
        })
        if (g.ok) {
          await prisma.event.update({
            where: { id },
            data: { google_event_id: g.appointment.id },
          }).catch(() => {})
        }
      }

      const { url, key } = getSupabaseConfig()
      if (url && key) {
        const mirrorResult = await updateSupabaseClusterEvent({ url, key }, {
          id: event.id,
          title: event.title,
          description: event.description,
          start_time: event.start_time.toISOString(),
          end_time: event.end_time ? event.end_time.toISOString() : null,
          scheduleReason: event.scheduleReason ?? null,
          location: event.location,
          google_event_id: event.google_event_id,
          itemType: event.itemType,
          status: event.status,
          priority: event.priority,
          reminderTime: event.reminderTime ? event.reminderTime.toISOString() : null,
          reminderSent: event.reminderSent,
          assignee: event.assignee,
          tags: event.tags,
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        })

        if (!mirrorResult.ok) {
          await prisma.event.update({
            where: { id },
            data: {
              title: previousEvent.title,
              description: previousEvent.description,
              start_time: previousEvent.start_time,
              end_time: previousEvent.end_time,
              location: previousEvent.location,
              google_event_id: previousEvent.google_event_id,
              itemType: previousEvent.itemType,
              status: previousEvent.status,
              priority: previousEvent.priority,
              reminderTime: previousEvent.reminderTime,
              reminderSent: previousEvent.reminderSent,
              assignee: previousEvent.assignee,
              tags: previousEvent.tags,
            },
          }).catch(() => null)
          return res.status(502).json({
            error: 'Failed to mirror cluster event update to Supabase',
            details: mirrorResult.details,
          })
        }
      }
    } catch (err) {
      console.error('Google Calendar sync failed:', err)
    }

    return res.json(event)
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

// Get board view (tasks grouped by status)
schedulerRouter.get('/board', async (req: Request, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: { itemType: { in: ['task', 'todo'] } },
      orderBy: { start_time: 'asc' },
    })

    const board = {
      todo: events.filter(e => e.status === 'todo'),
      'in-progress': events.filter(e => e.status === 'in-progress'),
      done: events.filter(e => e.status === 'done'),
    }

    return res.json(board)
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

// Get tasks by status
schedulerRouter.get('/tasks/status/:status', async (req: Request, res: Response) => {
  try {
    const status = req.params.status
    const tasks = await prisma.event.findMany({
      where: { status, itemType: { in: ['task', 'todo'] } },
      orderBy: { priority: 'desc', start_time: 'asc' },
    })
    return res.json(tasks)
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

// Update event status
schedulerRouter.patch('/events/:id/status', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const { status } = req.body
    if (!status) return res.status(400).json({ error: 'status is required' })

    const local = await prisma.event.findUnique({ where: { id } })
    if (local) {
      const event = await prisma.event.update({
        where: { id },
        data: { status },
      })
      return res.json(event)
    }

    const mirrored = await patchSupabaseEvent(id, { status })
    if (!mirrored.ok) {
      return res.status(mirrored.status).json({ error: 'Failed to update event in Supabase', details: mirrored.details })
    }

    return res.json({ id, status })
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})

schedulerRouter.delete('/events/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const event = await prisma.event.findUnique({ where: { id } })
    const supabaseEvent = event ?? await fetchSupabaseEvent(id)

    if (!event && !supabaseEvent) {
      return res.status(404).json({ error: 'Event not found' })
    }

    if (event) {
      const { url, key } = getSupabaseConfig()
      if (url && key) {
        const mirrorResult = await deleteSupabaseClusterEvent({ url, key }, id)
        if (!mirrorResult.ok) {
          return res.status(502).json({
            error: 'Failed to mirror cluster event delete to Supabase',
            details: mirrorResult.details,
          })
        }
      }

      if (event.habitId) {
        const occurrenceAt = event.habitOccurrenceAt ?? event.start_time
        await appendHabitSkipDate(event.habitId, formatDateKey(occurrenceAt))
      }

      if (event?.google_event_id) {
        try {
          const user = await getDefaultUser()
          await deleteGoogleCalendarEvent(user.id, event.google_event_id).catch(() => {})
        } catch (err) {
          console.error('Google Calendar delete failed:', err)
        }
      }

      try {
        const deleted = await prisma.event.delete({ where: { id } })
        return res.json(deleted)
      } catch (deleteError) {
        if (url && key) {
          await createSupabaseClusterEvent({ url, key }, {
            id: event.id,
            title: event.title,
            description: event.description,
            start_time: event.start_time.toISOString(),
            end_time: event.end_time ? event.end_time.toISOString() : null,
            location: event.location,
            google_event_id: event.google_event_id,
            itemType: event.itemType,
            status: event.status,
            priority: event.priority,
            reminderTime: event.reminderTime ? event.reminderTime.toISOString() : null,
            reminderSent: event.reminderSent,
            assignee: event.assignee,
            tags: event.tags,
            createdAt: event.createdAt.toISOString(),
            updatedAt: event.updatedAt.toISOString(),
          }).catch(() => null)
        }

        throw deleteError
      }
    }

    const deleteResult = await deleteSupabaseEvent(id)
    if (!deleteResult.ok) {
      return res.status(deleteResult.status).json({
        error: 'Failed to delete event from Supabase',
        details: deleteResult.details,
      })
    }

    return res.json({ success: true, deleted: true, id })
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ error: 'Internal error', details })
  }
})
