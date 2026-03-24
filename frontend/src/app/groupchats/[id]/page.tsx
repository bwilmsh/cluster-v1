'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, GroupChat, GroupChatMessage } from '@/lib/api'
import { GroupChatWindow, GroupMessage } from '@/components/GroupChatWindow'
import { readSSE } from '@/lib/sse'

interface StreamingAgent {
  name: string
  content: string
}

export default function GroupChatPage() {
  const params = useParams()
  const id = params.id as string

  const [chat, setChat] = useState<GroupChat | null>(null)
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingAgents, setStreamingAgents] = useState<StreamingAgent[]>([])

  useEffect(() => {
    Promise.all([
      api.groupChats.list().then((chats) => chats.find((c) => c.id === id) ?? null),
      api.groupChats.messages(id),
    ]).then(([foundChat, msgs]) => {
      setChat(foundChat)
      setMessages(
        msgs.map((m: GroupChatMessage) => ({
          id: m.id,
          senderName: m.senderName,
          senderRole: m.senderRole as 'user' | 'agent',
          content: m.content,
        }))
      )
    })
  }, [id])

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

    const agentBuffers: Record<string, string> = {}

    try {
      for await (const event of readSSE(`/api/groupchats/${id}/message`, {
        message: sentInput,
      })) {
        if (event.type === 'agent_start' && event.agentName) {
          agentBuffers[event.agentName] = ''
          setStreamingAgents((prev) => [...prev, { name: event.agentName!, content: '' }])
        } else if (event.delta && event.agentName) {
          agentBuffers[event.agentName] = (agentBuffers[event.agentName] ?? '') + event.delta
          const snapshot = { ...agentBuffers }
          setStreamingAgents(
            Object.entries(snapshot).map(([name, content]) => ({ name, content }))
          )
        } else if (event.type === 'agent_done' && event.agentName) {
          const finalContent = agentBuffers[event.agentName] ?? ''
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
          delete agentBuffers[event.agentName]
          setStreamingAgents((prev) => prev.filter((a) => a.name !== event.agentName))
        }
      }
    } finally {
      setStreamingAgents([])
      setStreaming(false)
    }
  }, [input, streaming, id])

  if (!chat) return <div className="p-8 text-white/30 text-sm">Loading...</div>

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-surface-border px-6 py-4 flex items-center gap-4">
        <Link
          href="/groupchats"
          className="text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          ←
        </Link>
        <div>
          <h1 className="font-medium text-white">{chat.name}</h1>
          <p className="text-xs text-white/40">
            {chat.members.filter((m) => m.type === 'agent').length} agents
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-[calc(100vh-65px)]">
          <GroupChatWindow
            messages={messages}
            streamingAgents={streamingAgents}
            isStreaming={streaming}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={handleSend}
          />
        </div>
      </div>
    </div>
  )
}
