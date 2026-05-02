'use client'

import React, { useEffect, useRef } from 'react'

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

function getPalette(name: string) {
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length]
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

function TypingDots({ dim = false }: { dim?: boolean }) {
  const dotClass = dim ? 'bg-white/30' : 'bg-white/40'
  return (
    <div className="flex gap-1 items-center py-0.5">
      <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dotClass}`} style={{ animationDelay: '0ms' }} />
      <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dotClass}`} style={{ animationDelay: '150ms' }} />
      <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${dotClass}`} style={{ animationDelay: '300ms' }} />
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
    <div className="flex h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Message feed */}
        <div
          className="flex-1 overflow-y-auto p-6 space-y-4"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {isStreaming && streamingAgents.length === 0 && (
            <div className="flex gap-3 justify-start">
              <div
                className="w-8 h-8 rounded-full border flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent-muted)',
                  borderColor: 'var(--accent)',
                }}
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  AI
                </span>
              </div>
              <div
                className="max-w-[70%] rounded-lg px-4 py-3 text-sm border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <p
                  className="text-xs mb-2 font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Thinking...
                </p>
                <TypingDots />
              </div>
            </div>
          )}

          {streamingAgents.map((sa) => (
            <div key={sa.name} className="flex gap-3 justify-start">
              <Avatar name={sa.name} />
              <div
                className="max-w-[70%] rounded-lg px-4 py-3 text-sm border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                }}
              >
                <p className={`text-xs font-semibold mb-2 ${getPalette(sa.name).text}`}>
                  {sa.name}
                </p>
                {sa.content ? (
                  <div className="leading-relaxed text-sm">
                    {renderAgentContent(sa.content, true)}
                  </div>
                ) : (
                  <TypingDots />
                )}
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="border-t p-5"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border)',
          }}
        >
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
              className="flex-1 rounded-lg px-4 py-3 text-sm focus:outline-none resize-none transition-all"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={onSubmit}
              disabled={isStreaming || !inputValue.trim()}
              className="px-6 py-3 rounded-lg text-white text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
              style={{
                backgroundColor: isStreaming || !inputValue.trim() ? 'var(--accent-muted)' : 'var(--accent)',
              }}
              onMouseOver={(e) => !isStreaming && inputValue.trim() && (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div
        className="w-56 shrink-0 border-l flex flex-col"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <div
          className="px-6 h-14 flex items-center border-b"
          style={{
            borderColor: 'var(--border)',
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Members
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* Human (always you) */}
          <div
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
            style={{ backgroundColor: 'var(--accent-muted)' }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 font-semibold"
              style={{
                backgroundColor: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: 'var(--bg-primary)',
              }}
            >
              Y
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                You
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Human
              </p>
            </div>
          </div>

          {/* Agent members */}
          {members.filter((m) => m.type === 'agent').map((member) => {
            const isTyping = typingNames.includes(member.name)
            const p = getPalette(member.name)
            return (
              <div
                key={member.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isTyping ? 'border' : ''
                }`}
                style={{
                  backgroundColor: isTyping ? 'var(--bg-tertiary)' : 'transparent',
                  borderColor: isTyping ? 'var(--border-strong)' : 'transparent',
                }}
              >
                <Avatar name={member.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm font-medium truncate leading-tight ${isTyping ? p.text : ''}`}
                      style={{ color: isTyping ? undefined : 'var(--text-primary)' }}
                    >
                      {member.name}
                    </p>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isTyping ? 'animate-pulse' : ''}`}
                      style={{
                        backgroundColor: isTyping ? 'var(--success)' : 'var(--success)',
                        opacity: isTyping ? 1 : 0.5,
                      }}
                    />
                  </div>
                  {isTyping ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <p
                        className="text-[10px]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        typing
                      </p>
                      <TypingDots dim />
                    </div>
                  ) : member.role ? (
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {member.role}
                    </p>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div
          className="p-4 border-t shrink-0"
          style={{
            borderColor: 'var(--border)',
          }}
        >
          <button
            onClick={onAddMember}
            className="w-full text-xs font-medium rounded-lg py-2.5 transition-all duration-200 border hover:-translate-y-0.5"
            style={{
              backgroundColor: 'var(--accent-muted)',
              borderColor: 'var(--border)',
              color: 'var(--accent)',
            }}
          >
            + Add Agent
          </button>
        </div>
      </div>
    </div>
  )
}

function renderWithMentions(content: string): React.ReactNode[] {
  return content.split(/(@\w+)/g).map((part, i) =>
    /^@\w+$/.test(part) ? (
      <span key={i} className="text-violet-300 font-medium">{part}</span>
    ) : (
      part
    )
  )
}

function renderAgentContent(text: string, cursor?: boolean): React.ReactNode {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  function fmt(line: string, key: string): React.ReactNode {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    if (parts.length === 1) return renderWithMentions(line)
    return (
      <span key={key}>
        {parts.map((p, i) => {
          if (p.startsWith('**') && p.endsWith('**'))
            return <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>
          if (p.startsWith('`') && p.endsWith('`'))
            return <code key={i} className="rounded px-1 text-xs font-mono" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}>{p.slice(1, -1)}</code>
          return renderWithMentions(p)
        })}
      </span>
    )
  }

  lines.forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('## ') || t.startsWith('### ')) {
      nodes.push(<p key={i} className="font-semibold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>{t.replace(/^#+\s/, '')}</p>)
    } else if (/^[-*•]\s/.test(t)) {
      nodes.push(
        <div key={i} className="flex gap-2">
          <span style={{ color: 'var(--text-tertiary)' }} className="shrink-0">·</span>
          <span>{fmt(t.replace(/^[-*•]\s/, ''), `${i}t`)}</span>
        </div>
      )
    } else if (t === '') {
      if (i > 0 && lines[i - 1].trim() !== '') nodes.push(<div key={i} className="h-1.5" />)
    } else {
      nodes.push(<p key={i} className="leading-relaxed" style={{ color: 'var(--text-primary)' }}>{fmt(line, `${i}t`)}</p>)
    }
  })

  return (
    <>
      {nodes}
      {cursor && <span className="inline-block w-1 h-3.5 ml-0.5 animate-pulse align-middle" style={{ backgroundColor: 'var(--text-primary)' }} />}
    </>
  )
}

function MessageRow({ msg }: { msg: GroupMessage }) {
  if (msg.senderRole === 'handoff') {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
        <span className="text-[11px] shrink-0 px-2 py-1 rounded" style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
          {msg.senderName} → @{msg.content}
        </span>
        <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
      </div>
    )
  }

  if (msg.senderRole === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[70%] rounded-lg px-5 py-3 text-sm"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg-primary)',
          }}
        >
          <p className="whitespace-pre-wrap leading-relaxed font-medium">{msg.content}</p>
        </div>
      </div>
    )
  }

  const p = getPalette(msg.senderName)
  return (
    <div className="flex gap-3 justify-start">
      <Avatar name={msg.senderName} />
      <div
        className="max-w-[70%] rounded-lg px-4 py-3 text-sm border"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
        }}
      >
        <p className={`text-xs font-semibold mb-2 ${p.text}`}>{msg.senderName}</p>
        <div style={{ color: 'var(--text-primary)' }}>{renderAgentContent(msg.content)}</div>
      </div>
    </div>
  )
}
