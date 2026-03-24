'use client'

import { useEffect, useRef } from 'react'

export interface GroupMessage {
  id: string
  senderName: string
  senderRole: 'user' | 'agent'
  content: string
}

interface StreamingAgent {
  name: string
  content: string
}

interface Props {
  messages: GroupMessage[]
  streamingAgents: StreamingAgent[]
  isStreaming: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
}

const AGENT_COLORS = [
  'text-violet-400',
  'text-blue-400',
  'text-emerald-400',
  'text-amber-400',
  'text-rose-400',
]

const agentColorCache: Record<string, string> = {}
function getAgentColor(name: string): string {
  if (!agentColorCache[name]) {
    const i = Object.keys(agentColorCache).length % AGENT_COLORS.length
    agentColorCache[name] = AGENT_COLORS[i]
  }
  return agentColorCache[name]
}

export function GroupChatWindow({
  messages,
  streamingAgents,
  isStreaming,
  inputValue,
  onInputChange,
  onSubmit,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingAgents])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                msg.senderRole === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface-raised border border-surface-border text-white/90'
              }`}
            >
              {msg.senderRole === 'agent' && (
                <p className={`text-xs font-medium mb-1 ${getAgentColor(msg.senderName)}`}>
                  {msg.senderName}
                </p>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {streamingAgents.map((sa) => (
          <div key={sa.name} className="flex justify-start">
            <div className="max-w-[75%] rounded-xl px-4 py-2.5 text-sm bg-surface-raised border border-surface-border text-white/90">
              <p className={`text-xs font-medium mb-1 ${getAgentColor(sa.name)}`}>{sa.name}</p>
              <p className="whitespace-pre-wrap leading-relaxed">
                {sa.content || <span className="text-white/30 italic">thinking...</span>}
                <span className="inline-block w-1 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />
              </p>
            </div>
          </div>
        ))}

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
            placeholder="Message the group..."
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
