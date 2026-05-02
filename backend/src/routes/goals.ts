import { Router, Request, Response } from 'express'
import { getDefaultUser } from '../db'
import { clearCurrentGoals, createCurrentGoal, getCurrentGoal, listGoals } from '../lib/goals'
import { prisma } from '../db'

export const goalsRouter = Router()

type GoalBody = {
  goal_text?: string
  visible_agent_ids?: string[]
}

function normalizeVisibleAgentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

goalsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const limit = Number(req.query.limit ?? 20)
    const goals = await listGoals(user.id, limit)
    return res.json(goals)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to fetch goals', details })
  }
})

goalsRouter.get('/current', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const goal = await getCurrentGoal(user.id)
    return res.json({ data: goal })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to fetch current goal', details })
  }
})

goalsRouter.post('/current', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = req.body as GoalBody
    const goalText = String(body.goal_text ?? '').trim()
    if (!goalText) return res.status(400).json({ error: 'goal_text is required' })

    const visibleAgentIds = normalizeVisibleAgentIds(body.visible_agent_ids)
    if (visibleAgentIds.length > 0) {
      const validAgents = await prisma.agent.findMany({
        where: { userId: user.id, id: { in: visibleAgentIds } },
        select: { id: true },
      })
      const validAgentIds = new Set(validAgents.map((agent) => agent.id))
      const invalidAgentIds = visibleAgentIds.filter((agentId) => !validAgentIds.has(agentId))
      if (invalidAgentIds.length > 0) {
        return res.status(400).json({
          error: 'One or more selected AI targets are invalid',
          details: invalidAgentIds,
        })
      }
    }

    const created = await createCurrentGoal(user.id, goalText, visibleAgentIds)
    // Notify visible agents (or all agents if none selected) so their memory and
    // behavior immediately reflect the new active goal. Fire-and-forget background calls.
    ;(async () => {
      try {
        const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'

        // Determine target agents
        const targets = visibleAgentIds.length > 0
          ? await prisma.agent.findMany({ where: { id: { in: visibleAgentIds } }, select: { id: true, name: true, memory: true } })
          : await prisma.agent.findMany({ where: { userId: user.id }, select: { id: true, name: true, memory: true } })

        for (const a of targets) {
          try {
            const conversation = `system: Active goal set for the user: ${created.goal_text}\nassistant: Ask the user one concise question to clarify how they want to achieve this goal.`
            await fetch(`${pythonUrl}/update-memory`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent_id: a.id,
                agent_name: a.name,
                current_memory: a.memory ?? '',
                conversation,
              }),
              // do not wait long on these internal calls
              timeout: 5000 as unknown as number,
            })
          } catch {
            // best-effort only
          }
        }
      } catch {
        // swallow background errors
      }
    })()

    return res.status(201).json({ success: true, created })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to create goal', details })
  }
})

goalsRouter.delete('/current', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const cleared = await clearCurrentGoals(user.id)
    return res.json({ success: true, cleared })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to clear current goals', details })
  }
})
