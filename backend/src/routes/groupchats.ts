import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { getUserIntegrationTokens } from './integrations'

export const groupChatsRouter = Router()

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
    const mentioned = mention.slice(1).toLowerCase()
    // Match full name OR first word of the name (e.g. "@Sarah" matches "Sarah Johnson")
    const found = agentNames.find((n) =>
      n.toLowerCase() === mentioned ||
      n.toLowerCase().split(' ')[0] === mentioned
    )
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

  // Fetch integrations + recent history in parallel
  const user = await getDefaultUser()
  const [integrationTokens, recentHistory] = await Promise.all([
    getUserIntegrationTokens(user.id).catch(() => ({} as Record<string, string>)),
    prisma.groupChatMessage.findMany({
      where: { groupChatId: id },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { senderName: true, content: true, role: true },
    }),
  ])

  const agentMembers = chat.members.filter((m: any) => m.type === 'agent' && m.agent)

  if (agentMembers.length === 0) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  // Build member list with roles — passed to every agent for teammate awareness
  const agentInfoList = agentMembers.map((m: any) => ({
    name: m.agent.name as string,
    type: 'agent' as const,
    role: (m.agent.setupAnswers as any)?.['Business type / role'] ?? null,
  }))
  const membersList = [...agentInfoList, { name: senderName, type: 'human' as const }]

  const allAgentNames = agentInfoList.map((a) => a.name)

  // Helper: call the Python relevance endpoint
  async function pickAgent(
    msg: string,
    fromName: string,
    candidates: typeof agentInfoList,
    context = '',
  ): Promise<string | null> {
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0].name
    try {
      const r = await fetch(`${getPythonUrl()}/group-relevance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          sender_name: fromName,
          agents: candidates.map((a) => ({ name: a.name, role: a.role })),
          max_responders: 1,
          context,
        }),
      })
      const data = await r.json()
      return data.responders?.[0] ?? candidates[0].name
    } catch {
      return candidates[0].name
    }
  }

  // Pick the first (most relevant) agent
  const firstAgentName = await pickAgent(message, senderName, agentInfoList)
  if (!firstAgentName) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let aborted = false
  req.on('close', () => { aborted = true })

  // Chat history without the just-saved user message
  const historyForAgents = recentHistory.slice(0, -1).map((m) => ({
    sender_name: m.senderName,
    content: m.content,
    role: m.role,
  }))

  // inTurnHistory grows as agents respond — each agent sees all prior responses this turn
  const inTurnHistory = [...historyForAgents]

  // Helper: stream one agent's response and return the full text
  async function streamAgent(agentMember: any, msgText: string, fromName: string): Promise<string> {
    const agent = agentMember.agent
    res.write(`data: ${JSON.stringify({ type: 'agent_start', agentName: agent.name, agentId: agent.id })}\n\n`)

    let content = ''
    try {
      const pythonRes = await fetch(`${getPythonUrl()}/group-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: agent.name,
          setup_answers: agent.setupAnswers ?? {},
          memory: agent.memory ?? '',
          members: membersList,
          sender_name: fromName,
          history: inTurnHistory,
          message: msgText,
          chat_name: chat.name,
          integrations: integrationTokens,
        }),
      })

      const reader = pythonRes.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No body')

      while (true) {
        if (aborted) { reader.cancel(); break }
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim()
            if (payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload)
                if (parsed.delta) content += parsed.delta
                res.write(`data: ${JSON.stringify({ ...parsed, agentName: agent.name, agentId: agent.id })}\n\n`)
              } catch { /* skip malformed */ }
            }
          }
        }
      }
    } catch {
      res.write(`data: ${JSON.stringify({ error: 'Agent error', agentName: agent.name })}\n\n`)
    }

    if (content) {
      await prisma.groupChatMessage.create({
        data: {
          groupChatId: id,
          senderName: agent.name,
          senderRole: 'agent',
          role: 'assistant',
          content,
        },
      })
      inTurnHistory.push({ sender_name: agent.name, content, role: 'assistant' })
    }

    res.write(`data: ${JSON.stringify({ type: 'agent_done', agentName: agent.name, agentId: agent.id })}\n\n`)
    return content
  }

  // ── Waterfall ──────────────────────────────────────────────────────────────
  // Turn 0: most relevant agent responds to the user's message
  // Turn 1: check if a different agent should also contribute (auto-continuation)
  // Turn 1+: follow explicit @mention handoffs only (max 2 more)
  const MAX_EXPLICIT_HANDOFFS = 2
  let respondedAgents = new Set<string>()

  // Turn 0 — first agent
  const firstMember = agentMembers.find((m: any) => m.agent.name === firstAgentName)
  if (!firstMember || aborted) {
    res.write('data: [DONE]\n\n')
    res.end()
    return
  }

  const firstResponse = await streamAgent(firstMember, message, senderName)
  respondedAgents.add(firstAgentName)

  if (!aborted && firstResponse) {
    // Check for explicit @mention handoff first
    const mentionedNext = detectHandoff(firstResponse, allAgentNames.filter((n) => n !== firstAgentName))

    if (mentionedNext) {
      // Explicit handoff — agent addressed a specific teammate
      res.write(`data: ${JSON.stringify({ type: 'agent_handoff', from: firstAgentName, to: mentionedNext })}\n\n`)

      let currentHandoffAgent = mentionedNext
      let currentHandoffFrom = firstAgentName
      let handoffCount = 0

      while (currentHandoffAgent && handoffCount < MAX_EXPLICIT_HANDOFFS && !aborted) {
        const handoffMember = agentMembers.find((m: any) => m.agent.name === currentHandoffAgent)
        if (!handoffMember || respondedAgents.has(currentHandoffAgent)) break

        const handoffResponse = await streamAgent(handoffMember, message, currentHandoffFrom)
        respondedAgents.add(currentHandoffAgent)

        const nextMention = detectHandoff(
          handoffResponse,
          allAgentNames.filter((n) => n !== currentHandoffAgent && !respondedAgents.has(n))
        )
        if (nextMention) {
          res.write(`data: ${JSON.stringify({ type: 'agent_handoff', from: currentHandoffAgent, to: nextMention })}\n\n`)
          currentHandoffFrom = currentHandoffAgent
          currentHandoffAgent = nextMention
        } else {
          break
        }
        handoffCount++
      }
    } else if (agentMembers.length > 1) {
      // No explicit handoff — auto-check if a different agent should add value
      const remainingAgents = agentInfoList.filter((a) => !respondedAgents.has(a.name))
      if (remainingAgents.length > 0) {
        const autoNext = await pickAgent(message, senderName, remainingAgents, firstResponse)
        if (autoNext && !respondedAgents.has(autoNext)) {
          const autoMember = agentMembers.find((m: any) => m.agent.name === autoNext)
          if (autoMember && !aborted) {
            await streamAgent(autoMember, message, senderName)
            respondedAgents.add(autoNext)
          }
        }
      }
    }
  }

  res.write('data: [DONE]\n\n')
  res.end()
})
