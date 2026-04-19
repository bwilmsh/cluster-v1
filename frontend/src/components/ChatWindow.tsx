'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

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
  automationMode?: boolean
  onAutomationModeChange?: (active: boolean) => void
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

type LocationCardData = {
  title: string
  query: string
  subtitle?: string
  address?: string
  mapsUrl?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanQuery(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .trim()
}

function extractLocationData(content: string): LocationCardData | null {
  const text = content.trim()
  if (!text) return null

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const joined = lines.join(' ')
  const lowerJoined = joined.toLowerCase()

  const googleMapsUrlMatch = joined.match(/https?:\/\/(?:www\.)?google\.[^\s/]+\/maps[^\s)\]]*/i)
  const googleMapsUrl = googleMapsUrlMatch?.[0]

  const looksLikeToolResult = /\btool result\b|\bgoogle maps\b|\bmaps tool\b|\blocation card\b/i.test(joined)

  const streetSuffix = '(?:Street|St\\.?|Avenue|Ave\\.?|Road|Rd\\.?|Boulevard|Blvd\\.?|Lane|Ln\\.?|Drive|Dr\\.?|Court|Ct\\.?|Place|Pl\\.?|Way|Square|Sq\\.?|Trail|Trl\\.?|Terrace|Ter\\.?)'
  const cityStateZip = '(?:,?\s+[A-Za-z][A-Za-z .\'-]+)?(?:,?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?)?'

  const explicitAddressPatterns = [
    new RegExp(`(?:^|\\n)\\s*(?:address|location|located at)\\s*[:\\-]\\s*(\\d{1,6}\\s+[A-Za-z0-9.'\\-\\s]+${streetSuffix}[^\\n]*)`, 'i'),
    new RegExp(`(?:^|\\n)\\s*(\\d{1,6}\\s+[A-Za-z0-9.'\\-\\s]+${streetSuffix}${cityStateZip})`, 'i'),
  ]

  let address: string | undefined
  for (const pattern of explicitAddressPatterns) {
    const match = joined.match(pattern)
    if (match?.[1] || match?.[0]) {
      address = cleanQuery((match[1] ?? match[0]).replace(/^(located at|address[:\-]?|location[:\-]?|at)\s+/i, ''))
      break
    }
  }

  const restaurantPatterns = [
    /\b(?:restaurant|cafe|café|bar|bistro|diner|pizzeria|grill|steakhouse|tavern|eatery|brunch spot|bakery)\b/i,
    /\b(?:best|top|popular|recommended)\s+(?:restaurant|cafe|café|bar|bistro|diner|pizzeria|grill)\b/i,
    /\b(?:mexican|italian|thai|indian|japanese|korean|chinese|sushi|tacos?|food)\b/i,
  ]
  const looksLikeRestaurant = restaurantPatterns.some((pattern) => pattern.test(joined))

  const hasConcreteVenueDetails = [
    /\b(?:hours?|open(?:ing)? hours?|phone|call|reservations?|menu|website|www\.)\b/i,
    new RegExp(`\\b${streetSuffix}\\b`, 'i'),
  ].some((pattern) => pattern.test(joined))

  const hasLocalRecommendationIntent = [
    /\b(?:best|top|great|popular|recommended)\b/i,
    /\b(?:near me|nearby|in the area|around here|close by|local|near you)\b/i,
  ].every((pattern) => pattern.test(joined))

  if (!googleMapsUrl && !address && !(looksLikeRestaurant && (hasConcreteVenueDetails || hasLocalRecommendationIntent)) && !looksLikeToolResult) return null

  const titleLine = lines[0] ?? 'Location'
  const title = titleLine.length > 64 ? titleLine.slice(0, 61).trimEnd() + '…' : titleLine

  const venueLine = lines.find((line) => /\b(?:restaurant|cafe|café|bar|bistro|diner|pizzeria|grill|steakhouse|tavern|eatery|brunch spot|bakery)\b/i.test(line))
  const query = cleanQuery(address ?? venueLine ?? text)

  return {
    title: googleMapsUrl ? 'Google Maps Place' : title,
    query,
    address,
    mapsUrl: googleMapsUrl,
    subtitle: address ? 'Address found in message' : 'Restaurant details found in message',
  }
}

