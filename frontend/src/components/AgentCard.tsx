'use client'

import Link from 'next/link'
import { Agent } from '@/lib/api'

const AVATAR_COLORS = [
  'bg-violet-600',
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
]

function getAvatarColor(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) & 0xffff
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

interface Props {
  agent: Agent
  onDelete: (id: string) => void
}

export function AgentCard({ agent, onDelete }: Props) {
  const color = getAvatarColor(agent.name)
  const isSetup = agent.status === 'setting_up'

  return (
    <div className="group relative rounded-xl border border-surface-border bg-surface-raised p-5 hover:border-white/10 transition-colors">
      <Link href={`/agents/${agent.id}`} className="block">
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`${color} w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white shrink-0`}
          >
            {getInitials(agent.name)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-white truncate">{agent.name}</p>
            <p className="text-xs text-white/40 mt-0.5">
              {isSetup ? 'Setting up...' : 'Active'}
            </p>
          </div>
        </div>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault()
          onDelete(agent.id)
        }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition-all text-xs px-2 py-1 rounded"
      >
        Remove
      </button>
    </div>
  )
}
