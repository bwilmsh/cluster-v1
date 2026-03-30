import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { encrypt, decrypt } from '../lib/crypto'

export const oauthConfigRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

// GET /api/oauth-config — returns which providers are configured (no secrets)
oauthConfigRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const configs = await prisma.oAuthConfig.findMany({
      where: { userId: user.id },
      select: { provider: true, updatedAt: true },
    })
    res.json(configs)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/oauth-config/:provider — save credentials
oauthConfigRouter.post('/:provider', async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret } = req.body
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'clientId and clientSecret are required' })
    }
    const user = await getDefaultUser()
    const provider = req.params.provider as string

    await prisma.oAuthConfig.upsert({
      where: { userId_provider: { userId: user.id, provider } },
      create: {
        userId: user.id,
        provider,
        clientId: encrypt(clientId.trim()),
        clientSecret: encrypt(clientSecret.trim()),
      },
      update: {
        clientId: encrypt(clientId.trim()),
        clientSecret: encrypt(clientSecret.trim()),
      },
    })

    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/oauth-config/:provider — remove credentials (also disconnects)
oauthConfigRouter.delete('/:provider', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const provider = req.params.provider as string

    await prisma.$transaction([
      prisma.oAuthConfig.deleteMany({ where: { userId: user.id, provider } }),
      prisma.integration.deleteMany({ where: { userId: user.id, provider } }),
    ])

    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Internal helper — get decrypted credentials for a provider
export async function getOAuthCredentials(
  provider: string
): Promise<{ clientId: string; clientSecret: string } | null> {
  // 1. Try database first
  try {
    const user = await prisma.user.findUnique({ where: { email: 'user@cluster.local' } })
    if (user) {
      const config = await prisma.oAuthConfig.findUnique({
        where: { userId_provider: { userId: user.id, provider } },
      })
      if (config) {
        return {
          clientId: decrypt(config.clientId),
          clientSecret: decrypt(config.clientSecret),
        }
      }
    }
  } catch { /* fall through */ }

  // 2. Fall back to environment variables
  if (provider === 'google' && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
  }
  if (provider === 'slack' && process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
    return { clientId: process.env.SLACK_CLIENT_ID, clientSecret: process.env.SLACK_CLIENT_SECRET }
  }
  if (provider === 'notion' && process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET) {
    return { clientId: process.env.NOTION_CLIENT_ID, clientSecret: process.env.NOTION_CLIENT_SECRET }
  }

  return null
}
