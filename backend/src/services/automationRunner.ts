import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'

const PYTHON_URL = () => process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'

// Active cron jobs keyed by automation id
const jobs = new Map<string, cron.ScheduledTask>()

// ─── Run an automation ────────────────────────────────────────────────────────

export async function runAutomation(automationId: string): Promise<void> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { agent: true },
  }).catch(() => null)

  if (!automation || !automation.agent) return

  // Create a run record with status "running"
  const run = await prisma.automationRun.create({
    data: { automationId, status: 'running', steps: [] },
  })

  await prisma.automation.update({
    where: { id: automationId },
    data: { lastRunAt: new Date(), lastRunStatus: 'running' },
  })

  let steps: any[] = []
  let finalResult = ''
  let status = 'success'

  try {
    const resp = await fetch(`${PYTHON_URL()}/automate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: automation.agent.name,
        agent_id: automation.agent.id,
        setup_answers: automation.agent.setupAnswers ?? {},
        memory: automation.agent.memory ?? '',
        goal: automation.goal,
        integrations: {},
      }),
    })

    if (!resp.ok) throw new Error(`Agent service returned ${resp.status}`)

    const data = await resp.json()
    steps = Array.isArray(data.steps) ? data.steps : []
    finalResult = typeof data.final_result === 'string' ? data.final_result : ''
    if (!finalResult) status = 'failed'
  } catch (err) {
    status = 'failed'
    finalResult = `Error: ${(err as Error).message}`
  }

  await Promise.all([
    prisma.automationRun.update({
      where: { id: run.id },
      data: { status, steps, finalResult: finalResult.slice(0, 20000), completedAt: new Date() },
    }),
    prisma.automation.update({
      where: { id: automationId },
      data: { lastRunAt: new Date(), lastRunStatus: status },
    }),
  ]).catch(console.error)
}

// ─── Register / unregister cron job ──────────────────────────────────────────

export function syncAutomation(a: { id: string; active: boolean; triggerType: string; cronExpr: string | null }): void {
  jobs.get(a.id)?.stop()
  jobs.delete(a.id)
  if (!a.active || a.triggerType !== 'schedule' || !a.cronExpr) return
  if (!cron.validate(a.cronExpr)) return
  jobs.set(a.id, cron.schedule(a.cronExpr, () => runAutomation(a.id)))
}

// ─── Boot: register all active scheduled automations ─────────────────────────

export async function loadAutomations(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const automations = await prisma.automation.findMany({
      where: { userId: user.id, active: true, triggerType: 'schedule' },
      select: { id: true, active: true, triggerType: true, cronExpr: true },
    })
    automations.forEach(syncAutomation)
    console.log(`Automations: registered ${automations.length} scheduled job(s)`)
  } catch (err) {
    console.error('Automations init error:', err)
  }
}
