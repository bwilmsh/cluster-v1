import { randomUUID } from 'crypto'
import { prisma } from '../db'
import { suggestHabitSlot, type HabitScheduleEvent } from '../lib/groq'

type HabitLike = Record<string, any>

type BusyInterval = {
  start: Date
  end: Date
}

type ScheduleResult = {
  created: number
  unscheduledDates: string[]
  skippedDates: string[]
}

type Slot = {
  start: Date
  end: Date
}

const WORKDAY_MINUTES = { start: 6 * 60, end: 22 * 60 }
const SEARCH_STEP_MINUTES = 15

function hasDelegate(name: string) {
  return Boolean((prisma as any)[name])
}

function localDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, amount: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

function parseTimeToMinutes(value?: string | null) {
  if (!value) return null
  const parts = String(value).split(':').map((part) => Number(part))
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) return null
  return parts[0] * 60 + parts[1]
}

function minutesToDate(baseDay: Date, minutes: number) {
  const result = new Date(baseDay)
  result.setHours(0, 0, 0, 0)
  result.setMinutes(minutes)
  return result
}

function dayOfWeekCode(date: Date) {
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][date.getDay()]
}

function normalizeKeywords(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeDaysOfWeek(habit: HabitLike) {
  const daysOfWeek = Array.isArray(habit.daysOfWeek) ? habit.daysOfWeek.map((day: unknown) => String(day).toUpperCase()).filter(Boolean) : []
  if (daysOfWeek.length > 0) return daysOfWeek

  if (typeof habit.rrule === 'string') {
    const match = habit.rrule.match(/BYDAY=([A-Z,]+)/)
    if (match?.[1]) return match[1].split(',').filter(Boolean)
  }

  if (typeof habit.cadence === 'string') {
    if (habit.cadence === 'daily') return ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
    if (habit.cadence === 'weekly') return [dayOfWeekCode(new Date(habit.createdAt ?? Date.now()))]
  }

  if (habit.frequency === 'WEEKDAYS') return ['MO', 'TU', 'WE', 'TH', 'FR']
  if (habit.frequency === 'DAILY') return ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

  return []
}

function resolveFrequency(habit: HabitLike) {
  const frequency = String(habit.frequency ?? '').toUpperCase()
  if (['DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM'].includes(frequency)) return frequency
  if (habit.cadence === 'daily') return 'DAILY'
  if (habit.cadence === 'weekly') return 'WEEKLY'
  return 'CUSTOM'
}

function resolveWindow(habit: HabitLike) {
  const idealTime = String(habit.idealTime ?? '').toUpperCase()
  const defaults = {
    MORNING: { start: 6 * 60, end: 12 * 60, ideal: 9 * 60 },
    AFTERNOON: { start: 12 * 60, end: 17 * 60, ideal: 14 * 60 },
    EVENING: { start: 17 * 60, end: 21 * 60, ideal: 19 * 60 },
  }

  const fallback = defaults[idealTime as keyof typeof defaults] ?? defaults.MORNING
  const start = parseTimeToMinutes(habit.timeRangeStart ?? habit.timeOfDay) ?? fallback.start
  const end = parseTimeToMinutes(habit.timeRangeEnd ?? habit.endTime) ?? fallback.end

  return {
    start: Math.max(WORKDAY_MINUTES.start, Math.min(WORKDAY_MINUTES.end, start)),
    end: Math.max(WORKDAY_MINUTES.start, Math.min(WORKDAY_MINUTES.end, end)),
    ideal: fallback.ideal,
  }
}

function overlaps(start: Date, end: Date, busy: BusyInterval) {
  return start < busy.end && end > busy.start
}

function findBestSlot(day: Date, busyIntervals: BusyInterval[], durationMinutes: number, windowStart: number, windowEnd: number, idealMinutes: number) {
  const baseDay = startOfLocalDay(day)
  const searchStart = Math.max(windowStart, WORKDAY_MINUTES.start)
  const searchEnd = Math.min(windowEnd, WORKDAY_MINUTES.end)

  if (searchEnd - searchStart < durationMinutes) return null

  let best: { slot: Slot; score: number; startMinute: number } | null = null
  for (let cursor = searchStart; cursor + durationMinutes <= searchEnd; cursor += SEARCH_STEP_MINUTES) {
    const start = minutesToDate(baseDay, cursor)
    const end = minutesToDate(baseDay, cursor + durationMinutes)
    const conflict = busyIntervals.some((interval) => overlaps(start, end, interval))
    if (conflict) continue

    const score = Math.abs(cursor - idealMinutes)
    if (!best || score < best.score || (score === best.score && cursor < best.startMinute)) {
      best = { slot: { start, end }, score, startMinute: cursor }
    }
  }

  return best?.slot ?? null
}

async function fetchBusyIntervals(rangeStart: Date, rangeEnd: Date, habitId?: string) {
  const events = habitId
    ? await prisma.$queryRaw<Array<{ start_time: Date; end_time: Date | null }>>`
        SELECT "start_time", "end_time"
        FROM "Event"
        WHERE "start_time" < ${rangeEnd}
          AND "end_time" > ${rangeStart}
          AND COALESCE("showAsBusy", true) = true
          AND COALESCE("habitId", '') <> ${habitId}
      `
    : await prisma.$queryRaw<Array<{ start_time: Date; end_time: Date | null }>>`
        SELECT "start_time", "end_time"
        FROM "Event"
        WHERE "start_time" < ${rangeEnd}
          AND "end_time" > ${rangeStart}
          AND COALESCE("showAsBusy", true) = true
      `

  return events
    .map((event) => ({
      start: event.start_time,
      end: event.end_time ?? new Date(event.start_time.getTime() + 30 * 60 * 1000),
    }))
    .filter((event) => event.end > rangeStart && event.start < rangeEnd)
}

async function loadExistingEntries(habitId: string, rangeStart: Date, rangeEnd: Date) {
  const habitEntryDelegate = (prisma as any).habitEntry
  if (habitEntryDelegate?.findMany) {
    return habitEntryDelegate.findMany({
      where: { habitId, scheduledDate: { gte: rangeStart, lt: rangeEnd } },
      orderBy: { scheduledDate: 'asc' },
      include: { event: true },
    })
  }

  return prisma.$queryRaw<any[]>`
    SELECT *
    FROM "HabitEntry"
    WHERE "habitId" = ${habitId}
      AND "scheduledDate" >= ${rangeStart}
      AND "scheduledDate" < ${rangeEnd}
    ORDER BY "scheduledDate" ASC
  `
}

async function deleteExistingPlannedEntries(habitId: string, rangeStart: Date, rangeEnd: Date) {
  const existing = await loadExistingEntries(habitId, rangeStart, rangeEnd)
  const toDelete = existing.filter((entry) => String(entry.status ?? '').toUpperCase() === 'SCHEDULED')

  for (const entry of toDelete) {
    if (entry.event?.id) {
      await prisma.event.delete({ where: { id: entry.event.id } }).catch(() => null)
    }

    if ((prisma as any).habitEntry?.delete) {
      await (prisma as any).habitEntry.delete({ where: { id: entry.id } }).catch(() => null)
    } else {
      await prisma.$executeRaw`DELETE FROM "HabitEntry" WHERE "id" = ${entry.id}`
    }
  }
}

async function syncEntryEvent(habit: HabitLike, entry: any) {
  const showAsBusy = habit.showAsBusy !== false
  const hideDetails = Boolean(habit.hideDetails)
  const eventData = {
    title: hideDetails ? 'Busy' : `${habit.name} (habit)`,
    description: hideDetails ? null : habit.description ?? null,
    startTime: new Date(entry.scheduledStart),
    endTime: new Date(entry.scheduledEnd),
    status: String(entry.status ?? 'SCHEDULED').toLowerCase() === 'completed' ? 'done' : 'todo',
    habitEntryId: entry.id,
    habitOccurrenceAt: new Date(entry.scheduledDate),
    habitLocked: false,
    showAsBusy,
    hideDetails,
    scheduleReason: habit.scheduleReason ?? null,
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
    updatedAt: new Date(),
  }

  const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Event"
    WHERE "habitEntryId" = ${entry.id}
    LIMIT 1
  `
  const existing = existingRows[0]
  if (existing) {
    await prisma.$executeRaw`
      UPDATE "Event"
      SET
        "title" = ${eventData.title},
        "description" = ${eventData.description},
        "start_time" = ${eventData.startTime},
        "end_time" = ${eventData.endTime},
        "itemType" = 'habit',
        "status" = ${eventData.status},
        "tags" = ARRAY['habit']::text[],
        "habitEntryId" = ${eventData.habitEntryId},
        "habitOccurrenceAt" = ${eventData.habitOccurrenceAt},
        "habitLocked" = ${eventData.habitLocked},
        "showAsBusy" = ${eventData.showAsBusy},
        "hideDetails" = ${eventData.hideDetails},
        "scheduleReason" = ${eventData.scheduleReason},
        "createdAt" = COALESCE(${eventData.createdAt}, "createdAt"),
        "updatedAt" = ${eventData.updatedAt}
      WHERE "id" = ${existing.id}
    `.catch(() => null)
    return existing.id
  }

  const createdRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Event" (
      "id",
      "title",
      "description",
      "start_time",
      "end_time",
      "itemType",
      "status",
      "priority",
      "reminderSent",
      "tags",
      "habitEntryId",
      "habitOccurrenceAt",
      "habitLocked",
      "showAsBusy",
      "hideDetails",
      "scheduleReason",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${eventData.title},
      ${eventData.description},
      ${eventData.startTime},
      ${eventData.endTime},
      'habit',
      ${eventData.status},
      'medium',
      false,
      ARRAY['habit']::text[],
      ${eventData.habitEntryId},
      ${eventData.habitOccurrenceAt},
      ${eventData.habitLocked},
      ${eventData.showAsBusy},
      ${eventData.hideDetails},
      ${eventData.scheduleReason},
      ${eventData.createdAt},
      ${eventData.updatedAt}
    )
    RETURNING "id"
  `
  return createdRows[0]?.id ?? null
}

async function upsertHabitEntry(habit: HabitLike, date: Date, slot: Slot) {
  const habitEntryDelegate = (prisma as any).habitEntry
  const scheduledDate = startOfLocalDay(date)
  const data = {
    habitId: habit.id,
    scheduledDate,
    scheduledStart: slot.start,
    scheduledEnd: slot.end,
    status: 'SCHEDULED',
    wasRescheduled: false,
    completedAt: null,
  }

  if (habitEntryDelegate?.upsert) {
    return habitEntryDelegate.upsert({
      where: {
        habitId_scheduledDate: {
          habitId: habit.id,
          scheduledDate,
        },
      },
      update: data,
      create: data,
    })
  }

  const [row] = await prisma.$queryRaw<any[]>`
    INSERT INTO "HabitEntry" (
      "id",
      "habitId",
      "scheduledDate",
      "scheduledStart",
      "scheduledEnd",
      "status",
      "wasRescheduled",
      "completedAt",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${habit.id},
      ${scheduledDate},
      ${slot.start},
      ${slot.end},
      'SCHEDULED',
      false,
      ${null},
      NOW(),
      NOW()
    )
    ON CONFLICT ("habitId", "scheduledDate")
    DO UPDATE SET
      "scheduledStart" = EXCLUDED."scheduledStart",
      "scheduledEnd" = EXCLUDED."scheduledEnd",
      "status" = EXCLUDED."status",
      "wasRescheduled" = EXCLUDED."wasRescheduled",
      "updatedAt" = NOW()
    RETURNING *
  `

  return row
}

async function loadEventsForKeywordCheck(rangeStart: Date, rangeEnd: Date) {
  return prisma.event.findMany({
    where: { start_time: { lt: rangeEnd }, end_time: { gt: rangeStart } },
    select: { title: true, start_time: true },
  })
}

async function loadEventsForDay(dayStart: Date, dayEnd: Date) {
  return prisma.event.findMany({
    where: { start_time: { gte: dayStart, lt: dayEnd } },
    select: { title: true, start_time: true, end_time: true, description: true, itemType: true },
  })
}

async function chooseHabitSlotForDay(habit: HabitLike, day: Date, durationMinutes: number, busyIntervals: BusyInterval[]) {
  const dayStart = startOfLocalDay(day)
  const dayEnd = addDays(dayStart, 1)
  const dayEvents = await loadEventsForDay(dayStart, dayEnd)
  const aiSuggestion = await suggestHabitSlot({
    habitName: String(habit.name ?? 'Habit'),
    durationMinutes,
    habitNote: typeof habit.notes === 'string' ? habit.notes : null,
    events: dayEvents.map((event) => ({
      title: event.title ?? null,
      start_time: event.start_time.toISOString(),
      end_time: event.end_time ? event.end_time.toISOString() : null,
      description: event.description ?? null,
      itemType: event.itemType ?? null,
    } satisfies HabitScheduleEvent)),
  })

  const window = resolveWindow(habit)

  if (aiSuggestion) {
    const startMinutes = parseTimeToMinutes(aiSuggestion.startTime)
    if (startMinutes !== null) {
      const start = minutesToDate(dayStart, startMinutes)
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
      const withinBounds = startMinutes >= window.start && startMinutes + durationMinutes <= window.end
      const conflict = busyIntervals.some((interval) => overlaps(start, end, interval))
      if (withinBounds && !conflict) {
        return { slot: { start, end }, reason: aiSuggestion.reason }
      }
    }
  }

  const fallback = findBestSlot(dayStart, busyIntervals, durationMinutes, window.start, window.end, window.ideal)
  if (fallback) {
    return {
      slot: fallback,
      reason: aiSuggestion?.reason
        ? `${aiSuggestion.reason} The suggested time conflicted, so Cluster used the nearest open slot.`
        : 'Cluster checked your calendar and scheduled the nearest available slot between 6am and 10pm.',
    }
  }

  return null
}

function dayMatchesHabit(habit: HabitLike, day: Date) {
  const frequency = resolveFrequency(habit)
  const weekday = dayOfWeekCode(day)
  const daysOfWeek = normalizeDaysOfWeek(habit)

  if (frequency === 'DAILY') return true
  if (frequency === 'WEEKDAYS') return ['MO', 'TU', 'WE', 'TH', 'FR'].includes(weekday)
  if (frequency === 'WEEKLY') return daysOfWeek.length > 0 ? daysOfWeek.includes(weekday) : true
  if (frequency === 'CUSTOM') return daysOfWeek.includes(weekday)
  return false
}

function eventHasKeywordConflict(eventTitle: string, keywords: string[]) {
  const lowerTitle = eventTitle.toLowerCase()
  return keywords.some((keyword) => lowerTitle.includes(keyword.toLowerCase()))
}

export async function scheduleHabitEntries(habit: HabitLike, options?: { startDate?: Date; daysAhead?: number; replaceExisting?: boolean }) {
  const startDate = startOfLocalDay(options?.startDate ?? new Date())
  const daysAhead = options?.daysAhead ?? 7
  const rangeEnd = addDays(startDate, daysAhead)
  const keywords = normalizeKeywords(habit.keywords)
  const durationMinutes = Number(habit.durationMinutes ?? 30)

  if (options?.replaceExisting) {
    await deleteExistingPlannedEntries(habit.id, startDate, rangeEnd)
  }

  const busyIntervals = await fetchBusyIntervals(startDate, rangeEnd, habit.id)
  const existingEvents = await loadEventsForKeywordCheck(startDate, rangeEnd)
  const existingEntries = await loadExistingEntries(habit.id, startDate, rangeEnd)
  const existingByDate = new Set(existingEntries.map((entry) => localDateKey(new Date(entry.scheduledDate))))
  const skippedDates = new Set(Array.isArray(habit.skippedDates) ? habit.skippedDates.map((value: unknown) => String(value)).filter(Boolean) : [])

  const result: ScheduleResult = { created: 0, unscheduledDates: [], skippedDates: Array.from(skippedDates) }
  let firstReason: string | null = null

  for (let offset = 0, dayCursor = new Date(startDate); offset < daysAhead; offset += 1, dayCursor = addDays(dayCursor, 1)) {
    const day = new Date(dayCursor)
    const key = localDateKey(day)

    if (!dayMatchesHabit(habit, day)) continue
    if (skippedDates.has(key)) continue
    if (existingByDate.has(key) && !options?.replaceExisting) continue

    if (keywords.length > 0) {
      const conflictingEvent = existingEvents.find((event) => localDateKey(event.start_time) === key && event.title && eventHasKeywordConflict(event.title, keywords))
      if (conflictingEvent) {
        result.unscheduledDates.push(key)
        continue
      }
    }

    const chosen = await chooseHabitSlotForDay(habit, day, durationMinutes, busyIntervals)
    if (!chosen) {
      result.unscheduledDates.push(key)
      continue
    }

    const entry = await upsertHabitEntry(habit, day, chosen.slot)
    if (firstReason === null && chosen.reason) {
      firstReason = chosen.reason
    }
    await syncEntryEvent({ ...habit, scheduleReason: chosen.reason }, entry)
    busyIntervals.push(chosen.slot)
    result.created += 1
  }

  if (firstReason) {
    await prisma.$executeRaw`
      UPDATE "Habit"
      SET "scheduleReason" = ${firstReason}, "updatedAt" = NOW()
      WHERE "id" = ${habit.id}
    `.catch(() => null)
  }

  return result
}

export async function lockUpcomingHabitEvents(now = new Date()) {
  const lockCutoff = new Date(now.getTime() + 60 * 60 * 1000)
  const entries = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Event"
    WHERE "habitId" IS NOT NULL
      AND "habitLocked" = false
      AND "start_time" >= ${now}
      AND "start_time" <= ${lockCutoff}
  `

  if (entries.length === 0) return 0

  await prisma.event.updateMany({
    where: { id: { in: entries.map((entry) => entry.id) } },
    data: { habitLocked: true },
  })

  return entries.length
}

export async function markHabitCompleted(habitId: string, completedAt: Date) {
  const habitDelegate = (prisma as any).habit
  let habit = null
  if (habitDelegate?.findUnique) {
    habit = await habitDelegate.findUnique({ where: { id: habitId } })
  }
  if (!habit && habitDelegate?.findFirst) {
    habit = await habitDelegate.findFirst({ where: { id: habitId } })
  }
  if (!habit) {
    habit = await prisma.habit.findFirst({ where: { id: habitId } })
  }

  if (!habit) return null

  const nextStreak = Number(habit.streak ?? 0) + 1
  const nextLongest = Math.max(Number(habit.longestStreak ?? 0), nextStreak)

  const updated = habitDelegate?.update
    ? await habitDelegate.update({ where: { id: habitId }, data: { streak: nextStreak, longestStreak: nextLongest, lastCompleted: completedAt } })
    : (await prisma.$queryRaw<any[]>`
        UPDATE "Habit"
        SET "streak" = ${nextStreak}, "longestStreak" = ${nextLongest}, "lastCompleted" = ${completedAt}, "updatedAt" = NOW()
        WHERE "id" = ${habitId}
        RETURNING *
      `)[0]

  return updated ?? null
}

export async function resetHabitStreak(habitId: string) {
  const habitDelegate = (prisma as any).habit
  if (habitDelegate?.update) {
    return habitDelegate.update({ where: { id: habitId }, data: { streak: 0 } })
  }

  const [updated] = await prisma.$queryRaw<any[]>`
    UPDATE "Habit"
    SET "streak" = 0, "updatedAt" = NOW()
    WHERE "id" = ${habitId}
    RETURNING *
  `
  return updated ?? null
}
