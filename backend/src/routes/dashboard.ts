import { Router, Request, Response } from 'express'
import { getDefaultUser, prisma } from '../db'
import { generateDailyBriefing } from '../lib/groq'

export const dashboardRouter = Router()

type DashboardTask = {
  id: string
  title: string
  status: string
  start_time: string
  end_time: string | null
}

type DashboardDueDate = {
  id: string
  title: string
  dueAt: string
  dueTime: string
  priority: string
  urgency: 'today' | 'overdue' | 'upcoming'
}

type DashboardHabit = {
  id: string
  name: string
  scheduledTime: string
  streak: number
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

function endOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatHHMM(date: Date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function urgencyForDueDate(dueAt: Date) {
  const now = new Date()
  const todayStart = startOfToday().getTime()
  const dueTime = dueAt.getTime()
  if (dueTime < now.getTime()) return 'overdue' as const
  if (dueTime >= todayStart && dueTime <= endOfToday().getTime()) return 'today' as const
  return 'upcoming' as const
}

function fallbackBriefing(tasks: DashboardTask[], eventsCount: number) {
  const todoCount = tasks.filter((task) => task.status !== 'done').length
  if (todoCount === 0 && eventsCount === 0) {
    return 'You have a light day with no pending tasks or scheduled events, so this is a good window for planning ahead.'
  }
  if (todoCount === 0) {
    return `You have ${eventsCount} event${eventsCount === 1 ? '' : 's'} today and no open tasks, so focus on calendar execution.`
  }
  return `You have ${todoCount} pending task${todoCount === 1 ? '' : 's'} and ${eventsCount} event${eventsCount === 1 ? '' : 's'} today, so tackle high-priority work first.`
}

dashboardRouter.get('/home', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const todayStart = startOfToday()
    const todayEnd = endOfToday()

    const taskHorizonEnd = addDays(todayEnd, 6)

    const [tasksTodayRows, eventsTodayRows, dueDateRows, habitsRows] = await Promise.all([
      prisma.event.findMany({
        where: {
          itemType: 'task',
          start_time: { lte: taskHorizonEnd },
        },
        orderBy: [{ status: 'asc' }, { start_time: 'asc' }],
        take: 50,
      }),
      prisma.event.findMany({
        where: {
          start_time: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { start_time: 'asc' },
        take: 60,
      }),
      prisma.dueDate.findMany({
        where: {
          userId: user.id,
          status: { not: 'COMPLETED' },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: 20,
      }),
      prisma.habit.findMany({
        where: {
          userId: user.id,
          OR: [{ isActive: true }, { active: true }],
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      }),
    ])

    const tasksToday: DashboardTask[] = tasksTodayRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      start_time: row.start_time.toISOString(),
      end_time: row.end_time ? row.end_time.toISOString() : null,
    }))

    const dueDates: DashboardDueDate[] = dueDateRows.map((row) => ({
      id: row.id,
      title: row.title,
      dueAt: row.dueDate.toISOString(),
      dueTime: row.dueTime || formatHHMM(row.dueDate),
      priority: String(row.priority),
      urgency: urgencyForDueDate(row.dueDate),
    }))

    const habitsToday: DashboardHabit[] = habitsRows.map((row) => ({
      id: row.id,
      name: row.name,
      scheduledTime: row.timeRangeStart || row.timeOfDay || '08:00',
      streak: typeof row.streak === 'number' ? row.streak : 0,
    }))

    const briefing =
      (await generateDailyBriefing({
        tasks: tasksToday,
        events: eventsTodayRows.map((row) => ({
          title: row.title,
          itemType: row.itemType,
          start_time: row.start_time.toISOString(),
          end_time: row.end_time ? row.end_time.toISOString() : null,
        })),
      })) ?? fallbackBriefing(tasksToday, eventsTodayRows.length)

    return res.json({
      briefing,
      tasksToday,
      dueDates,
      habitsToday,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to load dashboard home data', details })
  }
})
