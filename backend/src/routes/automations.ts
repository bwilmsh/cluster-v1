import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { runAutomation, syncAutomation, loadAutomations, todayRunCount, DAILY_RUN_LIMIT } from '../automations/runner'

export { loadAutomations }

export const automationsRouter = Router()

// ─── My Automations ───────────────────────────────────────────────────────────

// GET /api/automations — list user's automations
automationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const [automations, runsToday] = await Promise.all([
      prisma.automation.findMany({
        where: { userId: user.id },
        include: { agent: true, requiredIntegrations: true },
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

// POST /api/automations — create automation from a natural language goal
automationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, goal, name, schedule, deliveryType, deliveryTarget, requiredIntegrations } = req.body
    if (!agentId || !goal) {
      return res.status(400).json({ error: 'agentId and goal required' })
    }

    const user = await getDefaultUser()

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        agentId,
        name: name || goal.slice(0, 80),
        goal,
        schedule: schedule ?? null,
        deliveryType: deliveryType ?? 'chat',
        deliveryTarget: deliveryTarget ?? null,
        requiredIntegrations: requiredIntegrations?.length
          ? {
              create: (requiredIntegrations as string[]).map((provider: string) => ({
                provider,
                isRequired: true,
              })),
            }
          : undefined,
      },
      include: { agent: true, requiredIntegrations: true },
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

// POST /api/automations/:id/run — run now
automationsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const [automation, runsToday] = await Promise.all([
      prisma.automation.findUnique({ where: { id: req.params.id } }),
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

// PATCH /api/automations/:id/integrations — update required integrations
automationsRouter.patch('/:id/integrations', async (req: Request, res: Response) => {
  try {
    const { requiredIntegrations } = req.body
    if (!Array.isArray(requiredIntegrations)) {
      return res.status(400).json({ error: 'requiredIntegrations must be an array' })
    }

    const existing = await prisma.automation.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    // Delete existing and recreate
    await prisma.automationIntegration.deleteMany({ where: { automationId: req.params.id } })

    const automation = await prisma.automation.update({
      where: { id: req.params.id },
      data: {
        requiredIntegrations: {
          create: (requiredIntegrations as string[]).map((provider: string) => ({
            provider,
            isRequired: true,
          })),
        },
      },
      include: { agent: true, requiredIntegrations: true },
    })

    res.json(automation)
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
    syncAutomation({ id: req.params.id, active: false, schedule: null })
    await prisma.automation.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Admin ────────────────────────────────────────────────────────────────────

// GET /api/automations/admin/pending — list pending custom templates
automationsRouter.get('/admin/pending', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.automationTemplate.findMany({
      where: { isOfficial: false, isApproved: false },
      orderBy: { createdAt: 'asc' },
    })
    res.json(pending)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/automations/admin/:id/approve
automationsRouter.patch('/admin/:id/approve', async (req: Request, res: Response) => {
  try {
    const template = await prisma.automationTemplate.update({
      where: { id: req.params.id },
      data: { isApproved: true, isOfficial: true },
    })
    res.json(template)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/automations/admin/:id — reject custom template
automationsRouter.delete('/admin/:id', async (req: Request, res: Response) => {
  try {
    await prisma.automationTemplate.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
