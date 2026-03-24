'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api, GroupChat } from '@/lib/api'

export default function GroupChatsPage() {
  const [chats, setChats] = useState<GroupChat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.groupChats.list().then(setChats).finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold text-white mt-2">Group Chats</h1>
        </div>
        <Link
          href="/groupchats/new"
          className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors"
        >
          New Group
        </Link>
      </div>

      {loading ? (
        <div className="text-white/30 text-sm">Loading...</div>
      ) : chats.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/30 text-sm mb-4">No group chats yet</p>
          <Link
            href="/groupchats/new"
            className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium"
          >
            Create your first group chat
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/groupchats/${chat.id}`}
              className="block rounded-xl border border-surface-border bg-surface-raised p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{chat.name}</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {chat.members.length} member{chat.members.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-white/20 text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
