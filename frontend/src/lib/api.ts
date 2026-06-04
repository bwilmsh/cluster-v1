const BASE = '/api'

/** Guard: if the server returns a wrapped object instead of an array, unwrap it. */
export function safeArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['data', 'items', 'results', 'tasks', 'agents', 'widgets', 'messages', 'credentials', 'chats', 'members', 'activities', 'goals', 'scheduledEmails']) {
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

export interface Goal {
  id: string
  user_id: string | null
  goal_text: string
  deadline: string | null
  is_active: boolean
  visible_agent_ids: string[]
  created_at: string
  updated_at: string
}

export interface GoalPlanTask {
  title: string
  due_date: string | null
  priority: string | null
  status: string | null
  note: string | null
}

export interface GoalPlanCalendarBlock {
  title: string
  start_time: string | null
  end_time: string | null
  note: string | null
}

export interface GoalPlanResponse {
  success: boolean
  reply: string
  check_in_prompt: string
  schedule_summary: string
  tasks: GoalPlanTask[]
  calendar_blocks: GoalPlanCalendarBlock[]
}

export type DueDatePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type DueDateStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE'
export type DueDateCategory = 'ASSIGNMENT' | 'EXAM' | 'WORK' | 'PERSONAL'

export interface DueDateItem {
  id: string
  title: string
  description: string | null
  dueDate: string
  dueTime: string
  dueAt: string
  priority: DueDatePriority
  status: DueDateStatus
  category: DueDateCategory
  createdAt: string
}

export interface AutoRunConfig {
  id: string
  eventId?: string | null
  goalId?: string | null
  enabled: boolean
  actionType: 'sendEmail' | 'createCalendarEvent' | 'markTaskComplete' | 'sendNotification'
  config: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface DueDatesResponse {
  data: DueDateItem[]
  warning?: string
}

export interface ScheduledEmail {
  id: string
  userId: string
  to: string
  subject: string
  body: string
  sendAt: string
  status: 'scheduled' | 'sending' | 'sent' | 'failed'
  sentAt: string | null
  gmailMessageId: string | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface GoogleIntegrationStatus {
  connected: boolean
  integration: {
    provider: string
    accountEmail?: string | null
    accountName?: string | null
    expiresAt?: string | null
  } | null
}

export const api = {
  agents: {
    list: (): Promise<Agent[]> =>
      fetch(`${BASE}/agents`).then((r) => r.json()).then((d) => safeArray<Agent>(d)),

    create: async (name: string): Promise<Agent> => {
      const r = await fetch(`${BASE}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`Create agent failed (${r.status}): ${text || r.statusText}`)
      }
      return r.json()
    },

    update: async (id: string, data: Partial<Pick<Agent, 'setupAnswers' | 'memory' | 'status'>>) => {
      const r = await fetch(`${BASE}/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        throw new Error(`Update agent failed (${r.status}): ${text || r.statusText}`)
      }
      return r.json()
    },

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/agents/${id}`, { method: 'DELETE' }).then(() => undefined),

    messages: (id: string): Promise<Message[]> => {
      console.log('[API] Fetching messages for agent:', id)
      return fetch(`${BASE}/agents/${id}/messages`)
        .then((r) => {
          console.log('[API] Messages response status:', r.status)
          return r.json()
        })
        .then((d) => {
          const msgs = safeArray<Message>(d)
          console.log('[API] Received', msgs.length, 'messages:', msgs.map((m) => ({ role: m.role, len: m.content.length })))
          return msgs
        })
        .catch((err) => {
          console.error('[API] Failed to fetch messages:', err)
          throw err
        })
    },

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
        dailyLimit: typeof d?.dailyLimit === 'number' ? d.dailyLimit : 10,
      })),

    create: (data: {
      agentId: string
      goal: string
      name?: string
      schedule?: string
      deliveryType?: string
      deliveryTarget?: string
    }): Promise<Automation> =>
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

    admin: {
      pending: (): Promise<AutomationTemplate[]> =>
        fetch(`${BASE}/automations/admin/pending`).then((r) => r.json()).then((d) => safeArray<AutomationTemplate>(d)),

      approve: (id: string): Promise<AutomationTemplate> =>
        fetch(`${BASE}/automations/admin/${id}/approve`, { method: 'PATCH' }).then((r) => r.json()),

      reject: (id: string): Promise<void> =>
        fetch(`${BASE}/automations/admin/${id}`, { method: 'DELETE' }).then(() => undefined),
    },
  },

  browse: {
    activity: (): Promise<BrowseActivity[]> =>
      fetch(`${BASE}/browse/activity`).then((r) => r.json()).then((d) => safeArray<BrowseActivity>(d)),
  },

  goals: {
    list: (limit = 10): Promise<Goal[]> =>
      fetch(`${BASE}/goals?limit=${encodeURIComponent(String(limit))}`)
        .then((r) => r.json())
        .then((d) => safeArray<Goal>(d)),

    get: (id: string): Promise<Goal> =>
      fetch(`${BASE}/goals/${encodeURIComponent(id)}`)
        .then(async (r) => {
          const data = await r.json().catch(() => ({}))
          if (!r.ok) {
            throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to load goal')
          }
          return data
        })
        .then((d) => {
          if (d && typeof d === 'object' && 'data' in d) {
            return (d as { data: Goal }).data
          }
          return d as Goal
        }),

    create: (goalText: string, deadline?: string | null, visibleAgentIds: string[] = []): Promise<{ success: boolean; created: Goal }> =>
      fetch(`${BASE}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_text: goalText, deadline: deadline ?? null, visible_agent_ids: visibleAgentIds }),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to create goal')
        }
        return data
      }),

    update: (id: string, updates: { goal_text?: string; deadline?: string | null }): Promise<{ success: boolean; goal: Goal }> =>
      fetch(`${BASE}/goals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to update goal')
        }
        return data
      }),

    plan: (id: string, payload: { message: string; history?: Array<{ role: string; content: string }> }): Promise<GoalPlanResponse> =>
      fetch(`${BASE}/goals/${encodeURIComponent(id)}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to plan goal')
        }
        return data as GoalPlanResponse
      }),

    current: (): Promise<Goal | null> =>
      fetch(`${BASE}/goals/current`)
        .then((r) => {
          if (!r.ok) return r.json().then((d) => Promise.reject(new Error(typeof d?.details === 'string' ? d.details : d?.error ?? 'Failed to load current goal')))
          return r.json()
        })
        .then((d) => {
          if (d && typeof d === 'object' && 'data' in d) {
            const data = (d as { data?: Goal | null }).data
            return data ?? null
          }
          return null
        }),

    setCurrent: (goalText: string, visibleAgentIds: string[] = [], userId?: number): Promise<{ success: boolean; created: Goal }> =>
      fetch(`${BASE}/goals/current`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_text: goalText, visible_agent_ids: visibleAgentIds, user_id: userId ?? null }),
      }).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to create goal')
        }
        return data
      }),

    clearCurrent: (): Promise<{ success: boolean; cleared: number }> =>
      fetch(`${BASE}/goals/current`, { method: 'DELETE' }).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to clear goal')
        }
        return data
      }),
  },

  dueDates: {
    list: (): Promise<DueDatesResponse> =>
      fetch(`${BASE}/due-dates`).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to load due dates')
        }
        return {
          data: safeArray<DueDateItem>(data),
          warning: typeof data?.warning === 'string' ? data.warning : undefined,
        }
      }),

    create: async (data: { title: string; description?: string | null; dueDate: string; dueTime: string; priority: DueDatePriority; category: DueDateCategory }): Promise<DueDateItem> => {
      const r = await fetch(`${BASE}/due-dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.description ?? null,
          dueDate: data.dueDate,
          dueTime: data.dueTime,
          priority: data.priority,
          category: data.category,
        }),
      })

      const payload = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to create due date')
      }

      return payload as DueDateItem
    },

    update: async (id: string, data: Partial<Omit<DueDateItem, 'id' | 'createdAt' | 'dueAt'>> & { dueDate?: string }): Promise<DueDateItem> => {
      const r = await fetch(`${BASE}/due-dates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const payload = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to update due date')
      }

      return payload as DueDateItem
    },

    complete: async (id: string): Promise<void> => {
      const r = await fetch(`${BASE}/due-dates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })

      const payload = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to complete due date')
      }
    },

    delete: async (id: string): Promise<void> => {
      const r = await fetch(`${BASE}/due-dates/${id}`, {
        method: 'DELETE',
      })

      const payload = await r.json().catch(() => ({}))
      if (!r.ok && r.status !== 204) {
        throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to delete due date')
      }
    },

    getAutoRun: async (itemId: string): Promise<AutoRunConfig> => {
      const r = await fetch(`${BASE}/due-dates/${itemId}/auto-run`)
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to load auto run config')
      }
      return data
    },

    setAutoRun: async (itemId: string, itemType: 'task' | 'goal', enabled: boolean, actionType: string, config: Record<string, any> = {}): Promise<AutoRunConfig> => {
      const r = await fetch(`${BASE}/due-dates/${itemId}/auto-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType, enabled, actionType, config }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to save auto run config')
      }
      return data
    },

    deleteAutoRun: async (itemId: string): Promise<{ success: boolean; deletedCount: number }> => {
      const r = await fetch(`${BASE}/due-dates/${itemId}/auto-run`, { method: 'DELETE' })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to delete auto run config')
      }
      return data
    },
  },

  scheduledEmails: {
    list: (): Promise<ScheduledEmail[]> =>
      fetch(`${BASE}/scheduled-emails`).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to load scheduled emails')
        }
        return safeArray<ScheduledEmail>(data)
      }),

    create: (data: { to: string; subject: string; body: string; sendAt: string }): Promise<ScheduledEmail> =>
      fetch(`${BASE}/scheduled-emails`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const payload = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to save scheduled email')
        }
        return payload as ScheduledEmail
      }),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/scheduled-emails/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(async (r) => {
        if (!r.ok && r.status !== 204) {
          const payload = await r.json().catch(() => ({}))
          throw new Error(typeof payload?.details === 'string' ? payload.details : payload?.error ?? 'Failed to delete scheduled email')
        }
      }),
  },

  oauth: {
    googleStatus: (): Promise<GoogleIntegrationStatus> =>
      fetch(`${BASE}/oauth/google/status`).then(async (r) => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          throw new Error(typeof data?.details === 'string' ? data.details : data?.error ?? 'Failed to load Google status')
        }
        return {
          connected: Boolean(data?.connected),
          integration: data?.integration ?? null,
        }
      }),
  },

  ap: {
    status: (): Promise<APStatus> =>
      fetch(`${BASE}/activepieces/status`).then((r) => r.json()),

    flows: (): Promise<APFlow[]> =>
      fetch(`${BASE}/activepieces/flows`)
        .then((r) => r.json())
        .then((d: APFlowsResponse | { error: string }) => {
          if ('error' in d) return []
          return d.data ?? []
        }),

    toggle: (id: string): Promise<APFlow> =>
      fetch(`${BASE}/activepieces/flows/${id}/toggle`, { method: 'POST' }).then((r) => r.json()),

    run: (id: string): Promise<APRun | { error: string }> =>
      fetch(`${BASE}/activepieces/flows/${id}/run`, { method: 'POST' }).then((r) => r.json()),

    runs: (id: string): Promise<APRun[]> =>
      fetch(`${BASE}/activepieces/flows/${id}/runs`)
        .then((r) => r.json())
        .then((d: { data: APRun[] } | { error: string }) => {
          if ('error' in d) return []
          return d.data ?? []
        }),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/activepieces/flows/${id}`, { method: 'DELETE' }).then(() => undefined),
  },

  workflows: {
    list: (): Promise<Workflow[]> =>
      fetch(`${BASE}/workflows`).then((r) => r.json()).then((d) => safeArray<Workflow>(d)),

    get: (id: string): Promise<Workflow> =>
      fetch(`${BASE}/workflows/${id}`).then((r) => r.json()),

    create: (data: {
      name: string
      description?: string
      nodes: WorkflowNode[]
      edges: WorkflowEdge[]
      status?: string
    }): Promise<Workflow> =>
      fetch(`${BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    update: (id: string, data: Partial<{
      name: string
      description: string
      nodes: WorkflowNode[]
      edges: WorkflowEdge[]
      status: string
    }>): Promise<Workflow> =>
      fetch(`${BASE}/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),

    delete: (id: string): Promise<void> =>
      fetch(`${BASE}/workflows/${id}`, { method: 'DELETE' }).then(() => undefined),

    run: (id: string): Promise<{ message: string }> =>
      fetch(`${BASE}/workflows/${id}/run`, { method: 'POST' }).then((r) => r.json()),

    runs: (id: string): Promise<WorkflowRun[]> =>
      fetch(`${BASE}/workflows/${id}/runs`).then((r) => r.json()).then((d) => safeArray<WorkflowRun>(d)),
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

export interface AutomationTemplateVariable {
  key: string
  label: string
  type: 'select' | 'text' | 'number'
  options?: string[]
  default?: string | number
  required?: boolean
  placeholder?: string
}

export interface AutomationTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  isOfficial: boolean
  isApproved: boolean
  createdAt: string
  definition: {
    requires: string[]
    variables: AutomationTemplateVariable[]
    steps: any[]
    delivery_options: string[]
    estimated_duration: string
    ai_recovery: boolean
  }
}

export interface Automation {
  id: string
  agentId: string
  agent: { id: string; name: string } | null
  name: string
  goal: string | null
  schedule: string | null
  active: boolean
  deliveryType: string
  deliveryTarget: string | null
  lastRunAt: string | null
  lastRunStatus: string | null
  lastRunResult: string | null
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
  status: 'running' | 'success' | 'failed' | 'skipped'
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

// ─── Workflow types ────────────────────────────────────────────────────────────

export type WorkflowNodeType =
  | 'trigger'
  | 'check'
  | 'action'
  | 'notify'
  | 'decision'
  | 'memory_read'
  | 'memory_write'

export interface WorkflowNodeData {
  label: string
  capability?: string | null
  parameters?: Record<string, unknown>
}

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  position: { x: number; y: number }
  data: WorkflowNodeData
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string
}

export interface Workflow {
  id: string
  userId: string
  name: string
  description: string | null
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  status: 'draft' | 'active' | 'paused'
  lastRunAt: string | null
  lastRunStatus: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkflowRun {
  id: string
  workflowId: string
  startedAt: string
  completedAt: string | null
  status: 'running' | 'success' | 'failed'
  result: string | null
}

// ─── Activepieces types ───────────────────────────────────────────────────────

export interface APStatus {
  configured: boolean
  reason?: 'no_credentials' | 'unreachable'
  detail?: string
  projectId?: string
}

export interface APFlow {
  id: string
  displayName: string
  status: 'ENABLED' | 'DISABLED'
  publishedVersionId: string | null
  created: string
  updated: string
}

export interface APFlowsResponse {
  data: APFlow[]
  next: string | null
  previous: string | null
}

export interface APRun {
  id: string
  flowId: string
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'INTERNAL_ERROR' | 'STOPPED' | 'SKIPPED'
  startTime: string
  finishTime: string | null
  logsFileId: string | null
}
