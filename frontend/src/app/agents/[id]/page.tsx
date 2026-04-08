'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { api, Agent, AgentFile, Message } from '@/lib/api'
import { ChatWindow, ChatMessage } from '@/components/ChatWindow'
import { ComputerUsePanel } from '@/components/ComputerUsePanel'
import { LoadingDots } from '@/components/LoadingDots'
import { readSSE } from '@/lib/sse'

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
  const [uploading, setUploading] = useState(false)
  const [showComputerUse, setShowComputerUse] = useState(false)
  const streamingContentRef = useRef('')

  useEffect(() => {
    Promise.all([
      api.agents.list().then((agents) => agents.find((a) => a.id === id) ?? null),
      api.agents.messages(id),
      api.agents.files(id),
    ]).then(([foundAgent, msgs, agentFiles]) => {
      setAgent(foundAgent)
      setMessages(msgs.map((m: Message) => ({ id: m.id, role: m.role, content: m.content })))
      setFiles(agentFiles)
    })
  }, [id])

  const handleSend = useCallback(async () => {
    if (!input.trim() || streaming) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    const sentInput = input.trim()
    setInput('')
    setStreaming(true)
    setStreamingContent('')
    streamingContentRef.current = ''

    try {
      for await (const event of readSSE(`/api/agents/${id}/chat`, { message: sentInput })) {
        if (event.delta) {
          streamingContentRef.current += event.delta
          setStreamingContent(streamingContentRef.current)
        }
      }
    } finally {
      const content = streamingContentRef.current
      if (content) {
        setMessages((msgs) => [...msgs, { id: Date.now().toString() + '-a', role: 'assistant', content }])
      }
      setStreamingContent('')
      streamingContentRef.current = ''
      setStreaming(false)
    }
  }, [input, streaming, id])

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

  async function handleDeleteFile(fileId: string) {
    await api.agents.deleteFile(id, fileId)
    setFiles((prev) => prev.filter((f) => f.id !== fileId))
  }

  const role = (agent?.setupAnswers as Record<string, string> | null)?.['Business type / role'] ?? ''
  const isActive = agent?.status !== 'setting_up' && agent?.status !== 'offline'

  if (!agent) return (
    <div className="h-full flex flex-col">
      {/* Skeleton header */}
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-surface-border px-5 h-14 flex items-center gap-3">
        <Link href="/" className="text-white/30 hover:text-white/60 text-sm transition-colors shrink-0">
          ←
        </Link>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
          <div className="min-w-0">
            <p className="font-medium text-white text-sm leading-tight truncate">{agent.name}</p>
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
          <Link href="/integrations" className="text-xs text-white/30 hover:text-white/60 transition-colors">
            Integrations
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat */}
        <div className="flex-1 min-h-0">
          <ChatWindow
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={streaming}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            placeholder={`Message ${agent.name}...`}
            agentName={agent.name}
            onFileUpload={handleFileUpload}
            uploading={uploading}
          />
        </div>

        {/* Computer Use Panel */}
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

        {/* Files sidebar — only shown when files exist */}
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
