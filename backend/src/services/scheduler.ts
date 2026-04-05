import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'

const PYTHON_URL = () => process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'

const jobs = new Map<string, cron.ScheduledTask>()

// ─── Structured task prompt ───────────────────────────────────────────────────

function buildTaskPrompt(task: { name: string; description: string; websiteUrl?: string | null }): string {
  const site = task.websiteUrl ? `\nWebsite to check: ${task.websiteUrl}` : ''
  return (
    `You have been given a scheduled task to execute: "${task.name}"${site}\n\n` +
    `Task instructions: ${task.description}\n\n` +
    `Think through this step by step, use your tools (web search, browse) to gather ` +
    `up-to-date information, then provide a structured report in exactly this format:\n\n` +
    `## Summary\n[2-3 sentence overview of what you found]\n\n` +
    `## Key Findings\n[Bullet points of the most important findings]\n\n` +
    `## Action Items\n[Specific things that need attention or follow-up, or "None" if all is well]\n\n` +
    `## Alerts\n[Anything urgent or requiring immediate attention, or "None"]`
  )
}

// ─── Stream agent response ────────────────────────────────────────────────────

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
  return result.trim()
}

// ─── Run a single task ────────────────────────────────────────────────────────

export async function runTask(taskId: string): Promise<void> {
  const task = await prisma.scheduledTask.findUnique({
    where: { id: taskId },
    include: { agent: true },
  }).catch(() => null)

  if (!task || !task.agent) return

  const prompt = buildTaskPrompt(task)
  const result = await callAgent(task.agent, prompt)
  const status = result.startsWith('Error:') ? 'failed' : 'success'

  await Promise.all([
    prisma.taskResult.create({
      data: { taskId, status, result: result.slice(0, 10000) },
    }),
    prisma.scheduledTask.update({
      where: { id: taskId },
      data: { lastRunAt: new Date(), lastRunResult: result.slice(0, 2000) },
    }),
  ]).catch(console.error)
}

// ─── Register / unregister cron job ──────────────────────────────────────────

export function syncJob(task: { id: string; active: boolean; cronExpr: string }): void {
  jobs.get(task.id)?.stop()
  jobs.delete(task.id)
  if (!task.active || !cron.validate(task.cronExpr)) return
  jobs.set(task.id, cron.schedule(task.cronExpr, () => runTask(task.id)))
}

// ─── Boot: load all active tasks ─────────────────────────────────────────────

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
