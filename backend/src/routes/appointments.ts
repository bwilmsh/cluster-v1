import { Router, Request, Response } from 'express'
import { getDefaultUser, prisma } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from '../lib/calai'
import { deleteGoogleCalendarEvent, listGoogleCalendarEvents, updateGoogleCalendarEvent } from '../lib/googleCalendar'
import { createSupabaseClusterEvent, listSupabaseClusterEvents } from '../lib/supabaseClusterEvents'
import { suggestHabitSlot } from '../lib/groq'

type UnifiedCalendarRecord = {
  id: string | number
  customer_id: number | null
  customer_name: string | null
  customer_email: string | null
  note?: string | null
  category?: string | null
  location?: string | null
  itemType?: 'event' | 'task' | 'habit' | null
  start_time: string
  end_time: string | null
  status: string
  source: 'google' | 'cluster'
}

async function fetchClusterBlocks(limit: number, upcomingOnly: boolean): Promise<UnifiedCalendarRecord[]> {
  try {
    const rows = await prisma.event.findMany({
      where: {
        OR: [
          { itemType: { in: ['task', 'event', 'habit'] } },
          { itemType: null },
        ],
        ...(upcomingOnly ? { start_time: { gte: new Date() } } : {}),
      },
      orderBy: { start_time: 'asc' },
      take: limit,
    })

    const localBlocks: UnifiedCalendarRecord[] = rows.map((row) => ({
      id: row.id,
      customer_id: null,
      customer_name: row.title,
      customer_email: null,
      note: row.description,
      category: null,
      location: row.location,
      itemType: (row.itemType === 'task' ? 'task' : (row.itemType === 'habit' ? 'habit' : 'event')) as 'event' | 'task' | 'habit',
      start_time: row.start_time.toISOString(),
      end_time: row.end_time ? row.end_time.toISOString() : null,
      status: row.status,
      source: 'cluster' as const,
    }))

    let remoteBlocks: UnifiedCalendarRecord[] = []
    const { supabaseUrl, supabaseKey } = getSupabaseConfig()
    if (supabaseUrl && supabaseKey) {
      const remote = await listSupabaseClusterEvents({ url: supabaseUrl, key: supabaseKey }, limit)
      if (remote.ok) {
        remoteBlocks = remote.data.map((row) => ({
          id: row.id,
          customer_id: null,
          customer_name: row.title,
          customer_email: null,
          note: row.description ?? null,
          category: null,
          location: row.location ?? null,
          itemType: row.itemType === 'task' ? 'task' : 'event',
          start_time: row.start_time,
          end_time: row.end_time ?? null,
          status: row.status ?? 'todo',
          source: 'cluster' as const,
        }))
      }
    }

    const clusterById = new Map<string, UnifiedCalendarRecord>()
    for (const block of [...remoteBlocks, ...localBlocks]) {
      clusterById.set(String(block.id), block)
    }

    return [...Array.from(clusterById.values())]
  } catch {
    return []
  }
}

async function writeClusterEvent(
  config: { url: string; key: string },
  input: {
    title: string
    note: string
    location: string
    itemType: 'event' | 'task'
    startTime: string
    endTime: string | null
  },
): Promise<{ ok: true; appointment: UnifiedCalendarRecord } | { ok: false; status: number; details: string }> {
  let scheduleReason: string | null = null

  // If no start time provided, try to get a Groq suggestion for today's date
  if (!input.startTime) {
    try {
      const dateForSuggestion = new Date().toISOString().slice(0, 10)
      const durationMinutes = 30
      const dayStart = new Date(`${dateForSuggestion}T00:00:00Z`)
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
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
        habitName: String(input.title ?? 'Event'),
        durationMinutes,
        habitNote: typeof input.note === 'string' ? input.note : null,
        events: groqEvents,
      })

      if (suggestion) {
        input.startTime = `${dateForSuggestion}T${suggestion.startTime}:00Z`
        input.endTime = new Date(new Date(input.startTime).getTime() + durationMinutes * 60 * 1000).toISOString()
        // persist the reason in description if not present
        input.note = input.note || ''
        input.note = input.note + (input.note ? '\n' : '') + `Schedule reason: ${suggestion.reason}`
        scheduleReason = suggestion.reason
      }
    } catch (err) {
      console.error('Groq suggestion for appointment failed:', err)
    }
  }

  const created = await createSupabaseClusterEvent(config, {
    id: String(Date.now()),
    title: input.title || 'Event',
    description: input.note || null,
    start_time: input.startTime,
    end_time: input.endTime,
    scheduleReason: scheduleReason ?? null,
    location: input.location || null,
    google_event_id: null,
    itemType: input.itemType,
    status: input.itemType === 'task' ? 'todo' : 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  if (!created.ok) {
    return created
  }

  return {
    ok: true as const,
    appointment: {
      id: created.appointment.id,
      customer_id: null,
      customer_name: created.appointment.title,
      customer_email: null,
      note: created.appointment.description ?? null,
      category: null,
      location: created.appointment.location ?? null,
      itemType: created.appointment.itemType === 'task' ? 'task' : 'event',
      start_time: created.appointment.start_time,
      end_time: created.appointment.end_time ?? null,
      status: created.appointment.status ?? (input.itemType === 'task' ? 'todo' : 'scheduled'),
      source: 'cluster',
    },
  }
}

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
  location?: string | null
  itemType?: 'event' | 'task' | null
}

type SupabaseLegacyEvent = {
  id: number
  title?: string | null
  event_time?: string | null
  category?: string | null
  note?: string | null
  description?: string | null
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
  customer_name?: string
  title?: string
  date?: string
  time?: string
  note?: string
  category?: string
  location?: string
  itemType?: 'event' | 'task'
  start_time?: string
  end_time?: string
  duration_minutes?: number
}

type UpdateAppointmentBody = {
  customer_name?: string
  title?: string
  note?: string
  category?: string
  start_time?: string
  end_time?: string
}

type ParseTaskBody = {
  text?: string
}

type AdjustTaskBody = {
  action?: 'delay' | 'skip'
  delayMinutes?: number
}

type ParsedTaskCategory = 'money' | 'health' | 'work/study' | 'errands'
type ParsedTaskPriority = 'low' | 'medium' | 'high'

type ParsedTaskResult = {
  intent: string
  taskName: string
  category: ParsedTaskCategory
  deadline: string | null
  priority: ParsedTaskPriority
  deadlineSource: 'inferred' | 'suggested'
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
  const trimmed = value.trim()
  
  // First try standard ISO parsing
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) return parsed
  
  // Try to parse as local date with 12-hour time format
  // Patterns: "2026-05-04 9:30am", "2026-05-04T9:30am", "May 4, 2026 9:30am"
  const dateTimeMatch = trimmed.match(/^(.+?)\s+(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm))$/i)
  if (dateTimeMatch) {
    const datePart = dateTimeMatch[1]
    const timePart = convert12HourTo24Hour(dateTimeMatch[2])
    const combined = `${datePart}T${timePart}`
    const parsed2 = new Date(combined)
    if (!Number.isNaN(parsed2.getTime())) return parsed2
  }
  
  return null
}

function formatIsoDate(value: Date | string) {
  // If already an ISO string with timezone, preserve it exactly
  if (typeof value === 'string') {
    const trimmed = value.trim()
    // Check if it already has timezone info (ends with Z or ±HH:MM)
    if (/[Z+-]\d{2}:\d{2}$/.test(trimmed) || trimmed.endsWith('Z')) {
      return trimmed
    }
    // Try to parse and format as proper ISO
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString()
    }
    return trimmed
  }
  
  // For Date objects, use toISOString()
  return value.toISOString()
}

