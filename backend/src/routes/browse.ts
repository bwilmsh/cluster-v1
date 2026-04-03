import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { browseWebsite } from '../services/browser'
import { decrypt } from '../lib/crypto'

export const browseRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

// POST /api/browse — called by Python agent to execute a browse action
browseRouter.post('/', async (req: Request, res: Response) => {
  const { url, instructions, screenshot = false, agent_id, agent_name } = req.body

  if (!url || !instructions) {
    return res.status(400).json({ error: 'url and instructions are required' })
  }

  let user: any
  try {
    user = await getDefaultUser()
  } catch {
    return res.status(500).json({ error: 'User not found' })
  }

  // Look up stored credentials for this domain
  const domain = extractDomain(url)
  let credentials: { username: string; password: string } | null = null

  try {
    const creds = await prisma.webCredential.findFirst({
      where: {
        userId: user.id,
        siteUrl: { contains: domain },
      },
    })
    if (creds) {
      credentials = {
        username: creds.username,
        password: decrypt(creds.password),
      }
    }
  } catch {
    // No credentials or decryption failed — continue without
  }

  // Execute the browse
  const result = await browseWebsite({ url, instructions, screenshot, credentials })

  // Log activity
  try {
    await prisma.browseActivity.create({
      data: {
        userId: user.id,
        agentId: agent_id ?? null,
        agentName: agent_name ?? null,
        url,
        domain,
        summary: instructions.slice(0, 200),
      },
    })
  } catch {
    // Log failure is non-fatal
  }

  if (result.error) {
    return res.status(200).json({
      success: false,
      error: result.error,
      content: '',
    })
  }

  return res.json({
    success: true,
    content: result.content,
    screenshotBase64: result.screenshotBase64,
  })
})

// GET /api/browse/activity — recent browse history
browseRouter.get('/activity', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const activities = await prisma.browseActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(activities)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
