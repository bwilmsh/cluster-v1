import { Router, Request, Response } from 'express'
import { prisma } from '../db'
import { encrypt } from '../lib/crypto'
import { getOAuthCredentials } from './oauth-config'

export const oauthRouter = Router()

const DEFAULT_USER_EMAIL = 'user@cluster.local'

async function getDefaultUser() {
  return prisma.user.findUniqueOrThrow({ where: { email: DEFAULT_USER_EMAIL } })
}

function frontendUrl() {
  return process.env.FRONTEND_URL ?? 'http://localhost:3000'
}

function backendUrl() {
  return process.env.BACKEND_URL ?? 'http://localhost:3001'
}

// ─── Google ───────────────────────────────────────────────────────────────────

oauthRouter.get('/google/start', async (_req: Request, res: Response) => {
  const creds = await getOAuthCredentials('google')
  if (!creds) return res.redirect(`${frontendUrl()}/calendar?error=google_not_configured`)

  const redirectUri = `${backendUrl()}/api/oauth/google/callback`
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

oauthRouter.get('/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query
  if (error || !code) return res.redirect(`${frontendUrl()}/calendar?error=google`)

  try {
    const creds = await getOAuthCredentials('google')
    if (!creds) return res.redirect(`${frontendUrl()}/calendar?error=google_not_configured`)

    const redirectUri = `${backendUrl()}/api/oauth/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json() as any

    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userRes.json() as any

    const user = await getDefaultUser()
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null

    await prisma.integration.upsert({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
      create: {
        userId: user.id,
        provider: 'google',
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        expiresAt,
      },
      update: {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        expiresAt,
      },
    })

    res.redirect(`${frontendUrl()}/calendar?connected=google`)
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    res.redirect(`${frontendUrl()}/calendar?error=google`)
  }
})

oauthRouter.get('/google/status', async (_req: Request, res: Response) => {
  try {
    const user = await getDefaultUser()
    const integration = await prisma.integration.findUnique({
      where: { userId_provider: { userId: user.id, provider: 'google' } },
      select: { provider: true, accountEmail: true, accountName: true, expiresAt: true },
    })

    res.json({
      connected: Boolean(integration),
      integration: integration ?? null,
    })
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── Slack ────────────────────────────────────────────────────────────────────

oauthRouter.get('/slack/start', async (_req: Request, res: Response) => {
  const creds = await getOAuthCredentials('slack')
  if (!creds) return res.redirect(`${frontendUrl()}/integrations?error=slack_not_configured`)

  const redirectUri = `${backendUrl()}/api/oauth/slack/callback`
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    scope: 'chat:write,channels:read,users:read',
  })

  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`)
})

oauthRouter.get('/slack/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query
  if (error || !code) return res.redirect(`${frontendUrl()}/integrations?error=slack`)

  try {
    const creds = await getOAuthCredentials('slack')
    if (!creds) return res.redirect(`${frontendUrl()}/integrations?error=slack_not_configured`)

    const redirectUri = `${backendUrl()}/api/oauth/slack/callback`

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({ code: code as string, redirect_uri: redirectUri }),
    })
    const data = await tokenRes.json() as any
    if (!data.ok) throw new Error(data.error)

    const user = await getDefaultUser()

    await prisma.integration.upsert({
      where: { userId_provider: { userId: user.id, provider: 'slack' } },
      create: {
        userId: user.id,
        provider: 'slack',
        accessToken: encrypt(data.access_token),
        accountName: data.team?.name ?? 'Slack workspace',
        accountEmail: data.authed_user?.id ?? '',
      },
      update: {
        accessToken: encrypt(data.access_token),
        accountName: data.team?.name ?? 'Slack workspace',
        accountEmail: data.authed_user?.id ?? '',
      },
    })

    res.redirect(`${frontendUrl()}/integrations?connected=slack`)
  } catch (err) {
    console.error('Slack OAuth callback error:', err)
    res.redirect(`${frontendUrl()}/integrations?error=slack`)
  }
})

// ─── Notion ───────────────────────────────────────────────────────────────────

oauthRouter.get('/notion/start', async (_req: Request, res: Response) => {
  const creds = await getOAuthCredentials('notion')
  if (!creds) return res.redirect(`${frontendUrl()}/integrations?error=notion_not_configured`)

  const redirectUri = `${backendUrl()}/api/oauth/notion/callback`
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
  })

  res.redirect(`https://api.notion.com/v1/oauth/authorize?${params}`)
})

oauthRouter.get('/notion/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query
  if (error || !code) return res.redirect(`${frontendUrl()}/integrations?error=notion`)

  try {
    const creds = await getOAuthCredentials('notion')
    if (!creds) return res.redirect(`${frontendUrl()}/integrations?error=notion_not_configured`)

    const redirectUri = `${backendUrl()}/api/oauth/notion/callback`
    const credentials = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')

    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    const data = await tokenRes.json() as any

    const user = await getDefaultUser()

    await prisma.integration.upsert({
      where: { userId_provider: { userId: user.id, provider: 'notion' } },
      create: {
        userId: user.id,
        provider: 'notion',
        accessToken: encrypt(data.access_token),
        accountName: data.workspace_name ?? 'Notion workspace',
        accountEmail: data.bot_id ?? '',
      },
      update: {
        accessToken: encrypt(data.access_token),
        accountName: data.workspace_name ?? 'Notion workspace',
        accountEmail: data.bot_id ?? '',
      },
    })

    res.redirect(`${frontendUrl()}/integrations?connected=notion`)
  } catch (err) {
    console.error('Notion OAuth callback error:', err)
    res.redirect(`${frontendUrl()}/integrations?error=notion`)
  }
})
