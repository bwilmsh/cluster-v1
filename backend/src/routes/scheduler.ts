import { Router, Request, Response } from 'express'
import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { runTask, registerOrUnregisterCronJob, loadAllActiveTasks } from '../services/scheduler'

export { loadAllActiveTasks }

export const schedulerRouter = Router()

// GET /api/scheduler/tasks — list all tasks for default user (agent always included)
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

// POST /api/scheduler/tasks — create a new scheduled task
schedulerRouter.post('/tasks', async (req: Request, res: Response) => {
  try {
    const { agentId, name, prompt, cronExpr } = req.body
    if (!agentId || !name || !prompt || !cronExpr) {
      return res.status(400).json({ error: 'agentId, name, prompt, cronExpr required' })
    }
    if (!cron.validate(cronExpr)) {
      return res.status(400).json({ error: 'Invalid cron expression' })
    }
    const user = await getDefaultUser()
    const task = await prisma.scheduledTask.create({
      data: { userId: user.id, agentId, name, prompt, cronExpr },
      include: { agent: true },
    })
    registerOrUnregisterCronJob(task)
    res.status(201).json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/tasks/:id/activate — toggle active status
schedulerRouter.patch('/tasks/:id/activate', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scheduledTask.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Task not found' })

    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: { active: !existing.active },
      include: { agent: true },
    })
    registerOrUnregisterCronJob(task)
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/tasks/:id — update cronExpr / prompt / name
schedulerRouter.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const { cronExpr, prompt, name } = req.body
    const updates: Record<string, any> = {}
    if (cronExpr !== undefined) {
      if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' })
      updates.cronExpr = cronExpr
    }
    if (prompt !== undefined) updates.prompt = prompt
    if (name !== undefined) updates.name = name

    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: updates,
      include: { agent: true },
    })
    registerOrUnregisterCronJob(task)
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
    // Unregister cron job first
    registerOrUnregisterCronJob({ id: req.params.id, active: false, cronExpr: '' })
    await prisma.scheduledTask.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
