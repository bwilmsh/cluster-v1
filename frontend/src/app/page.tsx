'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, Agent } from '@/lib/api'
import { AgentCard } from '@/components/AgentCard'

export default function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.agents.list().then(setAgents).finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Remove this agent?')) return
    await api.agents.delete(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cluster</h1>
          <p className="text-white/40 text-sm mt-1">Your AI team</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/groupchats"
            className="px-4 py-2 rounded-lg border border-surface-border text-white/60 hover:text-white hover:border-white/20 text-sm transition-colors"
          >
            Group Chats
          </Link>
          <Link
            href="/agents/new"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            Hire Agent
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-white/30 text-sm">Loading...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/30 text-sm mb-4">No agents hired yet</p>
          <Link
            href="/agents/new"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            Hire your first agent
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