function convert12HourTo24Hour(time12: string): string {
  const text = time12.trim().toLowerCase()
  
  // Match 12-hour format: HH:MM am/pm or H:MM am/pm or HH am/pm or H am/pm
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/i)
  if (!match) return time12 // Not 12-hour format, return as-is
  
  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? match[2] : '00'
  const seconds = match[3] ? match[3] : '00'
  const period = match[4].toLowerCase()
  
  // Validate hours (1-12 for 12-hour format)
  if (hours < 1 || hours > 12) return time12
  
  // Convert to 24-hour format
  if (period === 'am') {
    if (hours === 12) hours = 0 // 12 AM = 00:00
  } else { // pm
    if (hours !== 12) hours += 12 // 1 PM = 13:00, but 12 PM = 12:00
  }
  
  return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`
}

function parseDateAndTimeOrNull(date?: string, time?: string) {
  const d = String(date ?? '').trim()
  let t = String(time ?? '').trim()
  if (!d || !t) return null
  
  // Convert 12-hour format (with am/pm) to 24-hour format
  t = convert12HourTo24Hour(t)
  
  const parsed = new Date(`${d}T${t}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isLocalIsoDateTime(value?: string) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)
}

function normalizeLocalIsoDateTime(value?: string) {
  const text = String(value ?? '').trim()
  if (!isLocalIsoDateTime(text)) return null
  return text.length === 16 ? `${text}:00` : text
}

function buildLocalIsoFromDateAndTime(date?: string, time?: string) {
  const d = String(date ?? '').trim()
  let t = String(time ?? '').trim()
  if (!d || !t) return null
  t = convert12HourTo24Hour(t)
  if (/^\d{2}:\d{2}$/.test(t)) return `${d}T${t}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return `${d}T${t}`
  return null
}

function createPersonalEventIdentity(title?: string) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const normalizedTitle = String(title ?? '').trim()
  return {
    name: normalizedTitle || 'Event',
    email: `personal-event-${suffix}@cluster.local`,
  }
}

function mapEventCategoryToTaskCategory(category?: string) {
  const normalized = String(category ?? '').trim().toLowerCase()
  if (normalized === 'business') return 'work/study'
  if (normalized === 'personal') return 'health'
  return 'errands'
}

function buildQuickTaskMetadata(input: { title: string; note: string; category: string; location: string; startTime: Date }) {
  const taskCategory = mapEventCategoryToTaskCategory(input.category)
  const taskInput = [input.title, input.note, input.location].map((part) => String(part ?? '').trim()).filter(Boolean).join(' - ')
  return buildTaskMetadataString({
    taskCategory,
    priority: 'medium',
    intent: input.title || 'plan task',
    input: taskInput || input.title || 'Task',
    taskStatus: 'scheduled',
    location: input.location,
    itemType: 'task',
    deadline: formatIsoDate(input.startTime),
  })
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
      const location = typeof record.location === 'string' ? record.location : null
      const itemType = record.itemType === 'event' || record.itemType === 'task' ? record.itemType : null
      if (note !== null || category !== null || location !== null || itemType !== null) {
        return { note, category, location, itemType }
      }
    }
  } catch {
    const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) {
      const metadata: Record<string, string> = {}
      for (const part of parts) {
        const index = part.indexOf(':')
        if (index <= 0) continue
        const key = part.slice(0, index).trim()
        const value = part.slice(index + 1).trim()
        if (key) metadata[key] = value
      }

      const note = metadata.note ?? metadata.Input ?? null
      const category = metadata.category ?? metadata.TaskCategory ?? null
      const location = metadata.location ?? metadata.Location ?? null
      const itemType = metadata.itemType === 'event' || metadata.itemType === 'task'
        ? metadata.itemType
        : metadata.ItemType === 'event' || metadata.ItemType === 'task'
          ? metadata.ItemType
          : null

      if (note !== null || category !== null || location !== null || itemType !== null) {
        return { note, category, location, itemType }
      }
    }
  }

  return { note: raw }
}

function buildAppointmentDetails(note?: string, category?: string, location?: string, itemType?: 'event' | 'task') {
  const payload: AppointmentDetails = {}
  const trimmedNote = String(note ?? '').trim()
  const trimmedCategory = String(category ?? '').trim()
  const trimmedLocation = String(location ?? '').trim()

  if (trimmedNote) payload.note = trimmedNote
  if (trimmedCategory) payload.category = trimmedCategory
  if (trimmedLocation) payload.location = trimmedLocation
  if (itemType) payload.itemType = itemType

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null
}

function isMissingSupabaseTable(details: string, tableName: string) {
  const text = String(details ?? '').toLowerCase()
  return (
    text.includes('pgrst205') &&
    (text.includes(`public.${tableName}`) || text.includes(`table '${tableName}'`))
  )
}

function parseLegacyEventTitle(title?: string | null) {
  const raw = String(title ?? '').trim()
  if (!raw) return { customer_name: null, note: null }

  const marker = ' // '
  const index = raw.indexOf(marker)
  if (index <= 0) {
    return { customer_name: raw, note: null }
  }

  const customer_name = raw.slice(0, index).trim()
  const note = raw.slice(index + marker.length).trim()
  return {
    customer_name: customer_name || null,
    note: note || null,
  }
}

function composeLegacyEventTitle(customerName?: string, note?: string) {
  const cleanName = String(customerName ?? '').trim() || 'Event'
  const cleanNote = String(note ?? '').trim()
  if (!cleanNote) return cleanName
  return `${cleanName} // ${cleanNote}`
}

