import { Router, Request, Response } from 'express'
import cron from 'node-cron'
import { prisma } from '../db'

export const schedulerRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

function getPythonUrl() {
  return process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
}

// Active cron jobs keyed by task id
const activeJobs = new Map<string, cron.ScheduledTask>()

async function runTask(taskId: string) {
  let task: any
  try {
    task = await prisma.scheduledTask.findUnique({
      where: { id: taskId },
      include: { agent: true },
    })
  } catch {
    return
  }

  if (!task || !task.enabled) return

  // Update lastRun
  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { lastRun: new Date() },
  })

  // Call the Python agent
  let result = ''
  try {
    const resp = await fetch(`${getPythonUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: task.agent.name,
        setup_answers: task.agent.setupAnswers ?? {},
        memory: task.agent.memory ?? '',
        history: [],
        message: task.prompt,
        integrations: {},
        files: [],
      }),
    })

    // Consume SSE stream and collect text
    const reader = resp.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim()
            if (payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload)
                if (parsed.delta) result += parsed.delta
              } catch {
                // skip
              }
            }
          }
        }
      }
    }
  } catch (err) {
    result = `Error: ${(err as Error).message}`
  }

  // Save result back to the task and the agent's message history
  try {
    await prisma.scheduledTask.update({
      where: { id: taskId },
      data: { lastResult: result.slice(0, 2000) },
    })

    const user = await getDefaultUser()
    if (result) {
      await prisma.message.createMany({
        data: [
          {
            agentId: task.agentId,
            userId: user.id,
            role: 'user',
            content: `[Scheduled: ${task.name}] ${task.prompt}`,
          },
          {
            agentId: task.agentId,
            userId: user.id,
            role: 'assistant',
            content: result,
          },
        ],
      })
    }
  } catch {
    // Non-fatal
  }
}

function scheduleTask(taskId: string, cronExpr: string) {
  // Stop existing job if any
  const existing = activeJobs.get(taskId)
  if (existing) {
    existing.stop()
    activeJobs.delete(taskId)
  }

  if (!cron.validate(cronExpr)) return

  const job = cron.schedule(cronExpr, () => runTask(taskId), { scheduled: true })
  activeJobs.set(taskId, job)
}

// Initialize all enabled tasks on startup
export async function initScheduler() {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id, enabled: true },
    })
    for (const task of tasks) {
      scheduleTask(task.id, task.cronExpr)
    }
    console.log(`Scheduler: loaded ${tasks.length} task(s)`)
  } catch {
    // No user yet — fine
  }
}

// GET /api/scheduler
schedulerRouter.get('/', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(tasks)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/scheduler
schedulerRouter.post('/', async (req: Request, res: Response) => {
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
      include: { agent: { select: { id: true, name: true } } },
    })
    scheduleTask(task.id, task.cronExpr)
    res.status(201).json(task)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/scheduler/:id — toggle enabled, update cronExpr/prompt
schedulerRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { enabled, cronExpr, prompt, name } = req.body
    const updates: Record<string, any> = {}
    if (enabled !== undefined) updates.enabled = enabled
    if (cronExpr !== undefined) {
      if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' })
      updates.cronExpr = cronExpr
    }
    if (prompt !== undefined) updates.prompt = prompt
    if (name !== undefined) updates.name = name

    const task = await prisma.scheduledTask.update({
      where: { id: req.params.id },
      data: updates,
      include: { agent: { select: { id: true, name: true } } },
    })

    // Re-schedule
    if (task.enabled) {
      scheduleTask(task.id, task.cronExpr)
    } else {
      const job = activeJobs.get(task.id)
      if (job) { job.stop(); activeJobs.delete(task.id) }
    }

    res.json(task)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/scheduler/:id/run — manual trigger
schedulerRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    await runTask(req.params.id)
    const task = await prisma.scheduledTask.findUnique({
      where: { id: req.params.id },
      include: { agent: { select: { id: true, name: true } } },
    })
    res.json(task)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/scheduler/:id
schedulerRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const job = activeJobs.get(req.params.id)
    if (job) { job.stop(); activeJobs.delete(req.params.id) }
    await prisma.scheduledTask.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
