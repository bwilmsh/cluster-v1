'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, APFlow, APRun, APStatus } from '@/lib/api'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function runStatusColor(status: APRun['status']): string {
  switch (status) {
    case 'SUCCEEDED': return '#22c55e'
    case 'RUNNING':   return '#f59e0b'
    case 'FAILED':
    case 'INTERNAL_ERROR': return '#ef4444'
    default:          return 'var(--text-tertiary)'
  }
}

function runStatusLabel(status: APRun['status']): string {
  switch (status) {
    case 'SUCCEEDED':     return 'Success'
    case 'RUNNING':       return 'Running'
    case 'FAILED':        return 'Failed'
    case 'TIMEOUT':       return 'Timed out'
    case 'INTERNAL_ERROR':return 'Error'
    case 'STOPPED':       return 'Stopped'
    case 'SKIPPED':       return 'Skipped'
    default:              return status
  }
}

// ─── Setup screen ─────────────────────────────────────────────────────────────

function SetupScreen({ reason }: { reason?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center max-w-lg mx-auto">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" style={{ color: 'var(--text-secondary)' }}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div>
        <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Connect Activepieces
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {reason === 'no_credentials'
            ? 'Add your Activepieces login details to .env to enable automations.'
            : 'Activepieces isn\'t reachable. Make sure Docker is running.'}
        </p>
      </div>

      <ol className="text-left space-y-3 w-full">
        {[
          {
            step: '1',
            text: (
              <>
                Run{' '}
                <code
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  npm run dev
                </code>{' '}
                from the{' '}
                <code
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  cluster
                </code>{' '}
                folder to start Docker services
              </>
            ),
          },
          {
            step: '2',
            text: (
              <>
                Open{' '}
                <a
                  href="http://localhost:8080"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  localhost:8080
                </a>{' '}
                and create your Activepieces account if you haven't already
              </>
            ),
          },
          {
            step: '3',
            text: (
              <>
                Add these two lines to your{' '}
                <code
                  className="px-1.5 py-0.5 rounded text-xs"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  .env
                </code>{' '}
                file:
                <div
                  className="mt-2 px-3 py-2 rounded-lg text-xs font-mono"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  ACTIVEPIECES_EMAIL=your@email.com<br />
                  ACTIVEPIECES_PASSWORD=yourpassword
                </div>
              </>
            ),
          },
          {
            step: '4',
            text: 'Restart the backend — the Automations page will connect automatically',
          },
        ].map(({ step, text }) => (
          <li key={step} className="flex gap-3 items-start">
            <span
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              {step}
            </span>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {text}
            </span>
          </li>
        ))}
      </ol>

      <a
        href="http://localhost:8080"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity"
        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        Open Activepieces ↗
      </a>
    </div>
  )
}

// ─── Run history panel ────────────────────────────────────────────────────────

