'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Agent, GroupChat, GroupChatMessage } from '@/lib/api'
import { GroupChatWindow, GroupMessage, GroupMember } from '@/components/GroupChatWindow'
import { LoadingDots } from '@/components/LoadingDots'
import { readSSE } from '@/lib/sse'

interface StreamingAgent {
  name: string
  content: string
}

export default function GroupChatPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [chat, setChat] = useState<GroupChat | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingAgents, setStreamingAgents] = useState<StreamingAgent[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const agentBuffersRef = useRef<Record<string, string>>({})
  const activeStreamingAgentRef = useRef<string | null>(null)

  async function loadChat() {
    const [chatData, msgs] = await Promise.all([
      fetch(`/api/groupchats/${id}`).then((r) => r.json()),
      api.groupChats.messages(id),
    ])
    setChat(chatData)
    setMessages(
      msgs.map((m: GroupChatMessage) => ({
        id: m.id,
        senderName: m.senderName,
        senderRole: m.senderRole as 'user' | 'agent',
        content: m.content,
      }))
    )
  }

  useEffect(() => {
    loadChat()
  }, [id])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return

    const userMsg: GroupMessage = {
      id: Date.now().toString(),
      senderName: 'You',
      senderRole: 'user',
      content: input.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    const sentInput = input.trim()
    setInput('')
    setStreaming(true)
    agentBuffersRef.current = {}
    activeStreamingAgentRef.current = null

    try {
      for await (const event of readSSE(`/api/groupchats/${id}/message`, {
        message: sentInput,
      })) {
        if (event.type === 'agent_start' && event.agentName) {
          agentBuffersRef.current[event.agentName] = ''
          activeStreamingAgentRef.current = event.agentName
          setStreamingAgents([{ name: event.agentName, content: '' }])
        } else if (event.delta && event.agentName) {
          if (activeStreamingAgentRef.current !== event.agentName) continue
          agentBuffersRef.current[event.agentName] =
            (agentBuffersRef.current[event.agentName] ?? '') + event.delta
          setStreamingAgents([{ name: event.agentName, content: agentBuffersRef.current[event.agentName] }])
        } else if (event.type === 'agent_done' && event.agentName) {
          if (activeStreamingAgentRef.current !== event.agentName) continue
          const finalContent = agentBuffersRef.current[event.agentName] ?? ''
          if (finalContent) {
            setMessages((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${event.agentName}`,
                senderName: event.agentName!,
                senderRole: 'agent' as const,
                content: finalContent,
              },
            ])
          }
          delete agentBuffersRef.current[event.agentName]
          setStreamingAgents([])
          activeStreamingAgentRef.current = null
        } else if (event.type === 'agent_handoff' && event.from && event.to) {
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-handoff`,
              senderName: event.from!,
              senderRole: 'handoff' as const,
              content: event.to!,
            },
          ])
        }
      }
    } finally {
      agentBuffersRef.current = {}
      activeStreamingAgentRef.current = null
      setStreamingAgents([])
      setStreaming(false)
    }
  }, [input, streaming, id])

  async function handleAddMember(agentId: string) {
    await api.groupChats.addMember(id, { agentId, type: 'agent' })
    setShowAddModal(false)
    await loadChat()
  }

  async function handleDeleteChat() {
    if (!confirm(`Delete "${chat?.name}"? This cannot be undone.`)) return
    await api.groupChats.delete(id)
    router.push('/groupchats')
  }

  const members: GroupMember[] = chat
    ? chat.members
        .filter((m) => m.type === 'agent' && m.agent)
        .map((m) => ({
          id: m.id,
          name: m.agent!.name,
          type: 'agent' as const,
          role: (m.agent!.setupAnswers as Record<string, string> | null)?.['Business type / role'],
        }))
    : []

  if (!chat) return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-surface-border px-5 h-14 flex items-center gap-3">
        <div className="w-6 h-4 bg-white/5 rounded animate-pulse" />
        <div className="w-40 h-4 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <LoadingDots />
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-5 h-14 flex items-center gap-3">
        <Link href="/groupchats" className="text-white/30 hover:text-white/60 text-sm transition-colors shrink-0">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm truncate">{chat.name}</p>
          <p className="text-[11px] text-white/35">
            {members.length} agent{members.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/8 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-20 bg-surface-raised border border-surface-border rounded-xl shadow-xl shadow-black/40 py-1 min-w-[160px]">
              <button
                onClick={() => { setMenuOpen(false); setShowAddModal(true) }}
                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              >
                Add Agent
              </button>
              <div className="h-px bg-surface-border mx-2 my-1" />
              <button
                onClick={() => { setMenuOpen(false); handleDeleteChat() }}
                className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:text-rose-300 hover:bg-white/5 transition-colors"
              >
                Delete Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <GroupChatWindow
          members={members}
          messages={messages}
          streamingAgents={streamingAgents}
          isStreaming={streaming}
          inputValue={input}
          onInputChange={setInput}
          onSubmit={handleSend}
          onAddMember={() => setShowAddModal(true)}
        />
      </div>

      {/* Add member modal */}
      {showAddModal && (
        <AddMemberModal
          currentMemberAgentIds={chat.members.map((m) => m.agentId).filter(Boolean) as string[]}
          onAdd={handleAddMember}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}

function AddMemberModal({
  currentMemberAgentIds,
  onAdd,
  onClose,
}: {
  currentMemberAgentIds: string[]
  onAdd: (agentId: string) => void
  onClose: () => void
}) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [adding, setAdding] = useState<string | null>(null)

  useEffect(() => {
    api.agents.list().then(setAgents)
  }, [])

  const available = agents.filter((a) => !currentMemberAgentIds.includes(a.id))

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Add Agent</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-sm transition-colors">
            ✕
          </button>
        </div>

        {available.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-4">
            All your agents are already in this chat.
          </p>
        ) : (
          <div className="space-y-2">
            {available.map((agent) => (
              <button
                key={agent.id}
                onClick={async () => {
                  setAdding(agent.id)
                  await onAdd(agent.id)
                  setAdding(null)
                }}
                disabled={adding !== null}
                className="w-full text-left rounded-xl border border-surface-border px-4 py-3 text-sm text-white/70 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40"
              >
                {agent.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