function startOfDay(value: Date) {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

function normalizeTaskText(input: string) {
  return input
    .replace(/\s+/g, ' ')
    .trim()
}

function inferCategory(text: string): ParsedTaskCategory {
  const value = text.toLowerCase()
  if (/(pay|rego|rent|invoice|bill|budget|tax|loan|bank|salary|subscription)/.test(value)) {
    return 'money'
  }
  if (/(dentist|doctor|medical|physio|therapy|gym|medication|hospital|health|checkup)/.test(value)) {
    return 'health'
  }
  if (/(assignment|homework|study|exam|project|meeting|work|client|report|deadline|presentation)/.test(value)) {
    return 'work/study'
  }
  return 'errands'
}

function inferIntent(text: string) {
  const value = text.toLowerCase().trim()
  if (!value) return 'plan task'
  if (/\b(pay|send|transfer|invoice)\b/.test(value)) return 'handle payment'
  if (/\b(book|schedule|appointment|call)\b/.test(value)) return 'schedule appointment'
  if (/\b(buy|pickup|drop off|collect|shop)\b/.test(value)) return 'run errand'
  if (/\b(study|assignment|submit|exam|project|report)\b/.test(value)) return 'complete work/study task'
  return 'plan task'
}

function inferDeadline(text: string, now: Date) {
  const value = text.toLowerCase()
  const today = startOfDay(now)

  if (/\btoday\b/.test(value)) {
    return today
  }

  if (/\btomorrow\b/.test(value)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 1)
    return d
  }

  if (/\bnext week\b/.test(value)) {
    const d = new Date(today)
    d.setDate(d.getDate() + 7)
    return d
  }

  const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  for (let i = 0; i < weekdayNames.length; i += 1) {
    const weekday = weekdayNames[i]
    const regex = new RegExp(`\\b(?:due\\s+)?(?:this\\s+|next\\s+)?${weekday}\\b`)
    if (!regex.test(value)) continue

    const hasNext = new RegExp(`\\bnext\\s+${weekday}\\b`).test(value)
    const currentDow = today.getDay()
    let delta = (i - currentDow + 7) % 7
    if (delta === 0 || hasNext) {
      delta += 7
    }

    const d = new Date(today)
    d.setDate(d.getDate() + delta)
    return d
  }

  const isoDateMatch = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (isoDateMatch) {
    const parsed = new Date(`${isoDateMatch[1]}T00:00:00`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const longDateMatch = value.match(/\b([a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?)\b/i)
  if (longDateMatch) {
    const parsed = new Date(longDateMatch[1])
    if (!Number.isNaN(parsed.getTime())) return startOfDay(parsed)
  }

  return null
}

function inferPriority(text: string, deadline: Date | null, now: Date): ParsedTaskPriority {
  const value = text.toLowerCase()
  if (/\b(urgent|asap|immediately|important|priority|critical|today|tomorrow|tonight)\b/.test(value)) {
    return 'high'
  }

  if (!deadline) return 'medium'

  const startNow = startOfDay(now).getTime()
  const startDeadline = startOfDay(deadline).getTime()
  const daysUntil = Math.floor((startDeadline - startNow) / (24 * 60 * 60 * 1000))

  if (daysUntil <= 1) return 'high'
  if (daysUntil <= 4) return 'medium'
  return 'low'
}

function inferTaskName(text: string): string {
  let name = text
    .replace(/\b(today|tomorrow|next week)\b/gi, ' ')
    .replace(/\b(due\s+)?(this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b[a-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!name) name = text.trim()

  const punctuation = /[.!?,;:]+$/
  name = name.replace(punctuation, '').trim()

  if (!name) return 'Task'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function inferSuggestedDeadline(category: ParsedTaskCategory, priority: ParsedTaskPriority, now: Date) {
  const base = startOfDay(now)
  let daysToAdd = 4

  if (category === 'money') daysToAdd = 2
  if (category === 'health') daysToAdd = 5
  if (category === 'work/study') daysToAdd = 3
  if (category === 'errands') daysToAdd = 4

  if (priority === 'high') daysToAdd = Math.min(daysToAdd, 1)
  if (priority === 'low') daysToAdd = Math.max(daysToAdd, 7)

  const deadline = new Date(base)
  deadline.setDate(deadline.getDate() + daysToAdd)
  return deadline
}

function mapTaskCategoryToEventCategory(category: ParsedTaskCategory) {
  if (category === 'money' || category === 'work/study') return 'business'
  if (category === 'health') return 'personal'
  return 'chore'
}

type BusyInterval = {
  start: Date
  end: Date
}

const DEFAULT_TASK_DURATION_MINUTES = 60
const WORKDAY_START_HOUR = 9
const WORKDAY_END_HOUR = 18

function parseTaskMetadata(note?: string | null) {
  const result: Record<string, string> = {}
  const raw = String(note ?? '').trim()
  if (!raw) return result

  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const index = part.indexOf(':')
    if (index <= 0) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key) result[key] = value
  }
  return result
}

function buildTaskMetadataString(fields: {
  taskCategory: ParsedTaskCategory
  priority: ParsedTaskPriority
  intent: string
  input: string
  taskStatus: 'scheduled' | 'completed' | 'missed' | 'rescheduled' | 'skipped'
  deadline: string | null
  location?: string | null
  itemType?: 'event' | 'task' | null
}) {
  const chunks = [
    `TaskCategory: ${fields.taskCategory}`,
    `Priority: ${fields.priority}`,
    `Intent: ${fields.intent}`,
    `Input: ${fields.input}`,
    `TaskStatus: ${fields.taskStatus}`,
  ]

  if (fields.location) chunks.push(`Location: ${fields.location}`)
  if (fields.itemType) chunks.push(`ItemType: ${fields.itemType}`)
  if (fields.deadline) chunks.push(`Deadline: ${fields.deadline}`)
  return chunks.join(' | ')
}

function mergeTaskMetadata(note: string | null | undefined, patch: Record<string, string>) {
  const merged = parseTaskMetadata(note)
  for (const [key, value] of Object.entries(patch)) {
    if (value) merged[key] = value
  }
  const orderedKeys = ['TaskCategory', 'Priority', 'Intent', 'Input', 'TaskStatus', 'Location', 'ItemType', 'Deadline']
  const parts = orderedKeys
    .filter((key) => merged[key])
    .map((key) => `${key}: ${merged[key]}`)
  return parts.join(' | ')
}

function toDayRange(day: Date) {
  const start = startOfDay(day)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function overlaps(start: Date, end: Date, busy: BusyInterval) {
  return start < busy.end && end > busy.start
}

function findOpenSlotInDay(day: Date, busyIntervals: BusyInterval[], durationMinutes: number, now: Date) {
  const { start } = toDayRange(day)
  const dayStart = new Date(start)
  dayStart.setHours(WORKDAY_START_HOUR, 0, 0, 0)

  const dayEnd = new Date(start)
  dayEnd.setHours(WORKDAY_END_HOUR, 0, 0, 0)

  let cursor = new Date(dayStart)
  if (now > cursor) {
    cursor = new Date(now)
    cursor.setSeconds(0, 0)
    if (cursor.getMinutes() % 15 !== 0) {
      cursor.setMinutes(cursor.getMinutes() + (15 - (cursor.getMinutes() % 15)))
    }
  }

  if (cursor < dayStart) cursor = new Date(dayStart)

  while (cursor < dayEnd) {
    const end = new Date(cursor.getTime() + durationMinutes * 60 * 1000)
    if (end > dayEnd) return null
    const hasConflict = busyIntervals.some((busy) => overlaps(cursor, end, busy))
    if (!hasConflict) {
      return { start: new Date(cursor), end }
    }
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000)
  }

  return null
}

async function fetchBusyIntervalsInRange(
  supabaseUrl: string,
  supabaseKey: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BusyInterval[]> {
  const apptQuery = new URLSearchParams({
    select: 'start_time,end_time',
    order: 'start_time.asc',
    limit: '1000',
  })
  apptQuery.append('start_time', `gte.${rangeStart.toISOString()}`)
  apptQuery.append('start_time', `lte.${rangeEnd.toISOString()}`)

  const apptResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?${apptQuery.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (apptResponse.ok) {
    const rows = (await apptResponse.json()) as Array<{ start_time?: string; end_time?: string }>
    return rows
      .map((row) => {
        const start = parseIsoOrNull(row.start_time)
        const end = parseIsoOrNull(row.end_time) ?? (start ? new Date(start.getTime() + DEFAULT_TASK_DURATION_MINUTES * 60 * 1000) : null)
        if (!start || !end) return null
        return { start, end }
      })
      .filter((value): value is BusyInterval => value !== null)
  }

  const apptError = await apptResponse.text()
  if (!isMissingSupabaseTable(apptError, 'appointments')) {
    return []
  }

  const eventQuery = new URLSearchParams({
    select: 'event_time,showAsBusy',
    order: 'event_time.asc',
    limit: '1000',
  })
  eventQuery.append('event_time', `gte.${rangeStart.toISOString()}`)
  eventQuery.append('event_time', `lte.${rangeEnd.toISOString()}`)

  const eventResponse = await fetch(`${supabaseUrl}/rest/v1/events?${eventQuery.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (!eventResponse.ok) {
    return []
  }

  const rows = (await eventResponse.json()) as Array<{ event_time?: string | null; showAsBusy?: boolean | null }>
  return rows
    .map((row) => {
      if (row.showAsBusy === false) return null
      const start = parseIsoOrNull(String(row.event_time ?? ''))
      if (!start) return null
      const end = new Date(start.getTime() + DEFAULT_TASK_DURATION_MINUTES * 60 * 1000)
      return { start, end }
    })
    .filter((value): value is BusyInterval => value !== null)
}

async function findAvailableSlot(
  supabaseUrl: string,
  supabaseKey: string,
  preferredDeadlineIso: string | null,
  durationMinutes: number,
) {
  const now = new Date()
  const preferredDeadline = parseIsoOrNull(preferredDeadlineIso ?? '') ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const searchStart = startOfDay(now)
  const searchEnd = new Date(startOfDay(preferredDeadline))
  searchEnd.setDate(searchEnd.getDate() + 7)

  const busyIntervals = await fetchBusyIntervalsInRange(supabaseUrl, supabaseKey, searchStart, searchEnd)

  const dayCursor = new Date(searchStart)
  while (dayCursor <= searchEnd) {
    const slot = findOpenSlotInDay(dayCursor, busyIntervals, durationMinutes, now)
    if (slot) return slot
    dayCursor.setDate(dayCursor.getDate() + 1)
  }

  const fallbackStart = new Date(now.getTime() + 60 * 60 * 1000)
  fallbackStart.setSeconds(0, 0)
  return {
    start: fallbackStart,
    end: new Date(fallbackStart.getTime() + durationMinutes * 60 * 1000),
  }
}

async function updateTaskSchedule(
  supabaseUrl: string,
  supabaseKey: string,
  id: number,
  start: Date,
  end: Date,
  notePatch: Record<string, string>,
) {
  const apptPatchResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders(supabaseKey, 'return=representation'),
    body: JSON.stringify({
      start_time: formatIsoDate(start),
      end_time: formatIsoDate(end),
    }),
  })

  if (apptPatchResponse.ok) {
    const customerQuery = new URLSearchParams({
      select: 'customer_id,customers(notes)',
      id: `eq.${id}`,
      limit: '1',
    })
    const detailsResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?${customerQuery.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    if (detailsResponse.ok) {
      const rows = (await detailsResponse.json()) as Array<{ customer_id?: number; customers?: { notes?: string | null } | null }>
      const first = rows[0]
      if (first?.customer_id) {
        const nextNotes = mergeTaskMetadata(first.customers?.notes ?? '', notePatch)
        await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${first.customer_id}`, {
          method: 'PATCH',
          headers: supabaseHeaders(supabaseKey),
          body: JSON.stringify({ notes: nextNotes }),
        })
      }
    }

    return { ok: true as const, source: 'appointments' as const }
  }

  const apptError = await apptPatchResponse.text()
  if (!isMissingSupabaseTable(apptError, 'appointments')) {
    return { ok: false as const, details: apptError }
  }

  const currentEventResponse = await fetch(`${supabaseUrl}/rest/v1/events?select=title,note,description&id=eq.${id}&limit=1`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  let existingNote = ''
  if (currentEventResponse.ok) {
    const rows = (await currentEventResponse.json()) as Array<{ note?: string | null; description?: string | null }>
    existingNote = String(rows[0]?.note ?? rows[0]?.description ?? '')
  }

  const nextNote = mergeTaskMetadata(existingNote, notePatch)
  const eventPayloadVariants: Array<Record<string, unknown>> = [
    {
      event_time: formatIsoDate(start),
      note: nextNote,
    },
    {
      event_time: formatIsoDate(start),
      description: nextNote,
    },
    {
      event_time: formatIsoDate(start),
      title: composeLegacyEventTitle(undefined, nextNote),
    },
  ]

  let eventError = ''
  for (const payload of eventPayloadVariants) {
    const eventPatchResponse = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${id}`, {
      method: 'PATCH',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify(payload),
    })

    if (eventPatchResponse.ok) {
      return { ok: true as const, source: 'events' as const }
    }

    eventError = await eventPatchResponse.text()
    const lower = eventError.toLowerCase()
    const isMissingColumnError = lower.includes('column') && (lower.includes('does not exist') || lower.includes('could not find'))
    if (!isMissingColumnError) break
  }

  return { ok: false as const, details: eventError }
}

async function updateCalendarSchedule(
  supabaseUrl: string,
  supabaseKey: string,
  id: number,
  start: Date,
  end: Date,
) {
  const apptPatchResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders(supabaseKey, 'return=representation'),
    body: JSON.stringify({
      start_time: formatIsoDate(start),
      end_time: formatIsoDate(end),
    }),
  })

  if (apptPatchResponse.ok) {
    return { ok: true as const, source: 'appointments' as const }
  }

  const apptError = await apptPatchResponse.text()
  if (!isMissingSupabaseTable(apptError, 'appointments')) {
    return { ok: false as const, details: apptError }
  }

  const eventPatchResponse = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${id}`, {
    method: 'PATCH',
    headers: supabaseHeaders(supabaseKey, 'return=representation'),
    body: JSON.stringify({
      event_time: formatIsoDate(start),
    }),
  })

  if (eventPatchResponse.ok) {
    return { ok: true as const, source: 'events' as const }
  }

  const eventError = await eventPatchResponse.text()
  return { ok: false as const, details: eventError }
}

function inferTaskCategoryFromAppointment(row: {
  category?: string | null
  note?: string | null
}): ParsedTaskCategory {
  const note = String(row.note ?? '')
  const markerMatch = note.match(/TaskCategory:\s*(money|health|work\/study|errands)/i)
  if (markerMatch) {
    return markerMatch[1].toLowerCase() as ParsedTaskCategory
  }

  const normalized = String(row.category ?? '').trim().toLowerCase()
  if (normalized === 'business') return 'work/study'
  if (normalized === 'personal') return 'health'
  return 'errands'
}

function parseNaturalTask(text: string): ParsedTaskResult {
  const cleanText = normalizeTaskText(text)
  const now = new Date()
  const category = inferCategory(cleanText)
  const inferredDeadline = inferDeadline(cleanText, now)
  const priority = inferPriority(cleanText, inferredDeadline, now)
  const deadlineDate = inferredDeadline ?? inferSuggestedDeadline(category, priority, now)
  const taskName = inferTaskName(cleanText)

  return {
    intent: inferIntent(cleanText),
    taskName,
    category,
    deadline: deadlineDate ? formatIsoDate(deadlineDate) : null,
    priority,
    deadlineSource: inferredDeadline ? 'inferred' : 'suggested',
  }
}

appointmentsRouter.post('/parse', async (req: Request, res: Response) => {
  try {
    const body = req.body as ParseTaskBody
    const text = String(body.text ?? '').trim()

    if (!text) {
      return res.status(400).json({ error: 'text is required' })
    }

    return res.json({ data: parseNaturalTask(text) })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to parse task text', details })
  }
})

appointmentsRouter.post('/tasks', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const body = req.body as ParseTaskBody
    const text = String(body.text ?? '').trim()
    if (!text) {
      return res.status(400).json({ error: 'text is required' })
    }

    const parsed = parseNaturalTask(text)
    const slot = await findAvailableSlot(
      supabaseUrl,
      supabaseKey,
      parsed.deadline,
      DEFAULT_TASK_DURATION_MINUTES,
    )
    const startDate = slot.start
    const endDate = slot.end
    const note = buildTaskMetadataString({
      taskCategory: parsed.category,
      priority: parsed.priority,
      intent: parsed.intent,
      input: text,
      taskStatus: 'scheduled',
      deadline: parsed.deadline,
    })
    const eventTitle = parsed.taskName
    const category = mapTaskCategoryToEventCategory(parsed.category)
    const identity = createPersonalEventIdentity(eventTitle)

    const legacyCreate = await insertLegacyEvent(supabaseUrl, supabaseKey, eventTitle, note, text, category, startDate)
    if (legacyCreate.ok) {
      return res.status(201).json({
        success: true,
        data: {
          parsed,
          appointment: legacyCreate.appointment,
        },
      })
    }

    const legacyError = legacyCreate.details
    if (!isMissingSupabaseTable(legacyError, 'events')) {
      return res.status(400).json({
        error: 'Failed to create task in Supabase events table',
        details: legacyError,
      })
    }

    const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify({
        name: identity.name,
        email: identity.email,
        notes: buildAppointmentDetails(note, category, undefined, 'task'),
      }),
    })

    if (!customerResponse.ok) {
      const details = await customerResponse.text()
      return res.status(customerResponse.status).json({
        error: 'Failed to create task customer record',
        details,
      })
    }

    const customerRows = (await customerResponse.json()) as SupabaseCustomer[] | SupabaseCustomer
    const customer = Array.isArray(customerRows) ? customerRows[0] : customerRows

    if (!customer?.id) {
      return res.status(500).json({ error: 'Customer creation did not return a customer record' })
    }

    const apptPayload: Record<string, unknown> = {
      customer_id: customer.id,
      start_time: formatIsoDate(startDate),
      status: 'scheduled',
    }
    if (endDate) apptPayload.end_time = formatIsoDate(endDate)

    const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify(apptPayload),
    })

    if (!appointmentResponse.ok) {
      const details = await appointmentResponse.text()
      return res.status(appointmentResponse.status).json({
        error: 'Failed to save task in Supabase',
        details,
      })
    }

    const appointmentRows = (await appointmentResponse.json()) as SupabaseAppointment[] | SupabaseAppointment
    const appointment = Array.isArray(appointmentRows) ? appointmentRows[0] : appointmentRows

    return res.status(201).json({
      success: true,
      data: {
        parsed,
        appointment: {
          id: appointment.id,
          customer_id: customer.id,
          customer_name: customer.name,
          customer_email: customer.email,
          note,
          category,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          status: appointment.status,
        },
      },
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to capture and store task', details })
  }
})

