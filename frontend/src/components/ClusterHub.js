'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import prismatic from '@prismatic-io/embedded'
import { LoadingDots } from './LoadingDots'

const PRISMATIC_CONNECTORS = [
  {
    provider: 'google',
    title: 'Gmail / Google Workspace',
    description: 'Connect Gmail so Cluster can send email, create calendar events, and write spreadsheet rows.',
    actionLabel: 'Connect Gmail',
    actionHref: '/api/oauth/google/start',
    actionType: 'oauth',
    tools: ['Gmail', 'Calendar', 'Sheets'],
    accent: 'from-blue-500/20 to-cyan-500/20',
    badge: 'Google',
  },
  {
    provider: 'slack',
    title: 'Slack',
    description: 'Connect Slack to let agents post messages into your workspace and coordinate updates.',
    actionLabel: 'Connect Slack',
    actionHref: '/api/oauth/slack/start',
    actionType: 'oauth',
    tools: ['send_slack_message'],
    accent: 'from-fuchsia-500/20 to-pink-500/20',
    badge: 'Chat',
  },
  {
    provider: 'notion',
    title: 'Notion',
    description: 'Connect Notion so agents can create pages and log summaries into your knowledge base.',
    actionLabel: 'Connect Notion',
    actionHref: '/api/oauth/notion/start',
    actionType: 'oauth',
    tools: ['create_notion_page'],
    accent: 'from-amber-500/20 to-orange-500/20',
    badge: 'Docs',
  },
  {
    provider: 'teams',
    title: 'Microsoft Teams',
    description: 'Open the Prismatic marketplace to manage the Teams connector and channel routing.',
    actionLabel: 'Open Prismatic marketplace',
    actionType: 'prismatic',
    tools: ['send_teams_message'],
    accent: 'from-emerald-500/20 to-teal-500/20',
    badge: 'Prismatic',
  },
]

const TOOL_LABELS = {
  Gmail: 'Send email',
  Calendar: 'Create calendar events',
  Sheets: 'Write spreadsheet rows',
  send_slack_message: 'Send Slack messages',
  create_notion_page: 'Create Notion pages',
  send_teams_message: 'Send Teams messages',
}

function getPrismaticTheme() {
  if (typeof document === 'undefined') return 'DARK'
  return document.documentElement.classList.contains('light-mode') ? 'LIGHT' : 'DARK'
}

function openOAuth(url) {
  window.location.assign(url)
}

function getStatusMessage(status, error) {
  if (status === 'ready') return 'Prismatic is connected and ready to open.'
  if (status === 'loading') return 'Preparing the Prismatic marketplace connection...'
  return error || 'Prismatic is unavailable right now, but your Cluster connections still work.'
}

