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
  const flushTimerRef = useRef<number | null>(null)
  const FLUSH_MS = 100

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

          if (!flushTimerRef.current) {
            flushTimerRef.current = window.setInterval(() => {
              const agentName = activeStreamingAgentRef.current
              if (!agentName) return
              const buf = agentBuffersRef.current[agentName] ?? ''
              setStreamingAgents([{ name: agentName, content: buf }])
            }, FLUSH_MS)
          }
        } else if (event.type === 'agent_done' && event.agentName) {
          if (activeStreamingAgentRef.current !== event.agentName) continue
          if (flushTimerRef.current) {
            clearInterval(flushTimerRef.current)
            flushTimerRef.current = null
          }
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
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current)
        flushTimerRef.current = null
      }
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
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        className="shrink-0 border-b px-6 h-16 flex items-center gap-3"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div className="w-6 h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
        <div className="w-40 h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-tertiary)' }} />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <LoadingDots />
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 border-b px-6 h-16 flex items-center gap-4"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <Link
          href="/groupchats"
          className="text-sm transition-colors hover:font-semibold"
          style={{ color: 'var(--text-tertiary)' }}
        >
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>
            {chat.name}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {members.length} agent{members.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Three-dot menu */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 hover:shadow-md"
            style={{
              backgroundColor: 'var(--accent-muted)',
              color: 'var(--accent)',
            }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-11 z-20 rounded-lg shadow-lg py-1 min-w-[180px] border"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); setShowAddModal(true) }}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-muted)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Add Agent
              </button>
              <div
                className="h-px mx-2 my-1"
                style={{ backgroundColor: 'var(--border)' }}
              />
              <button
                onClick={() => { setMenuOpen(false); handleDeleteChat() }}
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{ color: 'var(--error)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
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
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-lg w-full max-w-sm p-6 border shadow-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            Add Agent
          </h2>
          <button
            onClick={onClose}
            className="text-sm transition-colors font-medium hover:font-bold"
            style={{ color: 'var(--text-tertiary)' }}
          >
            ✕
          </button>
        </div>

        {available.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
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
                className="w-full text-left rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 border disabled:opacity-40 hover:-translate-y-0.5"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
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
