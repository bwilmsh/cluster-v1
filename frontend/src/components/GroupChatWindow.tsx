'use client'

import { useEffect, useRef } from 'react'

export interface GroupMessage {
  id: string
  senderName: string
  senderRole: 'user' | 'agent' | 'handoff'
  content: string
}

export interface GroupMember {
  id: string
  name: string
  type: 'human' | 'agent'
  role?: string
}

interface StreamingAgent {
  name: string
  content: string
}

interface Props {
  members: GroupMember[]
  messages: GroupMessage[]
  streamingAgents: StreamingAgent[]
  isStreaming: boolean
  inputValue: string
  onInputChange: (v: string) => void
  onSubmit: () => void
  onAddMember: () => void
}

const AVATAR_PALETTES = [
  { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/40' },
  { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/40' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/40' },
  { bg: 'bg-rose-500/20', text: 'text-rose-300', border: 'border-rose-500/40' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/40' },
]

const paletteCache: Record<string, (typeof AVATAR_PALETTES)[0]> = {}

function getPalette(name: string) {
  if (!paletteCache[name]) {
    const i = Object.keys(paletteCache).length % AVATAR_PALETTES.length
    paletteCache[name] = AVATAR_PALETTES[i]
  }
  return paletteCache[name]
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const p = getPalette(name)
  const sz = size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
  return (
    <div
      className={`${sz} rounded-full border ${p.bg} ${p.text} ${p.border} flex items-center justify-center font-semibold shrink-0`}
    >
      {initials(name)}
    </div>
  )
}

export function GroupChatWindow({
  members,
  messages,
  streamingAgents,
  isStreaming,
  inputValue,
  onInputChange,
  onSubmit,
  onAddMember,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingNames = streamingAgents.map((a) => a.name)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingAgents])

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Message feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {streamingAgents.map((sa) => (
            <div key={sa.name} className="flex gap-2.5 justify-start">
              <Avatar name={sa.name} />
              <div className="max-w-[70%] rounded-xl px-4 py-2.5 text-sm bg-surface-raised border border-surface-border text-white/90">
                <p className={`text-xs font-semibold mb-1 ${getPalette(sa.name).text}`}>
                  {sa.name}
                </p>
                {sa.content ? (
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {sa.content}
                    <span className="inline-block w-1 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />
                  </p>
                ) : (
                  <div className="flex gap-1 items-center py-0.5">
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
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
              placeholder="Message the team..."
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

      {/* Sidebar */}
      <div className="w-48 shrink-0 border-l border-surface-border flex flex-col">
        <div className="px-4 h-12 flex items-center border-b border-surface-border">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Members</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {/* Human (always you) */}
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <span className="text-[10px] text-white/50 font-semibold">Y</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white/60 truncate">You</p>
              <p className="text-[10px] text-white/25">Human</p>
            </div>
          </div>

          {/* Agent members */}
          {members.filter((m) => m.type === 'agent').map((member) => {
            const isTyping = typingNames.includes(member.name)
            const p = getPalette(member.name)
            return (
              <div
                key={member.id}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-colors ${
                  isTyping ? 'bg-white/5' : ''
                }`}
              >
                <Avatar name={member.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm truncate leading-tight ${isTyping ? p.text : 'text-white/70'}`}>
                      {member.name}
                    </p>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isTyping ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/60'}`} />
                  </div>
                  {member.role ? (
                    <p className="text-[10px] text-white/25 truncate">{member.role}</p>
                  ) : isTyping ? (
                    <p className="text-[10px] text-white/30">thinking...</p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-3 border-t border-surface-border shrink-0">
          <button
            onClick={onAddMember}
            className="w-full text-xs text-white/35 hover:text-white/60 border border-surface-border hover:border-white/20 rounded-lg py-2 transition-colors"
          >
            + Add Agent
          </button>
        </div>
      </div>
    </div>
  )
}

function renderWithMentions(content: string) {
  return content.split(/(@\w+)/g).map((part, i) =>
    /^@\w+$/.test(part) ? (
      <span key={i} className="text-violet-300 font-medium">{part}</span>
    ) : (
      part
    )
  )
}

function MessageRow({ msg }: { msg: GroupMessage }) {
  if (msg.senderRole === 'handoff') {
    return (
      <div className="flex items-center gap-2 py-0.5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[11px] text-white/25 shrink-0 px-1">
          {msg.senderName} → @{msg.content}
        </span>
        <div className="flex-1 h-px bg-white/10" />
      </div>
    )
  }

  if (msg.senderRole === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-xl px-4 py-2.5 text-sm bg-accent text-white">
          <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
        </div>
      </div>
    )
  }

  const p = getPalette(msg.senderName)
  return (
    <div className="flex gap-2.5 justify-start">
      <Avatar name={msg.senderName} />
      <div className="max-w-[70%] rounded-xl px-4 py-2.5 text-sm bg-surface-raised border border-surface-border text-white/90">
        <p className={`text-xs font-semibold mb-1 ${p.text}`}>{msg.senderName}</p>
        <p className="whitespace-pre-wrap leading-relaxed">{renderWithMentions(msg.content)}</p>
      </div>
    </div>
  )
}