function ConnectorCard({ card, connected, busy, onConnect, onDisconnect, onBrowse }) {
  const isOauth = card.actionType === 'oauth'
  const isConnected = Boolean(connected)
  const primaryLabel = isConnected ? 'Reconnect' : card.actionLabel

  return (
    <div className="rounded-3xl border border-surface-border bg-white/[0.03] p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className={`rounded-2xl bg-gradient-to-br ${card.accent} border border-white/5 px-4 py-4`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">{card.badge}</p>
            <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{card.title}</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-[11px] font-medium text-[var(--text-primary)]">
            {isConnected ? 'Connected' : 'Not connected'}
          </div>
        </div>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">{card.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {card.tools.map((tool) => (
            <span
              key={tool}
              className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[11px] text-[var(--text-primary)]"
            >
              {tool}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isOauth ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={busy}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Opening...' : primaryLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onBrowse}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-110"
          >
            {primaryLabel}
          </button>
        )}

        {isOauth && isConnected && (
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-xl border border-surface-border px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-white/5"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  )
}

export default function ClusterHub() {
  const searchParams = useSearchParams()
  const [connectedIntegrations, setConnectedIntegrations] = useState([])
  const [prismaticStatus, setPrismaticStatus] = useState('loading')
  const [prismaticError, setPrismaticError] = useState('')
  const [statusMessage, setStatusMessage] = useState('Initializing Prismatic...')
  const [busyProvider, setBusyProvider] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  const connectedByProvider = useMemo(() => {
    const map = new Map()
    for (const integration of connectedIntegrations) {
      map.set(integration.provider, integration)
    }
    return map
  }, [connectedIntegrations])

  const unlockedTools = useMemo(() => {
    const tools = new Set()
    for (const integration of connectedIntegrations) {
      for (const tool of integration.tools ?? []) {
        tools.add(tool)
      }
    }
    return Array.from(tools)
  }, [connectedIntegrations])

  const connectedParam = searchParams?.get('connected')
  const errorParam = searchParams?.get('error')

  useEffect(() => {
    let cancelled = false

    async function loadIntegrations() {
      try {
        const response = await fetch('/api/integrations')
        const data = await response.json().catch(() => [])
        if (!cancelled && Array.isArray(data)) {
          setConnectedIntegrations(data)
        }
      } catch {
        if (!cancelled) setConnectedIntegrations([])
      }
    }

    void loadIntegrations()

    return () => {
      cancelled = true
    }
  }, [refreshNonce])

  useEffect(() => {
    let cancelled = false

    async function bootPrismatic() {
      try {
        setPrismaticStatus('loading')
        setPrismaticError('')
        setStatusMessage('Getting a secure Prismatic token...')

        const response = await fetch('/api/v1/auth/prismatic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        const payload = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || 'Unable to load the Prismatic token.')
        }

        const token = payload?.token
        if (!token) {
          throw new Error('Prismatic auth endpoint did not return a token.')
        }

        prismatic.init({
          theme: getPrismaticTheme(),
          skipPreload: true,
          screenConfiguration: {
            initializing: {
              background: '#6366f1',
              color: '#ffffff',
            },
            marketplace: {
              configuration: 'allow-details',
            },
          },
        })

        setStatusMessage('Authenticating with Prismatic...')
        await prismatic.authenticate({ token })

        if (!cancelled) {
          setPrismaticStatus('ready')
          setStatusMessage('Prismatic marketplace ready.')
        }
      } catch (err) {
        if (!cancelled) {
          setPrismaticStatus('error')
          setPrismaticError(err instanceof Error ? err.message : 'Prismatic could not be initialized.')
          setStatusMessage('Prismatic marketplace is unavailable.')
        }
      }
    }

    void bootPrismatic()

    return () => {
      cancelled = true
    }
  }, [])

  function openMarketplace() {
    if (prismaticStatus !== 'ready') {
      setPrismaticError('Prismatic is still initializing. Try again in a moment.')
      return
    }

    prismatic.showMarketplace({
      usePopover: true,
      theme: getPrismaticTheme(),
      screenConfiguration: {
        marketplace: { configuration: 'allow-details' },
      },
    })
  }

  function connectProvider(provider) {
    setBusyProvider(provider)
    const route = `/api/oauth/${provider}/start`
    openOAuth(route)
  }

  async function disconnectProvider(provider) {
    try {
      setBusyProvider(provider)
      await fetch(`/api/integrations/${provider}`, { method: 'DELETE' })
      setRefreshNonce((value) => value + 1)
    } finally {
      setBusyProvider('')
    }
  }

  function refreshConnections() {
    setRefreshNonce((value) => value + 1)
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-6 py-6 border-b border-surface-border bg-[linear-gradient(180deg,rgba(99,102,241,0.14),rgba(99,102,241,0.02))]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">Integrations hub</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">Add apps, connect accounts, unlock tools</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Connect Gmail, Slack, Notion, or open the Prismatic marketplace. Once a connection exists, Cluster can use the matching tools automatically.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openMarketplace}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
              disabled={prismaticStatus !== 'ready'}
            >
              Browse Prismatic marketplace
            </button>
            <button
              type="button"
              onClick={refreshConnections}
              className="rounded-xl border border-surface-border px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-white/5"
            >
              Refresh connections
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <div className="rounded-full border border-surface-border bg-black/10 px-3 py-1.5 text-[var(--text-primary)]">
            {statusMessage}
          </div>
          {prismaticStatus === 'loading' && (
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <LoadingDots />
              <span>Preparing marketplace access</span>
            </div>
          )}
          {prismaticStatus === 'error' && (
            <div className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-rose-300">
              {prismaticError}
            </div>
          )}
          {connectedParam && (
            <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
              Connected successfully: {connectedParam}
            </div>
          )}
          {errorParam && (
            <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-300">
              Connection issue: {errorParam}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-6 space-y-8">
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">Add an integration</p>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Start here when you want to add Gmail or another app. Cluster will surface the matching tools after the account is connected.
              </p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {PRISMATIC_CONNECTORS.map((card) => (
              <ConnectorCard
                key={card.provider}
                card={card}
                connected={connectedByProvider.get(card.provider)}
                busy={busyProvider === card.provider}
                onConnect={() => connectProvider(card.provider)}
                onDisconnect={() => disconnectProvider(card.provider)}
                onBrowse={openMarketplace}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-surface-border bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">Connected integrations</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {connectedIntegrations.length > 0 ? (
                connectedIntegrations.map((integration) => (
                  <div
                    key={integration.provider}
                    className="rounded-2xl border border-surface-border bg-black/10 px-4 py-3"
                  >
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {integration.accountName || integration.accountEmail || integration.provider}
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      {integration.provider === 'google' ? 'Gmail / Google Workspace' : integration.provider}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(integration.tools || []).map((tool) => (
                        <span key={tool} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[var(--text-secondary)]">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-surface-border px-4 py-5 text-sm text-[var(--text-secondary)]">
                  No integrations connected yet. Connect Gmail, Slack, or Notion to unlock tools.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-surface-border bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-secondary)]">Tools unlocked</p>
            {unlockedTools.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {unlockedTools.map((tool) => (
                  <span key={tool} className="rounded-full border border-[color:var(--border)] bg-[var(--accent-muted)] px-3 py-1.5 text-xs text-[var(--accent)]">
                    {TOOL_LABELS[tool] || tool}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Add a connection and the matching tool set becomes available to agents and automations.
              </p>
            )}

            <div className="mt-5 rounded-2xl border border-surface-border bg-black/10 p-4 text-sm text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">How it connects</p>
              <ol className="mt-2 space-y-2">
                <li>1. Add the app from Prismatic or start a provider OAuth connection.</li>
                <li>2. Cluster stores the connection in its integration table.</li>
                <li>3. The agent and workflow layer reads that table and exposes the matching tools.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
