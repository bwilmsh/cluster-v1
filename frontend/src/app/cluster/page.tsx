'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// Strip [WIDGET]...[/WIDGET] from displayed text
function stripWidgetSentinel(text: string): string {
  return text.replace(/\[WIDGET\][\s\S]*?\[\/WIDGET\]/g, '').trim()
}

export default function ClusterPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [widgetCreated, setWidgetCreated] = useState(false)
  const streamingRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingContent('')
    streamingRef.current = ''
    setWidgetCreated(false)

    try {
      const res = await fetch('/api/cluster/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.body) throw new Error('No body')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: widget_created')) {
            setWidgetCreated(true)
            continue
          }
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const data = JSON.parse(payload)
            if (data.delta) {
              streamingRef.current += data.delta
              setStreamingContent(streamingRef.current)
            }
          } catch { /* skip */ }
        }
      }

      const final = stripWidgetSentinel(streamingRef.current)
      setMessages((prev) => [...prev, { role: 'assistant', content: final }])
      setStreamingContent('')
      streamingRef.current = ''
    } catch (err) {
      console.error(err)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong.' }])
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const displayStreaming = stripWidgetSentinel(streamingContent)

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h1 className="text-white font-semibold">Cluster</h1>
          <p className="text-white/30 text-xs mt-0.5">Your workspace intelligence</p>
        </div>
        <div className="flex gap-3 items-center">
          {widgetCreated && (
            <Link
              href="/"
              className="text-xs text-green-400 border border-green-400/30 px-3 py-1 rounded-lg hover:bg-green-400/10 transition-colors"
            >
              Widget added — view dashboard
            </Link>
          )}
          <Link href="/" className="text-white/40 hover:text-white text-sm transition-colors">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.712-1.379 2.712H4.178c-1.408 0-2.379-1.712-1.379-2.712L4.2 15.3" />
              </svg>
            </div>
            <p className="text-white/40 text-sm">Ask Cluster anything about your workspace.</p>
            <p className="text-white/20 text-xs mt-1">Or ask it to build a dashboard widget.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-white/10 text-white'
                  : 'bg-transparent text-white/80'
              }`}
            >
              {m.role === 'assistant' && (
                <div className="text-xs text-white/30 font-medium mb-1 uppercase tracking-wide">Cluster</div>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-transparent text-white/80">
              <div className="text-xs text-white/30 font-medium mb-1 uppercase tracking-wide">Cluster</div>
              {displayStreaming ? (
                <p className="whitespace-pre-wrap">
                  {displayStreaming}
                  <span className="inline-block w-0.5 h-4 bg-white/40 ml-0.5 animate-pulse align-middle" />
                </p>
              ) : (
                <div className="flex gap-1 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-white/5">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Cluster anything…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 resize-none focus:outline-none focus:border-white/20 transition-colors disabled:opacity-50"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-white/15 text-xs mt-2 text-center">
          Ask Cluster to "build a widget showing active agents" to add it to your dashboard.
        </p>
      </div>
    </div>
  )
}
