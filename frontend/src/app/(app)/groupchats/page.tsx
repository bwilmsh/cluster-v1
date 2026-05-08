'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api, GroupChat, GroupChatMember } from '@/lib/api'
import { LoadingDots } from '@/components/LoadingDots'

const AVATAR_PALETTES = [
  { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/40' },
  { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/40' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/40' },
]

const paletteCache: Record<string, (typeof AVATAR_PALETTES)[0]> = {}
function getPalette(name: string) {
  if (!paletteCache[name]) {
    let hash = 0
    for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
    paletteCache[name] = AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
  }
  return paletteCache[name]
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function MemberAvatars({ members }: { members: GroupChatMember[] }) {
  const agentMembers = members.filter((m) => m.type === 'agent' && m.agent).slice(0, 5)
  return (
    <div className="flex items-center">
      {agentMembers.map((m, i) => {
        const p = getPalette(m.agent!.name)
        return (
          <div
            key={m.id}
            title={m.agent!.name}
            className={`w-7 h-7 rounded-full border-2 border-surface-border flex items-center justify-center text-[10px] font-semibold shrink-0 ${p.bg} ${p.text}`}
            style={{ marginLeft: i === 0 ? 0 : -8, zIndex: agentMembers.length - i }}
          >
            {initials(m.agent!.name)}
          </div>
        )
      })}
      {members.filter((m) => m.type === 'agent').length > 5 && (
        <div
          className="w-7 h-7 rounded-full border-2 border-surface-border bg-white/10 dark:bg-white/10 light:bg-gray-200 flex items-center justify-center text-[10px] text-white/40 dark:text-white/40 light:text-gray-600 shrink-0"
          style={{ marginLeft: -8 }}
        >
          +{members.filter((m) => m.type === 'agent').length - 5}
        </div>
      )}
    </div>
  )
}

export default function GroupChatsPage() {
  const [chats, setChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    api.groupChats.list().then(setChats).finally(() => setLoading(false))
  }, [])

  const agentCount = (chat: GroupChat) => chat.members.filter((m) => m.type === 'agent').length

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Group Chats
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {loading ? '' : `${chats.length} conversation${chats.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Link
            href="/groupchats/new"
            className="px-6 py-3 rounded-lg font-medium text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{
              backgroundColor: 'var(--accent)',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            New Group
          </Link>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><LoadingDots /></div>
        ) : chats.length === 0 ? (
          <div
            className="text-center py-20 rounded-2xl border-2 border-dashed"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--accent-muted)',
            }}
          >
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              No group chats yet
            </p>
            <Link
              href="/groupchats/new"
              className="px-6 py-3 rounded-lg font-medium text-white transition-all duration-200 inline-block hover:-translate-y-0.5 hover:shadow-lg"
              style={{
                backgroundColor: 'var(--accent)',
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              Create your first group chat
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {chats.map((chat) => {
              const lastMsg = chat.messages?.[0]
              const n = agentCount(chat)
              return (
                <button
                  key={chat.id}
                  onClick={() => router.push(`/groupchats/${chat.id}`)}
                  className="text-left group rounded-xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.25)';
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="min-w-0">
                      <p className="font-semibold text-lg truncate" style={{ color: 'var(--text-primary)' }}>
                        {chat.name}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        {n} agent{n !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {lastMsg && (
                      <span className="text-[11px] shrink-0 mt-0.5 px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                        {timeAgo(lastMsg.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Member avatars */}
                  <div className="mb-4">
                    <MemberAvatars members={chat.members} />
                  </div>

                  {/* Last message preview */}
                  {lastMsg && (
                    <p className="text-xs leading-relaxed truncate" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {lastMsg.senderName}:
                      </span>{' '}
                      {lastMsg.content}
                    </p>
                  )}

                  {!lastMsg && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      No messages yet
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
