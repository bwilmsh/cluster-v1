'use client'

import { useEffect, useRef } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  senderName?: string
}

interface Props {
  messages: ChatMessage[]
  streamingContent?: string
  isStreaming: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
}

export function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  inputValue,
  onInputChange,
  onSubmit,
  placeholder = 'Message...',
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && streamingContent !== undefined && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
            }}
            isStreaming
          />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-surface-border p-4">
        <div className="flex gap-3">
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!isStreaming && inputValue.trim()) onSubmit()
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-surface-raised border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 resize-none"
          />
          <button
            onClick={onSubmit}
            disabled={isStreaming || !inputValue.trim()}
            className="px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-accent text-white'
            : 'bg-surface-raised border border-surface-border text-white/90'
        }`}
      >
        {message.senderName && !isUser && (
          <p className="text-xs text-white/40 mb-1 font-medium">{message.senderName}</p>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />
          )}
        </p>
      </div>
    </div>
  )
}
