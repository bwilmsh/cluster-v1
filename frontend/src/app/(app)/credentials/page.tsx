'use client'

import { useEffect, useState } from 'react'
import { api, WebCredential } from '@/lib/api'
import { LoadingDots } from '@/components/LoadingDots'

type GoogleIntegrationInfo = {
  accountEmail?: string | null
  accountName?: string | null
  expiresAt?: string | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

export default function CredentialsPage() {
  const [creds, setCreds] = useState<WebCredential[]>([])
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleIntegration, setGoogleIntegration] = useState<GoogleIntegrationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ siteName: '', siteUrl: '', username: '', password: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      setGoogleLoading(true)

      try {
        const [credentialList, googleStatusResponse] = await Promise.all([
          api.credentials.list(),
          fetch('/api/oauth/google/status'),
        ])

        const googleStatus = (await googleStatusResponse.json().catch(() => null)) as {
          connected?: boolean
          integration?: GoogleIntegrationInfo | null
        } | null

        if (cancelled) return

        setCreds(credentialList)
        setGoogleConnected(Boolean(googleStatus?.connected))
        setGoogleIntegration(googleStatus?.integration ?? null)
      } finally {
        if (cancelled) return
        setLoading(false)
        setGoogleLoading(false)
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnectGoogle() {
    window.location.href = '/api/oauth/google/start'
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.siteName || !form.siteUrl || !form.username || !form.password) return
    setSaving(true)
    try {
      const created = await api.credentials.create(form)
      setCreds((prev) => [created, ...prev])
      setForm({ siteName: '', siteUrl: '', username: '', password: '' })
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this credential?')) return
    await api.credentials.delete(id)
    setCreds((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Website Credentials</h1>
            <p className="text-white/30 text-sm mt-0.5">
              Saved logins your agents can use when browsing websites
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            + Add Credential
          </button>
        </div>

        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                Google Calendar
              </div>
              <p className="text-sm text-white/72">
                {googleLoading
                  ? 'Checking your Google Calendar connection...'
                  : googleConnected
                    ? 'Google Calendar is connected for this account and ready to sync events.'
                    : 'No Google account is connected yet. Connect one here to sync calendar events.'}
              </p>
              {!googleLoading && googleConnected ? (
                <p className="text-xs text-white/38">
                  {googleIntegration?.accountName || googleIntegration?.accountEmail
                    ? `${googleIntegration.accountName ?? 'Google account'}${googleIntegration.accountEmail ? ` · ${googleIntegration.accountEmail}` : ''}`
                    : 'Connected account'}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {!googleLoading && googleConnected ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-2 text-sm font-medium text-emerald-200">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Connected
                </span>
              ) : null}
              <button
                onClick={handleConnectGoogle}
                className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_14px_30px_rgba(56,189,248,0.28)] transition-transform hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_18px_36px_rgba(56,189,248,0.36)]"
              >
                {googleConnected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
              </button>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex gap-3 bg-white/[0.04] border border-white/8 rounded-xl px-4 py-3 mb-6">
          <div className="shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-white/30" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Passwords are encrypted with AES-256-GCM before being stored. Your agents automatically
            use matching credentials when they browse a site.
          </p>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><LoadingDots /></div>
        ) : creds.length === 0 && !showForm ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <p className="text-white/25 text-sm mb-4">No saved credentials yet</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Add your first credential
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {creds.map((cred) => (
              <div
                key={cred.id}
                className="group flex items-center gap-4 bg-surface-raised border border-surface-border rounded-xl px-5 py-4 hover:border-white/10 transition-colors"
              >
                {/* Site icon */}
                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${cred.siteUrl}&sz=32`}
                    alt=""
                    className="w-5 h-5"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm">{cred.siteName}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-white/35 truncate">{cred.siteUrl}</p>
                    <span className="text-white/15">·</span>
                    <p className="text-xs text-white/35 shrink-0">{cred.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-white/20">{timeAgo(cred.createdAt)}</span>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-rose-400 text-xs transition-all"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add credential form */}
        {showForm && (
          <div className="mt-4 bg-surface-raised border border-surface-border rounded-xl p-6">
            <h2 className="font-semibold text-white text-sm mb-5">Add Website Credential</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Site name</label>
                  <input
                    value={form.siteName}
                    onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))}
                    placeholder="e.g. TikTok Studio"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Site URL</label>
                  <input
                    value={form.siteUrl}
                    onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
                    placeholder="https://studio.tiktok.com"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Username / Email</label>
                  <input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="you@example.com"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1.5 block">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving...' : 'Save Credential'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg border border-surface-border text-white/50 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
