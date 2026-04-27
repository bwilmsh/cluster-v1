import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'
import { filesRouter } from './files'

export const agentsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: {},
    create: { email: DEFAULT_USER_EMAIL, name: 'Default User' },
  })
}

function getPythonUrl() {
  return process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
}

type UpcomingAppointment = {
  id: number
  start_time: string
  end_time: string
  status: string
  customer_id?: number
}

async function getBusinessContext(): Promise<string> {
  const now = new Date()
  const nowIso = now.toISOString()
  const humanNow = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(now)

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return [
      'Business context:',
      `- Current time (ISO): ${nowIso}`,
      `- Current local time: ${humanNow}`,
      '- Upcoming appointments: unavailable (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)',
    ].join('\n')
  }

  try {
    const query = new URLSearchParams({
      select: 'id,start_time,end_time,status,customer_id',
      start_time: `gte.${nowIso}`,
      order: 'start_time.asc',
      limit: '3',
    })

    const response = await fetch(`${supabaseUrl}/rest/v1/appointments?${query.toString()}`, {
      method: 'GET',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return [
        'Business context:',
        `- Current time (ISO): ${nowIso}`,
        `- Current local time: ${humanNow}`,
        `- Upcoming appointments: unavailable (Supabase error ${response.status}: ${errorText.slice(0, 200)})`,
      ].join('\n')
    }

    const appointments = (await response.json()) as UpcomingAppointment[]
    const lines = appointments.length
      ? appointments.map((appt, idx) => (
          `- ${idx + 1}. ${appt.start_time} to ${appt.end_time} | status: ${appt.status} | appointment_id: ${appt.id}`
        ))
      : ['- None in the next window.']

    return [
      'Business context:',
      `- Current time (ISO): ${nowIso}`,
      `- Current local time: ${humanNow}`,
      '- Next 3 upcoming appointments:',
      ...lines,
    ].join('\n')
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error'
    return [
      'Business context:',
      `- Current time (ISO): ${nowIso}`,
      `- Current local time: ${humanNow}`,
      `- Upcoming appointments: unavailable (${reason})`,
    ].join('\n')
  }
}

// Mount file routes under /api/agents/:id/files
agentsRouter.use('/:id/files', filesRouter)

// GET /api/agents
agentsRouter.get('/', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const agents = await prisma.agent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(agents)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/agents
agentsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const user = await getDefaultUser()
    const agent = await prisma.agent.create({
      data: { name, userId: user.id, status: 'setting_up' },
    })
    res.status(201).json(agent)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/agents/generate-questions  — MUST be registered before /:id routes
agentsRouter.post('/generate-questions', async (req: Request, res: Response) => {
  const { agentName } = req.body
  if (!agentName) return res.status(400).json({ error: 'agentName is required' })

  try {
    const response = await fetch(`${getPythonUrl()}/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_name: agentName }),
    })
    const data = await response.json()
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'Python service unavailable' })
  }
})

// GET /api/agents/memory/by-name?name=AgentName  — explicit cross-agent memory read
agentsRouter.get('/memory/by-name', async (req: Request, res: Response) => {
  try {
    const rawName = String(req.query.name ?? '').trim()
    if (!rawName) return res.status(400).json({ error: 'name query parameter is required' })

    const user = await getDefaultUser()
    const agent = await prisma.agent.findFirst({
      where: { userId: user.id, name: rawName },
      select: { id: true, name: true, memory: true },
    })

    if (!agent) return res.status(404).json({ error: 'Agent not found' })
    res.json(agent)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/agents/:id
agentsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { setupAnswers, memory, status } = req.body
    const agent = await prisma.agent.update({
      where: { id },
      data: {
        ...(setupAnswers !== undefined && { setupAnswers, status: 'active' }),
        ...(memory !== undefined && { memory }),
        ...(status !== undefined && { status }),
      },
    })
    res.json(agent)

    // After saving setup answers, generate initial memory in background
    if (setupAnswers !== undefined) {
      fetch(`${getPythonUrl()}/initialize-memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_name: agent.name, setup_answers: setupAnswers }),
      })
        .then((r) => r.json())
        .then(({ memory: initialMemory }) => {
          if (initialMemory) {
            return prisma.agent.update({ where: { id }, data: { memory: initialMemory } })
          }
        })
        .catch(() => {})
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/agents/:id
agentsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.agent.delete({ where: { id } })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/agents/:id/messages
agentsRouter.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const messages = await prisma.message.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'asc' },
    })
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/agents/:id/chat  — SSE streaming
agentsRouter.post('/:id/chat', async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { message } = req.body

  const agent = await prisma.agent.findUnique({ where: { id } })
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  const user = await getDefaultUser()

  // Save user message
  await prisma.message.create({
    data: { agentId: id, userId: user.id, role: 'user', content: message },
  })

  // Fetch history + agent files + user integrations in parallel
  const [history, agentFiles, integrationContext] = await Promise.all([
    prisma.message.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    }),
    prisma.agentFile.findMany({
      where: { agentId: id },
      select: { fileName: true, content: true },
    }),
    getUserIntegrationContext(user.id),
  ])
  const integrationTokens = integrationContext.tokens

  const business_context = await getBusinessContext()
  const memoryWithBusinessContext = `${business_context}\n\n${agent.memory ?? ''}`.trim()

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let aborted = false
  req.on('close', () => { aborted = true })

  let fullContent = ''

  try {
    const pythonRes = await fetch(`${getPythonUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agent.name,
        agent_id: agent.id,
        setup_answers: agent.setupAnswers ?? {},
        memory: memoryWithBusinessContext,
        history: history.slice(0, -1),
        message,
        integrations: integrationTokens,
        connected_integrations: integrationContext.connectedIntegrations,
        files: agentFiles.map((f) => ({ name: f.fileName, content: f.content })),
      }),
    })

    const reader = pythonRes.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) throw new Error('No response body')

    while (true) {
      if (aborted) { reader.cancel(); break }
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') {
            res.write('data: [DONE]\n\n')
          } else {
            try {
              const parsed = JSON.parse(payload)
              if (parsed.delta) fullContent += parsed.delta
              res.write(`data: ${payload}\n\n`)
            } catch {
              // skip malformed
            }
          }
        }
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Agent service error' })}\n\n`)
  } finally {
    if (fullContent) {
      await prisma.message.create({
        data: { agentId: id, userId: user.id, role: 'assistant', content: fullContent },
      })

      // Fire-and-forget memory update
      const recentTurn = `user: ${message}\nassistant: ${fullContent}`
      ;(async () => {
        try {
          const latestAgent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, memory: true },
          })
          if (!latestAgent) return

          const updateResponse = await fetch(`${getPythonUrl()}/update-memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agent_id: latestAgent.id,
              agent_name: latestAgent.name,
              current_memory: latestAgent.memory ?? '',
              conversation: recentTurn,
            }),
          })

          const { memory: updatedMemory } = await updateResponse.json()
          if (updatedMemory) {
            await prisma.agent.update({ where: { id: latestAgent.id }, data: { memory: updatedMemory } })
          }
        } catch {
          // best-effort memory update only
        }
      })()
    }
    res.end()
  }
})
