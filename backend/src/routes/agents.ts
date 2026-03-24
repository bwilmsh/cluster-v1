import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const agentsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

// GET /api/agents
agentsRouter.get('/', async (_req, res: Response) => {
  const user = await getDefaultUser()
  const agents = await prisma.agent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  res.json(agents)
})

// POST /api/agents
agentsRouter.post('/', async (req: Request, res: Response) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const user = await getDefaultUser()
  const agent = await prisma.agent.create({
    data: { name, userId: user.id, status: 'setting_up' },
  })
  res.status(201).json(agent)
})

// POST /api/agents/generate-questions  — MUST be registered before /:id routes
agentsRouter.post('/generate-questions', async (req: Request, res: Response) => {
  const { agentName } = req.body
  if (!agentName) return res.status(400).json({ error: 'agentName is required' })

  const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
  try {
    const response = await fetch(`${pythonUrl}/generate-questions`, {
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

// PATCH /api/agents/:id
agentsRouter.patch('/:id', async (req: Request, res: Response) => {
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
})

// DELETE /api/agents/:id
agentsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = req.params.id as string
  await prisma.agent.delete({ where: { id } })
  res.status(204).send()
})

// GET /api/agents/:id/messages
agentsRouter.get('/:id/messages', async (req: Request, res: Response) => {
  const id = req.params.id as string
  const messages = await prisma.message.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'asc' },
  })
  res.json(messages)
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

  // Fetch conversation history
  const history = await prisma.message.findMany({
    where: { agentId: id },
    orderBy: { createdAt: 'asc' },
    select: { role: true, content: true },
  })

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
  let fullContent = ''

  try {
    const pythonRes = await fetch(`${pythonUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agent.name,
        setup_answers: agent.setupAnswers ?? {},
        memory: agent.memory ?? '',
        history: history.slice(0, -1),
        message,
      }),
    })

    const reader = pythonRes.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) throw new Error('No response body')

    while (true) {
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
    }
    res.end()
  }
})
