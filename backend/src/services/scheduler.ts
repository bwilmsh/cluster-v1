import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'

function getPythonUrl() {
  return process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
}

// Active cron jobs keyed by task id
const activeJobs = new Map<string, cron.ScheduledTask>()

// ─── Run a task ───────────────────────────────────────────────────────────────

export async function runTask(taskId: string): Promise<void> {
  let task: any
  try {
    task = await prisma.scheduledTask.findUnique({
      where: { id: taskId },
      include: { agent: true },
    })
  } catch {
    return
  }

  if (!task || !task.active) return
  if (!task.agent) return

  // Build the message: prepend website URL if provided
  const message = task.websiteUrl
    ? `Visit ${task.websiteUrl} and ${task.description}`
    : task.description

  // Mark last run time immediately
  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { lastRunAt: new Date() },
  })

  // Call Python agent service and collect streamed result
  let result = ''
  try {
    const resp = await fetch(`${getPythonUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: task.agent.name,
        agent_id: task.agent.id,
        setup_answers: task.agent.setupAnswers ?? {},
        memory: task.agent.memory ?? '',
        history: [],
        message,
        integrations: {},
        files: [],
      }),
    })

    const reader = resp.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim()
            if (payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload)
                if (parsed.delta) result += parsed.delta
              } catch {
                // skip malformed
              }
            }
          }
        }
      }
    }
  } catch (err) {
    result = `Error: ${(err as Error).message}`
  }

  // Save result
  try {
    await prisma.scheduledTask.update({
      where: { id: taskId },
      data: { lastRunResult: result.slice(0, 2000) },
    })

    if (result) {
      const user = await getDefaultUser()
      await prisma.message.createMany({
        data: [
          {
            agentId: task.agentId,
            userId: user.id,
            role: 'user',
            content: `[Scheduled: ${task.name}] ${message}`,
          },
          {
            agentId: task.agentId,
            userId: user.id,
            role: 'assistant',
            content: result,
          },
        ],
      })
    }
  } catch {
    // non-fatal
  }
}

// ─── Register or unregister a cron job ───────────────────────────────────────

export function registerOrUnregisterCronJob(task: { id: string; active: boolean; cronExpr: string }): void {
  const existing = activeJobs.get(task.id)
  if (existing) {
    existing.stop()
    activeJobs.delete(task.id)
  }

  if (!task.active) return
  if (!cron.validate(task.cronExpr)) return

  const job = cron.schedule(task.cronExpr, () => runTask(task.id))
  activeJobs.set(task.id, job)
}

// ─── Load all active tasks on startup ────────────────────────────────────────

export async function loadAllActiveTasks(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, active: true, cronExpr: true },
    })
    for (const task of tasks) {
      registerOrUnregisterCronJob(task)
    }
    console.log(`Scheduler: registered ${tasks.length} active task(s)`)
  } catch (err) {
    console.error('Scheduler init error:', err)
  }
}