function RunHistoryPanel({ flowId, onClose }: { flowId: string; onClose: () => void }) {
  const [runs, setRuns] = useState<APRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.ap.runs(flowId).then((r) => {
      setRuns(r)
      setLoading(false)
    })
  }, [flowId])

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div
        className="shrink-0 h-14 flex items-center justify-between px-6"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Run History
        </h2>
        <button
          onClick={onClose}
          className="text-xs transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.6')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-center mt-8" style={{ color: 'var(--text-tertiary)' }}>
            Loading…
          </p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-center mt-8" style={{ color: 'var(--text-tertiary)' }}>
            No runs yet
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--border)' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: runStatusColor(run.status) }}
                  />
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {runStatusLabel(run.status)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDate(run.startTime)}
                    </p>
                  </div>
                </div>
                {run.finishTime && (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    finished {formatDate(run.finishTime)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Flow card ────────────────────────────────────────────────────────────────

function FlowCard({
  flow,
  onToggle,
  onRun,
  onDelete,
  onHistory,
}: {
  flow: APFlow
  onToggle: (id: string) => void
  onRun: (id: string) => void
  onDelete: (id: string) => void
  onHistory: (id: string) => void
}) {
  const enabled = flow.status === 'ENABLED'
  const published = !!flow.publishedVersionId

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 rounded-2xl"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--border)' }}
    >
      {/* Status dot */}
      <span
        className="shrink-0 w-2 h-2 rounded-full"
        style={{ backgroundColor: enabled ? '#22c55e' : 'var(--text-tertiary)' }}
      />

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {flow.displayName || 'Untitled flow'}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {published ? `Updated ${formatDate(flow.updated)}` : 'Draft — not published'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* History */}
        <button
          onClick={() => onHistory(flow.id)}
          title="Run history"
          className="px-3 py-1.5 rounded-lg text-xs transition-opacity"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          History
        </button>

        {/* Run now */}
        <button
          onClick={() => onRun(flow.id)}
          disabled={!published}
          title={published ? 'Run now' : 'Publish the flow in Activepieces first'}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          onMouseEnter={(e) => { if (published) e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          Run
        </button>

        {/* Toggle */}
        <button
          onClick={() => onToggle(flow.id)}
          title={enabled ? 'Disable' : 'Enable'}
          className="relative shrink-0 rounded-full transition-colors"
          style={{
            width: '36px',
            height: '20px',
            backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
          }}
        >
          <span
            className="absolute top-0.5 rounded-full transition-transform"
            style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#fff',
              left: enabled ? '18px' : '2px',
              transition: 'left 0.15s',
            }}
          />
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(flow.id)}
          title="Delete"
          className="px-2 py-1.5 rounded-lg text-xs transition-opacity"
          style={{ color: '#ef4444', backgroundColor: 'var(--bg-tertiary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [status, setStatus] = useState<APStatus | null>(null)
  const [flows, setFlows] = useState<APFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [historyFlowId, setHistoryFlowId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.ap.status()
      setStatus(s)
      if (s.configured) {
        const f = await api.ap.flows()
        setFlows(f)
      }
    } catch {
      setStatus({ configured: false, reason: 'unreachable' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (id: string) => {
    try {
      const updated = await api.ap.toggle(id)
      setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, status: updated.status } : f)))
    } catch {
      showToast('Failed to toggle flow', false)
    }
  }

  const handleRun = async (id: string) => {
    const result = await api.ap.run(id)
    if ('error' in result) {
      showToast(result.error, false)
    } else {
      showToast('Flow triggered successfully')
    }
  }

  const handleDelete = async (id: string) => {
    const flow = flows.find((f) => f.id === id)
    if (!confirm(`Delete "${flow?.displayName || 'this flow'}"?`)) return
    await api.ap.delete(id)
    setFlows((prev) => prev.filter((f) => f.id !== id))
    showToast('Flow deleted')
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div
        className="shrink-0 h-14 flex items-center justify-between px-6"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Automations
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="text-xs transition-opacity"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.6')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Refresh
          </button>
          <a
            href="http://localhost:8080"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            + New Flow ↗
          </a>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>
        </div>
      ) : !status?.configured ? (
        <SetupScreen reason={status?.reason} />
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {flows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 text-center mt-16">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No flows yet. Create your first automation in Activepieces.
              </p>
              <a
                href="http://localhost:8080"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl text-sm font-medium transition-opacity"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Open Activepieces ↗
              </a>
              <p className="text-xs max-w-xs" style={{ color: 'var(--text-tertiary)' }}>
                Build your flow there, then come back here to manage and run it.
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
              <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                {flows.length} flow{flows.length !== 1 ? 's' : ''} · managed via Activepieces
              </p>
              {flows.map((flow) => (
                <FlowCard
                  key={flow.id}
                  flow={flow}
                  onToggle={handleToggle}
                  onRun={handleRun}
                  onDelete={handleDelete}
                  onHistory={setHistoryFlowId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Run history overlay */}
      {historyFlowId && (
        <RunHistoryPanel
          flowId={historyFlowId}
          onClose={() => setHistoryFlowId(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg pointer-events-none"
          style={{
            backgroundColor: toast.ok ? '#22c55e' : '#ef4444',
            color: '#fff',
            zIndex: 50,
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
