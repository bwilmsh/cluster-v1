import { Router, Request, Response } from 'express'
import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { runAutomation, syncAutomation, loadAutomations, todayRunCount, DAILY_RUN_LIMIT } from '../services/automationRunner'

export { loadAutomations }

export const automationsRouter = Router()

// GET /api/automations — list all automations with agent + daily usage
automationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const [automations, runsToday] = await Promise.all([
      prisma.automation.findMany({
        where: { userId: user.id },
        include: { agent: true },
        orderBy: { createdAt: 'desc' },
      }),
      todayRunCount(user.id),
    ])
    res.json({ automations, runsToday, dailyLimit: DAILY_RUN_LIMIT })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/automations — create automation
automationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, name, goal, triggerType, cronExpr } = req.body
    if (!agentId || !name || !goal) {
      return res.status(400).json({ error: 'agentId, name, goal required' })
    }
    const type = triggerType ?? 'manual'
    if (type === 'schedule') {
      if (!cronExpr) return res.status(400).json({ error: 'cronExpr required for schedule trigger' })
      if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'Invalid cron expression' })
    }
    const user = await getDefaultUser()
    const automation = await prisma.automation.create({
      data: { userId: user.id, agentId, name, goal, triggerType: type, cronExpr: cronExpr ?? null },
      include: { agent: true },
    })
    syncAutomation(automation)
    res.status(201).json(automation)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/automations/:id/toggle — flip active
automationsRouter.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: { active: !existing.active },
      include: { agent: true },
    })
    syncAutomation(automation)
    res.json(automation)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/automations/:id/preflight — check requirements before running
automationsRouter.post('/:id/preflight', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const automation = await prisma.automation.findUnique({
      where: { id: req.params.id },
      include: { agent: true },
    })
    if (!automation || !automation.agent) return res.status(404).json({ error: 'Not found' })

    // Get user's connected integrations
    const integrations = await prisma.integration.findMany({
      where: { userId: user.id },
      select: { provider: true, accountEmail: true },
    })
    const connected = integrations.map((i) => i.provider)

    // Call Python for goal analysis
    const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
    let analysis: any = {
      requirements: [],
      web_access: true,
      will_send_emails: false,
      will_modify_data: false,
      estimated_steps: 5,
      notes: 'Pre-flight analysis unavailable — you can still run manually.',
    }

    try {
      const pythonRes = await fetch(`${pythonUrl}/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: automation.goal,
          agent_name: automation.agent.name,
          agent_id: automation.agent.id,
          connected_integrations: connected,
        }),
      })
      if (pythonRes.ok) analysis = await pythonRes.json()
    } catch {
      // Python down — return safe defaults so the UI still works
    }

    // Cross-check each requirement against what the user has connected
    const requirements = (analysis.requirements ?? []).map((r: any) => ({
      ...r,
      connected: connected.includes(r.name),
    }))

    const blockers = requirements.filter((r: any) => r.required && !r.connected)
    const warnings = requirements.filter((r: any) => !r.required && !r.connected)

    res.json({
      ...analysis,
      requirements,
      connected_integrations: connected,
      has_blockers: blockers.length > 0,
      blockers,
      warnings,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/automations/:id/run — run now (responds immediately)
automationsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const [automation, runsToday] = await Promise.all([
      prisma.automation.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } }),
      todayRunCount(user.id),
    ])
    if (!automation) return res.status(404).json({ error: 'Not found' })
    if (runsToday >= DAILY_RUN_LIMIT) {
      return res.status(429).json({
        error: `Daily run limit reached (${DAILY_RUN_LIMIT}/day). Resets at midnight UTC.`,
        runsToday,
        dailyLimit: DAILY_RUN_LIMIT,
      })
    }
    res.json({ message: 'Automation started', automationId: automation.id, runsToday: runsToday + 1, dailyLimit: DAILY_RUN_LIMIT })
    runAutomation(automation.id).catch(console.error)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/automations/:id/runs — run history
automationsRouter.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const runs = await prisma.automationRun.findMany({
      where: { automationId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
    res.json(runs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/automations/:id
automationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    syncAutomation({ id: req.params.id, active: false, triggerType: 'manual', cronExpr: null })
    await prisma.automation.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
