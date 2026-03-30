import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { decrypt } from '../lib/crypto'

export const integrationsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

// GET /api/integrations — returns connected status (no tokens)
integrationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const integrations = await prisma.integration.findMany({
      where: { userId: user.id },
      select: { provider: true, accountEmail: true, accountName: true, expiresAt: true },
    })
    res.json(integrations)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/integrations/:provider — disconnect
integrationsRouter.delete('/:provider', async (req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    await prisma.integration.delete({
      where: { userId_provider: { userId: user.id, provider: req.params.provider as string } },
    })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Internal helper — used by chat routes to get decrypted tokens for Python
export async function getUserIntegrationTokens(userId: string): Promise<Record<string, string>> {
  const integrations = await prisma.integration.findMany({ where: { userId } })
  const tokens: Record<string, string> = {}

  for (const integration of integrations) {
    try {
      const accessToken = decrypt(integration.accessToken)
      const refreshToken = integration.refreshToken ? decrypt(integration.refreshToken) : null

      if (integration.provider === 'google') {
        // Refresh token if expired
        if (
          integration.expiresAt &&
          integration.expiresAt < new Date(Date.now() + 60 * 1000) &&
          refreshToken
        ) {
          const refreshed = await refreshGoogleToken(refreshToken, userId, integration.provider)
          if (refreshed) {
            tokens['google_access_token'] = refreshed
            continue
          }
        }
        tokens['google_access_token'] = accessToken
        if (refreshToken) tokens['google_refresh_token'] = refreshToken
      } else if (integration.provider === 'slack') {
        tokens['slack_token'] = accessToken
      } else if (integration.provider === 'notion') {
        tokens['notion_token'] = accessToken
      }
    } catch {
      // Skip corrupted token
    }
  }

  return tokens
}

async function refreshGoogleToken(
  refreshToken: string,
  userId: string,
  provider: string
): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json() as any
    if (!data.access_token) return null

    const { encrypt } = await import('../lib/crypto')
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000)

    await prisma.integration.update({
      where: { userId_provider: { userId, provider } },
      data: { accessToken: encrypt(data.access_token), expiresAt },
    })

    return data.access_token
  } catch {
    return null
  }
}
