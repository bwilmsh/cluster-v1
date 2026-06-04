'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api, Agent, AgentFile, Message } from '@/lib/api'
import { ChatWindow, ChatMessage } from '@/components/ChatWindow'
import { ComputerUsePanel } from '@/components/ComputerUsePanel'
import { LoadingDots } from '@/components/LoadingDots'
import { readSSE } from '@/lib/sse'
import Link from 'next/link'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

export default function AgentChatPage() {
  const params = useParams()
  const id = params.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [files, setFiles] = useState<AgentFile[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showComputerUse, setShowComputerUse] = useState(false)
  const [automationMode, setAutomationMode] = useState(false)
  const [loadingAgent, setLoadingAgent] = useState(true)
  const streamingContentRef = useRef('')
  const flushTimerRef = useRef<number | null>(null)
  const streamingTargetRef = useRef('')
  const FLUSH_MS = 100
  const autoSendPending = useRef<string | null>(null)

  // Core send function — accepts text directly, does not read from input state
  const sendText = useCallback(async (text: string, options?: { skipLocalEcho?: boolean }) => {
    console.log('[CHAT] sendText called with:', { text, skipLocalEcho: options?.skipLocalEcho, streaming })
    if (!text.trim() || streaming) {
      console.log('[CHAT] Aborting: empty text or already streaming')
      return
    }
    const assistantMsgId = `${Date.now().toString()}-stream`
    if (!options?.skipLocalEcho) {
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text.trim() }
      console.log('[CHAT] Adding user message to UI:', userMsg)
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantMsgId, role: 'assistant', content: '' },
      ])
    } else {
      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }])
    }
    setStreamingMessageId(assistantMsgId)
    setStreaming(true)
    setStreamingContent('')
    streamingContentRef.current = ''
    try {
      console.log('[CHAT] Starting SSE stream to /api/agents/' + id + '/chat')
      streamingTargetRef.current = ''
      for await (const event of readSSE(`/api/agents/${id}/chat`, { message: text.trim() })) {
        if (event.delta) {
          console.log('[CHAT] Received delta:', event.delta)
          streamingTargetRef.current += event.delta

          if (!flushTimerRef.current) {
            flushTimerRef.current = window.setInterval(() => {
              const current = streamingTargetRef.current
              setStreamingContent(current)
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMsgId ? { ...message, content: current } : message,
                ),
              )
            }, FLUSH_MS)
          }
        }
      }
      console.log('[CHAT] SSE stream ended')
    } catch (err) {
      console.error('[CHAT] SSE stream error:', err)
    } finally {
        if (flushTimerRef.current) {
          clearInterval(flushTimerRef.current)
          flushTimerRef.current = null
        }
        const content = streamingTargetRef.current || streamingContentRef.current
        console.log('[CHAT] Stream finished with content length:', content.length)
        if (content) {
          console.log('[CHAT] Adding assistant message to UI')
          setMessages((msgs) =>
            msgs.some((message) => message.id === assistantMsgId)
              ? msgs.map((message) => (message.id === assistantMsgId ? { ...message, content } : message))
              : [...msgs, { id: Date.now().toString() + '-a', role: 'assistant' as const, content }]
          )
        } else {
          console.log('[CHAT] No streamed content, fetching messages from API')
          try {
            const msgs = await api.agents.messages(id)
            console.log('[CHAT] Fetched messages from API:', msgs.length)
            const fetchedMessages = msgs.map((m: Message) => ({ id: m.id, role: m.role, content: m.content }))
            setMessages((prev) => {
              if (prev.length === 0) return fetchedMessages

              const merged = [...prev]
              for (const m of fetchedMessages) {
                const alreadyPresent = merged.some(
                  (x) => x.id === m.id || (x.role === m.role && x.content === m.content)
                )
                if (!alreadyPresent) merged.push(m)
              }
              console.log('[CHAT] Merged messages count:', merged.length)
              return merged
            })
          } catch (err) {
            console.error('[CHAT] Failed to fetch messages:', err)
          }
        }
        setStreamingContent('')
        streamingContentRef.current = ''
        streamingTargetRef.current = ''
        setStreamingMessageId(null)
        setStreaming(false)
    }
  }, [streaming, id])

  const handleSend = useCallback(async () => {
    console.log('[CHAT] handleSend called, input:', input.trim())
    const text = input.trim()
    if (!text) {
      console.log('[CHAT] handleSend: empty input')
      return
    }
    console.log('[CHAT] Clearing input and calling sendText')
    setInput('')
    await sendText(text)
  }, [input, sendText])

  useEffect(() => {
    // Grab any initial message stored by the home page before loading
    const key = `agent-init-${id}`
    const initMsg = sessionStorage.getItem(key)
    if (initMsg) {
      autoSendPending.current = initMsg
      const trimmedInit = initMsg.trim()
      if (trimmedInit) {
        setMessages((prev) => {
          const exists = prev.some((m) => m.role === 'user' && m.content === trimmedInit)
          if (exists) return prev
          return [...prev, { id: `init-${Date.now()}`, role: 'user', content: trimmedInit }]
        })
      }
    }

    let cancelled = false

    setLoadingAgent(true)
    api.agents.list()
      .then((agents) => {
        if (cancelled) return
        setAgent(agents.find((a) => a.id === id) ?? null)
      })
      .finally(() => {
        if (!cancelled) setLoadingAgent(false)
      })

    api.agents.messages(id)
      .then((msgs) => {
        if (cancelled) return
        const fetchedMessages = msgs.map((m: Message) => ({ id: m.id, role: m.role, content: m.content }))
        setMessages((prev) => {
          if (prev.length === 0) return fetchedMessages

          const merged = [...fetchedMessages]
          for (const existing of prev) {
            const alreadyPresent = merged.some(
              (m) => m.id === existing.id || (m.role === existing.role && m.content === existing.content)
            )
            if (!alreadyPresent) merged.push(existing)
          }
          return merged
        })
      })
      .catch(() => {})

    api.agents.files(id)
      .then((agentFiles) => {
        if (!cancelled) setFiles(agentFiles)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [id])

  // Fire auto-send once agent data is loaded
  useEffect(() => {
    if (agent && autoSendPending.current) {
      const text = autoSendPending.current
      autoSendPending.current = null
      sessionStorage.removeItem(`agent-init-${id}`)
      sendText(text, { skipLocalEcho: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, id])

  async function handleFileUpload(file: File) {
    setUploading(true)
    try {
      const uploaded = await api.agents.uploadFile(id, file)
      setFiles((prev) => [uploaded, ...prev])
    } catch {
      // silent fail
    } finally {
      setUploading(false)
    }
  }

  function handleAutomationModeChange(active: boolean) {
    setAutomationMode(active)
    if (active) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '-mode',
          role: 'assistant',
          content: "**Automation Builder activated.**\n\nI can build Cluster-native workflows or connect third-party services (Gmail, Slack, Notion).\n\nWhat do you want to automate?",
        },
      ])
    }
  }

  async function handleDeleteFile(fileId: string) {
    await api.agents.deleteFile(id, fileId)
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const role =
    (agent?.setupAnswers as Record<string, string> | null)?.['Personality selection']
    ?? (agent?.setupAnswers as Record<string, string> | null)?.['Business type / role']
    ?? ''
  const isActive = agent?.status !== 'setting_up' && agent?.status !== 'offline'

  if (loadingAgent && !agent) return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-surface-border px-5 h-14 flex items-center gap-3">
        <div className="w-6 h-4 bg-white/5 rounded animate-pulse" />
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-white/10 animate-pulse" />
          <div className="w-32 h-4 bg-white/5 rounded animate-pulse" />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <LoadingDots />
      </div>
    </div>
  )

  if (!agent) return (
    <div className="h-full flex items-center justify-center px-6 text-sm text-white/60">
      Agent not found.
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div
        className="shrink-0 px-5 h-14 flex items-center gap-3"
        style={{
          borderBottom: '0.5px solid var(--border)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
        }}
      >
        <Link href="/" className="text-white/30 hover:text-white/60 text-sm transition-colors shrink-0">
          ←
        </Link>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              backgroundColor: isActive ? '#34d399' : 'rgba(255,255,255,0.2)',
              boxShadow: isActive ? '0 0 6px rgba(52,211,153,0.5)' : 'none',
            }}
          />
          <div className="min-w-0">
            <p className="font-medium text-sm leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{agent.name}</p>
            {role && <p className="text-[11px] text-white/35 truncate">{role}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isElectron && (
            <button
              onClick={() => setShowComputerUse(true)}
              className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
              </svg>
              Screen Control
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0">
          <ChatWindow
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={streaming}
            streamingMessageId={streamingMessageId}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            placeholder={automationMode ? 'Describe what you want to automate...' : `Message ${agent.name}...`}
            agentName={agent.name}
            onFileUpload={handleFileUpload}
            uploading={uploading}
            automationMode={automationMode}
            onAutomationModeChange={handleAutomationModeChange}
            helperText="Tell me what you want to achieve and I’ll turn it into a goal, then ask how you want to achieve it."
          />
        </div>

        {showComputerUse && (
          <ComputerUsePanel
            agentName={agent.name}
            onResult={(result) => {
              setMessages((prev) => [
                ...prev,
                { id: Date.now().toString() + '-cu', role: 'assistant', content: `[Computer Control Result]\n\n${result}` },
              ])
              setShowComputerUse(false)
            }}
            onClose={() => setShowComputerUse(false)}
          />
        )}

        {files.length > 0 && (
          <div className="w-48 shrink-0 border-l border-surface-border flex flex-col">
            <div className="p-3 border-b border-surface-border">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Files</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {files.map((f) => (
                <div key={f.id} className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <span className="text-white/30 text-xs shrink-0">📄</span>
                  <span className="text-xs text-white/50 truncate flex-1">{f.fileName}</span>
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    className="text-white/20 hover:text-white/50 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
