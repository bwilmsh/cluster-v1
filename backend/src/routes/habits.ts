import { randomUUID } from 'crypto'
import { Request, Response, Router } from 'express'
import { getDefaultUser, prisma } from '../db'
import { lockUpcomingHabitEvents, markHabitCompleted, scheduleHabitEntries } from '../services/habitScheduler'

export const habitsRouter = Router()

export type HabitBody = {
  name?: string
  description?: string | null
  notes?: string | null
  frequency?: string | null
  idealTime?: string | null
  timeRangeStart?: string | null
  timeRangeEnd?: string | null
  daysOfWeek?: string[] | string | null
  isActive?: boolean
  autoReschedule?: boolean
  keywords?: string[] | string | null
  priority?: number | string | null
  priorityLevel?: string | null
  rrule?: string | null
  cadence?: string | null
  timeOfDay?: string | null
  endTime?: string | null
  durationMinutes?: number | string | null
  timezone?: string | null
  color?: string | null
  active?: boolean
  materialize?: boolean
  showAsBusy?: boolean | string | null
  hideDetails?: boolean | string | null
  timeDefenseMode?: string | null
  skippedDates?: string[] | string | null
}

let habitSchemaEnsurePromise: Promise<void> | null = null

function normalizePriority(value: unknown) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 3
  return Math.min(5, Math.max(1, Math.round(parsed)))
}

function normalizePriorityLevel(value: unknown) {
  const input = String(value ?? '').toUpperCase()
  if (input === 'LOW' || input === 'MEDIUM' || input === 'HIGH') return input
  const numeric = normalizePriority(value)
  if (numeric <= 2) return 'LOW'
  if (numeric >= 4) return 'HIGH'
  return 'MEDIUM'
}

function normalizeFrequency(value: unknown, body: HabitBody) {
  const input = String(value ?? '').toUpperCase()
  if (['DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM'].includes(input)) return input
  if (body.cadence === 'weekly') return 'WEEKLY'
  if (body.cadence === 'daily') return 'DAILY'
  if (body.rrule) return 'CUSTOM'
  return 'DAILY'
}

function normalizeIdealTime(value: unknown, body: HabitBody) {
  const input = String(value ?? '').toUpperCase()
  if (input === 'MORNING' || input === 'AFTERNOON' || input === 'EVENING') return input
  const base = body.timeRangeStart ?? body.timeOfDay ?? '08:00'
  const hour = Number(String(base).split(':')[0] ?? '8')
  if (hour < 12) return 'MORNING'
  if (hour < 17) return 'AFTERNOON'
  return 'EVENING'
}

function normalizeDaysOfWeek(value: unknown, body: HabitBody) {
  if (Array.isArray(value)) return value.map((day) => String(day).toUpperCase()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map((day) => day.trim().toUpperCase()).filter(Boolean)
  if (typeof body.rrule === 'string') {
    const match = body.rrule.match(/BYDAY=([A-Z,]+)/)
    if (match?.[1]) return match[1].split(',').filter(Boolean)
  }
  return []
}

function normalizeKeywords(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean)
  return []
}

function normalizeDurationMinutes(value: unknown) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 30
  return Math.min(480, Math.max(15, Math.round(parsed)))
}

function normalizeBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const input = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(input)) return true
    if (['false', '0', 'no', 'off'].includes(input)) return false
  }
  return defaultValue
}

function normalizeShowAsBusy(body: HabitBody) {
  const mode = String(body.timeDefenseMode ?? '').trim().toUpperCase()
  if (mode === 'FREE') return false
  if (mode === 'BUSY') return true
  if (typeof body.showAsBusy === 'string') {
    const input = body.showAsBusy.trim().toLowerCase()
    if (['free', 'transparent'].includes(input)) return false
    if (['busy', 'opaque'].includes(input)) return true
  }
  if (body.showAsBusy !== undefined) return normalizeBoolean(body.showAsBusy, true)
  return true
}

function normalizeHideDetails(body: HabitBody) {
  return normalizeBoolean(body.hideDetails, false)
}

function normalizeSkippedDates(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return value.split(',').map((item) => item.trim()).filter(Boolean)
  return undefined
}

function hasHabitDelegate() {
  return Boolean((prisma as any).habit)
}

function hasHabitEntryDelegate() {
  return Boolean((prisma as any).habitEntry)
}

