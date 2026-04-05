import { Router, Request, Response } from 'express'
import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { runTask, syncJob, loadActiveTasks } from '../services/scheduler'

export { loadActiveTasks }

export const schedulerRouter = Router()

// GET /api/scheduler — all tasks for default user
schedulerRouter.get('/', async (_req: Request, res: Response) => {
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

// POST /api/scheduler — create a task
schedulerRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, name, description, cronExpr } = req.body
    if (!agentId || !name || !description || !cronExpr) {
      return res.status(400).json({ error: 'agentId, name, description, cronExpr required' })
    }
    if (!cron.validate(cronExpr)) {
      return res.status(400).json({ error: 'Invalid cron expression' })
    }
    const user = await getDefaultUser()
    const task = await prisma.scheduledTask.create({
      data: { userId: user.id, agentId, name, description, cronExpr, active: true },
      include: { agent: true },
    })
    syncJob({ id: task.id, active: task.active, cronExpr: task.cronExpr })
    res.status(201).json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/:id/toggle — flip active
schedulerRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.scheduledTask.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: { active: !existing.active },
      include: { agent: true },
    })
    syncJob({ id: task.id, active: task.active, cronExpr: task.cronExpr })
    res.json(task)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/scheduler/:id/results — task run history
schedulerRouter.get('/:id/results', async (req: Request, res: Response) => {
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

// POST /api/scheduler/:id/run — run now
schedulerRouter.post('/:id/run', async (req: Request, res: Response) => {
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

// DELETE /api/scheduler/:id
schedulerRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    syncJob({ id: req.params.id, active: false, cronExpr: '' })
    await prisma.scheduledTask.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
