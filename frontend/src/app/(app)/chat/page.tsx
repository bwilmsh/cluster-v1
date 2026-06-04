'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, Agent } from '@/lib/api'
import { readSSE } from '@/lib/sse'

const AGENT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
]

function getColor(index: number) {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export default function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preferredAgentId = searchParams.get('agentId')

  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingAssistantMessageId, setStreamingAssistantMessageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const flushTimerRef = useRef<number | null>(null)
  const assistantTargetRef = useRef('')
  const FLUSH_MS = 100

  useEffect(() => {
    api.agents.list()
      .then((list) => {
        const data = Array.isArray(list) ? list : []
        setAgents(data)
        if (preferredAgentId) {
          const preferred = data.find((a) => a.id === preferredAgentId)
          if (preferred) {
            setSelectedAgent(preferred)
            return
          }
        }
        if (data.length > 0) setSelectedAgent(data[0])
      })
      .catch(() => setError('Could not load agents'))
  }, [preferredAgentId])

  useEffect(() => {
    if (!selectedAgent) {
      setMessages([])
      return
    }

    api.agents.messages(selectedAgent.id)
      .then((list) => {
        setMessages(
          list.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: new Date(message.createdAt).getTime(),
          }))
        )
      })
      .catch(() => setError('Could not load chat history'))
  }, [selectedAgent])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || !selectedAgent || loading) return

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }

    const assistantMessageId = `msg-${Date.now()}-assistant`

    setMessages((prev) => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      },
    ])
    setInput('')
    setLoading(true)
    setStreamingAssistantMessageId(assistantMessageId)
    setError(null)
    let assistantContent = ''

    try {
      assistantTargetRef.current = ''
      for await (const event of readSSE(`/api/agents/${selectedAgent.id}/chat`, { message: trimmed })) {
        if (event.delta) {
          assistantTargetRef.current += event.delta

          if (!flushTimerRef.current) {
            flushTimerRef.current = window.setInterval(() => {
              const current = assistantTargetRef.current
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMessageId
                    ? { ...message, content: current }
                    : message,
                )
              )
            }, FLUSH_MS)
          }
        }
      }

      if (!assistantTargetRef.current) {
        const fetched = await api.agents.messages(selectedAgent.id)
        const latestAssistant = [...fetched].reverse().find((message) => message.role === 'assistant')
        assistantTargetRef.current = latestAssistant?.content ?? ''
      }

      const refreshed = await api.agents.messages(selectedAgent.id)
      setMessages(
        refreshed.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: new Date(message.createdAt).getTime(),
        }))
      )
    } catch (err) {
      const fallback = assistantContent || 'Sorry, I encountered an error. Please try again.'
      const errorMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fallback,
        timestamp: Date.now(),
      }
      setMessages((prev) =>
        prev.some((message) => message.id === streamingAssistantMessageId)
          ? prev.map((message) =>
              message.id === streamingAssistantMessageId ? { ...message, content: fallback } : message,
            )
          : [...prev, errorMsg]
      )
      setError('The chat request failed to register on the server.')
    } finally {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current)
        flushTimerRef.current = null
      }
      const final = assistantTargetRef.current || assistantContent
      if (final) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId ? { ...message, content: final } : message,
          ),
        )
      }
      setLoading(false)
      setStreamingAssistantMessageId(null)
      assistantTargetRef.current = ''
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const agentIndex = selectedAgent ? agents.findIndex((a) => a.id === selectedAgent.id) : -1
  const selectedColor = agentIndex >= 0 ? getColor(agentIndex) : '#6366f1'

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      {error ? (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--danger)' }}>
          {error}
        </div>
      ) : null}
      {/* Messages Area */}
      {messages.length > 0 ? (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '8px',
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  wordWrap: 'break-word',
                }}
              >
                {msg.content}
                {loading && msg.id === streamingAssistantMessageId ? <span style={{ display: 'inline-block', marginLeft: 2, animation: 'clusterCaretBlink 1s steps(1,end) infinite' }}>▍</span> : null}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
        >
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <h1
              style={{
                fontSize: '24px',
                fontWeight: 700,
                margin: '0 0 6px 0',
                color: 'var(--text-primary)',
              }}
            >
              Cluster
            </h1>
            <p
              style={{
                fontSize: '16px',
                color: 'var(--text-tertiary)',
                margin: 0,
              }}
            >
              Life runs smoother with Cluster
            </p>
          </div>

          <h2
            style={{
              fontSize: '28px',
              fontWeight: 600,
              margin: '0 0 48px 0',
              textAlign: 'center',
              color: 'var(--text-primary)',
            }}
          >
            What's on your mind today?
          </h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              width: '100%',
              maxWidth: '700px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '12px',
                background: 'var(--bg-secondary)',
                borderRadius: '24px',
                padding: '12px 20px',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)', fontSize: '18px', lineHeight: '1' }}>+</span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything"
                rows={4}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  lineHeight: '1.5',
                  fontFamily: 'inherit',
                  maxHeight: '120px',
                }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <button
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Voice input"
                >
                  🎤
                </button>
                <button
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Send"
                  onClick={handleSend}
                >
                  ↗
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 150ms',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <span>📅</span> Manage calendar events
              </button>
              <button
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 150ms',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <span>✏️</span> Write or edit
              </button>
              <button
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 150ms',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <span>🔍</span> Look something up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}