'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, Workflow } from '@/lib/api'

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-yellow-500/15 text-yellow-400',
  draft: 'bg-white/5 text-white/40',
}

const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: '#6366f1',
  check: '#f59e0b',
  action: '#22c55e',
  notify: '#a855f7',
  decision: '#f97316',
  memory_read: '#06b6d4',
  memory_write: '#06b6d4',
}

export default function WorkflowsPage() {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)

  useEffect(() => {
    api.workflows.list().then(setWorkflows).catch(() => setWorkflows([]))
  }, [])

  async function handleDelete(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await api.workflows.delete(id)
    setWorkflows((prev) => prev?.filter((w) => w.id !== id) ?? [])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="shrink-0 h-14 flex items-center justify-between px-6"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Workflows
          </h1>
          {workflows && workflows.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {workflows.length}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Built by your agents
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {workflows === null ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: 'var(--text-tertiary)',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <svg className="w-6 h-6" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.25" />
                <circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.25" />
                <circle cx="3" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.25" />
                <path d="M4.5 3.5L11.5 7M4.5 12.5L11.5 8.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No workflows yet</p>
            <p className="text-xs max-w-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              Ask any agent to set up a workflow for you. Say something like{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                "Set me a reminder for my hair appointment Sunday"
              </span>{' '}
              and the agent will build it.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                onClick={() => router.push(`/workflows/${wf.id}`)}
                className="rounded-2xl p-4 cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '0.5px solid var(--border)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {wf.name}
                      </p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[wf.status] ?? STATUS_STYLES.draft}`}>
                        {wf.status}
                      </span>
                    </div>
                    {wf.description && (
                      <p className="text-xs truncate mb-2" style={{ color: 'var(--text-secondary)' }}>
                        {wf.description}
                      </p>
                    )}
                    {/* Node type pills */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {wf.nodes.slice(0, 6).map((node) => (
                        <span
                          key={node.id}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${NODE_TYPE_COLORS[node.type] ?? '#888'}20`,
                            color: NODE_TYPE_COLORS[node.type] ?? '#888',
                          }}
                        >
                          {node.type}
                        </span>
                      ))}
                      {wf.nodes.length > 6 && (
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          +{wf.nodes.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {timeAgo(wf.updatedAt)}
                    </span>
                    <button
                      onClick={(e) => handleDelete(wf.id, wf.name, e)}
                      className="text-xs px-2 py-1 rounded-lg transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#ef4444'
                        e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-tertiary)'
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
