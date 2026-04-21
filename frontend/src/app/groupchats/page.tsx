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
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white dark:text-white light:text-gray-900">Group Chats</h1>
            <p className="text-white/30 dark:text-white/30 light:text-gray-500 text-sm mt-0.5">
              {loading ? '' : `${chats.length} conversation${chats.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Link
            href="/groupchats/new"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
          >
            New Group
          </Link>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><LoadingDots /></div>
        ) : chats.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/8 dark:border-white/8 light:border-gray-300">
            <p className="text-white/25 dark:text-white/25 light:text-gray-500 text-sm mb-4">No group chats yet</p>
            <Link
              href="/groupchats/new"
              className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
            >
              Create your first group chat
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {chats.map((chat) => {
              const lastMsg = chat.messages?.[0]
              const n = agentCount(chat)
              return (
                <button
                  key={chat.id}
                  onClick={() => router.push(`/groupchats/${chat.id}`)}
                  className="text-left group rounded-xl border border-surface-border bg-surface-raised p-5 hover:-translate-y-0.5 hover:border-white/15 dark:hover:border-white/15 light:hover:border-gray-400 hover:shadow-lg hover:shadow-black/20 dark:hover:shadow-black/20 light:hover:shadow-gray-400/10 transition-all duration-200"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-white dark:text-white light:text-gray-900 text-sm truncate">{chat.name}</p>
                      <p className="text-xs text-white/35 dark:text-white/35 light:text-gray-500 mt-0.5">
                        {n} agent{n !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {lastMsg && (
                      <span className="text-[11px] text-white/25 dark:text-white/25 light:text-gray-400 shrink-0 mt-0.5">
                        {timeAgo(lastMsg.createdAt)}
                      </span>
                    )}
                  </div>

                  {/* Member avatars */}
                  <MemberAvatars members={chat.members} />

                  {/* Last message preview */}
                  {lastMsg && (
                    <p className="mt-3 text-xs text-white/30 dark:text-white/30 light:text-gray-600 truncate">
                      <span className="text-white/45 dark:text-white/45 light:text-gray-500">{lastMsg.senderName}:</span>{' '}
                      {lastMsg.content}
                    </p>
                  )}

                  {!lastMsg && (
                    <p className="mt-3 text-xs text-white/20 dark:text-white/20 light:text-gray-400">No messages yet</p>
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
