import { Router, Request, Response } from 'express'
import { prisma } from '../db'

export const widgetsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

async function computeWidgetData(widget: any, userId: string): Promise<any> {
  const config = (widget.config as Record<string, any>) ?? {}

  switch (widget.type) {
    case 'stat': {
      const metric = config.metric ?? 'agent_count'
      if (metric === 'agent_count') {
        const value = await prisma.agent.count({ where: { userId } })
        return { value, label: 'Total Agents' }
      }
      if (metric === 'active_agents') {
        const value = await prisma.agent.count({ where: { userId, status: 'active' } })
        return { value, label: 'Active Agents' }
      }
      if (metric === 'message_count_today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const value = await prisma.message.count({ where: { userId, createdAt: { gte: today } } })
        return { value, label: 'Messages Today' }
      }
      if (metric === 'group_chat_count') {
        const value = await prisma.groupChat.count({ where: { userId } })
        return { value, label: 'Group Chats' }
      }
      return { value: 0, label: metric }
    }

    case 'agents_grid': {
      const agents = await prisma.agent.findMany({
        where: { userId },
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
      return { agents }
    }

    case 'activity_feed': {
      const limit = Number(config.limit ?? 8)
      const messages = await prisma.message.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { agent: { select: { name: true } } },
      })
      return {
        messages: messages.map((m) => ({
          id: m.id,
          agentName: m.agent.name,
          role: m.role,
          content: m.content.substring(0, 120),
          createdAt: m.createdAt,
        })),
      }
    }

    case 'agent_memory': {
      const agentName = config.agentName
      const agent = await prisma.agent.findFirst({
        where: { userId, name: agentName },
        select: { name: true, memory: true },
      })
      return { name: agent?.name ?? agentName, memory: agent?.memory ?? 'No memory yet.' }
    }

    case 'text':
      return { content: config.content ?? '' }

    default:
      return null
  }
}

// GET /api/widgets
widgetsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const widgets = await prisma.widget.findMany({
      where: { userId: user.id },
      orderBy: { order: 'asc' },
    })

    const withData = await Promise.all(
      widgets.map(async (w) => ({
        ...w,
        data: await computeWidgetData(w, user.id),
      }))
    )

    res.json(withData)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/widgets
widgetsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { title, type, size = 'md', config = {}, order } = req.body
    if (!title || !type) return res.status(400).json({ error: 'title and type required' })

    const user = await getDefaultUser()
    const count = await prisma.widget.count({ where: { userId: user.id } })

    const widget = await prisma.widget.create({
      data: {
        userId: user.id,
        title,
        type,
        size,
        config,
        order: order ?? count,
      },
    })

    const data = await computeWidgetData(widget, user.id)
    res.json({ ...widget, data })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/widgets/reorder  — batch update order
widgetsRouter.post('/reorder', async (req: Request, res: Response) => {
  try {
    const { order } = req.body as { order: { id: string; order: number }[] }
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' })

    await Promise.all(
      order.map(({ id, order: o }) => prisma.widget.update({ where: { id }, data: { order: o } }))
    )

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/widgets/:id
widgetsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { title, size, order } = req.body
    const widget = await prisma.widget.update({
      where: { id: req.params.id as string },
      data: { ...(title && { title }), ...(size && { size }), ...(order != null && { order }) },
    })
    res.json(widget)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/widgets/:id/data — push computed data (for scheduled tasks)
widgetsRouter.patch('/:id/data', async (req: Request, res: Response) => {
  try {
    const { data } = req.body
    const widget = await prisma.widget.update({
      where: { id: req.params.id as string },
      data: { lastData: data, lastUpdated: new Date() },
    })
    res.json(widget)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/widgets/:id
widgetsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.widget.delete({ where: { id: req.params.id as string } })
    res.status(204).send()
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})