async function ensureHabitSchema() {
  if (!habitSchemaEnsurePromise) {
    habitSchemaEnsurePromise = (async () => {
      if (typeof (prisma as any).$executeRawUnsafe !== 'function') return

      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "frequency" TEXT NOT NULL DEFAULT \'DAILY\'')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "idealTime" TEXT NOT NULL DEFAULT \'MORNING\'')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "timeRangeStart" TEXT')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "timeRangeEnd" TEXT')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "daysOfWeek" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "autoReschedule" BOOLEAN NOT NULL DEFAULT true')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "priorityLevel" TEXT NOT NULL DEFAULT \'MEDIUM\'')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "showAsBusy" BOOLEAN NOT NULL DEFAULT true')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "hideDetails" BOOLEAN NOT NULL DEFAULT false')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "scheduleReason" TEXT')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "streak" INTEGER NOT NULL DEFAULT 0')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER NOT NULL DEFAULT 0')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "notes" TEXT')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 3')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 30')
      await (prisma as any).$executeRawUnsafe(`ALTER TABLE "Habit" ADD COLUMN IF NOT EXISTS "skippedDates" JSONB NOT NULL DEFAULT '[]'::jsonb`)
      await (prisma as any).$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "HabitEntryStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `)
      await (prisma as any).$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "HabitEntry" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "habitId" TEXT NOT NULL,
          "scheduledDate" TIMESTAMP(3) NOT NULL,
          "scheduledStart" TIMESTAMP(3) NOT NULL,
          "scheduledEnd" TIMESTAMP(3) NOT NULL,
          "status" "HabitEntryStatus" NOT NULL DEFAULT 'SCHEDULED',
          "wasRescheduled" BOOLEAN NOT NULL DEFAULT false,
          "completedAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
          CONSTRAINT "HabitEntry_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `)
      await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "HabitEntry_habitId_scheduledDate_key" ON "HabitEntry"("habitId", "scheduledDate")')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "habitEntryId" TEXT')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "habitOccurrenceAt" TIMESTAMP(3)')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "habitLocked" BOOLEAN NOT NULL DEFAULT false')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "showAsBusy" BOOLEAN NOT NULL DEFAULT true')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "hideDetails" BOOLEAN NOT NULL DEFAULT false')
      await (prisma as any).$executeRawUnsafe('ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "scheduleReason" TEXT')
      await (prisma as any).$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "Event_habitEntryId_key" ON "Event"("habitEntryId")')

      await (prisma as any).$executeRawUnsafe(`
        WITH ranked AS (
          SELECT
            he."id",
            ROW_NUMBER() OVER (
              PARTITION BY he."habitId", he."scheduledDate"
              ORDER BY
                CASE WHEN EXISTS (SELECT 1 FROM "Event" e WHERE e."habitEntryId" = he."id") THEN 0 ELSE 1 END,
                he."updatedAt" DESC,
                he."createdAt" DESC,
                he."id" ASC
            ) AS rn
          FROM "HabitEntry" he
        )
        DELETE FROM "Event" e
        USING ranked r
        WHERE e."habitEntryId" = r."id"
          AND r.rn > 1;
      `)

      await (prisma as any).$executeRawUnsafe(`
        WITH ranked AS (
          SELECT
            he."id",
            ROW_NUMBER() OVER (
              PARTITION BY he."habitId", he."scheduledDate"
              ORDER BY
                CASE WHEN EXISTS (SELECT 1 FROM "Event" e WHERE e."habitEntryId" = he."id") THEN 0 ELSE 1 END,
                he."updatedAt" DESC,
                he."createdAt" DESC,
                he."id" ASC
            ) AS rn
          FROM "HabitEntry" he
        )
        DELETE FROM "HabitEntry" he
        USING ranked r
        WHERE he."id" = r."id"
          AND r.rn > 1;
      `)
    })().catch((error) => {
      habitSchemaEnsurePromise = null
      throw error
    })
  }

  return habitSchemaEnsurePromise
}

export async function ensureHabitEventSchema() {
  await ensureHabitSchema()
}

async function listHabitsForUser(userId: string) {
  if (hasHabitDelegate()) {
    return (prisma as any).habit.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  }

  return prisma.$queryRaw<any[]>`
    SELECT *
    FROM "Habit"
    WHERE "userId" = ${userId}
    ORDER BY "createdAt" DESC
  `
}

