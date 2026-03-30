import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const groupChatsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

function getPythonUrl() {
  return process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
}

// GET /api/groupchats
groupChatsRouter.get('/', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const chats = await prisma.groupChat.findMany({
      where: { userId: user.id },
      include: {
        members: { include: { agent: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, senderName: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(chats)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/groupchats/:id
groupChatsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.groupChatMessage.deleteMany({ where: { groupChatId: id } })
    await prisma.groupChatMember.deleteMany({ where: { groupChatId: id } })
    await prisma.groupChat.delete({ where: { id } })
    res.status(204).send()
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
      include: { members: { include: { agent: true } } },
    })
    res.status(201).json(chat)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/groupchats/:id
groupChatsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const chat = await prisma.groupChat.findUnique({
      where: { id: req.params.id as string },
      include: { members: { include: { agent: true } } },
    })
    if (!chat) return res.status(404).json({ error: 'Not found' })
    res.json(chat)
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
      include: { agent: true },
    })
    res.status(201).json(member)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/groupchats/:id/members/:memberId
groupChatsRouter.delete('/:id/members/:memberId', async (req: Request, res: Response) => {
  try {
    await prisma.groupChatMember.delete({ where: { id: req.params.memberId as string } })
    res.status(204).send()
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

function detectHandoff(response: string, agentNames: string[]): string | null {
  const matches = response.match(/@(\w+)/g)
  if (!matches) return null
  for (const mention of matches) {
    const name = mention.slice(1)
    const found = agentNames.find((n) => n.toLowerCase() === name.toLowerCase())
    if (found) return found
  }
  return null
}

// POST /api/groupchats/:id/message  — SSE streaming, waterfall agent responses
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
      data: { groupChatId: id, senderName, senderRole: 'user', role: 'user', content: message },
    })
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' })
  }

  // Fetch recent history (includes the user message we just saved)
  const recentHistory = await prisma.groupChatMessage.findMany({
    where: { groupChatId: id },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { senderName: true, content: true, role: true },
  })

  const agentMembers = chat.members.filter((m: any) => m.type === 'agent' && m.agent)

  if (agentMembers.length === 0) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  // Build member list with roles for context
  const membersList = [
    ...agentMembers.map((m: any) => ({
      name: m.agent.name,
      type: 'agent',
      role: (m.agent.setupAnswers as any)?.['Business type / role'] ?? null,
    })),
    { name: senderName, type: 'human' },
  ]

  const allAgentNames = agentMembers.map((m: any) => m.agent.name as string)

  // Relevance check picks the starting agent
  let startingAgentName: string = agentMembers[0].agent.name
  try {
    const relevanceRes = await fetch(`${getPythonUrl()}/group-relevance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sender_name: senderName,
        agents: agentMembers.map((m: any) => ({ name: m.agent.name })),
        max_responders: 1,
      }),
    })
    const relevanceData = await relevanceRes.json()
    startingAgentName = relevanceData.responders?.[0] ?? startingAgentName
  } catch {
    // keep fallback
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // History excluding the user message (slice off last entry = user msg we just saved)
  const historyForAgents = recentHistory.slice(0, -1).map((m) => ({
    sender_name: m.senderName,
    content: m.content,
    role: m.role,
  }))

  // Waterfall state
  const MAX_TURNS = 5
  let currentAgentName = startingAgentName
  let currentMessage = message
  let currentSenderName = senderName
  // Accumulated context grows as agents respond
  const inTurnHistory = [...historyForAgents]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const member = agentMembers.find((m: any) => m.agent.name === currentAgentName)
    if (!member) break

    const agent = member.agent
    res.write(
      `data: ${JSON.stringify({ type: 'agent_start', agentName: agent.name, agentId: agent.id })}\n\n`
    )

    let agentResponse = ''

    try {
      const pythonRes = await fetch(`${getPythonUrl()}/group-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: agent.name,
          setup_answers: agent.setupAnswers ?? {},
          memory: agent.memory ?? '',
          members: membersList,
          sender_name: currentSenderName,
          history: inTurnHistory,
          message: currentMessage,
          chat_name: chat.name,
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
              } catch {
                // skip malformed
              }
            }
          }
        }
      }
    } catch {
      res.write(`data: ${JSON.stringify({ error: 'Agent error', agentName: agent.name })}\n\n`)
    }

    if (agentResponse) {
      await prisma.groupChatMessage.create({
        data: {
          groupChatId: id,
          senderName: agent.name,
          senderRole: 'agent',
          role: 'assistant',
          content: agentResponse,
        },
      })
      inTurnHistory.push({ sender_name: agent.name, content: agentResponse, role: 'assistant' })
    }

    res.write(
      `data: ${JSON.stringify({ type: 'agent_done', agentName: agent.name, agentId: agent.id })}\n\n`
    )

    // Detect @mention handoff to next agent
    const nextAgent = detectHandoff(agentResponse, allAgentNames.filter((n) => n !== agent.name))
    if (nextAgent) {
      res.write(
        `data: ${JSON.stringify({ type: 'agent_handoff', from: agent.name, to: nextAgent })}\n\n`
      )
      currentAgentName = nextAgent
      currentMessage = agentResponse
      currentSenderName = agent.name
    } else {
      break
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
})
