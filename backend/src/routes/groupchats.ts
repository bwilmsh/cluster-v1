import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const groupChatsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

// GET /api/groupchats
groupChatsRouter.get('/', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const chats = await prisma.groupChat.findMany({
      where: { userId: user.id },
      include: { members: { include: { agent: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(chats)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/groupchats
groupChatsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, agentIds } = req.body
    if (!name) return res.status(400).json({ error: 'name is required' })
    const user = await getDefaultUser()

    const chat = await prisma.groupChat.create({
      data: {
        name,
        userId: user.id,
        members: {
          create: (agentIds ?? []).map((aid: string) => ({
            agentId: aid,
            type: 'agent',
          })),
        },
      },
      include: { members: true },
    })
    res.status(201).json(chat)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/groupchats/:id/members
groupChatsRouter.post('/:id/members', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { agentId, userId, type } = req.body
    const member = await prisma.groupChatMember.create({
      data: { groupChatId: id, agentId, userId, type },
    })
    res.status(201).json(member)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/groupchats/:id/messages
groupChatsRouter.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const messages = await prisma.groupChatMessage.findMany({
      where: { groupChatId: id },
      orderBy: { createdAt: 'asc' },
    })
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/groupchats/:id/message  — SSE streaming, each agent responds in turn
groupChatsRouter.post('/:id/message', async (req: Request, res: Response) => {
  const id = req.params.id as string
  const { message, senderName = 'You' } = req.body

  let chat: any
  try {
    chat = await prisma.groupChat.findUnique({
      where: { id },
      include: { members: { include: { agent: true } } },
    })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }

  if (!chat) return res.status(404).json({ error: 'Group chat not found' })

  // Save user message
  try {
    await prisma.groupChatMessage.create({
      data: {
        groupChatId: id,
        senderName,
        senderRole: 'user',
        role: 'user',
        content: message,
      },
    })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  let existingMessages: Array<{ role: string; content: string; senderName: string }>
  try {
    existingMessages = await prisma.groupChatMessage.findMany({
      where: { groupChatId: id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true, senderName: true },
    })
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Failed to load history' })}\n\n`)
    res.end()
    return
  }

  const pythonUrl = process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
  const agentMembers = chat.members.filter((m: any) => m.type === 'agent' && m.agent)

  for (const member of agentMembers) {
    const agent = member.agent
    res.write(
      `data: ${JSON.stringify({ type: 'agent_start', agentName: agent.name, agentId: agent.id })}\n\n`
    )

    let agentResponse = ''

    try {
      const pythonRes = await fetch(`${pythonUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: agent.name,
          setup_answers: agent.setupAnswers ?? {},
          memory: agent.memory ?? '',
          history: existingMessages.map((m) => ({ role: m.role, content: m.content })),
          message: `[Group chat context] ${senderName} said: ${message}`,
        }),
      })

      const reader = pythonRes.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No body')

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
                if (parsed.delta) agentResponse += parsed.delta
                res.write(
                  `data: ${JSON.stringify({ ...parsed, agentName: agent.name, agentId: agent.id })}\n\n`
                )
              } catch { /* skip malformed */ }
            }
          }
        }
      }
    } catch {
      res.write(`data: ${JSON.stringify({ error: 'Agent error', agentName: agent.name })}\n\n`)
    }

    if (agentResponse) {
      try {
        await prisma.groupChatMessage.create({
          data: {
            groupChatId: id,
            senderName: agent.name,
            senderRole: 'agent',
            role: 'assistant',
            content: agentResponse,
          },
        })
      } catch { /* non-fatal */ }
    }

    res.write(
      `data: ${JSON.stringify({ type: 'agent_done', agentName: agent.name, agentId: agent.id })}\n\n`
    )
  }

  res.write('data: [DONE]\n\n')
  res.end()
})
