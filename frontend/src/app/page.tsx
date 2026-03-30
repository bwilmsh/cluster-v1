'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Agent, Widget } from '@/lib/api'
import { AgentCard } from '@/components/AgentCard'
import { WidgetRenderer } from '@/components/WidgetRenderer'

// ─── Widget Card ─────────────────────────────────────────────────────────────

function sizeClass(size: Widget['size']) {
  if (size === 'sm') return 'col-span-1'
  if (size === 'lg') return 'col-span-2 sm:col-span-3'
  return 'col-span-1 sm:col-span-2'
}

function heightClass(size: Widget['size']) {
  if (size === 'sm') return 'h-36'
  if (size === 'lg') return 'h-64'
  return 'h-48'
}

interface WidgetCardProps {
  widget: Widget
  onDelete: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: () => void
  isDragging: boolean
}

function WidgetCard({ widget, onDelete, onDragStart, onDragOver, onDrop, isDragging }: WidgetCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(widget.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(widget.id) }}
      onDrop={onDrop}
      className={`
        ${sizeClass(widget.size)} ${heightClass(widget.size)}
        relative group bg-white/[0.03] border border-white/8 rounded-2xl p-4 cursor-grab active:cursor-grabbing
        transition-opacity ${isDragging ? 'opacity-30' : 'opacity-100'}
      `}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-white/60 text-xs font-medium uppercase tracking-wide truncate pr-2">{widget.title}</h3>
        <button
          onClick={() => onDelete(widget.id)}
          className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition-all flex-shrink-0 text-lg leading-none -mt-0.5"
        >
          ×
        </button>
      </div>
      <div className="overflow-hidden" style={{ height: 'calc(100% - 2rem)' }}>
        <WidgetRenderer widget={widget} />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [loading, setLoading] = useState(true)

  const dragId = useRef<string | null>(null)
  const dragOverId = useRef<string | null>(null)

  useEffect(() => {
    Promise.all([api.agents.list(), api.widgets.list()])
      .then(([a, w]) => { setAgents(a); setWidgets(w) })
      .finally(() => setLoading(false))
  }, [])

  async function handleDeleteAgent(id: string) {
    if (!confirm('Remove this agent?')) return
    await api.agents.delete(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleDeleteWidget(id: string) {
    await api.widgets.delete(id)
    setWidgets((prev) => prev.filter((w) => w.id !== id))
  }

  function handleDragStart(id: string) { dragId.current = id }
  function handleDragOver(id: string) { dragOverId.current = id }

  async function handleDrop() {
    const fromId = dragId.current
    const toId = dragOverId.current
    dragId.current = null
    dragOverId.current = null
    if (!fromId || !toId || fromId === toId) return

    const reordered = [...widgets]
    const fromIdx = reordered.findIndex((w) => w.id === fromId)
    const toIdx = reordered.findIndex((w) => w.id === toId)
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const withOrder = reordered.map((w, i) => ({ ...w, order: i }))
    setWidgets(withOrder)
    await api.widgets.reorder(withOrder.map((w) => ({ id: w.id, order: w.order })))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white">Dashboard</h1>
            <p className="text-white/30 text-sm mt-0.5">
              {loading ? '' : `${agents.length} agent${agents.length !== 1 ? 's' : ''} active`}
            </p>
          </div>
          <Link
            href="/cluster"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
            </svg>
            Ask Cluster
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-white/25 text-sm py-12">
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-white/25 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <>
            {/* Widget grid */}
            {widgets.length > 0 ? (
              <div className="mb-10">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-min">
                  {widgets.map((w) => (
                    <WidgetCard
                      key={w.id}
                      widget={w}
                      onDelete={handleDeleteWidget}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      isDragging={dragId.current === w.id}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-10 rounded-2xl border border-dashed border-white/8 py-10 text-center">
                <p className="text-white/25 text-sm mb-2">No dashboard widgets yet</p>
                <Link
                  href="/cluster"
                  className="text-white/40 hover:text-white/70 text-sm transition-colors"
                >
                  Ask Cluster to build your dashboard →
                </Link>
              </div>
            )}

            {/* Agents section */}
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">Your Agents</h2>
                <Link
                  href="/agents/new"
                  className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  + Hire new
                </Link>
              </div>

              {agents.length === 0 ? (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/8">
                  <p className="text-white/25 text-sm mb-4">No agents hired yet</p>
                  <Link
                    href="/agents/new"
                    className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
                  >
                    Hire your first agent
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} onDelete={handleDeleteAgent} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
