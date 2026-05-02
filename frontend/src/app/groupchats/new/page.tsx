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
    <div className="h-full overflow-y-auto p-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="max-w-2xl mx-auto">
        {/* Back link */}
        <div className="mb-10">
          <Link href="/groupchats" className="inline-flex items-center gap-2 text-sm transition-colors hover:font-semibold" style={{ color: 'var(--text-secondary)' }}>
            ← Group Chats
          </Link>
        </div>

        {/* Form */}
        <form onSubmit={handleCreate} className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              Create a Group Chat
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Start a conversation with multiple agents
            </p>
          </div>

          {/* Group name */}
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
              Group Name
            </label>
            <input
              type="text"
              placeholder="e.g. Marketing Strategy, Q4 Planning"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm transition-all duration-200 focus:outline-none focus:-translate-y-0.5 focus:shadow-lg"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Select agents */}
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
              Select Agents
            </label>
            {agents.length === 0 ? (
              <div className="p-6 rounded-lg text-center" style={{ backgroundColor: 'var(--accent-muted)', borderColor: 'var(--border)', border: '1px solid var(--border)' }}>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  No agents yet.
                </p>
                <Link
                  href="/agents/new"
                  className="inline-block px-4 py-2 rounded-lg text-white font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Hire your first agent
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className="w-full text-left rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: selectedIds.has(agent.id)
                        ? 'var(--accent-muted)'
                        : 'var(--bg-secondary)',
                      borderColor: selectedIds.has(agent.id)
                        ? 'var(--accent)'
                        : 'var(--border)',
                      border: '1px solid var(--border)',
                      color: selectedIds.has(agent.id)
                        ? 'var(--accent)'
                        : 'var(--text-primary)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors"
                        style={{
                          borderColor: selectedIds.has(agent.id)
                            ? 'var(--accent)'
                            : 'var(--text-tertiary)',
                          backgroundColor: selectedIds.has(agent.id)
                            ? 'var(--accent)'
                            : 'transparent',
                        }}
                      >
                        {selectedIds.has(agent.id) && (
                          <span style={{ color: 'var(--bg-primary)' }}>✓</span>
                        )}
                      </div>
                      <span>{agent.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!name.trim() || selectedIds.size === 0 || creating}
            className="w-full py-3 rounded-lg text-white font-medium transition-all duration-200 hover:-translate-y-1 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
            style={{
              backgroundColor: 'var(--accent)',
            }}
            onMouseOver={(e) => !creating && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            {creating ? 'Creating...' : 'Create Group Chat'}
          </button>
        </form>
      </div>
    </div>
  )
}
