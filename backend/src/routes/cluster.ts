import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { getAllGoalsSummary } from '../lib/goals'

export const clusterRouter = Router()

const AGENT_URL = process.env.AGENT_URL ?? 'http://localhost:8000'
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
  const goals = await getAllGoalsSummary(userId, agents.map((agent) => ({ id: agent.id, name: agent.name })))

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

  ctx += `\nGoals (${goals.length}):\n`
  if (goals.length === 0) {
    ctx += `- None yet.\n`
  } else {
    for (const goal of goals) {
      const status = goal.isActive ? 'active' : 'inactive'
      ctx += `- ${goal.goalText} [${status}] visible to: ${goal.visibleTo}\n`
    }
  }

  return ctx
}

// POST /api/cluster/chat — SSE stream
clusterRouter.post('/chat', async (req: Request, res: Response) => {
  const { message, history = [], calendar_context = '' } = req.body

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Connection', 'keep-alive')

  try {
    const user = await getDefaultUser()
    // Calendar Ask AI does not need the full workspace snapshot; keep the payload small and focused.
    const workspaceContext = calendar_context ? '' : await buildWorkspaceContext(user.id)
    const combinedWorkspaceContext = calendar_context
      ? `Calendar context:\n${calendar_context}`
      : workspaceContext

    console.log('Cluster chat proxy: POSTing to agent at', `${AGENT_URL}/cluster-chat`)
    const pyRes = await fetch(`${AGENT_URL}/cluster-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, workspace_context: combinedWorkspaceContext }),
    })

    console.log('Cluster chat proxy: received agent response', pyRes.status, 'body=', !!pyRes.body)
    if (!pyRes.ok || !pyRes.body) {
      try {
        const txt = await pyRes.text().catch(() => '')
        console.error('Cluster chat proxy: agent returned non-ok', pyRes.status, txt)
      } catch (e) {
        console.error('Cluster chat proxy: agent returned non-ok and body read failed', e)
      }
      res.write(`data: ${JSON.stringify({ delta: 'Agent service unavailable.' })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let aborted = false

    req.on('close', () => {
      aborted = true
    })

    const isCleanStreamClose = (err: unknown) => {
      const errorText = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      return (
        errorText.includes('terminated') ||
        errorText.includes('other side closed') ||
        errorText.includes('UND_ERR_SOCKET')
      )
    }

    // Support both Web ReadableStream (getReader) and Node.js Readable (async iterable)
    if (pyRes.body && typeof (pyRes.body as any).getReader === 'function') {
      const reader = (pyRes.body as any).getReader()
      while (true) {
        if (aborted) {
          try {
            await reader.cancel()
          } catch {
            // ignore cancellation errors when the client disconnects
          }
          break
        }

        let readResult
        try {
          readResult = await reader.read()
        } catch (err) {
          if (isCleanStreamClose(err)) {
            console.log('Cluster chat proxy: agent stream closed cleanly:', String(err))
            break
          }
          throw err
        }

        const { done, value } = readResult
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
          } catch {
            // skip malformed chunks
          }
        }
      }
    } else if (pyRes.body && Symbol.asyncIterator in pyRes.body) {
      // Node.js Readable stream (async iterable of Buffer chunks)
      try {
        for await (const chunkBuf of (pyRes.body as any)) {
          if (aborted) break
          const chunk = typeof chunkBuf === 'string' ? chunkBuf : decoder.decode(chunkBuf, { stream: true })
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
            } catch {
              // skip malformed chunks
            }
          }
        }
      } catch (err) {
        if (!isCleanStreamClose(err)) {
          throw err
        }
        console.log('Cluster chat proxy: agent stream closed cleanly:', String(err))
      }
    } else {
      // Fallback: read text and attempt to parse lines
      const txt = await pyRes.text().catch(() => '')
      const lines = txt.split('\n')
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
        } catch {
          // skip malformed
        }
      }
    }

    // Detect calendar refresh sentinel and notify the frontend
    if (fullText.includes('[CALENDAR_REFRESH]')) {
      res.write(`data: ${JSON.stringify({ calendar_refresh: true })}\n\n`)
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
