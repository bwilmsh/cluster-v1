import { prisma } from '../db'

export interface MissingRequirement {
  key: string
  label: string
  type: 'credentials' | 'integration'
  settingsPath: string
}

export interface RequirementsResult {
  ok: boolean
  missing: MissingRequirement[]
}

/**
 * Maps a requirement key to a human-readable label, type, and where to set it up.
 * Keys ending in `_credentials` map to web credentials (stored in Settings → Credentials).
 * Keys ending in `_oauth` or `_token` map to OAuth integrations (Settings → Integrations).
 */
const REQUIREMENT_META: Record<string, { label: string; type: 'credentials' | 'integration'; settingsPath: string }> = {
  tiktok_credentials:    { label: 'TikTok credentials',    type: 'credentials',  settingsPath: '/settings?tab=credentials' },
  instagram_credentials: { label: 'Instagram credentials', type: 'credentials',  settingsPath: '/settings?tab=credentials' },
  youtube_credentials:   { label: 'YouTube credentials',   type: 'credentials',  settingsPath: '/settings?tab=credentials' },
  google_oauth:          { label: 'Google account',        type: 'integration',  settingsPath: '/integrations' },
  slack_token:           { label: 'Slack workspace',       type: 'integration',  settingsPath: '/integrations' },
  notion_token:          { label: 'Notion workspace',      type: 'integration',  settingsPath: '/integrations' },
  teams_token:           { label: 'Microsoft Teams',       type: 'integration',  settingsPath: '/integrations' },
}

function metaFor(key: string): { label: string; type: 'credentials' | 'integration'; settingsPath: string } {
  if (REQUIREMENT_META[key]) return REQUIREMENT_META[key]
  // Fallback: infer from key shape
  if (key.endsWith('_credentials')) {
    const name = key.replace('_credentials', '').replace(/_/g, ' ')
    return { label: `${name} credentials`, type: 'credentials', settingsPath: '/settings?tab=credentials' }
  }
  if (key.endsWith('_oauth') || key.endsWith('_token')) {
    const name = key.replace(/_oauth$/, '').replace(/_token$/, '').replace(/_/g, ' ')
    return { label: `${name} integration`, type: 'integration', settingsPath: '/integrations' }
  }
  return { label: key.replace(/_/g, ' '), type: 'integration', settingsPath: '/integrations' }
}

/**
 * Checks whether all items in `requires` are satisfied for the given user.
 * - `*_credentials` keys → must have a WebCredential whose siteName normalises to that key
 * - `google_oauth` / `slack_token` / `notion_token` / `teams_token` → must have a connected Integration
 */
export async function checkRequirements(userId: string, requires: string[]): Promise<RequirementsResult> {
  if (!requires || requires.length === 0) return { ok: true, missing: [] }

  const credKeys   = requires.filter((r) => r.endsWith('_credentials'))
  const oauthKeys  = requires.filter((r) => !r.endsWith('_credentials'))

  const missing: MissingRequirement[] = []

  // ── Credentials check ──────────────────────────────────────────────────────
  if (credKeys.length > 0) {
    const webCreds = await prisma.webCredential.findMany({
      where: { userId },
      select: { siteName: true },
    })
    const storedKeys = new Set(
      webCreds.map((c) => c.siteName.toLowerCase().replace(/\s+/g, '_') + '_credentials')
    )
    for (const key of credKeys) {
      if (!storedKeys.has(key)) {
        missing.push({ key, ...metaFor(key) })
      }
    }
  }

  // ── OAuth / integration check ──────────────────────────────────────────────
  if (oauthKeys.length > 0) {
    const integrations = await prisma.integration.findMany({
      where: { userId },
      select: { provider: true },
    })
    const connectedProviders = new Set(integrations.map((i) => i.provider))

    for (const key of oauthKeys) {
      // Map key → provider name
      const provider = key
        .replace('_oauth', '')
        .replace('_token', '')
      if (!connectedProviders.has(provider)) {
        missing.push({ key, ...metaFor(key) })
      }
    }
  }

  return { ok: missing.length === 0, missing }
}
