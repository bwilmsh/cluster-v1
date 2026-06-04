const GROQ_CHAT_MODEL = process.env.GROQ_DEFAULT_MODEL || 'llama-3.1-8b-instant'

type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type HabitScheduleEvent = {
  title: string | null
  start_time: string
  end_time: string | null
  description?: string | null
  itemType?: string | null
}

export type GroqHabitSuggestion = {
  startTime: string
  reason: string
}

export type DailyBriefTask = {
  title: string
  status?: string | null
  start_time: string
  end_time?: string | null
}

export type DailyBriefEvent = {
  title: string
  start_time: string
  end_time?: string | null
  itemType?: string | null
}

function getGroqApiKey() {
  const key = process.env.GROQ_API_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

function parseGroqSuggestion(content: string): GroqHabitSuggestion | null {
  const text = String(content ?? '').trim()
  if (!text) return null

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { startTime?: unknown; reason?: unknown }
      const startTime = String(parsed.startTime ?? '').trim()
      const reason = String(parsed.reason ?? '').trim()
      if (/^\d{2}:\d{2}$/.test(startTime) && reason) {
        return { startTime, reason }
      }
    } catch {
      // fall through
    }
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return null

  const firstLine = lines[0]
  const match = firstLine.match(/^(\d{2}:\d{2})(?:\s*[-–:|]\s*(.*))?$/)
  if (!match) return null

  const startTime = match[1]
  const inlineReason = match[2]?.trim() ?? ''
  const reason = inlineReason || lines.slice(1).join(' ').trim()
  if (!reason) return null

  return { startTime, reason }
}

async function runGroqChat(messages: GroqChatMessage[], temperature = 0.2) {
  const apiKey = getGroqApiKey()
  if (!apiKey) return null

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_CHAT_MODEL,
      temperature,
      messages,
    }),
  })

  if (!response.ok) return null

  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null } }>
  } | null

  return payload?.choices?.[0]?.message?.content?.trim() || null
}

export async function generateDailyBriefing(input: {
  tasks: DailyBriefTask[]
  events: DailyBriefEvent[]
}): Promise<string | null> {
  const hasApiKey = getGroqApiKey()
  if (!hasApiKey) return null

  const compactTasks = input.tasks.slice(0, 15).map((task) => ({
    title: task.title,
    status: task.status ?? 'todo',
    start_time: task.start_time,
    end_time: task.end_time ?? null,
  }))
  const compactEvents = input.events.slice(0, 15).map((event) => ({
    title: event.title,
    itemType: event.itemType ?? 'event',
    start_time: event.start_time,
    end_time: event.end_time ?? null,
  }))

  const systemPrompt =
    'You are Cluster AI. Write exactly one concise sentence (max 22 words) as a practical daily briefing. Be direct, neutral, and useful. No emojis. No markdown. No greeting.'
  const userPrompt = `Today task context: ${JSON.stringify(compactTasks)}. Today event context: ${JSON.stringify(compactEvents)}. Output exactly one sentence summary with no extra commentary.`

  const content = await runGroqChat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  if (!content) return null
  const singleLine = content.replace(/\s+/g, ' ').trim()
  if (!singleLine) return null
  return singleLine
}

export async function suggestHabitSlot(input: {
  habitName: string
  durationMinutes: number
  habitNote?: string | null
  events: HabitScheduleEvent[]
}): Promise<GroqHabitSuggestion | null> {
  const systemPrompt =
    'You are Cluster, an AI habit scheduler. Return only JSON with startTime in HH:MM format and a short reason sentence. Keep the reason crisp, practical, and free of filler.'
  const habitNote = input.habitNote?.trim()
  const noteLine = habitNote ? `AI note from the user: ${habitNote}.` : ''
  const userPrompt = `You are Cluster. The user has a habit called ${input.habitName} that takes ${input.durationMinutes} minutes. ${noteLine} Here are their calendar events for today: ${JSON.stringify(input.events)}. Find the best available time slot between 6am and 10pm that does not conflict with any existing event, and write the reason as a single natural sentence. Respond with JSON only in this shape: {"startTime":"HH:MM","reason":"short note"}.`

  const content = await runGroqChat([
    { role: 'system', content: systemPrompt } satisfies GroqChatMessage,
    { role: 'user', content: userPrompt } satisfies GroqChatMessage,
  ])
  if (!content) return null

  return parseGroqSuggestion(content)
}
