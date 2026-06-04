import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'
import { getVisibleGoalsForAgent } from '../lib/goals'
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
    console.error('POST /api/agents failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: 'Internal server error', detail: message })
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
    console.error('PATCH /api/agents/:id failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: 'Internal server error', detail: message })
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

  console.log('[BACKEND] POST /api/agents/:id/chat', { id, message })

  const agent = await prisma.agent.findUnique({ where: { id } })
  if (!agent) {
    console.log('[BACKEND] Agent not found:', id)
    return res.status(404).json({ error: 'Agent not found' })
  }

  const user = await getDefaultUser()
  console.log('[BACKEND] Using user:', user.email)

  // Save user message
  const userMsg = await prisma.message.create({
    data: { agentId: id, userId: user.id, role: 'user', content: String(message ?? '') },
  })
  console.log('[BACKEND] Saved user message:', userMsg.id, userMsg.content.slice(0, 50))

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
  const visibleGoals = await getVisibleGoalsForAgent(user.id, id)
  const integrationTokens = integrationContext.tokens

  console.log('[BACKEND] Fetched', history.length, 'history items,', agentFiles.length, 'files')

  const business_context = await getBusinessContext()
  const memoryWithBusinessContext = `${business_context}\n\n${agent.memory ?? ''}`.trim()

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  console.log('[BACKEND] SSE headers set')

  let aborted = false
  req.on('close', () => {
    console.log('[BACKEND] Client closed connection')
    aborted = true
  })

  let fullContent = ''

  try {
    const pythonUrl = getPythonUrl()
    console.log('[BACKEND] Calling Python service:', pythonUrl + '/chat')
    const pythonRes = await fetch(`${pythonUrl}/chat`, {
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
        goals: visibleGoals,
        files: agentFiles.map((f) => ({ name: f.fileName, content: f.content })),
      }),
    })

    console.log('[BACKEND] Python response received:', pythonRes.status, pythonRes.statusText)
    const reader = pythonRes.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      console.error('[BACKEND] No response body from Python service')
      throw new Error('No response body')
    }

    let chunkCount = 0
    while (true) {
      if (aborted) {
        console.log('[BACKEND] Stream aborted by client')
        reader.cancel()
        break
      }
      let readResult
      try {
        readResult = await reader.read()
      } catch (err) {
        const errorText = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        if (
          errorText.includes('terminated') ||
          errorText.includes('other side closed') ||
          errorText.includes('UND_ERR_SOCKET')
        ) {
          console.log('[BACKEND] Python stream closed cleanly:', errorText)
          break
        }
        throw err
      }

      const { done, value } = readResult
      if (done) {
        console.log('[BACKEND] Python stream ended after', chunkCount, 'chunks')
        break
      }
      chunkCount++
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') {
            console.log('[BACKEND] Received [DONE] from Python')
            res.write('data: [DONE]\n\n')
          } else {
            try {
              const parsed = JSON.parse(payload)
              if (parsed.delta) {
                fullContent += parsed.delta
                console.log('[BACKEND] Added delta, total length now:', fullContent.length)
              }
              res.write(`data: ${payload}\n\n`)
            } catch (err) {
              console.error('[BACKEND] Failed to parse payload:', payload, err)
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[BACKEND] Error during streaming:', err)
    res.write(`data: ${JSON.stringify({ error: 'Agent service error' })}\n\n`)
  } finally {
    console.log('[BACKEND] Finally block: fullContent length =', fullContent.length)
    if (fullContent) {
      const assistantMsg = await prisma.message.create({
        data: { agentId: id, userId: user.id, role: 'assistant', content: fullContent },
      })
      console.log('[BACKEND] Saved assistant message:', assistantMsg.id, assistantMsg.content.slice(0, 50))

      // Fire-and-forget memory update
      const recentTurn = `user: ${message}\nassistant: ${fullContent}`
      ;(async () => {
        try {
          const latestAgent = await prisma.agent.findUnique({
            where: { id },
            select: { id: true, name: true, memory: true },
          })
          if (!latestAgent) {
            console.log('[BACKEND] Agent not found for memory update')
            return
          }

          const updateResult = await postJsonWithTimeout(`${getPythonUrl()}/update-memory`, {
            agent_id: latestAgent.id,
            agent_name: latestAgent.name,
            current_memory: latestAgent.memory ?? '',
            conversation: recentTurn,
          })

          const updatedMemory = updateResult?.memory
          if (updatedMemory) {
            await prisma.agent.update({ where: { id: latestAgent.id }, data: { memory: updatedMemory } })
            console.log('[BACKEND] Agent memory updated')
          }
        } catch (err) {
          // best-effort only; never surface memory update failures
        }
      })()
      console.log('[BACKEND] Memory update async call initiated')
    } else {
      console.log('[BACKEND] No fullContent - skipping message save and memory update')
    }
    console.log('[BACKEND] Closing SSE connection')
    res.end()
  }
})