async function findHabitForUser(userId: string, habitId: string) {
  if (hasHabitDelegate()) {
    return (prisma as any).habit.findFirst({ where: { id: habitId, userId } })
  }

  const rows = await prisma.$queryRaw<any[]>`
    SELECT *
    FROM "Habit"
    WHERE "id" = ${habitId} AND "userId" = ${userId}
    LIMIT 1
  `
  return rows[0] ?? null
}

function buildLegacyHabitData(body: HabitBody) {
  return {
    name: String(body.name ?? '').trim(),
    description: body.description ?? null,
    notes: body.notes ?? null,
    priority: normalizePriority(body.priority),
    durationMinutes: normalizeDurationMinutes(body.durationMinutes),
    rrule: body.rrule ?? null,
    cadence: body.cadence ?? null,
    timeOfDay: body.timeOfDay ?? null,
    endTime: body.endTime ?? null,
    timezone: body.timezone ?? null,
    color: body.color ?? null,
    active: body.active ?? body.isActive ?? true,
    materialize: body.materialize ?? body.autoReschedule ?? true,
    showAsBusy: normalizeShowAsBusy(body),
    hideDetails: normalizeHideDetails(body),
  }
}

async function createHabitRecord(userId: string, body: HabitBody) {
  const data = {
    userId,
    ...buildLegacyHabitData(body),
    frequency: normalizeFrequency(body.frequency, body),
    idealTime: normalizeIdealTime(body.idealTime, body),
    timeRangeStart: body.timeRangeStart ?? body.timeOfDay ?? null,
    timeRangeEnd: body.timeRangeEnd ?? body.endTime ?? null,
    daysOfWeek: normalizeDaysOfWeek(body.daysOfWeek, body),
    isActive: body.isActive ?? body.active ?? true,
    autoReschedule: body.autoReschedule ?? body.materialize ?? true,
    keywords: normalizeKeywords(body.keywords),
    priorityLevel: normalizePriorityLevel(body.priorityLevel ?? body.priority),
    showAsBusy: normalizeShowAsBusy(body),
    hideDetails: normalizeHideDetails(body),
    streak: 0,
    longestStreak: 0,
    skippedDates: [],
  }

  if (hasHabitDelegate()) {
    return (prisma as any).habit.create({ data })
  }

  const [created] = await prisma.$queryRaw<any[]>`
    INSERT INTO "Habit" (
      "id",
      "userId",
      "name",
      "description",
      "notes",
      "priority",
      "durationMinutes",
      "timeRangeStart",
      "timeRangeEnd",
      "rrule",
      "cadence",
      "timeOfDay",
      "endTime",
      "timezone",
      "color",
      "active",
      "materialize",
      "showAsBusy",
      "hideDetails",
      "skippedDates",
      "lastCompleted",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${userId},
      ${data.name},
      ${data.description},
      ${data.notes},
      ${data.priority},
      ${data.durationMinutes},
      ${data.timeRangeStart},
      ${data.timeRangeEnd},
      ${data.rrule},
      ${data.cadence},
      ${data.timeOfDay},
      ${data.endTime},
      ${data.timezone},
      ${data.color},
      ${data.active},
      ${data.materialize},
      ${data.showAsBusy},
      ${data.hideDetails},
      ${JSON.stringify([])}::jsonb,
      ${null},
      NOW(),
      NOW()
    )
    RETURNING *
  `

  return created
}

