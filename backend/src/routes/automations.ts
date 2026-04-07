import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { runAutomation, syncAutomation, loadAutomations, todayRunCount, DAILY_RUN_LIMIT } from '../automations/runner'
import { loadAllTemplates, loadTemplate } from '../automations/templateLoader'
import { checkRequirements } from '../automations/requirementsChecker'

export { loadAutomations }

export const automationsRouter = Router()

// ─── Templates ────────────────────────────────────────────────────────────────

// GET /api/automations/templates — list all approved templates
automationsRouter.get('/templates', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.automationTemplate.findMany({
      where: { isApproved: true },
      orderBy: [{ isOfficial: 'desc' }, { name: 'asc' }],
    })
    res.json(templates)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/automations/templates/:id — single template with full definition
automationsRouter.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.automationTemplate.findUnique({ where: { id: req.params.id } })
    if (!template) return res.status(404).json({ error: 'Not found' })
    res.json(template)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/automations/templates/:id/requirements — check requirements for a template (pre-activation)
automationsRouter.get('/templates/:id/requirements', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const template = await prisma.automationTemplate.findUnique({ where: { id: req.params.id } })
    if (!template) return res.status(404).json({ error: 'Not found' })
    const requires: string[] = (template.definition as any)?.requires ?? []
    const result = await checkRequirements(user.id, requires)
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── My Automations ───────────────────────────────────────────────────────────

// GET /api/automations — list user's automations
automationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const [automations, runsToday] = await Promise.all([
      prisma.automation.findMany({
        where: { userId: user.id },
        include: { agent: true, template: true },
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

// POST /api/automations — create automation from template
automationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { agentId, templateId, name, variables, schedule, deliveryType, deliveryTarget } = req.body
    if (!agentId || !templateId) {
      return res.status(400).json({ error: 'agentId and templateId required' })
    }

    const template = await prisma.automationTemplate.findUnique({ where: { id: templateId } })
    if (!template) return res.status(404).json({ error: 'Template not found' })

    const user = await getDefaultUser()

    // Check requirements — include result in response so UI can warn immediately
    const requires: string[] = (template.definition as any)?.requires ?? []
    const reqCheck = await checkRequirements(user.id, requires)

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        agentId,
        templateId,
        name: name || template.name,
        variables: variables ?? {},
        schedule: schedule ?? null,
        deliveryType: deliveryType ?? 'chat',
        deliveryTarget: deliveryTarget ?? null,
      },
      include: { agent: true, template: true },
    })
    syncAutomation(automation)
    res.status(201).json({ ...automation, requirements: reqCheck })
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
      include: { agent: true, template: true },
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
      prisma.automation.findUnique({
        where: { id: req.params.id },
        select: { id: true, name: true, templateId: true },
        include: undefined,
      }),
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

    // Hard block if requirements are missing
    const template = await prisma.automationTemplate.findUnique({
      where: { id: automation.templateId },
      select: { definition: true },
    })
    const requires: string[] = (template?.definition as any)?.requires ?? []
    const reqCheck = await checkRequirements(user.id, requires)
    if (!reqCheck.ok) {
      return res.status(422).json({
        error: 'Missing requirements',
        missing: reqCheck.missing,
      })
    }

    res.json({ message: 'Automation started', automationId: automation.id, runsToday: runsToday + 1, dailyLimit: DAILY_RUN_LIMIT })
    runAutomation(automation.id).catch(console.error)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/automations/:id/requirements — check requirements status
automationsRouter.get('/:id/requirements', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const automation = await prisma.automation.findUnique({
      where: { id: req.params.id },
      include: { template: true },
    })
    if (!automation) return res.status(404).json({ error: 'Not found' })
    const requires: string[] = (automation.template?.definition as any)?.requires ?? []
    const result = await checkRequirements(user.id, requires)
    res.json(result)
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

// ─── Custom automation builder ────────────────────────────────────────────────

// POST /api/automations/build — AI generates step definition from description
automationsRouter.post('/build', async (req: Request, res: Response) => {
  try {
    const { description } = req.body
    if (!description) return res.status(400).json({ error: 'description required' })

    const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
    const pythonRes = await fetch(`${pythonUrl}/build-automation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    })

    if (!pythonRes.ok) {
      return res.status(500).json({ error: 'Build service unavailable' })
    }

    const data = await pythonRes.json()
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/automations/custom — save a custom automation (creates template + automation)
automationsRouter.post('/custom', async (req: Request, res: Response) => {
  try {
    const { agentId, name, description, steps, variables, schedule, deliveryType, deliveryTarget } = req.body
    if (!agentId || !name || !steps) return res.status(400).json({ error: 'agentId, name, steps required' })

    const user = await getDefaultUser()

    // Create a custom template (pending admin approval)
    const templateId = `custom_${user.id}_${Date.now()}`
    const template = await prisma.automationTemplate.create({
      data: {
        id: templateId,
        name,
        description: description ?? name,
        category: 'analytics',
        icon: 'custom',
        isOfficial: false,
        isApproved: false,
        createdBy: user.id,
        definition: {
          id: templateId,
          name,
          description: description ?? name,
          category: 'analytics',
          icon: 'custom',
          requires: [],
          variables: variables ?? [],
          steps,
          delivery_options: ['chat', 'email', 'slack'],
          estimated_duration: 'varies',
          ai_recovery: true,
        },
      },
    })

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        agentId,
        templateId,
        name,
        variables: {},
        schedule: schedule ?? null,
        deliveryType: deliveryType ?? 'chat',
        deliveryTarget: deliveryTarget ?? null,
      },
      include: { agent: true, template: true },
    })

    if (automation.schedule) syncAutomation(automation)
    res.status(201).json(automation)
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
