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
}

export interface GroupChatMember {
  id: string
  agentId: string | null
  userId: string | null
  type: 'human' | 'agent'
  agent?: Agent
}

export interface GroupChatMessage {
  id: string
  senderName: string
  senderRole: string
  role: string
  content: string
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

    generateQuestions: (agentName: string) =>
      fetch(`${BASE}/agents/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentName }),
      }).then((r) => r.json()),
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
  },
}