appointmentsRouter.post('/tasks/reschedule-missed', async (_req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const now = new Date()
    const appointmentsResponse = await fetch(
      `${supabaseUrl}/rest/v1/appointments?select=id,start_time,customers(notes)&order=start_time.asc&limit=500`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      },
    )

    let candidates: Array<{ id: number; start: Date; note: string }> = []

    if (appointmentsResponse.ok) {
      const rows = (await appointmentsResponse.json()) as Array<{ id: number; start_time?: string; customers?: { notes?: string | null } | null }>
      candidates = rows
        .map((row) => {
          const start = parseIsoOrNull(row.start_time)
          if (!start) return null
          return {
            id: row.id,
            start,
            note: String(row.customers?.notes ?? ''),
          }
        })
        .filter((value): value is { id: number; start: Date; note: string } => value !== null)
    } else {
      const details = await appointmentsResponse.text()
      if (!isMissingSupabaseTable(details, 'appointments')) {
        return res.status(appointmentsResponse.status).json({ error: 'Failed to load tasks', details })
      }

      const legacy = await fetchLegacyEvents(supabaseUrl, supabaseKey, 500, false)
      if (!legacy.ok) {
        return res.status(legacy.status).json({ error: 'Failed to load tasks', details: legacy.details })
      }

      candidates = legacy.data
        .map((row) => {
          const start = parseIsoOrNull(row.start_time)
          if (!start) return null
          return {
            id: Number(row.id),
            start,
            note: String(row.note ?? ''),
          }
        })
        .filter((value): value is { id: number; start: Date; note: string } => value !== null)
    }

    let rescheduled = 0
    for (const candidate of candidates) {
      if (candidate.start >= now) continue
      const metadata = parseTaskMetadata(candidate.note)
      const status = String(metadata.TaskStatus ?? 'scheduled').toLowerCase()
      if (status === 'completed' || status === 'skipped') continue

      const slot = await findAvailableSlot(
        supabaseUrl,
        supabaseKey,
        metadata.Deadline ?? null,
        DEFAULT_TASK_DURATION_MINUTES,
      )

      const result = await updateTaskSchedule(
        supabaseUrl,
        supabaseKey,
        candidate.id,
        slot.start,
        slot.end,
        { TaskStatus: 'rescheduled' },
      )

      if (result.ok) rescheduled += 1
    }

    return res.json({ success: true, data: { rescheduled } })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to reschedule missed tasks', details })
  }
})

