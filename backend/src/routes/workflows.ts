import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { runWorkflow, syncWorkflow } from '../workflows/runner'

export const workflowsRouter = Router()

// GET /api/workflows — list user's workflows
workflowsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const workflows = await prisma.workflow.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(workflows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/workflows/:id — get single workflow
workflowsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!workflow) return res.status(404).json({ error: 'Not found' })
    res.json(workflow)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/workflows — create workflow
workflowsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, nodes, edges, status } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })

    const user = await getDefaultUser()
    const workflow = await prisma.workflow.create({
      data: {
        userId: user.id,
        name,
        description: description ?? null,
        nodes: nodes ?? [],
        edges: edges ?? [],
        status: status ?? 'draft',
      },
    })
    syncWorkflow({ id: workflow.id, status: workflow.status, nodes: workflow.nodes })
    res.status(201).json(workflow)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/workflows/:id — update workflow (nodes, edges, name, status)
workflowsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const { name, description, nodes, edges, status } = req.body
    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(nodes !== undefined && { nodes }),
        ...(edges !== undefined && { edges }),
        ...(status !== undefined && { status }),
      },
    })
    // Re-register cron if status or nodes changed
    syncWorkflow({ id: workflow.id, status: workflow.status, nodes: workflow.nodes })
    res.json(workflow)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/workflows/:id/run — manual run
workflowsRouter.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    // Fire async — don't wait, just confirm it started
    runWorkflow(req.params.id).catch(console.error)
    res.json({ message: 'Workflow started' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/workflows/:id/runs — run history
workflowsRouter.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
    res.json(runs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/workflows/:id
workflowsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const existing = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId: user.id },
    })
    if (!existing) return res.status(404).json({ error: 'Not found' })

    await prisma.workflow.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
