import { Router, Request, Response } from 'express'
import { getDefaultUser, prisma } from '../db'

export const dueDatesRouter = Router()

type DueDatePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type DueDateStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE'
type DueDateCategory = 'ASSIGNMENT' | 'EXAM' | 'WORK' | 'PERSONAL'

type DueDateRecord = {
  id: string
  title: string
  description: string | null
  dueDate: string
  dueTime: string
  dueAt: string
  priority: DueDatePriority
  status: DueDateStatus
  category: DueDateCategory
  createdAt: string
}

type DueDatePayload = {
  title?: unknown
  description?: unknown
  dueDate?: unknown
  dueTime?: unknown
  priority?: unknown
  status?: unknown
  category?: unknown
}

function isValidIso(value: string) {
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime())
}

function toDateTime(value: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeTime(value: unknown, fallback?: Date) {
  const text = String(value ?? '').trim()
  if (/^\d{2}:\d{2}$/.test(text)) return text
  if (fallback) {
    const hours = String(fallback.getHours()).padStart(2, '0')
    const minutes = String(fallback.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }
  return '00:00'
}

function normalizePriority(value: unknown): DueDatePriority {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized === 'LOW' || normalized === 'HIGH' || normalized === 'URGENT' ? normalized : 'MEDIUM'
}

function normalizeCategory(value: unknown): DueDateCategory {
  const normalized = String(value ?? '').trim().toUpperCase()
  return normalized === 'ASSIGNMENT' || normalized === 'EXAM' || normalized === 'WORK' ? normalized : 'PERSONAL'
}

function normalizeStatus(value: unknown, dueDate: Date): DueDateStatus {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'COMPLETED') return 'COMPLETED'
  if (normalized === 'OVERDUE') return 'OVERDUE'
  return dueDate.getTime() < new Date().getTime() ? 'OVERDUE' : 'PENDING'
}

function formatDueTime(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

function serializeDueDate(row: {
  id: string
  title: string
  description: string | null
  dueDate: Date
  dueTime: string
  priority: DueDatePriority
  status: DueDateStatus
  category: DueDateCategory
  createdAt: Date
}): DueDateRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate.toISOString(),
    dueTime: row.dueTime,
    dueAt: row.dueDate.toISOString(),
    priority: row.priority,
    status: row.status,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  }
}

async function loadDueDateRows(userId: string) {
  const rows = await prisma.dueDate.findMany({
    where: { userId, status: { not: 'COMPLETED' } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  })

  return rows.map((row) => ({
    ...row,
    status: normalizeStatus(row.status, row.dueDate),
    dueTime: normalizeTime(row.dueTime, row.dueDate),
  }))
}

dueDatesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const rows = await loadDueDateRows(user.id)
    return res.json({ data: rows.map(serializeDueDate) })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to load due dates', details })
  }
})

dueDatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = (req.body ?? {}) as DueDatePayload
    const title = String(body.title ?? '').trim()
    const dueDate = toDateTime(body.dueDate)

    if (!title) {
      return res.status(400).json({ error: 'Title is required' })
    }

    if (!dueDate || !isValidIso(dueDate.toISOString())) {
      return res.status(400).json({ error: 'A valid dueDate is required' })
    }

    const record = await prisma.dueDate.create({
      data: {
        userId: user.id,
        title,
        description: String(body.description ?? '').trim() || null,
        dueDate,
        dueTime: normalizeTime(body.dueTime, dueDate),
        priority: normalizePriority(body.priority),
        status: normalizeStatus(body.status, dueDate),
        category: normalizeCategory(body.category),
      },
    })

    return res.status(201).json(serializeDueDate(record))
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to create due date', details })
  }
})

dueDatesRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = (req.body ?? {}) as DueDatePayload
    const existing = await prisma.dueDate.findFirst({ where: { id: req.params.id, userId: user.id } })

    if (!existing) {
      return res.status(404).json({ error: 'Due date not found' })
    }

    const nextDueDate = body.dueDate !== undefined ? toDateTime(body.dueDate) : existing.dueDate
    if (!nextDueDate) {
      return res.status(400).json({ error: 'A valid dueDate is required' })
    }

    const updated = await prisma.dueDate.update({
      where: { id: existing.id },
      data: {
        title: body.title !== undefined ? String(body.title).trim() : existing.title,
        description: body.description === undefined ? existing.description : String(body.description ?? '').trim() || null,
        dueDate: nextDueDate,
        dueTime: body.dueTime === undefined ? normalizeTime(existing.dueTime, nextDueDate) : normalizeTime(body.dueTime, nextDueDate),
        priority: body.priority === undefined ? existing.priority : normalizePriority(body.priority),
        status: body.status === undefined ? normalizeStatus(existing.status, nextDueDate) : normalizeStatus(body.status, nextDueDate),
        category: body.category === undefined ? existing.category : normalizeCategory(body.category),
      },
    })

    return res.json(serializeDueDate(updated))
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to update due date', details })
  }
})

dueDatesRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const deleted = await prisma.dueDate.deleteMany({ where: { id: req.params.id, userId: user.id } })

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Due date not found' })
    }

    return res.json({ success: true, deleted: true })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to delete due date', details })
  }
})

// Get auto run config for an item
dueDatesRouter.get('/:itemId/auto-run', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params
    const user = await getDefaultUser()

    // Try to find auto run config for either event (task) or goal
    const autoRun = await prisma.dueDateAutoRun.findFirst({
      where: {
        OR: [
          { eventId: itemId },
          { goalId: itemId },
        ],
      },
    })

    if (!autoRun) {
      return res.status(404).json({ error: 'Auto run config not found' })
    }

    return res.json(autoRun)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to load auto run config', details })
  }
})

// Create or update auto run config
dueDatesRouter.post('/:itemId/auto-run', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params
    const { itemType, enabled, actionType, config } = req.body
    const user = await getDefaultUser()

    // Validate input
    if (!itemType || !['task', 'goal', 'event'].includes(itemType)) {
      return res.status(400).json({ error: 'Invalid itemType' })
    }

    if (!actionType || !['sendEmail', 'createCalendarEvent', 'markTaskComplete', 'sendNotification'].includes(actionType)) {
      return res.status(400).json({ error: 'Invalid actionType' })
    }

    // Check if item exists and belongs to user
    if (itemType === 'task') {
      const event = await prisma.event.findUnique({ where: { id: itemId } })
      if (!event) {
        return res.status(404).json({ error: 'Task not found' })
      }
    } else if (itemType === 'goal') {
      const goal = await prisma.goal.findUnique({ where: { id: itemId } })
      if (!goal || goal.userId !== user.id) {
        return res.status(404).json({ error: 'Goal not found' })
      }
    }

    // Update or create auto run config
    let autoRun
    if (itemType === 'task') {
      autoRun = await prisma.dueDateAutoRun.upsert({
        where: { eventId: itemId },
        create: {
          eventId: itemId,
          enabled: Boolean(enabled),
          actionType,
          config: config || {},
        },
        update: {
          enabled: Boolean(enabled),
          actionType,
          config: config || {},
          updatedAt: new Date(),
        },
      })
    } else if (itemType === 'goal') {
      autoRun = await prisma.dueDateAutoRun.upsert({
        where: { goalId: itemId },
        create: {
          goalId: itemId,
          enabled: Boolean(enabled),
          actionType,
          config: config || {},
        },
        update: {
          enabled: Boolean(enabled),
          actionType,
          config: config || {},
          updatedAt: new Date(),
        },
      })
    }

    return res.json(autoRun)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to save auto run config', details })
  }
})

// Delete auto run config
dueDatesRouter.delete('/:itemId/auto-run', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params
    const user = await getDefaultUser()

    const deleted = await prisma.dueDateAutoRun.deleteMany({
      where: {
        OR: [
          { eventId: itemId },
          { goalId: itemId },
        ],
      },
    })

    return res.json({ success: true, deletedCount: deleted.count })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to delete auto run config', details })
  }
})