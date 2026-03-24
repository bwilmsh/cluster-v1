'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, Agent, Message } from '@/lib/api'
import { ChatWindow, ChatMessage } from '@/components/ChatWindow'
import { readSSE } from '@/lib/sse'

export default function AgentChatPage() {
  const params = useParams()
  const id = params.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')

  useEffect(() => {
    Promise.all([
      api.agents.list().then((agents) => agents.find((a) => a.id === id) ?? null),
      api.agents.messages(id),
    ]).then(([foundAgent, msgs]) => {
      setAgent(foundAgent)
      setMessages(
        msgs.map((m: Message) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      )
    })
  }, [id])

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    const sentInput = input.trim()
    setInput('')
    setStreaming(true)
    setStreamingContent('')

    try {
      for await (const event of readSSE(`/api/agents/${id}/chat`, { message: sentInput })) {
        if (event.delta) {
          setStreamingContent((prev) => prev + event.delta)
        }
      }
    } finally {
      setStreamingContent((prev) => {
        if (prev) {
          setMessages((msgs) => [
            ...msgs,
            { id: Date.now().toString() + '-a', role: 'assistant', content: prev },
          ])
        }
        return ''
      })
      setStreaming(false)
    }
  }, [input, streaming, id])

  if (!agent) return <div className="p-8 text-white/30 text-sm">Loading...</div>

  return (
    <div className="min-h-screen flex flex-col">
      <div className="border-b border-surface-border px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-white/40 hover:text-white/70 text-sm transition-colors">
          ←
        </Link>
        <div>
          <h1 className="font-medium text-white">{agent.name}</h1>
          <p className="text-xs text-white/40">
            {agent.status === 'active' ? 'Active' : agent.status}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-[calc(100vh-65px)]">
          <ChatWindow
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={streaming}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            placeholder={`Message ${agent.name}...`}
          />
        </div>
      </div>
    </div>
  )
}
