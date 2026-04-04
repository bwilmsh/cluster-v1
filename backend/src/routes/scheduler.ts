import { Router, Request, Response } from 'express'
import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { runTask, registerOrUnregisterCronJob, loadAllActiveTasks } from '../services/scheduler'

/** Extract the first URL found in a string, or null. */
function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/)
  return match ? match[0] : null
}

/** Generate a short 3-5 word title from the task description. */
function generateTitle(description: string): string {
  // Strip URLs and punctuation, then take first 4 words
  const clean = description
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim()
  const words = clean.split(/\s+/).filter((w) => w.length > 2)
  const title = words.slice(0, 4).join(' ')
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export { loadAllActiveTasks }

export const schedulerRouter = Router()

// GET /api/scheduler/tasks — fetch all tasks with agent included
schedulerRouter.get('/tasks', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/scheduler/tasks/:userId — also support with userId param (single-tenant)
schedulerRouter.get('/tasks/:userId', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id },
      include: { agent: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(tasks)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/scheduler/task/:id — single task
schedulerRouter.get('/task/:id', async (req: Request, res: Response) => {
  try {
    const task = await prisma.scheduledTask.findUnique({
      where: { id: req.params.id },
      include: { agent: true },
    })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/scheduler/task/:id/results — results history
schedulerRouter.get('/task/:id/results', async (req: Request, res: Response) => {
  try {
    const results = await prisma.taskResult.findMany({
      where: { taskId: req.params.id },
      orderBy: { runAt: 'desc' },
      take: 20,
    })
    res.json(results)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/scheduler/tasks — create a new scheduled task (active and pre-approved by default)
schedulerRouter.post('/tasks', async (req: Request, res: Response) => {
  try {
    const { agentId, description, cronExpr, resultDelivery } = req.body
    if (!agentId || !description || !cronExpr) {
      return res.status(400).json({ error: 'agentId, description, cronExpr required' })
    }
    if (!cron.validate(cronExpr)) {
      return res.status(400).json({ error: 'Invalid cron expression' })
    }
    const user = await getDefaultUser()

    const name = generateTitle(description)
    const websiteUrl = extractUrl(description)

    const task = await prisma.scheduledTask.create({
      data: {
        userId: user.id,
        agentId,
        name,
        description,
        websiteUrl,
        cronExpr,
        active: true,
        planApproved: true,
        resultDelivery: resultDelivery ?? [],
      },
      include: { agent: true },
    })

    // Register the cron job immediately since it's auto-approved
    registerOrUnregisterCronJob({ id: task.id, active: true, cronExpr: task.cronExpr, planApproved: true })

    res.status(201).json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/scheduler/task/:id/approve-plan — approve plan and activate task
schedulerRouter.post('/task/:id/approve-plan', async (req: Request, res: Response) => {
  try {
    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: { planApproved: true, active: true },
      include: { agent: true },
    })
    registerOrUnregisterCronJob({ id: task.id, active: task.active, cronExpr: task.cronExpr, planApproved: true })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/task/:id/plan — edit plan text
schedulerRouter.patch('/task/:id/plan', async (req: Request, res: Response) => {
  try {
    const { agentPlan } = req.body
    if (!agentPlan) return res.status(400).json({ error: 'agentPlan required' })
    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: { agentPlan },
      include: { agent: true },
    })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/tasks/:id/activate — toggle active/paused (only allowed if planApproved)
schedulerRouter.patch('/tasks/:id/activate', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scheduledTask.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: { active: !existing.active },
      include: { agent: true },
    })
    registerOrUnregisterCronJob({ id: task.id, active: task.active, cronExpr: task.cronExpr, planApproved: task.planApproved })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/tasks/:id — update fields
schedulerRouter.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { cronExpr, description, name, resultDelivery } = req.body
    const updates: Record<string, any> = {}
    if (cronExpr !== undefined) {
      if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' })
      updates.cronExpr = cronExpr
    }
    if (description !== undefined) updates.description = description
    if (name !== undefined) updates.name = name
    if (resultDelivery !== undefined) updates.resultDelivery = resultDelivery

    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: updates,
      include: { agent: true },
    })
    registerOrUnregisterCronJob({ id: task.id, active: task.active, cronExpr: task.cronExpr, planApproved: task.planApproved })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/scheduler/tasks/:id/run — manual trigger
schedulerRouter.post('/tasks/:id/run', async (req: Request, res: Response) => {
  try {
    await runTask(req.params.id)
    const task = await prisma.scheduledTask.findUnique({
      where: { id: req.params.id },
      include: { agent: true },
    })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/scheduler/tasks/:id
schedulerRouter.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    registerOrUnregisterCronJob({ id: req.params.id, active: false, cronExpr: '' })
    await prisma.scheduledTask.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
