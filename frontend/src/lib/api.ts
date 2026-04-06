const BASE = '/api'

/** Guard: if the server returns a wrapped object instead of an array, unwrap it. */
export function safeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['data', 'items', 'results', 'tasks', 'agents', 'widgets', 'messages', 'credentials', 'chats', 'members', 'activities']) {
      if (Array.isArray(d[key])) return d[key] as T[]
    }
  }
  return []
}

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
      fetch(`${BASE}/agents`).then((r) => r.json()).then((d) => safeArray<Agent>(d)),

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
      fetch(`${BASE}/agents/${id}/messages`).then((r) => r.json()).then((d) => safeArray<Message>(d)),

    files: (id: string): Promise<AgentFile[]> =>
      fetch(`${BASE}/agents/${id}/files`).then((r) => r.json()).then((d) => safeArray<AgentFile>(d)),

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
      fetch(`${BASE}/widgets`).then((r) => r.json()).then((d) => safeArray<Widget>(d)),

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
      fetch(`${BASE}/groupchats`).then((r) => r.json()).then((d) => safeArray<GroupChat>(d)),

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
      fetch(`${BASE}/groupchats/${id}/messages`).then((r) => r.json()).then((d) => safeArray<GroupChatMessage>(d)),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/groupchats/${id}`, { method: 'DELETE' }).then(() => undefined),

    removeMember: (chatId: string, memberId: string): Promise<void> =>
      fetch(`${BASE}/groupchats/${chatId}/members/${memberId}`, { method: 'DELETE' }).then(() => undefined),
  },

  credentials: {
    list: (): Promise<WebCredential[]> =>
      fetch(`${BASE}/credentials`).then((r) => r.json()).then((d) => safeArray<WebCredential>(d)),

    create: (data: { siteName: string; siteUrl: string; username: string; password: string }): Promise<WebCredential> =>
      fetch(`${BASE}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/credentials/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  automations: {
    list: (): Promise<AutomationListResponse> =>
      fetch(`${BASE}/automations`).then((r) => r.json()).then((d) => ({
        automations: safeArray<Automation>(d?.automations ?? d),
        runsToday: typeof d?.runsToday === 'number' ? d.runsToday : 0,
        dailyLimit: typeof d?.dailyLimit === 'number' ? d.dailyLimit : 3,
      })),

    create: (data: { agentId: string; name: string; goal: string; triggerType: string; cronExpr?: string }): Promise<Automation> =>
      fetch(`${BASE}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    toggle: (id: string): Promise<Automation> =>
      fetch(`${BASE}/automations/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()),

    run: (id: string): Promise<{ message?: string; error?: string; automationId?: string; runsToday?: number; dailyLimit?: number }> =>
      fetch(`${BASE}/automations/${id}/run`, { method: 'POST' }).then((r) => r.json()),

    runs: (id: string): Promise<AutomationRun[]> =>
      fetch(`${BASE}/automations/${id}/runs`).then((r) => r.json()).then((d) => safeArray<AutomationRun>(d)),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/automations/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  browse: {
    activity: (): Promise<BrowseActivity[]> =>
      fetch(`${BASE}/browse/activity`).then((r) => r.json()).then((d) => safeArray<BrowseActivity>(d)),
  },
}

export interface WebCredential {
  id: string
  siteName: string
  siteUrl: string
  username: string
  createdAt: string
}

export interface AutomationListResponse {
  automations: Automation[]
  runsToday: number
  dailyLimit: number
}

export interface Automation {
  id: string
  agentId: string
  agent: { id: string; name: string } | null
  name: string
  goal: string
  triggerType: string
  cronExpr: string | null
  active: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
  createdAt: string
}

export interface AutomationStep {
  tool: string
  input: Record<string, string>
  output: string
  status: 'success' | 'failed'
}

export interface AutomationRun {
  id: string
  automationId: string
  startedAt: string
  completedAt: string | null
  status: 'running' | 'success' | 'failed'
  steps: AutomationStep[]
  finalResult: string | null
}

export interface BrowseActivity {
  id: string
  agentName: string | null
  url: string
  domain: string
  summary: string | null
  createdAt: string
}
