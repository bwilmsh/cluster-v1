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
  agentName?: string
  onFileUpload?: (file: File) => void
  uploading?: boolean
}

const AGENT_COLORS = [
  'bg-violet-500/20 text-violet-300',
  'bg-blue-500/20 text-blue-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-amber-500/20 text-amber-300',
  'bg-rose-500/20 text-rose-300',
  'bg-cyan-500/20 text-cyan-300',
]

function getAgentColor(name: string): string {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AGENT_COLORS[hash % AGENT_COLORS.length]
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
}

export function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  inputValue,
  onInputChange,
  onSubmit,
  placeholder = 'Message...',
  agentName,
  onFileUpload,
  uploading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarColor = agentName ? getAgentColor(agentName) : AGENT_COLORS[0]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && onFileUpload) onFileUpload(file)
    if (e.target) e.target.value = ''
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} agentName={agentName} avatarColor={avatarColor} />
        ))}
        {isStreaming && !streamingContent && (
          <TypingIndicator agentName={agentName} avatarColor={avatarColor} />
        )}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{ id: 'streaming', role: 'assistant', content: streamingContent }}
            agentName={agentName}
            avatarColor={avatarColor}
            isStreaming
          />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-surface-border px-4 py-3">
        <div className="flex items-end gap-2">
          {onFileUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Upload CSV file"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-surface-border text-white/30 hover:text-white/60 hover:border-white/20 transition-colors disabled:opacity-40 mb-0.5"
              >
                {uploading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </>
          )}

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
            className="flex-1 bg-surface-raised border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25 resize-none transition-colors"
          />
          <button
            onClick={onSubmit}
            disabled={isStreaming || !inputValue.trim()}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors mb-0.5"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ agentName, avatarColor }: { agentName?: string; avatarColor: string }) {
  return (
    <div className="flex gap-2.5 items-end">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarColor}`}>
        {getInitials(agentName ?? 'AI')}
      </div>
      <div className="bg-surface-raised border border-surface-border rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  agentName,
  avatarColor,
  isStreaming,
}: {
  message: ChatMessage
  agentName?: string
  avatarColor: string
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm bg-accent text-white">
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5 items-end">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${avatarColor}`}>
        {getInitials(agentName ?? 'AI')}
      </div>
      <div className="max-w-[72%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-surface-raised border border-surface-border text-white/90">
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
