'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { SetupModal } from '@/components/SetupModal'

export default function NewAgentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [setupAgent, setSetupAgent] = useState<{ id: string; name: string } | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const agent = await api.agents.create(name.trim())
    setSetupAgent({ id: agent.id, name: agent.name })
    setCreating(false)
  }

  function handleSetupComplete() {
    router.push(`/agents/${setupAgent!.id}`)
  }

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Back
        </Link>
      </div>

      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-white mb-2">Hire an Agent</h1>
        <p className="text-white/40 text-sm mb-8">Give your agent a name to get started.</p>

        <form onSubmit={handleCreate} className="space-y-4">
          <input
            type="text"
            placeholder="e.g. Marketing Manager, Support Agent..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-sm"
          />
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </form>
      </div>

      {setupAgent && (
        <SetupModal
          agentId={setupAgent.id}
          agentName={setupAgent.name}
          onComplete={handleSetupComplete}
        />
      )}
    </div>
  )
}