async function updateHabitRecord(userId: string, habitId: string, body: HabitBody) {
  const existing = await findHabitForUser(userId, habitId)
  if (!existing) return null

  const legacyPatch = {
    name: body.name === undefined ? undefined : String(body.name).trim(),
    description: body.description === undefined ? undefined : body.description,
    notes: body.notes === undefined ? undefined : body.notes,
    priority: body.priority === undefined ? undefined : normalizePriority(body.priority),
    durationMinutes: body.durationMinutes === undefined ? undefined : normalizeDurationMinutes(body.durationMinutes),
    rrule: body.rrule === undefined ? undefined : body.rrule,
    cadence: body.cadence === undefined ? undefined : body.cadence,
    timeOfDay: body.timeOfDay === undefined ? undefined : body.timeOfDay,
    endTime: body.endTime === undefined ? undefined : body.endTime,
    timezone: body.timezone === undefined ? undefined : body.timezone,
    color: body.color === undefined ? undefined : body.color,
    active: body.active === undefined && body.isActive === undefined ? undefined : body.active ?? body.isActive,
    materialize: body.materialize === undefined && body.autoReschedule === undefined ? undefined : body.materialize ?? body.autoReschedule,
    showAsBusy: body.showAsBusy === undefined && body.timeDefenseMode === undefined ? undefined : normalizeShowAsBusy(body),
    hideDetails: body.hideDetails === undefined ? undefined : normalizeHideDetails(body),
    skippedDates: body.skippedDates === undefined ? undefined : normalizeSkippedDates(body.skippedDates),
  }

  const specPatch = {
    frequency: body.frequency === undefined ? undefined : normalizeFrequency(body.frequency, body),
    idealTime: body.idealTime === undefined ? undefined : normalizeIdealTime(body.idealTime, body),
    timeRangeStart: body.timeRangeStart === undefined ? undefined : body.timeRangeStart,
    timeRangeEnd: body.timeRangeEnd === undefined ? undefined : body.timeRangeEnd,
    daysOfWeek: body.daysOfWeek === undefined ? undefined : normalizeDaysOfWeek(body.daysOfWeek, body),
    isActive: body.isActive === undefined ? undefined : body.isActive,
    autoReschedule: body.autoReschedule === undefined ? undefined : body.autoReschedule,
    keywords: body.keywords === undefined ? undefined : normalizeKeywords(body.keywords),
    priorityLevel: body.priorityLevel === undefined && body.priority === undefined ? undefined : normalizePriorityLevel(body.priorityLevel ?? body.priority),
    showAsBusy: body.showAsBusy === undefined && body.timeDefenseMode === undefined ? undefined : normalizeShowAsBusy(body),
    hideDetails: body.hideDetails === undefined ? undefined : normalizeHideDetails(body),
    skippedDates: body.skippedDates === undefined ? undefined : normalizeSkippedDates(body.skippedDates),
  }

  if (hasHabitDelegate()) {
    return (prisma as any).habit.update({
      where: { id: existing.id },
      data: { ...legacyPatch, ...specPatch },
    })
  }

  const [updated] = await prisma.$queryRaw<any[]>`
    UPDATE "Habit"
    SET
      "name" = COALESCE(${legacyPatch.name ?? null}, "name"),
      "description" = COALESCE(${legacyPatch.description ?? null}, "description"),
      "notes" = COALESCE(${legacyPatch.notes ?? null}, "notes"),
      "priority" = COALESCE(${legacyPatch.priority ?? null}, "priority"),
      "durationMinutes" = COALESCE(${legacyPatch.durationMinutes ?? null}, "durationMinutes"),
      "rrule" = COALESCE(${legacyPatch.rrule ?? null}, "rrule"),
      "cadence" = COALESCE(${legacyPatch.cadence ?? null}, "cadence"),
      "timeOfDay" = COALESCE(${legacyPatch.timeOfDay ?? null}, "timeOfDay"),
      "endTime" = COALESCE(${legacyPatch.endTime ?? null}, "endTime"),
      "color" = COALESCE(${legacyPatch.color ?? null}, "color"),
      "active" = COALESCE(${legacyPatch.active ?? null}, "active"),
      "materialize" = COALESCE(${legacyPatch.materialize ?? null}, "materialize"),
      "showAsBusy" = COALESCE(${legacyPatch.showAsBusy ?? null}, "showAsBusy"),
      "hideDetails" = COALESCE(${legacyPatch.hideDetails ?? null}, "hideDetails"),
      "skippedDates" = COALESCE(${legacyPatch.skippedDates ? JSON.stringify(legacyPatch.skippedDates) : null}::jsonb, "skippedDates"),
      "frequency" = COALESCE(${specPatch.frequency ?? null}, "frequency"),
      "idealTime" = COALESCE(${specPatch.idealTime ?? null}, "idealTime"),
      "timeRangeStart" = COALESCE(${specPatch.timeRangeStart ?? null}, "timeRangeStart"),
      "timeRangeEnd" = COALESCE(${specPatch.timeRangeEnd ?? null}, "timeRangeEnd"),
      "daysOfWeek" = COALESCE(${specPatch.daysOfWeek ? JSON.stringify(specPatch.daysOfWeek) : null}::text[], "daysOfWeek"),
      "isActive" = COALESCE(${specPatch.isActive ?? null}, "isActive"),
      "autoReschedule" = COALESCE(${specPatch.autoReschedule ?? null}, "autoReschedule"),
      "keywords" = COALESCE(${specPatch.keywords ? JSON.stringify(specPatch.keywords) : null}::text[], "keywords"),
      "priorityLevel" = COALESCE(${specPatch.priorityLevel ?? null}, "priorityLevel"),
      "updatedAt" = NOW()
    WHERE "id" = ${existing.id} AND "userId" = ${userId}
    RETURNING *
  `

  return updated ?? null
}

