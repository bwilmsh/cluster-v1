import { Router, Request, Response } from 'express'
import { getDefaultUser, prisma } from '../db'
import { clearCurrentGoals, createCurrentGoal, getCurrentGoal, getGoalById, listGoals, updateGoal } from '../lib/goals'

export const goalsRouter = Router()

async function postJsonWithTimeout(url: string, body: unknown, timeoutMs = 5000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return await response.json().catch(() => null)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

type GoalBody = {
  goal_text?: string
  visible_agent_ids?: string[]
  deadline?: string | null
}

type GoalUpdateBody = {
  goal_text?: string
  deadline?: string | null
}

type GoalPlanMessage = {
  role?: string
  content?: string
}

type GoalPlanTask = {
  title?: string
  due_date?: string | null
  priority?: string | null
  status?: string | null
  note?: string | null
}

type GoalPlanCalendarBlock = {
  title?: string
  start_time?: string | null
  end_time?: string | null
  note?: string | null
}

type GoalPlanBody = {
  message?: string
  history?: GoalPlanMessage[]
}

function goalTag(goalId: string) {
  return `goal:${goalId}`
}

function normalizeGoalPlanMessages(value: unknown): GoalPlanMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const message = item as GoalPlanMessage
      const role = String(message.role ?? '').trim()
      const content = String(message.content ?? '').trim()
      if (!role || !content) return null
      return { role, content }
    })
    .filter((item): item is GoalPlanMessage => Boolean(item))
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  try {
    return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function parseGoalPlanTasks(value: unknown): GoalPlanTask[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const task = item as GoalPlanTask
      const title = String(task.title ?? '').trim()
      if (!title) return null
      return {
        title,
        due_date: task.due_date ?? null,
        priority: task.priority ?? null,
        status: task.status ?? null,
        note: task.note ?? null,
      }
    })
    .filter((item): item is GoalPlanTask => Boolean(item))
}

function parseGoalCalendarBlocks(value: unknown): GoalPlanCalendarBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const block = item as GoalPlanCalendarBlock
      const title = String(block.title ?? '').trim()
      if (!title) return null
      return {
        title,
        start_time: block.start_time ?? null,
        end_time: block.end_time ?? null,
        note: block.note ?? null,
      }
    })
    .filter((item): item is GoalPlanCalendarBlock => Boolean(item))
}

function toPlanTaskDate(value: string | null | undefined, fallbackDays: number) {
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + fallbackDays)
  return date
}

function toPlanDateTime(value: string | null | undefined, fallbackDays: number, fallbackHour: number) {
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const date = new Date()
  date.setSeconds(0, 0)
  date.setHours(fallbackHour, 0, 0, 0)
  date.setDate(date.getDate() + fallbackDays)
  return date
}

