import { prisma } from '../db'
import { getOAuthCredentials } from '../routes/oauth-config'

export type IntegrationTokenMap = Record<string, string>

export type ConnectedIntegration = {
  provider: string
  label: string
  tools: string[]
  accountEmail?: string | null
  accountName?: string | null
  expiresAt?: Date | null
}

export type IntegrationContext = {
  tokens: IntegrationTokenMap
  connectedIntegrations: ConnectedIntegration[]
}

const INTEGRATION_LABELS: Record<string, string> = {
  google: 'Gmail / Google Workspace',
  slack: 'Slack',
  notion: 'Notion',
}

const INTEGRATION_TOOLS: Record<string, string[]> = {
  google: ['Calendar', 'Gmail', 'Sheets'],
  slack: ['send_slack_message'],
  notion: ['create_notion_page'],
}

function buildConnectedIntegration(provider: string): ConnectedIntegration {
  return {
    provider,
    label: INTEGRATION_LABELS[provider] ?? provider,
    tools: INTEGRATION_TOOLS[provider] ?? [],
  }
}

async function buildConnectedIntegrations(userId: string): Promise<ConnectedIntegration[]> {
  const integrations = await prisma.integration.findMany({
    where: { userId },
    select: { provider: true, accountEmail: true, accountName: true, expiresAt: true },
  })

  const connected = integrations.map((integration) => ({
    ...buildConnectedIntegration(integration.provider),
    accountEmail: integration.accountEmail,
    accountName: integration.accountName,
    expiresAt: integration.expiresAt,
  }))

  return connected
}

export async function getUserIntegrationContext(userId: string): Promise<IntegrationContext> {
  const integrations = await prisma.integration.findMany({ where: { userId } })
  const tokens: IntegrationTokenMap = {}

  for (const integration of integrations) {
    try {
      const { decrypt } = await import('../lib/crypto')
      const accessToken = decrypt(integration.accessToken)
      const refreshToken = integration.refreshToken ? decrypt(integration.refreshToken) : null

      if (integration.provider === 'google') {
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

  return {
    tokens,
    connectedIntegrations: await buildConnectedIntegrations(userId),
  }
}

async function refreshGoogleToken(
  refreshToken: string,
  userId: string,
  provider: string,
): Promise<string | null> {
  try {
    const creds = await getOAuthCredentials('google')
    if (!creds) return null

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
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