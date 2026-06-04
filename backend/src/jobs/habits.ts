import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { lockUpcomingHabitEvents, scheduleHabitEntries } from '../services/habitScheduler'

let worker: ReturnType<typeof cron.schedule> | null = null
let lockWorker: ReturnType<typeof cron.schedule> | null = null
let isProcessing = false

async function loadActiveHabits(userId: string) {
  const habitDelegate = (prisma as any).habit
  if (habitDelegate && typeof habitDelegate.findMany === 'function') {
    return habitDelegate.findMany({ where: { userId, active: true } })
  }

  // Fallback raw SQL for environments where generated client lacks Habit delegate
  try {
    return prisma.$queryRaw<any[]>`
      SELECT * FROM "Habit" WHERE "userId" = ${userId} AND active = true
    `
  } catch {
    return []
  }
}

async function processHabits() {
  if (isProcessing) return
  isProcessing = true
  try {
    const user = await getDefaultUser().catch(() => null)
    if (!user) return

    const habits = await loadActiveHabits(user.id)

    // Process only active habits
    for (const habit of habits) {
      if (habit.materialize === false || habit.active === false || habit.isActive === false) continue
      await scheduleHabitEntries(habit, { startDate: new Date(), daysAhead: 7, replaceExisting: true })
    }
  } catch (err) {
    console.error('Habits worker error:', err)
  } finally {
    isProcessing = false
  }
}

export function startHabitsWorker() {
  if (worker || lockWorker) return
  void processHabits()
  // run daily at 01:00
  worker = cron.schedule('0 1 * * *', () => {
    void processHabits()
  })
  lockWorker = cron.schedule('*/15 * * * *', () => {
    void lockUpcomingHabitEvents(new Date())
  })
  console.log('Habits worker started')
}
