import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'

const PYTHON_URL = () => process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'

// Active cron jobs keyed by task id
const jobs = new Map<string, cron.ScheduledTask>()

// ─── Call agent and collect streamed result ───────────────────────────────────

async function callAgent(agent: any, message: string): Promise<string> {
  let result = ''
  try {
    const resp = await fetch(`${PYTHON_URL()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agent.name,
        agent_id: agent.id,
        setup_answers: agent.setupAnswers ?? {},
        memory: agent.memory ?? '',
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
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim()
            if (payload !== '[DONE]') {
              try { const p = JSON.parse(payload); if (p.delta) result += p.delta } catch {}
            }
          }
        }
      }
    }
  } catch (err) {
    result = `Error: ${(err as Error).message}`
  }
  return result
}

// ─── Run a single task ────────────────────────────────────────────────────────

export async function runTask(taskId: string): Promise<void> {
  const task = await prisma.scheduledTask.findUnique({
    where: { id: taskId },
    include: { agent: true },
  }).catch(() => null)

  if (!task || !task.agent) return

  const result = await callAgent(task.agent, task.description)

  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { lastRunAt: new Date(), lastRunResult: result.slice(0, 2000) },
  }).catch(() => {})
}

// ─── Register / unregister a cron job ────────────────────────────────────────

export function syncJob(task: { id: string; active: boolean; cronExpr: string }): void {
  jobs.get(task.id)?.stop()
  jobs.delete(task.id)
  if (!task.active || !cron.validate(task.cronExpr)) return
  jobs.set(task.id, cron.schedule(task.cronExpr, () => runTask(task.id)))
}

// ─── Load all active tasks on startup ────────────────────────────────────────

export async function loadActiveTasks(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, active: true, cronExpr: true },
    })
    tasks.forEach(syncJob)
    console.log(`Scheduler: loaded ${tasks.length} active task(s)`)
  } catch (err) {
    console.error('Scheduler init error:', err)
  }
}
