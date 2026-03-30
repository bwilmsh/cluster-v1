'use client'

import { Widget } from '@/lib/api'

function StatWidget({ data }: { data: { value: number; label: string } }) {
  return (
    <div className="flex flex-col justify-center h-full">
      <div className="text-4xl font-bold text-white">{data?.value ?? '—'}</div>
      <div className="text-white/40 text-sm mt-1">{data?.label}</div>
    </div>
  )
}

function AgentsGridWidget({ data }: { data: { agents: { id: string; name: string; status: string }[] } }) {
  const agents = data?.agents ?? []
  return (
    <div className="space-y-2 overflow-auto max-h-full">
      {agents.length === 0 && <p className="text-white/30 text-sm">No agents yet</p>}
      {agents.map((a) => (
        <div key={a.id} className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.status === 'active' ? 'bg-green-400' : 'bg-white/20'}`} />
          <span className="text-white/80 text-sm truncate">{a.name}</span>
          <span className="text-white/30 text-xs ml-auto">{a.status}</span>
        </div>
      ))}
    </div>
  )
}

function ActivityFeedWidget({ data }: { data: { messages: { id: string; agentName: string; role: string; content: string; createdAt: string }[] } }) {
  const messages = data?.messages ?? []
  return (
    <div className="space-y-3 overflow-auto max-h-full">
      {messages.length === 0 && <p className="text-white/30 text-sm">No messages yet</p>}
      {messages.map((m) => (
        <div key={m.id} className="border-b border-white/5 pb-2 last:border-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-white/60 text-xs font-medium">{m.agentName}</span>
            <span className="text-white/20 text-xs">·</span>
            <span className="text-white/30 text-xs">{m.role}</span>
          </div>
          <p className="text-white/70 text-xs leading-relaxed line-clamp-2">{m.content}</p>
        </div>
      ))}
    </div>
  )
}

function AgentMemoryWidget({ data }: { data: { name: string; memory: string } }) {
  return (
    <div className="overflow-auto max-h-full">
      <div className="text-white/40 text-xs mb-2">{data?.name}</div>
      <pre className="text-white/70 text-xs whitespace-pre-wrap font-sans leading-relaxed">
        {data?.memory || 'No memory yet.'}
      </pre>
    </div>
  )
}

function TextWidget({ data }: { data: { content: string } }) {
  return (
    <div className="overflow-auto max-h-full">
      <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{data?.content}</p>
    </div>
  )
}

interface WidgetRendererProps {
  widget: Widget
}

export function WidgetRenderer({ widget }: WidgetRendererProps) {
  switch (widget.type) {
    case 'stat':
      return <StatWidget data={widget.data} />
    case 'agents_grid':
      return <AgentsGridWidget data={widget.data} />
    case 'activity_feed':
      return <ActivityFeedWidget data={widget.data} />
    case 'agent_memory':
      return <AgentMemoryWidget data={widget.data} />
    case 'text':
      return <TextWidget data={widget.data} />
    default:
      return <p className="text-white/30 text-sm">Unknown widget type</p>
  }
}
