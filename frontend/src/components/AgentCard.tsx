'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Agent } from '@/lib/api'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getRoleColors(role: string) {
  const r = role.toLowerCase()
  if (r.match(/market/))                   return { border: 'border-l-violet-500',  avatar: 'bg-violet-500/20 text-violet-300' }
  if (r.match(/sales/))                    return { border: 'border-l-blue-500',    avatar: 'bg-blue-500/20 text-blue-300' }
  if (r.match(/support|customer/))         return { border: 'border-l-emerald-500', avatar: 'bg-emerald-500/20 text-emerald-300' }
  if (r.match(/finance|account|book/))     return { border: 'border-l-amber-500',   avatar: 'bg-amber-500/20 text-amber-300' }
  if (r.match(/hr|recruit|people/))        return { border: 'border-l-rose-500',    avatar: 'bg-rose-500/20 text-rose-300' }
  if (r.match(/tech|dev|engineer|code/))   return { border: 'border-l-cyan-500',    avatar: 'bg-cyan-500/20 text-cyan-300' }
  if (r.match(/content|creat|copy|writ/))  return { border: 'border-l-pink-500',    avatar: 'bg-pink-500/20 text-pink-300' }
  if (r.match(/ops|operat|logist/))        return { border: 'border-l-orange-500',  avatar: 'bg-orange-500/20 text-orange-300' }
  return { border: 'border-l-white/20', avatar: 'bg-white/10 text-white/50' }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface Props {
  agent: Agent
  onDelete: (id: string) => void
}

export function AgentCard({ agent, onDelete }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const role = (agent.setupAnswers as Record<string, string> | null)?.['Business type / role'] ?? ''
  const colors = getRoleColors(role)
  const isActive = agent.status !== 'setting_up' && agent.status !== 'offline'

  // Build one-line description from the first non-role setup answer
  const description = (() => {
    if (!agent.setupAnswers) return role
    const answers = agent.setupAnswers as Record<string, string>
    // Skip the role field, pick the first substantive answer
    const key = Object.keys(answers).find(
      (k) => k !== 'Business type / role' && answers[k]?.trim()
    )
    return key ? answers[key] : role
  })()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div
      className={`group relative flex flex-col rounded-xl bg-surface-raised border border-surface-border border-l-4 ${colors.border} p-5 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20 transition-all duration-200 cursor-pointer`}
      onClick={() => router.push(`/agents/${agent.id}`)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-semibold shrink-0 ${colors.avatar}`}
          >
            {getInitials(agent.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm leading-tight truncate">{agent.name}</p>
            {role && (
              <p className="text-xs text-white/40 mt-0.5 truncate">{role}</p>
            )}
          </div>
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors opacity-0 group-hover:opacity-100"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-3 top-12 z-20 bg-surface-raised border border-surface-border rounded-xl shadow-xl shadow-black/40 py-1 min-w-[140px]">
              <button
                onClick={() => { setMenuOpen(false); router.push(`/agents/${agent.id}`) }}
                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                Open Chat
              </button>
              <div className="h-px bg-surface-border mx-2 my-1" />
              <button
                onClick={() => { setMenuOpen(false); onDelete(agent.id) }}
                className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-white/5 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-white/35 leading-relaxed line-clamp-2 mb-4 flex-1">
          {description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-surface-border">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
          <span className={`text-[11px] ${isActive ? 'text-emerald-400/80' : 'text-white/25'}`}>
            {agent.status === 'setting_up' ? 'Setting up' : isActive ? 'Active' : 'Offline'}
          </span>
        </div>
        <span className="text-[11px] text-white/25">{timeAgo(agent.createdAt)}</span>
      </div>
    </div>
  )
}
