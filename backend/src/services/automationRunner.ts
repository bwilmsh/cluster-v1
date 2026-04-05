import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { getUserIntegrationTokens } from '../routes/integrations'

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
    const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const dateNote = `Today's date is ${today}. Always search for current, up to date information. Never reference 2024 data when 2025 or 2026 information is available. When searching, include the current year in your queries.`

    const integrationTokens = await getUserIntegrationTokens(automation.userId).catch(() => ({} as Record<string, string>))

    const resp = await fetch(`${PYTHON_URL()}/automate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: automation.agent.name,
        agent_id: automation.agent.id,
        setup_answers: automation.agent.setupAnswers ?? {},
        memory: automation.agent.memory ? `${automation.agent.memory}\n\n${dateNote}` : dateNote,
        goal: automation.goal,
        integrations: integrationTokens,
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

  // Save run result — always do this first so results are visible
  await prisma.automationRun.update({
    where: { id: run.id },
    data: { status, steps, finalResult: finalResult.slice(0, 20000), completedAt: new Date() },
  }).catch((err) => console.error('Failed to save run result:', err))

  // Update automation status — use updateMany so it silently no-ops if deleted
  await prisma.automation.updateMany({
    where: { id: automationId },
    data: { lastRunAt: new Date(), lastRunStatus: status },
  }).catch((err) => console.error('Failed to update automation status:', err))
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
