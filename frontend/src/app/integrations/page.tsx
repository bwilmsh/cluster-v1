'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingDots } from '@/components/LoadingDots'

interface Integration {
  provider: string
  accountEmail: string | null
  accountName: string | null
}

interface OAuthConfig {
  provider: string
}

const SERVICES = [
  {
    provider: 'google',
    name: 'Google Workspace',
    description: 'Gmail · Sheets · Calendar',
    docsUrl: 'https://console.cloud.google.com',
    docsLabel: 'console.cloud.google.com',
    instructions: [
      'Go to console.cloud.google.com and create a project',
      'Enable: Gmail API, Google Sheets API, Google Calendar API',
      'OAuth consent screen → External → add your email as Test user',
      'Credentials → Create OAuth 2.0 Client ID → Web application',
      `Authorized redirect URI: http://localhost:3001/api/oauth/google/callback`,
      'Copy the Client ID and Client Secret below',
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Send messages to channels',
    docsUrl: 'https://api.slack.com/apps',
    docsLabel: 'api.slack.com/apps',
    instructions: [
      'Go to api.slack.com/apps → Create New App → From scratch',
      'OAuth & Permissions → Redirect URLs: http://localhost:3001/api/oauth/slack/callback',
      'Bot Token Scopes: chat:write, channels:read',
      'Install app to workspace, then go to Basic Information',
      'Copy the Client ID and Client Secret below',
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#E01E5A">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
      </svg>
    ),
  },
  {
    provider: 'notion',
    name: 'Notion',
    description: 'Create pages and databases',
    docsUrl: 'https://www.notion.so/my-integrations',
    docsLabel: 'notion.so/my-integrations',
    instructions: [
      'Go to notion.so/my-integrations → New integration',
      'Set type to Public (not Internal)',
      'Redirect URI: http://localhost:3001/api/oauth/notion/callback',
      'Copy the OAuth client ID and OAuth client secret below',
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.887.747-.933z"/>
      </svg>
    ),
  },
]

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [configs, setConfigs] = useState<OAuthConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [setupTarget, setSetupTarget] = useState<(typeof SERVICES)[0] | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const justConnected = searchParams?.get('connected')
  const connectError = searchParams?.get('error')

  async function load() {
    const [intRes, cfgRes] = await Promise.all([
      fetch('/api/integrations').then((r) => r.json()),
      fetch('/api/oauth-config').then((r) => r.json()),
    ])
    setIntegrations(intRes)
    setConfigs(cfgRes)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function getIntegration(provider: string) {
    return integrations.find((i) => i.provider === provider) ?? null
  }

  function isConfigured(provider: string) {
    return configs.some((c) => c.provider === provider)
  }

  async function handleDisconnect(provider: string) {
    setDisconnecting(provider)
    await fetch(`/api/integrations/${provider}`, { method: 'DELETE' })
    setIntegrations((prev) => prev.filter((i) => i.provider !== provider))
    setDisconnecting(null)
  }

  async function handleRemoveConfig(provider: string) {
    await fetch(`/api/oauth-config/${provider}`, { method: 'DELETE' })
    setConfigs((prev) => prev.filter((c) => c.provider !== provider))
    setIntegrations((prev) => prev.filter((i) => i.provider !== provider))
  }

  return (
    <div className="h-full overflow-y-auto p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold text-white mt-3">Integrations</h1>
        <p className="text-white/40 text-sm mt-1">
          Connect your tools so agents can take real actions.
        </p>
      </div>

      {justConnected && (
        <div className="mb-6 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
          Connected successfully.
        </div>
      )}
      {connectError && connectError.endsWith('_not_configured') && (
        <div className="mb-6 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
          Set up your credentials first, then connect.
        </div>
      )}
      {connectError && !connectError.endsWith('_not_configured') && (
        <div className="mb-6 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm">
          Connection failed. Check your credentials and try again.
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center"><LoadingDots /></div>
      ) : (
        <div className="space-y-3">
          {SERVICES.map((service) => {
            const connected = getIntegration(service.provider)
            const configured = isConfigured(service.provider)

            return (
              <div
                key={service.provider}
                className="rounded-2xl border border-surface-border bg-surface-raised p-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0 text-white/80">
                    {service.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{service.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">
                      {connected
                        ? connected.accountName ?? connected.accountEmail ?? 'Connected'
                        : service.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {connected ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-xs text-white/50 max-w-[140px] truncate">
                            {connected.accountEmail ?? 'Connected'}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDisconnect(service.provider)}
                          disabled={disconnecting === service.provider}
                          className="text-xs text-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                        >
                          {disconnecting === service.provider ? 'Removing...' : 'Disconnect'}
                        </button>
                      </>
                    ) : configured ? (
                      <a
                        href={`/api/oauth/${service.provider}/start`}
                        className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
                      >
                        Connect
                      </a>
                    ) : (
                      <button
                        onClick={() => setSetupTarget(service)}
                        className="px-4 py-2 rounded-lg border border-surface-border hover:border-white/20 text-white/60 hover:text-white text-xs font-medium transition-colors"
                      >
                        Set up
                      </button>
                    )}

                    {(configured || connected) && !connected && (
                      <button
                        onClick={() => handleRemoveConfig(service.provider)}
                        className="text-xs text-white/20 hover:text-white/50 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {setupTarget && (
        <SetupModal
          service={setupTarget}
          onSave={async () => {
            await load()
            setSetupTarget(null)
          }}
          onClose={() => setSetupTarget(null)}
        />
      )}
    </div>
  )
}

function SetupModal({
  service,
  onSave,
  onClose,
}: {
  service: (typeof SERVICES)[0]
  onSave: () => void
  onClose: () => void
}) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both fields are required.')
      return
    }
    setSaving(true)
    setError('')
    const res = await fetch(`/api/oauth-config/${service.provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
    })
    if (res.ok) {
      onSave()
    } else {
      setError('Failed to save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/80">
              {service.icon}
            </div>
            <h2 className="font-semibold text-white">Set up {service.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-sm">✕</button>
        </div>

        <ol className="space-y-1.5 mb-5">
          {service.instructions.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-white/50">
              <span className="text-white/25 shrink-0 mt-0.5">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <a
          href={service.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline block mb-5"
        >
          Open {service.docsLabel} →
        </a>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Client ID</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Paste your Client ID"
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Client Secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Paste your Client Secret"
              className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          {saving ? 'Saving...' : 'Save credentials'}
        </button>
      </div>
    </div>
  )
}