appointmentsRouter.post('/tasks/:id/adjust', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const taskId = Number(req.params.id)
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'task id must be a positive integer' })
    }

    const body = req.body as AdjustTaskBody
    const action = String(body.action ?? '').trim().toLowerCase()
    if (action !== 'delay' && action !== 'skip') {
      return res.status(400).json({ error: "action must be either 'delay' or 'skip'" })
    }

    if (action === 'skip') {
      const now = new Date()
      const end = new Date(now.getTime() + DEFAULT_TASK_DURATION_MINUTES * 60 * 1000)
      const result = await updateTaskSchedule(
        supabaseUrl,
        supabaseKey,
        taskId,
        now,
        end,
        { TaskStatus: 'skipped' },
      )
      if (!result.ok) {
        return res.status(400).json({ error: 'Failed to skip task', details: result.details })
      }

      return res.json({ success: true, data: { id: taskId, action: 'skip' } })
    }

    const delayMinutes = Math.min(Math.max(Number(body.delayMinutes ?? 24 * 60), 15), 14 * 24 * 60)
    const delayedAfter = new Date(Date.now() + delayMinutes * 60 * 1000)
    const slot = await findAvailableSlot(
      supabaseUrl,
      supabaseKey,
      delayedAfter.toISOString(),
      DEFAULT_TASK_DURATION_MINUTES,
    )

    const result = await updateTaskSchedule(
      supabaseUrl,
      supabaseKey,
      taskId,
      slot.start,
      slot.end,
      { TaskStatus: 'rescheduled' },
    )
    if (!result.ok) {
      return res.status(400).json({ error: 'Failed to delay task', details: result.details })
    }

    return res.json({
      success: true,
      data: {
        id: taskId,
        action: 'delay',
        start_time: formatIsoDate(slot.start),
        end_time: formatIsoDate(slot.end),
      },
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to adjust task', details })
  }
})