async function runGoalCoach(
  goalText: string,
  deadline: string | null,
  history: GoalPlanMessage[],
  message: string,
  existingTasks: Array<{ title: string; status: string; priority: string; due_date: string | null }>,
  existingCalendar: Array<{ title: string; start_time: string; end_time: string | null }>
) {
  const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
  const systemMemory = [
    'You are a goal coach embedded in a planning workspace.',
    'Help the user turn one goal into a realistic checklist, a schedule-aware plan, and a weekly check-in question.',
    'Your tone must be warm, encouraging, and practical in every response.',
    'Always acknowledge effort with a short supportive sentence (for example: "You are doing great", "You are further than most people who have not started", or equivalent natural wording).',
    'After the encouragement, give a clear breakdown with actionable steps and explain briefly how to do the next step.',
    'Keep guidance specific, realistic, and momentum-focused. Avoid vague motivation without concrete actions.',
    'Return ONLY valid JSON with this exact structure:',
    '{"reply":"short answer","tasks":[{"title":"task","due_date":"YYYY-MM-DD or null","priority":"high|medium|low","status":"todo|done","note":"optional"}],"calendar_blocks":[{"title":"calendar block","start_time":"ISO datetime or null","end_time":"ISO datetime or null","note":"optional"}],"check_in_prompt":"weekly question","schedule_summary":"short schedule note"}',
    'If the user has not explained enough yet, first include one encouraging sentence, then ask: What are you trying to achieve with this goal?',
    'Task output must break work down into small, clear steps the user can start immediately.',
    'If the user asks to add or adjust calendar items, include those changes in calendar_blocks with concrete times.',
    'Do not include markdown fences or extra text.',
    `Goal: ${goalText}`,
    `Deadline: ${deadline ?? 'none'}`,
    `Existing tasks: ${existingTasks.map((task) => `${task.title} [${task.status}]`).join('; ') || 'none'}`,
    `Existing calendar blocks: ${existingCalendar.map((item) => `${item.title} @ ${item.start_time}`).join('; ') || 'none'}`,
  ].join('\n')

  const response = await fetch(`${pythonUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_name: 'Goal Coach',
      agent_id: 'goal-coach',
      setup_answers: {},
      memory: systemMemory,
      history,
      message,
      integrations: {},
      files: [],
    }),
  })

  if (!response.ok || !response.body) {
    throw new Error('Goal coach service unavailable')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const parsed = JSON.parse(payload) as { delta?: string }
        if (parsed.delta) fullText += parsed.delta
      } catch {
        // ignore malformed stream chunks
      }
    }
  }

  const plan = parseJsonObject(fullText) ?? {
    reply: fullText.trim(),
    tasks: [],
    calendar_blocks: [],
    check_in_prompt: 'You are doing well staying consistent. How did this week go, and what should we adjust next?',
    schedule_summary: '',
  }

  return {
    reply: asString(plan.reply) || 'You are doing great by showing up and planning this. What are you trying to achieve with this goal?',
    tasks: parseGoalPlanTasks(plan.tasks),
    calendarBlocks: parseGoalCalendarBlocks(plan.calendar_blocks),
    checkInPrompt: asString(plan.check_in_prompt) || 'You are doing well staying consistent. How did this week go, and what should we adjust next?',
    scheduleSummary: asString(plan.schedule_summary),
  }
}

function normalizeVisibleAgentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function parseDeadline(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
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

goalsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const goal = await getGoalById(user.id, req.params.id)
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' })
    }

    return res.json({ data: goal })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to fetch goal', details })
  }
})

goalsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = req.body as GoalBody
    const goalText = String(body.goal_text ?? '').trim()
    if (!goalText) return res.status(400).json({ error: 'goal_text is required' })

    const visibleAgentIds = normalizeVisibleAgentIds(body.visible_agent_ids)
    const deadline = parseDeadline(body.deadline)

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

    const created = await createCurrentGoal(user.id, goalText, visibleAgentIds, deadline ?? null)
    return res.status(201).json({ success: true, created })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to create goal', details })
  }
})

goalsRouter.post('/current', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = req.body as GoalBody
    const goalText = String(body.goal_text ?? '').trim()
    if (!goalText) return res.status(400).json({ error: 'goal_text is required' })

    const visibleAgentIds = normalizeVisibleAgentIds(body.visible_agent_ids)
    const deadline = parseDeadline(body.deadline)
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

    const created = await createCurrentGoal(user.id, goalText, visibleAgentIds, deadline ?? null)
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
            await postJsonWithTimeout(`${pythonUrl}/update-memory`, {
              agent_id: a.id,
              agent_name: a.name,
              current_memory: a.memory ?? '',
              conversation,
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

goalsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const body = req.body as GoalUpdateBody
    const goalText = body.goal_text === undefined ? undefined : String(body.goal_text).trim()
    if (goalText !== undefined && !goalText) {
      return res.status(400).json({ error: 'goal_text is required' })
    }

    const deadline = parseDeadline(body.deadline)
    const updated = await updateGoal(user.id, req.params.id, {
      ...(goalText !== undefined ? { goalText } : {}),
      ...(deadline !== undefined ? { deadline } : {}),
    })

    if (!updated) {
      return res.status(404).json({ error: 'Goal not found' })
    }

    return res.json({ success: true, goal: updated })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to update goal', details })
  }
})

goalsRouter.post('/:id/plan', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const goal = await getGoalById(user.id, req.params.id)
    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' })
    }

    const body = req.body as GoalPlanBody
    const message = String(body.message ?? '').trim()
    if (!message) {
      return res.status(400).json({ error: 'message is required' })
    }

    const history = normalizeGoalPlanMessages(body.history)
    const goalEvents = await prisma.event.findMany({
      where: { tags: { has: goalTag(goal.id) } },
      orderBy: { start_time: 'asc' },
    })

    const goalTasks = goalEvents.filter((event) => event.itemType === 'task')
    const goalCalendarEvents = goalEvents.filter((event) => event.itemType !== 'task')

    const existingTasks = goalTasks.map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.start_time.toISOString().slice(0, 10),
    }))

    const existingCalendar = goalCalendarEvents.map((event) => ({
      title: event.title,
      start_time: event.start_time.toISOString(),
      end_time: event.end_time ? event.end_time.toISOString() : null,
    }))

    const plan = await runGoalCoach(goal.goal_text, goal.deadline ?? null, history, message, existingTasks, existingCalendar)

    const existingByTitle = new Map(goalTasks.map((task) => [task.title.trim().toLowerCase(), task]))
    const keepIds = new Set<string>()

    for (const [index, task] of plan.tasks.entries()) {
      const title = task.title.trim()
      const key = title.toLowerCase()
      const existing = existingByTitle.get(key)
      const dueDate = toPlanTaskDate(task.due_date ?? null, index)
      const status = task.status === 'done' ? 'done' : existing?.status ?? 'todo'
      const priority = task.priority === 'high' || task.priority === 'low' ? task.priority : existing?.priority ?? 'medium'

      if (existing) {
        keepIds.add(existing.id)
        await prisma.event.update({
          where: { id: existing.id },
          data: {
            title,
            start_time: dueDate,
            itemType: 'task',
            status,
            priority,
            description: task.note ?? existing.description ?? null,
            tags: Array.from(new Set([...(existing.tags ?? []), goalTag(goal.id)])),
          },
        })
      } else {
        const created = await prisma.event.create({
          data: {
            title,
            description: task.note ?? null,
            start_time: dueDate,
            end_time: null,
            itemType: 'task',
            status,
            priority,
            tags: [goalTag(goal.id)],
          },
        })
        keepIds.add(created.id)
      }
    }

    const staleTasks = goalTasks.filter((task) => !keepIds.has(task.id) && task.status !== 'done')
    if (staleTasks.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: staleTasks.map((task) => task.id) } } })
    }

    const existingCalendarByTitle = new Map(goalCalendarEvents.map((event) => [event.title.trim().toLowerCase(), event]))
    for (const [index, block] of plan.calendarBlocks.entries()) {
      const title = block.title?.trim() ?? ''
      if (!title) continue

      const key = title.toLowerCase()
      const existing = existingCalendarByTitle.get(key)
      const startTime = toPlanDateTime(block.start_time ?? null, index, 9)
      const endTime = toPlanDateTime(block.end_time ?? null, index, 10)
      const safeEnd = endTime.getTime() <= startTime.getTime() ? new Date(startTime.getTime() + 60 * 60 * 1000) : endTime

      if (existing) {
        await prisma.event.update({
          where: { id: existing.id },
          data: {
            title,
            description: block.note ?? existing.description ?? null,
            start_time: startTime,
            end_time: safeEnd,
            itemType: existing.itemType ?? 'event',
            tags: Array.from(new Set([...(existing.tags ?? []), goalTag(goal.id), 'goal-calendar'])),
          },
        })
      } else {
        await prisma.event.create({
          data: {
            title,
            description: block.note ?? null,
            start_time: startTime,
            end_time: safeEnd,
            itemType: 'event',
            status: 'todo',
            priority: 'medium',
            tags: [goalTag(goal.id), 'goal-calendar'],
          },
        })
      }
    }

    return res.json({
      success: true,
      reply: plan.reply,
      check_in_prompt: plan.checkInPrompt,
      schedule_summary: plan.scheduleSummary,
      tasks: plan.tasks,
      calendar_blocks: plan.calendarBlocks,
    })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Failed to plan goal', details })
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
