'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eAPI = typeof window !== 'undefined' ? (window as any).electronAPI : null
const isElectron = !!eAPI

type GoogleIntegrationInfo = {
  accountEmail?: string | null
  accountName?: string | null
  expiresAt?: string | null
}

export default function SettingsPage() {
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [hasComputerPermission, setHasComputerPermission] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloaded'>('idle')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [apiKeySet, setApiKeySet] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleIntegration, setGoogleIntegration] = useState<GoogleIntegrationInfo | null>(null)
  const [googleLoading, setGoogleLoading] = useState(true)

  useEffect(() => {
    if (eAPI) {
      eAPI.app.version().then(setAppVersion)
      eAPI.computerUse.checkPermission().then(setHasComputerPermission)
      eAPI.settings.isApiKeySet().then(setApiKeySet)

      const unsubAvail = eAPI.app.onUpdateAvailable((info: any) => {
        setUpdateStatus('available')
        setUpdateInfo(info)
      })
      const unsubDownloaded = eAPI.app.onUpdateDownloaded((info: any) => {
        setUpdateStatus('downloaded')
        setUpdateInfo(info)
      })

      return () => {
        unsubAvail?.()
        unsubDownloaded?.()
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setGoogleLoading(true)
    api.oauth.googleStatus()
      .catch(() => ({ connected: false, integration: null }))
      .then((status) => {
        if (cancelled) return
        setGoogleConnected(Boolean(status.connected))
        setGoogleIntegration(status.integration)
      })
      .finally(() => {
        if (!cancelled) setGoogleLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function revokeComputerPermission() {
    // We can't directly write to store from renderer — request permission again
    // which will re-show the dialog. Instead, signal via IPC isn't set up for revoke.
    // For now, inform user to restart the app.
    alert('To revoke computer control permission, delete the app\'s data store and restart.')
  }

  async function grantComputerPermission() {
    const granted = await eAPI.computerUse.requestPermission()
    setHasComputerPermission(granted)
  }

  async function connectGoogle() {
    window.location.href = '/api/oauth/google/start'
  }

  function checkForUpdates() {
    setUpdateStatus('checking')
    eAPI.app.checkForUpdates()
    setTimeout(() => {
      if (updateStatus === 'checking') setUpdateStatus('idle')
    }, 5000)
  }

  return (
    <div className="h-full overflow-y-auto p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                Google Calendar + Gmail
              </div>
              <p className="text-sm text-white/72">
                {googleLoading
                  ? 'Checking your Google connection...'
                  : googleConnected
                    ? 'Google is connected and Gmail send permission is enabled for scheduled emails and calendar actions.'
                    : 'Connect Google here to enable calendar actions and scheduled email sending.'}
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
                onClick={connectGoogle}
                className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_14px_30px_rgba(56,189,248,0.28)] transition-transform hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_18px_36px_rgba(56,189,248,0.36)]"
              >
                {googleConnected ? 'Reconnect Google' : 'Connect Google'}
              </button>
            </div>
          </div>
        </div>

        {/* API Key — shown in Electron (not found via .env in installed app) */}
        {isElectron && (
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
            <h2 className="text-white font-medium mb-1">Groq API Key</h2>
            <p className="text-white/40 text-xs mb-4">
              Required for all AI features. Your key is stored locally on this device only.
            </p>

            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2 h-2 rounded-full ${apiKeySet ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-white/60 text-sm">{apiKeySet ? 'API key is set' : 'API key not set'}</span>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => { setApiKeyInput(e.target.value); setApiKeySaved(false) }}
                placeholder="gsk_..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors font-mono"
              />
              <button
                onClick={async () => {
                  if (!apiKeyInput.trim()) return
                  await eAPI.settings.setApiKey(apiKeyInput.trim())
                  setApiKeySet(true)
                  setApiKeySaved(true)
                  setApiKeyInput('')
                }}
                disabled={!apiKeyInput.trim()}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
              >
                {apiKeySaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>

            {apiKeySet && (
              <button
                onClick={async () => {
                  await eAPI.settings.clearApiKey()
                  setApiKeySet(false)
                  setApiKeySaved(false)
                }}
                className="mt-2 text-red-400/60 hover:text-red-400 text-xs transition-colors"
              >
                Remove key
              </button>
            )}
          </div>
        )}

        {/* Desktop App section — only shown in Electron */}
        {isElectron ? (
          <>
            {/* App info */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h2 className="text-white font-medium mb-4">Desktop App</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">Version</span>
                  <span className="text-white/70 text-sm font-mono">{appVersion ?? '…'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-sm">Auto-updater</span>
                  <span className="text-green-400 text-sm">Enabled</span>
                </div>
                <div className="pt-2 border-t border-white/5">
                  {updateStatus === 'downloaded' ? (
                    <div className="flex items-center justify-between">
                      <span className="text-green-400 text-sm">Update ready — v{updateInfo?.version}</span>
                      <button
                        onClick={() => eAPI.app.installUpdate()}
                        className="px-3 py-1.5 bg-green-400/10 border border-green-400/30 text-green-400 rounded-lg text-xs hover:bg-green-400/20 transition-colors"
                      >
                        Restart & Install
                      </button>
                    </div>
                  ) : updateStatus === 'available' ? (
                    <span className="text-white/50 text-sm">Downloading v{updateInfo?.version}…</span>
                  ) : (
                    <button
                      onClick={checkForUpdates}
                      disabled={updateStatus === 'checking'}
                      className="text-white/40 hover:text-white text-sm transition-colors disabled:opacity-40"
                    >
                      {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Computer Control */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h2 className="text-white font-medium mb-1">Computer Control</h2>
              <p className="text-white/40 text-xs mb-4">
                Allows agents to control your mouse and keyboard to automate tasks on your screen.
                Only activates when you explicitly start a task.
              </p>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${hasComputerPermission ? 'bg-green-400' : 'bg-white/20'}`} />
                    <span className="text-white/70 text-sm">
                      {hasComputerPermission ? 'Permission granted' : 'Permission not granted'}
                    </span>
                  </div>
                  {hasComputerPermission ? (
                    <button
                      onClick={revokeComputerPermission}
                      className="text-red-400/70 hover:text-red-400 text-xs transition-colors"
                    >
                      Revoke
                    </button>
                  ) : (
                    <button
                      onClick={grantComputerPermission}
                      className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/70 hover:text-white rounded-lg text-xs transition-colors"
                    >
                      Grant Permission
                    </button>
                  )}
                </div>

                <div className="space-y-2 text-xs text-white/30">
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>Uses Groq-powered computer control — safe and audited</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>You can stop any task at any time</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>All actions are logged in the agent's activity</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>Never activates in the background without your knowledge</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop-exclusive features */}
            <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
              <h2 className="text-white font-medium mb-4">Desktop-only Features</h2>
              <div className="space-y-3">
                {[
                  { name: 'Computer Control', desc: 'Agents control your screen to automate tasks', available: true },
                  { name: 'System Tray', desc: 'Cluster lives in your menubar/taskbar', available: true },
                  { name: 'Desktop Notifications', desc: 'Get notified when tasks complete', available: true },
                  { name: 'Local File Access', desc: 'Agents can read files from your computer', available: true },
                  { name: 'Offline Mode', desc: 'Works without internet (except AI calls)', available: false },
                ].map((f) => (
                  <div key={f.name} className="flex items-start justify-between">
                    <div>
                      <p className="text-white/70 text-sm">{f.name}</p>
                      <p className="text-white/30 text-xs">{f.desc}</p>
                    </div>
                    <span className={`text-xs mt-0.5 ${f.available ? 'text-green-400' : 'text-white/20'}`}>
                      {f.available ? 'Available' : 'Coming soon'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Web version notice */
          <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
            <h2 className="text-white font-medium mb-2">Running in Browser</h2>
            <p className="text-white/50 text-sm mb-4">
              Download the desktop app to unlock computer control, system tray, desktop notifications, and local file access.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-white/30 text-sm">
                <span>→</span>
                <span>Computer Control (control your screen)</span>
              </div>
              <div className="flex items-center gap-2 text-white/30 text-sm">
                <span>→</span>
                <span>Desktop notifications</span>
              </div>
              <div className="flex items-center gap-2 text-white/30 text-sm">
                <span>→</span>
                <span>System tray — always available</span>
              </div>
              <div className="flex items-center gap-2 text-white/30 text-sm">
                <span>→</span>
                <span>Local file access</span>
              </div>
            </div>
          </div>
        )}

        {/* About */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6">
          <h2 className="text-white font-medium mb-4">About Cluster</h2>
          <div className="space-y-2 text-sm text-white/50">
            <p>Your AI team. Hire agents, build automations, control your workflow.</p>
            <p className="text-white/30 text-xs mt-2">
              One subscription covers web and desktop. Same price, more power on desktop.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