appointmentsRouter.get('/tasks/grouped', async (_req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/appointments?select=id,customer_id,start_time,end_time,status,customers(name,email,notes)&order=start_time.asc&limit=500`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    let tasks: Array<{ id: number | string; taskName: string; note: string | null; category: ParsedTaskCategory; start_time: string }> = []

    if (!response.ok) {
      const details = await response.text()
      if (isMissingSupabaseTable(details, 'appointments')) {
        const legacy = await fetchLegacyEvents(supabaseUrl, supabaseKey, 500, false)
        if (!legacy.ok) {
          return res.status(legacy.status).json({ error: 'Failed to group tasks', details: legacy.details })
        }

        tasks = legacy.data.map((row) => ({
          id: row.id,
          taskName: String(row.customer_name ?? 'Task'),
          note: row.note ?? null,
          category: inferTaskCategoryFromAppointment({ category: row.category, note: row.note }),
          start_time: String(row.start_time ?? ''),
        }))
      } else {
        return res.status(response.status).json({ error: 'Failed to group tasks', details })
      }
    } else {
      const rows = (await response.json()) as SupabaseAppointment[]
      tasks = rows.map((row) => {
        const details = parseAppointmentDetails(row.customers?.notes ?? null)
        return {
          id: row.id,
          taskName: String(row.customers?.name ?? 'Task'),
          note: details.note ?? null,
          category: inferTaskCategoryFromAppointment({ category: details.category, note: details.note }),
          start_time: row.start_time,
        }
      })
    }

    const grouped: Record<ParsedTaskCategory, typeof tasks> = {
      money: [],
      health: [],
      'work/study': [],
      errands: [],
    }

    for (const task of tasks) {
      grouped[task.category].push(task)
    }

    return res.json({ data: grouped })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to group tasks', details })
  }
})

async function fetchLegacyEvents(supabaseUrl: string, supabaseKey: string, limit: number, nowOnly: boolean) {
  const query = new URLSearchParams({
    select: '*',
    order: 'event_time.asc',
    limit: String(limit),
  })

  if (nowOnly) {
    query.set('event_time', `gte.${new Date().toISOString()}`)
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/events?${query.toString()}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const details = await response.text()
    return { ok: false as const, status: response.status, details }
  }

  const rows = (await response.json()) as SupabaseLegacyEvent[]
  const data = rows.map((row) => {
    const titleParts = parseLegacyEventTitle(row.title)
    const details = parseAppointmentDetails(row.note ?? row.description ?? titleParts.note)
    return {
      id: row.id,
      customer_id: null,
      customer_name: titleParts.customer_name,
      customer_email: null,
      note: details.note ?? row.note ?? row.description ?? titleParts.note,
      category: row.category ?? null,
      location: details.location ?? null,
      itemType: details.itemType ?? null,
      start_time: row.event_time ?? '',
      end_time: null,
      status: 'scheduled',
    }
  })

  return { ok: true as const, data }
}

async function insertLegacyEvent(
  supabaseUrl: string,
  supabaseKey: string,
  eventTitle: string,
  detailsText: string,
  displayNote: string,
  category: string,
  startDate: Date,
) {
  const categoryValue = normalizeEventCategory(category)
  const eventTime = formatIsoDate(startDate)

  const payloadVariants: Array<Record<string, unknown>> = [
    {
      title: eventTitle || 'Event',
      event_time: eventTime,
      category: categoryValue,
      note: detailsText || null,
    },
    {
      title: eventTitle || 'Event',
      event_time: eventTime,
      category: categoryValue,
      description: detailsText || null,
    },
    {
      title: composeLegacyEventTitle(eventTitle, displayNote),
      event_time: eventTime,
      category: categoryValue,
    },
  ]

  let lastErrorDetails = ''

  for (const payload of payloadVariants) {
    const response = await fetch(`${supabaseUrl}/rest/v1/events`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      const rows = (await response.json()) as SupabaseLegacyEvent[] | SupabaseLegacyEvent
      const event = Array.isArray(rows) ? rows[0] : rows
      return {
        ok: true as const,
        appointment: {
          id: event.id,
          customer_id: null,
          customer_name: eventTitle || 'Event',
          customer_email: null,
          note: detailsText || null,
          category: event.category ?? categoryValue,
          start_time: event.event_time ?? eventTime,
          end_time: null,
          status: 'scheduled',
        },
      }
    }

    lastErrorDetails = await response.text()
    const lower = lastErrorDetails.toLowerCase()
    const isMissingColumnError =
      lower.includes('column') &&
      (lower.includes('does not exist') || lower.includes('could not find'))

    if (!isMissingColumnError) {
      break
    }
  }

  return {
    ok: false as const,
    details: lastErrorDetails,
  }
}

appointmentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const limit = Math.min(Math.max(Number(req.query.limit ?? 200), 1), 500)
    const nowOnly = String(req.query.upcoming ?? 'false') === 'true'

    let primary: any[] = []
    let primaryFetched = false
    let warning: string | undefined

    const hasCalAi = Boolean(process.env.CAL_API_KEY)
    if (hasCalAi) {
      const calResult = await listCalendarEvents({ limit, upcoming: nowOnly })
      if (calResult.ok) {
        primary = calResult.data
        primaryFetched = true
      }
    }

    if (!primaryFetched) {
      const googleResult = await listGoogleCalendarEvents(user.id, { limit, upcoming: nowOnly }).catch(() => null)
      if (googleResult && googleResult.ok) {
        primary = googleResult.data
        primaryFetched = true
      }
    }

    if (!primaryFetched) {
      const { supabaseUrl, supabaseKey } = getSupabaseConfig()
      if (!supabaseUrl || !supabaseKey) {
        warning = 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env.'
      } else {
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

        if (response.ok) {
          const rows = (await response.json()) as SupabaseAppointment[]
          primary = rows.map((row) => ({
            id: row.id,
            customer_id: row.customer_id,
            customer_name: row.customers?.name ?? null,
            customer_email: row.customers?.email ?? null,
            ...parseAppointmentDetails(row.customers?.notes ?? null),
            start_time: row.start_time,
            end_time: row.end_time,
            status: row.status,
          }))
          primaryFetched = true
        } else {
          const details = await response.text()
          if (isMissingSupabaseTable(details, 'appointments')) {
            const legacy = await fetchLegacyEvents(supabaseUrl, supabaseKey, limit, nowOnly)
            if (legacy.ok && Array.isArray(legacy.data)) {
              primary = legacy.data
              primaryFetched = true
            }
          }
        }
      }
    }

    const taggedPrimary: UnifiedCalendarRecord[] = primary.map((e) => ({ ...e, source: 'google' as const }))
    const tasks = await fetchClusterBlocks(limit, nowOnly)

    const data: UnifiedCalendarRecord[] = [...taggedPrimary, ...tasks].sort((a, b) => {
      const ta = new Date(a.start_time).getTime()
      const tb = new Date(b.start_time).getTime()
      return ta - tb
    })

    return res.json(warning ? { data, warning } : { data })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.delete('/', async (_req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  }

  try {
    let deletedAppointments = 0
    let deletedLegacyEvents = 0

    const appointmentsResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=gt.0`, {
      method: 'DELETE',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
    })

    if (!appointmentsResponse.ok) {
      const details = await appointmentsResponse.text()
      if (!isMissingSupabaseTable(details, 'appointments')) {
        return res.status(appointmentsResponse.status).json({
          error: 'Failed to reset appointments in Supabase',
          details,
        })
      }
    } else {
      const rows = (await appointmentsResponse.json().catch(() => [])) as unknown
      deletedAppointments = Array.isArray(rows) ? rows.length : rows ? 1 : 0
    }

    const eventsResponse = await fetch(`${supabaseUrl}/rest/v1/events?id=gt.0`, {
      method: 'DELETE',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
    })

    if (!eventsResponse.ok) {
      const details = await eventsResponse.text()
      if (!isMissingSupabaseTable(details, 'events')) {
        return res.status(eventsResponse.status).json({
          error: 'Failed to reset legacy events in Supabase',
          details,
        })
      }
    } else {
      const rows = (await eventsResponse.json().catch(() => [])) as unknown
      deletedLegacyEvents = Array.isArray(rows) ? rows.length : rows ? 1 : 0
    }

    return res.json({
      success: true,
      reset: true,
      deletedAppointments,
      deletedLegacyEvents,
      totalDeleted: deletedAppointments + deletedLegacyEvents,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const appointmentId = String(req.params.id ?? '').trim()
    if (!appointmentId) {
      return res.status(400).json({ error: 'appointment id is required' })
    }

    const numericId = Number(appointmentId)
    const isNumericId = Number.isInteger(numericId) && numericId > 0

    if (!isNumericId) {
      const googleDelete = await deleteGoogleCalendarEvent(user.id, appointmentId)
      if (googleDelete.ok) {
        return res.json({ success: true, deleted: true, id: appointmentId, source: 'google' })
      }

      if (googleDelete.status !== 404) {
        return res.status(googleDelete.status).json({
          error: 'Failed to delete event from Google Calendar',
          details: googleDelete.details,
        })
      }
    }

    const { supabaseUrl, supabaseKey } = getSupabaseConfig()
    if (!supabaseUrl || !supabaseKey) {
      if (!isNumericId) {
        const hasCalAi = Boolean(process.env.CAL_API_KEY)
        if (hasCalAi) {
          const calDelete = await deleteCalendarEvent(appointmentId)
          if (calDelete.ok) {
            return res.json({ success: true, deleted: true, id: appointmentId, source: 'cal-ai' })
          }

          return res.status(calDelete.status).json({
            error: 'Failed to delete calendar event from Cal AI',
            details: calDelete.details,
          })
        }
      }

      return res.status(503).json({
        error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
      })
    }

    if (!isNumericId) {
      const hasCalAi = Boolean(process.env.CAL_API_KEY)
      if (!hasCalAi) {
        return res.status(404).json({ error: 'Event not found' })
      }

      const calDelete = await deleteCalendarEvent(appointmentId)
      if (calDelete.ok) {
        return res.json({ success: true, deleted: true, id: appointmentId, source: 'cal-ai' })
      }

      return res.status(calDelete.status).json({
        error: 'Failed to delete calendar event from Cal AI',
        details: calDelete.details,
      })
    }

    const appointmentResponse = await fetch(`${supabaseUrl}/rest/v1/appointments?id=eq.${numericId}`, {
      method: 'DELETE',
      headers: supabaseHeaders(supabaseKey),
    })

    if (!appointmentResponse.ok) {
      const details = await appointmentResponse.text()
      if (isMissingSupabaseTable(details, 'appointments')) {
        const legacyResponse = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${numericId}`, {
          method: 'DELETE',
          headers: supabaseHeaders(supabaseKey),
        })

        if (!legacyResponse.ok) {
          const legacyDetails = await legacyResponse.text()
          return res.status(legacyResponse.status).json({
            error: 'Failed to delete calendar event from Supabase',
            details: legacyDetails,
          })
        }

        return res.json({ success: true, deleted: true, id: numericId })
      }

      return res.status(appointmentResponse.status).json({
        error: 'Failed to delete appointment from Supabase',
        details,
      })
    }

    return res.json({ success: true, deleted: true, id: numericId })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})

appointmentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = req.body as CreateAppointmentBody
    
    // Preserve original ISO strings if they have timezone info
    const originalStartTime = String(body.start_time ?? '').trim()
    const hasStartTimeZone = /[Z+-]\d{2}:\d{2}$/.test(originalStartTime) || originalStartTime.endsWith('Z')
    
    const parsedFromStart = parseIsoOrNull(originalStartTime)
    const parsedFromDateTime = parseDateAndTimeOrNull(body.date, body.time)
    const startDate = parsedFromStart ?? parsedFromDateTime
    if (!startDate) {
      return res.status(400).json({
        error: 'Provide a valid start_time (ISO 8601) or both date and time',
      })
    }

    const itemType = String(body.itemType ?? 'event').trim().toLowerCase() === 'task' ? 'task' : 'event'

    let endDate: Date | null = null
    let originalEndTime = String(body.end_time ?? '').trim()
    const hasEndTimeZone = /[Z+-]\d{2}:\d{2}$/.test(originalEndTime) || originalEndTime.endsWith('Z')

    const endFromBody = parseIsoOrNull(originalEndTime)
    if (endFromBody) {
      endDate = endFromBody
    } else if (itemType === 'event') {
      const durationMinutes = Math.min(Math.max(Number(body.duration_minutes ?? 60), 5), 24 * 60)
      endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
    }

    if (endDate && endDate.getTime() <= startDate.getTime()) {
      return res.status(400).json({ error: 'end_time must be after start_time' })
    }

    const eventTitle = String(body.customer_name ?? body.title ?? '').trim()
    const note = String(body.note ?? '').trim()
    const category = String(body.category ?? '').trim()
    const location = String(body.location ?? '').trim()
    
    // Preserve caller-local datetime literals when provided, otherwise format from Date.
    const localStartIso = normalizeLocalIsoDateTime(originalStartTime)
    const startTime = hasStartTimeZone && originalStartTime
      ? originalStartTime
      : localStartIso
        ? localStartIso
        : buildLocalIsoFromDateAndTime(body.date, body.time) ?? formatIsoDate(startDate)

    let endTime: string | undefined
    if (endDate) {
      const localEndIso = normalizeLocalIsoDateTime(originalEndTime)
      endTime = hasEndTimeZone && originalEndTime
        ? originalEndTime
        : localEndIso
          ? localEndIso
          : buildLocalIsoFromDateAndTime(body.date, originalEndTime) ?? formatIsoDate(endDate)
    }
    
    const detailText = itemType === 'task'
      ? buildQuickTaskMetadata({ title: eventTitle, note, category, location, startTime: startDate })
      : buildAppointmentDetails(note, category, location, itemType)

    const targetSource = String((body as { source?: unknown }).source ?? '').trim().toLowerCase()

    if (targetSource === 'cluster') {
      try {
        const { supabaseUrl, supabaseKey } = getSupabaseConfig()
        if (!supabaseUrl || !supabaseKey) {
          return res.status(503).json({
            error: 'Supabase is not configured for cluster calendar events',
          })
        }

        const created = await writeClusterEvent({ url: supabaseUrl, key: supabaseKey }, {
          title: eventTitle,
          note,
          location,
          itemType,
          startTime,
          endTime: endTime ?? null,
        })

        if (!created.ok) {
          return res.status(created.status).json({
            error: 'Failed to create calendar event in Supabase',
            details: created.details,
          })
        }

        return res.status(201).json({
          success: true,
          source: 'cluster',
          appointment: created.appointment,
        })
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err)
        return res.status(500).json({
          error: 'Failed to save Cluster event to Supabase',
          details,
        })
      }
    }

    const hasCalAi = Boolean(process.env.CAL_API_KEY)

    if (hasCalAi) {
      const calEndTime = endTime ?? formatIsoDate(new Date(startDate.getTime() + 60 * 1000))
      const calCreate = await createCalendarEvent({
        title: eventTitle || 'Event',
        note: detailText,
        category,
        location,
        itemType,
        startTime,
        endTime: calEndTime,
      })

      if (calCreate.ok) {
        const { supabaseUrl, supabaseKey } = getSupabaseConfig()
        if (supabaseUrl && supabaseKey) {
          const mirrorResult = await insertLegacyEvent(
            supabaseUrl,
            supabaseKey,
            eventTitle,
            detailText ?? note,
            note,
            category,
            startDate,
          )

          if (!mirrorResult.ok) {
            await deleteCalendarEvent(String(calCreate.appointment.id)).catch(() => null)
            return res.status(502).json({
              error: 'Failed to mirror event to Supabase',
              details: mirrorResult.details,
            })
          }
        }

        const appointment = calCreate.appointment
        if (itemType === 'task' && !endDate) appointment.end_time = null
        return res.status(201).json({
          success: true,
          source: 'cal-ai',
          mirroredTo: supabaseUrl && supabaseKey ? 'supabase' : undefined,
          appointment,
        })
      }

      return res.status(calCreate.status).json({
        error: 'Failed to create event in Cal AI',
        details: calCreate.details,
      })
    }

    const { supabaseUrl, supabaseKey } = getSupabaseConfig()
    if (!supabaseUrl || !supabaseKey) {
      return res.status(503).json({
        error: 'Supabase is not configured for calendar events',
      })
    }

    const identity = createPersonalEventIdentity(eventTitle)

    const legacyCreate = await insertLegacyEvent(supabaseUrl, supabaseKey, eventTitle, detailText ?? note, note, category, startDate)
    if (legacyCreate.ok) {
      return res.status(201).json({ success: true, appointment: legacyCreate.appointment })
    }

    const legacyError = legacyCreate.details
    if (!isMissingSupabaseTable(legacyError, 'events')) {
      return res.status(400).json({
        error: 'Failed to create personal event in Supabase events table',
        details: legacyError,
      })
    }

    const customerResponse = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, 'return=representation'),
      body: JSON.stringify({
        name: identity.name,
        email: identity.email,
        notes: buildAppointmentDetails(note, category, location, itemType),
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
        end_time: endDate ? formatIsoDate(endDate) : null,
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

appointmentsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const eventId = String(req.params.id ?? '').trim()
    if (!eventId) {
      return res.status(400).json({ error: 'appointment id is required' })
    }

    const body = req.body as UpdateAppointmentBody
    const title = String(body.customer_name ?? body.title ?? '').trim()
    const note = String(body.note ?? '').trim()
    const category = String(body.category ?? '').trim()
    let startTime = String(body.start_time ?? '').trim()
    let endTime = String(body.end_time ?? '').trim()

    // Only reformat if needed (12-hour time format), preserve timezone-aware ISO strings
    if (startTime && !(/[Z+-]\d{2}:\d{2}$/.test(startTime) || startTime.endsWith('Z'))) {
      const parsed = parseIsoOrNull(startTime)
      if (parsed) startTime = formatIsoDate(parsed)
    }
    if (endTime && !(/[Z+-]\d{2}:\d{2}$/.test(endTime) || endTime.endsWith('Z'))) {
      const parsed = parseIsoOrNull(endTime)
      if (parsed) endTime = formatIsoDate(parsed)
    }

    const hasUpdate = Boolean(title || note || category || startTime || endTime)
    if (!hasUpdate) {
      return res.status(400).json({ error: 'Provide at least one field to update' })
    }

    // Cluster (local Prisma) events first
    const clusterRow = await prisma.event.findUnique({ where: { id: eventId } }).catch(() => null)
    if (clusterRow) {
      const updateData: Record<string, unknown> = {}
      if (title) updateData.title = title
      if (note) updateData.description = note
      if (startTime) {
        const parsed = parseIsoOrNull(startTime)
        if (parsed) updateData.start_time = parsed
      }
      if (endTime) {
        const parsed = parseIsoOrNull(endTime)
        if (parsed) updateData.end_time = parsed
      }
      try {
        const updated = await prisma.event.update({ where: { id: eventId }, data: updateData })

        if (updated.google_event_id) {
          const googleUpdate = await updateGoogleCalendarEvent(user.id, updated.google_event_id, {
            title: title || undefined,
            note: note || undefined,
            category: category || undefined,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
          })

          if (googleUpdate.ok) {
            return res.json({
              success: true,
              updated: true,
              source: 'google',
              appointment: googleUpdate.appointment,
            })
          }

          return res.status(googleUpdate.status).json({
            error: 'Failed to update event in Google Calendar',
            details: googleUpdate.details,
          })
        }

        return res.json({
          success: true,
          updated: true,
          source: 'cluster',
          appointment: {
            id: updated.id,
            customer_id: null,
            customer_name: updated.title,
            customer_email: null,
            note: updated.description,
            category: null,
            location: updated.location,
            itemType: updated.itemType === 'task' ? 'task' : 'event',
            start_time: updated.start_time.toISOString(),
            end_time: updated.end_time ? updated.end_time.toISOString() : null,
            status: updated.status,
            source: 'cluster',
          },
        })
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err)
        return res.status(500).json({ error: 'Failed to update Cluster event', details })
      }
    }

    const { supabaseUrl, supabaseKey } = getSupabaseConfig()
    if (eventId && !Number.isInteger(Number(eventId))) {
      const googleUpdate = await updateGoogleCalendarEvent(user.id, eventId, {
        title: title || undefined,
        note: note || undefined,
        category: category || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
      })

      if (googleUpdate.ok) {
        return res.json({
          success: true,
          updated: true,
          source: 'google',
          appointment: googleUpdate.appointment,
        })
      }

      if (googleUpdate.status !== 404) {
        return res.status(googleUpdate.status).json({
          error: 'Failed to update event in Google Calendar',
          details: googleUpdate.details,
        })
      }
    }

    if (supabaseUrl && supabaseKey) {
      const numericId = Number(eventId)
      if (Number.isInteger(numericId) && numericId > 0) {
        const parsedStart = startTime ? parseIsoOrNull(startTime) : null
        const parsedEnd = endTime ? parseIsoOrNull(endTime) : null
        if (parsedStart && parsedEnd) {
          const calendarUpdate = await updateCalendarSchedule(supabaseUrl, supabaseKey, numericId, parsedStart, parsedEnd)
          if (calendarUpdate.ok) {
            return res.json({
              success: true,
              updated: true,
              source: 'google',
              appointment: {
                id: numericId,
                customer_id: null,
                customer_name: title || 'Event',
                customer_email: null,
                note: note || null,
                category: category || null,
                location: null,
                itemType: 'event',
                start_time: parsedStart.toISOString(),
                end_time: parsedEnd.toISOString(),
                status: 'scheduled',
                source: 'google',
              },
            })
          }

          return res.status(500).json({
            error: 'Failed to update appointment in Supabase',
            details: calendarUpdate.details,
          })
        }
      }
    }

    const hasCalAi = Boolean(process.env.CAL_API_KEY)

    if (!hasCalAi) {
      return res.status(404).json({ error: 'Event not found' })
    }

    const calUpdate = await updateCalendarEvent(eventId, {
      title: title || undefined,
      note: note || undefined,
      category: category || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    })

    if (!calUpdate.ok) {
      return res.status(calUpdate.status).json({
        error: 'Failed to update event in Cal AI',
        details: calUpdate.details,
      })
    }

    return res.json({
      success: true,
      updated: true,
      source: 'cal-ai',
      appointment: calUpdate.appointment,
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
