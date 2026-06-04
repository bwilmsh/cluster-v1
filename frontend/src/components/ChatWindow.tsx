'use client'

import React, { useEffect, useRef, useState } from 'react'

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
  streamingMessageId?: string | null
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
  agentName?: string
  onFileUpload?: (file: File) => void
  uploading?: boolean
  automationMode?: boolean
  onAutomationModeChange?: (active: boolean) => void
  helperText?: string
}

const AGENT_COLORS = [
  'text-violet-400',
  'text-blue-400',
  'text-emerald-400',
  'text-amber-400',
  'text-rose-400',
  'text-cyan-400',
  'text-fuchsia-400',
  'text-lime-400',
]

const agentColorCache: Record<string, string> = {}

function getAgentColor(name: string): string {
  if (!agentColorCache[name]) {
    const index = Object.keys(agentColorCache).length % AGENT_COLORS.length
    agentColorCache[name] = AGENT_COLORS[index]
  }

  return agentColorCache[name]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
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
  const [visibleContent, setVisibleContent] = useState(message.content)
  const targetRef = useRef(message.content)
  const visibleRef = useRef(message.content)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (isUser) return

    targetRef.current = message.content

    if (!isStreaming) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      visibleRef.current = message.content
      setVisibleContent(message.content)
      return
    }

    if (timerRef.current) return

    timerRef.current = window.setInterval(() => {
      const target = targetRef.current
      const current = visibleRef.current

      if (current.length >= target.length) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        return
      }

      const nextLength = Math.min(current.length + 1, target.length)
      const nextValue = target.slice(0, nextLength)
      visibleRef.current = nextValue
      setVisibleContent(nextValue)

      if (nextLength >= target.length && timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }, 70)

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isStreaming, isUser, message.content])

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
          {visibleContent}
          {isStreaming ? (
            <span className="inline-block w-1 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />
          ) : null}
        </p>
      </div>
    </div>
  )
}

export function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  streamingMessageId,
  inputValue,
  onInputChange,
  onSubmit,
  placeholder = 'Message...',
  agentName,
  onFileUpload,
  uploading,
  automationMode,
  onAutomationModeChange,
  helperText,
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
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            agentName={agentName}
            avatarColor={avatarColor}
            isStreaming={isStreaming && msg.role === 'assistant' && msg.id === streamingMessageId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-surface-border px-4 py-3">
        {helperText ? <p className="mb-2 text-[11px] text-white/35">{helperText}</p> : null}
        {automationMode ? (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-500/25 text-violet-300 text-xs font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Automation Builder
            </div>
            <button
              onClick={() => onAutomationModeChange?.(false)}
              className="text-white/25 hover:text-white/50 text-xs transition-colors"
              title="Exit automation mode"
            >
              ✕
            </button>
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          {onFileUpload ? (
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
          ) : null}

          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (inputValue.trim() === '/automation') {
                  onInputChange('')
                  onAutomationModeChange?.(true)
                } else if (!isStreaming && inputValue.trim()) {
                  onSubmit()
                }
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
