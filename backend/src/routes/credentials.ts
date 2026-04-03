import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import { encrypt, decrypt } from '../lib/crypto'

export const credentialsRouter = Router()

// GET /api/credentials
credentialsRouter.get('/', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const creds = await prisma.webCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        siteName: true,
        siteUrl: true,
        username: true,
        createdAt: true,
        // password intentionally excluded from list
      },
    })
    res.json(creds)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/credentials
credentialsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { siteName, siteUrl, username, password } = req.body
    if (!siteName || !siteUrl || !username || !password) {
      return res.status(400).json({ error: 'siteName, siteUrl, username, password required' })
    }
    const user = await getDefaultUser()
    const cred = await prisma.webCredential.create({
      data: {
        userId: user.id,
        siteName,
        siteUrl,
        username,
        password: encrypt(password),
      },
      select: { id: true, siteName: true, siteUrl: true, username: true, createdAt: true },
    })
    res.status(201).json(cred)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/credentials/:id — update password
credentialsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ error: 'password required' })
    const updated = await prisma.webCredential.update({
      where: { id: req.params.id },
      data: { password: encrypt(password) },
      select: { id: true, siteName: true, siteUrl: true, username: true, createdAt: true },
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/credentials/:id
credentialsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.webCredential.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