function LocationCard({ data }: { data: LocationCardData }) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const [resolvedCoords, setResolvedCoords] = useState<{ lat: string; lon: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    if (data.mapsUrl) {
      setResolvedCoords(null)
      return () => {
        cancelled = true
      }
    }

    const query = data.address?.trim() || data.query.trim()
    if (!query) {
      setResolvedCoords(null)
      return () => {
        cancelled = true
      }
    }

    const controller = new AbortController()

    async function resolveCoordinates() {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
            },
          }
        )
        if (!response.ok) return
        const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>
        const first = payload?.[0]
        if (!first?.lat || !first?.lon) return
        if (!cancelled) {
          setResolvedCoords({ lat: first.lat, lon: first.lon })
        }
      } catch {
        // Silent fallback to query-based maps link.
      }
    }

    resolveCoordinates()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [data.address, data.mapsUrl, data.query])

  const mapsSearchUrl = useMemo(() => {
    if (data.mapsUrl) return data.mapsUrl
    if (resolvedCoords) return `https://www.google.com/maps?q=${resolvedCoords.lat},${resolvedCoords.lon}`
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.query)}`
  }, [data.mapsUrl, data.query, resolvedCoords])

  const mapsEmbedUrl = useMemo(() => {
    if (googleMapsApiKey) {
      const exactQuery = resolvedCoords
        ? `${resolvedCoords.lat},${resolvedCoords.lon}`
        : (data.address?.trim() || data.query)
      return `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(googleMapsApiKey)}&q=${encodeURIComponent(exactQuery)}`
    }
    if (resolvedCoords) return `https://www.google.com/maps?q=${resolvedCoords.lat},${resolvedCoords.lon}&z=16&output=embed`
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.query)}&output=embed`
  }, [data.address, data.query, googleMapsApiKey, resolvedCoords])

  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-white/10 bg-[#11151f] shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-white/5">
      <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-slate-900 via-zinc-900 to-stone-950">
        <iframe
          title={`Google Maps preview for ${data.title}`}
          src={mapsEmbedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/80 backdrop-blur-md">
          Specific location
        </div>
      </div>

      <div className="px-4 py-4 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_42%),linear-gradient(180deg,rgba(17,21,31,0.96),rgba(10,12,18,0.98))]">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Tool Result
          <span className="text-emerald-100/80">Google Maps</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-white/80 shadow-inner shadow-black/20">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-4.35 6-10a6 6 0 10-12 0c0 5.65 6 10 6 10z" />
              <circle cx="12" cy="11" r="2.5" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{data.title}</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45">
                Google Maps
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-white/55">{data.subtitle}</p>
            {data.address ? (
              <p className="mt-2 text-sm leading-6 text-white/80">{data.address}</p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <a
                href={mapsSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5"
              >
                Open in Maps
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11.25 3.5a.75.75 0 0 1 .75-.75h4.25A.75.75 0 0 1 17 3.5v4.25a.75.75 0 0 1-1.5 0V5.31l-7.22 7.22a.75.75 0 1 1-1.06-1.06l7.22-7.22h-2.44a.75.75 0 0 1-.75-.75Z" />
                  <path d="M5 5.75A1.75 1.75 0 0 1 6.75 4h2a.75.75 0 0 1 0 1.5h-2a.25.25 0 0 0-.25.25v7.75c0 .138.112.25.25.25h7.75a.25.25 0 0 0 .25-.25v-2a.75.75 0 0 1 1.5 0v2A1.75 1.75 0 0 1 14.75 15.5H6.75A1.75 1.75 0 0 1 5 13.75v-8Z" />
                </svg>
              </a>
              <span className="text-[11px] text-white/35">Preview powered by Google Maps</span>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-white/30">
              {googleMapsApiKey
                ? 'Connected to Google Maps Embed API.'
                : (resolvedCoords || data.mapsUrl
                  ? 'Linked to a specific place on Google Maps.'
                  : 'Resolving exact place link. If needed, open in Maps for the full page.')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
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
  automationMode,
  onAutomationModeChange,
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
        {automationMode && (
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
        )}
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

/** Lightweight inline markdown → React nodes. Handles the patterns the agent uses. */
function renderMarkdown(text: string, cursor?: boolean): React.ReactNode {
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []

  function inlineFormat(line: string, key: string): React.ReactNode {
    // **bold**, *italic*, `code`
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
    if (parts.length === 1) return line
    return (
      <span key={key}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
          if (part.startsWith('*') && part.endsWith('*'))
            return <em key={i} className="italic">{part.slice(1, -1)}</em>
          if (part.startsWith('`') && part.endsWith('`'))
            return <code key={i} className="bg-white/10 rounded px-1 py-0.5 text-xs font-mono">{part.slice(1, -1)}</code>
          return part
        })}
      </span>
    )
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // H2/H3 headers
    if (trimmed.startsWith('### ')) {
      nodes.push(<p key={i} className="font-semibold text-white/80 text-xs uppercase tracking-wide mt-3 mb-1">{trimmed.slice(4)}</p>)
    } else if (trimmed.startsWith('## ')) {
      nodes.push(<p key={i} className="font-semibold text-white mt-3 mb-1">{trimmed.slice(3)}</p>)
    } else if (trimmed.startsWith('# ')) {
      nodes.push(<p key={i} className="font-semibold text-white text-base mt-2 mb-1">{trimmed.slice(2)}</p>)
    // Bullet/dash list items
    } else if (/^[-*•]\s/.test(trimmed)) {
      nodes.push(
        <div key={i} className="flex gap-2 leading-relaxed">
          <span className="text-white/30 shrink-0 mt-px">·</span>
          <span>{inlineFormat(trimmed.replace(/^[-*•]\s/, ''), `${i}t`)}</span>
        </div>
      )
    // Numbered list
    } else if (/^\d+\.\s/.test(trimmed)) {
      const num = trimmed.match(/^(\d+)\./)?.[1]
      nodes.push(
        <div key={i} className="flex gap-2 leading-relaxed">
          <span className="text-white/40 shrink-0 tabular-nums w-4 text-right">{num}.</span>
          <span>{inlineFormat(trimmed.replace(/^\d+\.\s/, ''), `${i}t`)}</span>
        </div>
      )
    // Horizontal rule
    } else if (/^---+$/.test(trimmed)) {
      nodes.push(<hr key={i} className="border-white/10 my-2" />)
    // Empty line — spacing
    } else if (trimmed === '') {
      if (i > 0 && lines[i - 1].trim() !== '') nodes.push(<div key={i} className="h-2" />)
    // Normal paragraph line
    } else {
      nodes.push(<p key={i} className="leading-relaxed">{inlineFormat(line, `${i}t`)}</p>)
    }
    i++
  }

  return (
    <>
      {nodes}
      {cursor && <span className="inline-block w-1 h-3.5 bg-white/50 ml-0.5 animate-pulse align-middle" />}
    </>
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
  const locationData = !isUser ? extractLocationData(message.content) : null

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
      <div className="max-w-[72%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-surface-raised border border-surface-border text-white/90 space-y-0">
        {locationData ? (
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
            Tool
            <span className="text-white/80">Google Maps</span>
          </div>
        ) : null}
        {renderMarkdown(message.content, isStreaming)}
        {locationData ? <LocationCard data={locationData} /> : null}
      </div>
    </div>
  )
}
