import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const clusterRouter = Router()

const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8000'
const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function buildWorkspaceContext(userId: string): Promise<string> {
  const [agents, groupChats, widgets] = await Promise.all([
    prisma.agent.findMany({
      where: { userId },
      select: { name: true, status: true, memory: true, setupAnswers: true },
    }),
    prisma.groupChat.findMany({
      where: { userId },
      include: { members: { include: { agent: { select: { name: true } } } } },
    }),
    prisma.widget.findMany({
      where: { userId },
      select: { title: true, type: true },
      orderBy: { order: 'asc' },
    }),
  ])

  let ctx = 'WORKSPACE OVERVIEW\n\n'

  ctx += `Agents (${agents.length}):\n`
  for (const a of agents) {
    const snippet = a.memory ? a.memory.substring(0, 120).replace(/\n/g, ' ') + '…' : 'no memory yet'
    ctx += `- ${a.name} [${a.status}]: ${snippet}\n`
  }

  ctx += `\nGroup Chats (${groupChats.length}):\n`
  for (const gc of groupChats) {
    const names = gc.members.filter((m) => m.agent).map((m) => m.agent!.name).join(', ')
    ctx += `- ${gc.name}: ${names || 'no agents yet'}\n`
  }

  ctx += `\nDashboard Widgets (${widgets.length}):\n`
  for (const w of widgets) {
    ctx += `- ${w.title} [${w.type}]\n`
  }

  return ctx
}

// POST /api/cluster/chat — SSE stream
clusterRouter.post('/chat', async (req: Request, res: Response) => {
  const { message, history = [] } = req.body

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Connection', 'keep-alive')

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
    const workspaceContext = await buildWorkspaceContext(user.id)

    const pyRes = await fetch(`${AGENT_URL}/cluster-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, workspace_context: workspaceContext }),
    })

    if (!pyRes.ok || !pyRes.body) {
      res.write(`data: ${JSON.stringify({ delta: 'Agent service unavailable.' })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    const reader = (pyRes.body as any).getReader()
    const decoder = new TextDecoder()
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') continue

        try {
          const data = JSON.parse(payload)
          if (data.delta) {
            fullText += data.delta
            res.write(`data: ${JSON.stringify({ delta: data.delta })}\n\n`)
          }
        } catch { /* skip malformed */ }
      }
    }

    // Detect widget sentinel and create widget
    const widgetMatch = fullText.match(/\[WIDGET\]([\s\S]*?)\[\/WIDGET\]/)
    if (widgetMatch) {
      try {
        const widgetDef = JSON.parse(widgetMatch[1].trim())
        const count = await prisma.widget.count({ where: { userId: user.id } })
        const widget = await prisma.widget.create({
          data: {
            userId: user.id,
            title: widgetDef.title ?? 'Widget',
            type: widgetDef.type ?? 'text',
            size: widgetDef.size ?? 'md',
            config: widgetDef.config ?? {},
            order: count,
          },
        })
        res.write(`event: widget_created\ndata: ${JSON.stringify({ id: widget.id })}\n\n`)
      } catch (err) {
        console.error('Widget creation failed:', err)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    console.error('Cluster chat error:', err)
    res.write(`data: ${JSON.stringify({ delta: 'Something went wrong.' })}\n\n`)
    res.write('data: [DONE]\n\n')
    res.end()
  }
})
