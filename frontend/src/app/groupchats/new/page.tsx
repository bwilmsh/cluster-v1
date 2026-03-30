'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Agent } from '@/lib/api'

export default function NewGroupChatPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.agents.list().then(setAgents)
  }, [])

  function toggleAgent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || selectedIds.size === 0) return
    setCreating(true)
    const chat = await api.groupChats.create(name.trim(), Array.from(selectedIds))
    router.push(`/groupchats/${chat.id}`)
  }

  return (
    <div className="h-full overflow-y-auto p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <Link href="/groupchats" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Group Chats
        </Link>
      </div>

      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-white mb-8">New Group Chat</h1>

        <form onSubmit={handleCreate} className="space-y-6">
          <div>
            <label className="block text-sm text-white/60 mb-2">Group name</label>
            <input
              type="text"
              placeholder="e.g. Marketing Strategy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-white/60 mb-2">Select agents</label>
            {agents.length === 0 ? (
              <p className="text-white/30 text-sm">
                No agents yet.{' '}
                <Link href="/agents/new" className="text-accent">
                  Hire one first.
                </Link>
              </p>
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                      selectedIds.has(agent.id)
                        ? 'border-accent bg-accent/10 text-white'
                        : 'border-surface-border text-white/60 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!name.trim() || selectedIds.size === 0 || creating}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {creating ? 'Creating...' : 'Create Group Chat'}
          </button>
        </form>
      </div>
    </div>
  )
}
