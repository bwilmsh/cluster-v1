import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'

export const integrationsRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

// GET /api/integrations — returns connected status (no tokens)
integrationsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const { connectedIntegrations } = await getUserIntegrationContext(user.id)
    const integrations = connectedIntegrations.map((integration) => ({
      provider: integration.provider,
      accountEmail: integration.accountEmail ?? null,
      accountName: integration.accountName ?? null,
      expiresAt: integration.expiresAt ?? null,
      tools: integration.tools,
    }))
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
  const { tokens } = await getUserIntegrationContext(userId)
  return tokens
}