async function deleteHabitRecord(userId: string, habitId: string) {
  const existing = await findHabitForUser(userId, habitId)
  if (!existing) return null

  if (hasHabitDelegate()) {
    await (prisma as any).habit.delete({ where: { id: existing.id } })
    return existing
  }

  await prisma.$executeRaw`
    DELETE FROM "Habit"
    WHERE "id" = ${existing.id} AND "userId" = ${userId}
  `
  return existing
}

async function syncHabitCompletionEvent(habit: any, habitEntry: any, occurrenceDate: Date) {
  const linkedRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Event"
    WHERE "habitEntryId" = ${habitEntry.id}
    LIMIT 1
  `
  const linkedEvent = linkedRows[0]

  if (linkedEvent) {
    await prisma.$executeRaw`
      UPDATE "Event"
      SET
        "title" = ${habit.name} || ' (habit)',
        "description" = ${habit.description ?? null},
        "start_time" = ${occurrenceDate},
        "end_time" = ${occurrenceDate},
        "itemType" = 'habit',
        "status" = 'done',
        "tags" = ARRAY['habit']::text[],
        "habitId" = ${habit.id},
        "habitOccurrenceAt" = ${occurrenceDate},
        "habitEntryId" = ${habitEntry.id},
        "updatedAt" = NOW()
      WHERE "id" = ${linkedEvent.id}
    `
    return linkedEvent.id
  }

  const fallbackRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Event"
    WHERE "habitId" = ${habit.id}
      AND DATE("habitOccurrenceAt") = DATE(${occurrenceDate})
    ORDER BY "updatedAt" DESC, "createdAt" DESC
    LIMIT 1
  `
  const fallbackEvent = fallbackRows[0]

  if (fallbackEvent) {
    await prisma.$executeRaw`
      UPDATE "Event"
      SET
        "title" = ${habit.name} || ' (habit)',
        "description" = ${habit.description ?? null},
        "start_time" = ${occurrenceDate},
        "end_time" = ${occurrenceDate},
        "itemType" = 'habit',
        "status" = 'done',
        "tags" = ARRAY['habit']::text[],
        "habitId" = ${habit.id},
        "habitOccurrenceAt" = ${occurrenceDate},
        "habitEntryId" = ${habitEntry.id},
        "updatedAt" = NOW()
      WHERE "id" = ${fallbackEvent.id}
    `
    return fallbackEvent.id
  }

  const [created] = await prisma.$queryRaw<Array<{ id: string }>>`
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
      "habitId",
      "habitOccurrenceAt",
      "habitEntryId",
      "showAsBusy",
      "hideDetails",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${`${habit.name} (habit)`},
      ${habit.description ?? null},
      ${occurrenceDate},
      ${occurrenceDate},
      'habit',
      'done',
      'medium',
      false,
      ARRAY['habit']::text[],
      ${habit.id},
      ${occurrenceDate},
      ${habitEntry.id},
      ${true},
      ${false},
      NOW(),
      NOW()
    )
    RETURNING "id"
  `

  return created?.id ?? null
}

export async function ensureHabitEventSchema() {
  await ensureHabitSchema()
}

export async function materializeHabit(habit: any, shouldMaterialize: boolean) {
  await ensureHabitSchema()

  if (!shouldMaterialize) {
    try {
      await prisma.$executeRaw`DELETE FROM "Event" WHERE "habitId" = ${habit.id}`
      if (hasHabitEntryDelegate()) {
        await (prisma as any).habitEntry.deleteMany({ where: { habitId: habit.id } })
      } else {
        await prisma.$executeRaw`DELETE FROM "HabitEntry" WHERE "habitId" = ${habit.id}`
      }
    } catch {
      // best-effort only
    }
    return { created: 0, skippedDates: [], unscheduledDates: [] }
  }

  return scheduleHabitEntries(habit, { startDate: new Date(), daysAhead: 7, replaceExisting: true })
}

habitsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const habits = await listHabitsForUser(user.id)
    return res.json({ data: habits })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to fetch habits', details })
  }
})

habitsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const habit = await findHabitForUser(user.id, req.params.id)
    if (!habit) return res.status(404).json({ error: 'Habit not found' })
    return res.json({ data: habit })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to fetch habit', details })
  }
})

habitsRouter.post('/', async (req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const body = req.body as HabitBody
    const name = String(body.name ?? '').trim()
    if (!name) return res.status(400).json({ error: 'name is required' })

    const created = await createHabitRecord(user.id, body)
    const materializationResult = created.materialize ? await materializeHabit(created, true) : null

    return res.status(201).json({ success: true, data: created, materialization: materializationResult })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to create habit', details })
  }
})

habitsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const body = req.body as HabitBody
    const existing = await findHabitForUser(user.id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Habit not found' })

    const materializeChanged = body.materialize !== undefined && body.materialize !== existing.materialize
    const scheduleChanged =
      body.frequency !== undefined ||
      body.idealTime !== undefined ||
      body.timeRangeStart !== undefined ||
      body.timeRangeEnd !== undefined ||
      body.daysOfWeek !== undefined ||
      body.isActive !== undefined ||
      body.autoReschedule !== undefined ||
      body.keywords !== undefined ||
      body.priorityLevel !== undefined ||
      body.priority !== undefined ||
      body.rrule !== undefined ||
      body.cadence !== undefined ||
      body.timeOfDay !== undefined ||
      body.endTime !== undefined ||
      body.durationMinutes !== undefined ||
      body.active !== undefined

    const updated = await updateHabitRecord(user.id, req.params.id, body)
    if (!updated) return res.status(404).json({ error: 'Habit not found' })

    const materializationResult = materializeChanged || scheduleChanged ? await materializeHabit(updated, updated.materialize) : null
    return res.json({ success: true, data: updated, materialization: materializationResult })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to update habit', details })
  }
})

habitsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const existing = await findHabitForUser(user.id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Habit not found' })

    await deleteHabitRecord(user.id, existing.id)
    return res.json({ success: true })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to delete habit', details })
  }
})

habitsRouter.post('/:id/complete', async (req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const user = await getDefaultUser()
    const existing = await findHabitForUser(user.id, req.params.id)
    if (!existing) return res.status(404).json({ error: 'Habit not found' })

    const occurrenceDate = req.body?.occurrence_date ? new Date(String(req.body.occurrence_date)) : new Date()
    if (Number.isNaN(occurrenceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid occurrence_date' })
    }

    const updated = await markHabitCompleted(existing.id, occurrenceDate)

    let habitEntry: any = null
    if (hasHabitEntryDelegate()) {
      habitEntry = await (prisma as any).habitEntry.upsert({
        where: {
          habitId_scheduledDate: {
            habitId: existing.id,
            scheduledDate: new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate()),
          },
        },
        update: {
          status: 'COMPLETED',
          completedAt: occurrenceDate,
          wasRescheduled: true,
        },
        create: {
          habitId: existing.id,
          scheduledDate: new Date(occurrenceDate.getFullYear(), occurrenceDate.getMonth(), occurrenceDate.getDate()),
          scheduledStart: occurrenceDate,
          scheduledEnd: occurrenceDate,
          status: 'COMPLETED',
          wasRescheduled: true,
          completedAt: occurrenceDate,
        },
      }).catch(() => null)
    }

    try {
      if (habitEntry?.id) {
        await syncHabitCompletionEvent(existing, habitEntry, occurrenceDate)
      } else {
        await prisma.event.create({
          data: {
            title: `${existing.name} (habit)`,
            description: existing.description ?? null,
            start_time: occurrenceDate,
            end_time: occurrenceDate,
            itemType: 'habit',
            status: 'done',
            tags: ['habit'],
            habitId: existing.id,
            habitOccurrenceAt: occurrenceDate,
          },
        })
      }
    } catch {
      // best-effort only
    }

    return res.json({ success: true, data: updated })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to mark habit complete', details })
  }
})

habitsRouter.post('/locks/sweep', async (_req: Request, res: Response) => {
  try {
    await ensureHabitSchema()
    const locked = await lockUpcomingHabitEvents(new Date())
    return res.json({ success: true, locked })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to sweep habit locks', details })
  }
})
