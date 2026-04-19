'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, Agent } from '@/lib/api'

const AGENT_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
]

const CHIPS = [
  'Summarise a document',
  'Draft an email',
  'Help me plan a campaign',
  '@mention an agent',
]

function getColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

export default function HomePage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [message, setMessage] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.agents
      .list()
      .then((list) => {
        const agents = Array.isArray(list) ? list : []
        setAgents(agents)
        if (agents.length > 0) setSelectedAgent(agents[0])
      })
      .catch(() => {})
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setMessage(val)
    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const m = before.match(/@(\w*)$/)
    setMentionQuery(m ? m[1] : null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setMentionQuery(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    const trimmed = message.trim()
    if (!trimmed || !selectedAgent) return
    // Store the initial message for the agent page to auto-send
    sessionStorage.setItem(`agent-init-${selectedAgent.id}`, trimmed)
    router.push(`/agents/${selectedAgent.id}`)
  }

  const handleMentionSelect = (agent: Agent) => {
    const ta = textareaRef.current
    const cursor = ta?.selectionStart ?? message.length
    const before = message.slice(0, cursor)
    const m = before.match(/@(\w*)$/)
    if (m) {
      const replaced = before.slice(0, before.length - m[0].length) + `@${agent.name} `
      setMessage(replaced + message.slice(cursor))
    }
    setMentionQuery(null)
    setSelectedAgent(agent)
    ta?.focus()
  }

  const agentIndex = selectedAgent ? agents.findIndex((a) => a.id === selectedAgent.id) : -1
  const selectedColor = agentIndex >= 0 ? getColor(agentIndex) : '#6366f1'

  const mentionAgents =
    mentionQuery !== null
      ? agents.filter((a) => a.name.toLowerCase().includes(mentionQuery.toLowerCase()))
      : []

  const canSend = message.trim().length > 0 && selectedAgent !== null

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        backgroundColor: 'var(--bg-primary)',
      }}
    >
      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '26px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            margin: '0 0 8px',
          }}
        >
          What can I help with?
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', margin: 0 }}>
          Chat with an agent or @mention one to get started
        </p>
      </div>

      {/* Input area */}
      <div style={{ width: '100%', maxWidth: '640px', position: 'relative' }}>
        {/* @mention autocomplete popup */}
        {mentionQuery !== null && mentionAgents.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 0,
              width: '240px',
              backgroundColor: 'var(--bg-secondary)',
              border: '0.5px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 50,
            }}
          >
            {mentionAgents.map((agent) => {
              const idx = agents.findIndex((a) => a.id === agent.id)
              return (
                <button
                  key={agent.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleMentionSelect(agent)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    width: '100%',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    border: 'none',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: getColor(idx),
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                  {agent.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Main input box */}
        <div
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '0.5px solid var(--border)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Message or @mention an agent..."
            rows={3}
            style={{
              width: '100%',
              background: 'transparent',
              resize: 'none',
              outline: 'none',
              border: 'none',
              color: 'var(--text-primary)',
              caretColor: 'var(--accent)',
              fontSize: '14px',
              lineHeight: '1.5',
              fontFamily: 'inherit',
            }}
          />

          {/* Bottom row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '8px',
            }}
          >
            {/* Agent picker */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: dropdownOpen ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!dropdownOpen) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!dropdownOpen) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: selectedColor,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    maxWidth: '140px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedAgent ? selectedAgent.name : 'Select an agent'}
                </span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 4L5 7L8 4"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 4px)',
                    left: 0,
                    minWidth: '200px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '0.5px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 50,
                  }}
                >
                  {agents.length === 0 ? (
                    <div
                      style={{ padding: '10px 12px', color: 'var(--text-tertiary)', fontSize: '13px' }}
                    >
                      No agents yet
                    </div>
                  ) : (
                    agents.map((agent, idx) => {
                      const isSelected = selectedAgent?.id === agent.id
                      return (
                        <button
                          key={agent.id}
                          onClick={() => {
                            setSelectedAgent(agent)
                            setDropdownOpen(false)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            padding: '8px 12px',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                            fontSize: '13px',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = isSelected
                              ? 'var(--bg-hover)'
                              : 'transparent')
                          }
                        >
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: getColor(idx),
                              flexShrink: 0,
                              display: 'inline-block',
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500 }}>{agent.name}</div>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent)',
                opacity: canSend ? 1 : 0.4,
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 11V3M7 3L4 6M7 3L10 6"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Suggestion chips */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginTop: '12px',
            justifyContent: 'center',
          }}
        >
          {CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => {
                setMessage(chip)
                textareaRef.current?.focus()
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '0.5px solid var(--border)',
                borderRadius: '20px',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
