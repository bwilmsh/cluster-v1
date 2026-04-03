const BASE = '/api'

export interface Agent {
  id: string
  name: string
  setupAnswers: Record<string, string> | null
  memory: string | null
  status: string
  createdAt: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface GroupChat {
  id: string
  name: string
  createdAt: string
  members: GroupChatMember[]
  messages?: Array<{ content: string; senderName: string; createdAt: string }>
}

export interface GroupChatMember {
  id: string
  agentId: string | null
  userId: string | null
  type: 'human' | 'agent'
  agent?: Agent | null
}

export interface GroupChatMessage {
  id: string
  senderName: string
  senderRole: string
  role: string
  content: string
  createdAt: string
}

export interface AgentFile {
  id: string
  fileName: string
  fileType: string
  createdAt: string
}

export type WidgetSize = 'sm' | 'md' | 'lg'
export type WidgetType = 'stat' | 'agents_grid' | 'activity_feed' | 'agent_memory' | 'text'

export interface Widget {
  id: string
  title: string
  type: WidgetType
  size: WidgetSize
  config: Record<string, any>
  data: any
  order: number
  lastUpdated: string | null
  createdAt: string
}

export const api = {
  agents: {
    list: (): Promise<Agent[]> =>
      fetch(`${BASE}/agents`).then((r) => r.json()),

    create: (name: string): Promise<Agent> =>
      fetch(`${BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then((r) => r.json()),

    update: (id: string, data: Partial<Pick<Agent, 'setupAnswers' | 'memory' | 'status'>>) =>
      fetch(`${BASE}/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/agents/${id}`, { method: 'DELETE' }).then(() => undefined),

    messages: (id: string): Promise<Message[]> =>
      fetch(`${BASE}/agents/${id}/messages`).then((r) => r.json()),

    files: (id: string): Promise<AgentFile[]> =>
      fetch(`${BASE}/agents/${id}/files`).then((r) => r.json()),

    uploadFile: (id: string, file: File): Promise<AgentFile> => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/agents/${id}/files`, { method: 'POST', body: form }).then((r) => r.json())
    },

    deleteFile: (agentId: string, fileId: string): Promise<void> =>
      fetch(`${BASE}/agents/${agentId}/files/${fileId}`, { method: 'DELETE' }).then(() => undefined),

    generateQuestions: (agentName: string) =>
      fetch(`${BASE}/agents/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName }),
      }).then((r) => r.json()),
  },

  widgets: {
    list: (): Promise<Widget[]> =>
      fetch(`${BASE}/widgets`).then((r) => r.json()),

    create: (data: { title: string; type: WidgetType; size?: WidgetSize; config?: Record<string, any> }): Promise<Widget> =>
      fetch(`${BASE}/widgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    reorder: (order: { id: string; order: number }[]): Promise<void> =>
      fetch(`${BASE}/widgets/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      }).then(() => undefined),

    update: (id: string, data: Partial<Pick<Widget, 'title' | 'size' | 'order'>>): Promise<Widget> =>
      fetch(`${BASE}/widgets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/widgets/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  groupChats: {
    list: (): Promise<GroupChat[]> =>
      fetch(`${BASE}/groupchats`).then((r) => r.json()),

    create: (name: string, agentIds: string[]): Promise<GroupChat> =>
      fetch(`${BASE}/groupchats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agentIds }),
      }).then((r) => r.json()),

    addMember: (id: string, member: { agentId?: string; userId?: string; type: string }) =>
      fetch(`${BASE}/groupchats/${id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(member),
      }).then((r) => r.json()),

    messages: (id: string): Promise<GroupChatMessage[]> =>
      fetch(`${BASE}/groupchats/${id}/messages`).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/groupchats/${id}`, { method: 'DELETE' }).then(() => undefined),

    removeMember: (chatId: string, memberId: string): Promise<void> =>
      fetch(`${BASE}/groupchats/${chatId}/members/${memberId}`, { method: 'DELETE' }).then(() => undefined),
  },

  credentials: {
    list: (): Promise<WebCredential[]> =>
      fetch(`${BASE}/credentials`).then((r) => r.json()),

    create: (data: { siteName: string; siteUrl: string; username: string; password: string }): Promise<WebCredential> =>
      fetch(`${BASE}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/credentials/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  scheduler: {
    list: (): Promise<ScheduledTask[]> =>
      fetch(`${BASE}/scheduler`).then((r) => r.json()),

    create: (data: { agentId: string; name: string; prompt: string; cronExpr: string }): Promise<ScheduledTask> =>
      fetch(`${BASE}/scheduler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    update: (id: string, data: Partial<{ enabled: boolean; cronExpr: string; prompt: string; name: string }>): Promise<ScheduledTask> =>
      fetch(`${BASE}/scheduler/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    runNow: (id: string): Promise<ScheduledTask> =>
      fetch(`${BASE}/scheduler/${id}/run`, { method: 'POST' }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/scheduler/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  browse: {
    activity: (): Promise<BrowseActivity[]> =>
      fetch(`${BASE}/browse/activity`).then((r) => r.json()),
  },
}

export interface WebCredential {
  id: string
  siteName: string
  siteUrl: string
  username: string
  createdAt: string
}

export interface ScheduledTask {
  id: string
  agentId: string
  agent: { id: string; name: string }
  name: string
  prompt: string
  cronExpr: string
  enabled: boolean
  lastRun: string | null
  nextRun: string | null
  lastResult: string | null
  createdAt: string
}

export interface BrowseActivity {
  id: string
  agentName: string | null
  url: string
  domain: string
  summary: string | null
  createdAt: string
}
