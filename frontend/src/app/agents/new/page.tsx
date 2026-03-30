'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { SetupModal } from '@/components/SetupModal'

export default function NewAgentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [creating, setCreating] = useState(false)
  const [setupAgent, setSetupAgent] = useState<{ id: string; name: string; businessType: string } | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    const agent = await api.agents.create(name.trim())
    setSetupAgent({ id: agent.id, name: agent.name, businessType: businessType.trim() })
    setCreating(false)
  }

  function handleSetupComplete() {
    router.push(`/agents/${setupAgent!.id}`)
  }

  return (
    <div className="h-full overflow-y-auto p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ← Back
        </Link>
      </div>

      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-white mb-2">Hire an Agent</h1>
        <p className="text-white/40 text-sm mb-8">Name your agent and tell us about your business.</p>

        <form onSubmit={handleCreate} className="space-y-5">
          {/* Agent Name */}
          <div>
            <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
              Agent Name
            </label>
            <input
              type="text"
              placeholder="e.g. Alex, Sarah, Max"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-sm"
            />
          </div>

          {/* Business Type */}
          <div>
            <label className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2">
              Business Type / Role
            </label>
            <input
              type="text"
              placeholder="e.g. Marketing Manager for a coffee shop"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-white/30 text-sm"
            />
          </div>

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
          businessContext={setupAgent.businessType}
          onComplete={handleSetupComplete}
        />
      )}
    </div>
  )
}
