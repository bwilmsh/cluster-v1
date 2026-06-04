import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'

export const scheduledEmailsRouter = Router()

scheduledEmailsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const emails = await prisma.scheduledEmail.findMany({
      where: {
        userId: user.id,
        status: { not: 'sent' },
      },
      orderBy: { sendAt: 'asc' },
    })
    res.json({ data: emails })
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to load scheduled emails', details })
  }
})

scheduledEmailsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const { to, subject, body, sendAt } = req.body ?? {}

    if (!to || !subject || !body || !sendAt) {
      return res.status(400).json({ error: 'to, subject, body, and sendAt are required' })
    }

    const sendAtDate = new Date(sendAt)
    if (Number.isNaN(sendAtDate.getTime())) {
      return res.status(400).json({ error: 'Invalid sendAt value' })
    }

    const googleIntegration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
      select: { id: true },
    })

    if (!googleIntegration) {
      return res.status(400).json({ error: 'Connect Google in Settings before scheduling email' })
    }

    const email = await prisma.scheduledEmail.create({
      data: {
        userId: user.id,
        to: String(to).trim(),
        subject: String(subject).trim(),
        body: String(body),
        sendAt: sendAtDate,
        status: 'scheduled',
      },
    })

    res.status(201).json(email)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to save scheduled email', details })
  }
})

scheduledEmailsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const deleted = await prisma.scheduledEmail.deleteMany({
      where: {
        id: req.params.id,
        userId: user.id,
        status: { not: 'sent' },
      },
    })

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Scheduled email not found' })
    }

    res.status(204).send()
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to delete scheduled email', details })
  }
})