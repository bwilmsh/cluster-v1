import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'

const PYTHON_URL = () => process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
export const DAILY_RUN_LIMIT = 10

const jobs = new Map<string, cron.ScheduledTask>()

// ─── Daily run counter ────────────────────────────────────────────────────────

export async function todayRunCount(userId: string): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  return prisma.automationRun.count({
    where: { automation: { userId }, startedAt: { gte: startOfDay } },
  })
}

// ─── Main run function ────────────────────────────────────────────────────────

export async function runAutomation(automationId: string): Promise<void> {
  const automation = await prisma.automation.findUnique({
    where: { id: automationId },
    include: { agent: true },
  }).catch(() => null)

  if (!automation || !automation.agent) return

  const runsToday = await todayRunCount(automation.userId)
  if (runsToday >= DAILY_RUN_LIMIT) {
    console.warn(`Daily run limit reached for user ${automation.userId}`)
    return
  }

  // Get integration tokens and connected capability metadata
  const integrationContext = await getUserIntegrationContext(automation.userId).catch(() => ({ tokens: {}, connectedIntegrations: [] }))
  const integrationTokens = integrationContext.tokens

  const goal = automation.goal || automation.name

  // ── Preflight: check if required integrations are connected ────────────────
  try {
    const preflightRes = await fetch(`${PYTHON_URL()}/preflight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal,
        agent_name: automation.agent.name,
        agent_id: automation.agentId,
        connected_integrations: [
          integrationTokens['google_access_token'] ? 'google' : null,
          integrationTokens['slack_token'] ? 'slack' : null,
          integrationTokens['notion_token'] ? 'notion' : null,
          integrationContext.connectedIntegrations.some((integration) => integration.provider === 'teams') ? 'teams' : null,
        ].filter(Boolean),
      }),
    })

    if (preflightRes.ok) {
      const preflight = await preflightRes.json()
      // Only block on hard-required items with no workaround
      const blockers: any[] = (preflight.requirements ?? []).filter(
        (r: any) => r.required === true && !r.workaround
      )

      if (blockers.length > 0) {
        const missingList = blockers.map((r: any) => r.label).join(', ')
        const msg = `Missing required integrations: ${missingList}. Connect them at /integrations.`
        await prisma.automationRun.create({
          data: {
            automationId,
            status: 'skipped',
            steps: [],
            finalResult: msg,
            completedAt: new Date(),
          },
        }).catch(console.error)
        await prisma.automation.update({
          where: { id: automationId },
          data: { lastRunAt: new Date(), lastRunStatus: 'skipped', lastRunResult: msg },
        }).catch(console.error)
        return
      }
    }
  } catch {
    // If preflight fails, proceed anyway — the agent will handle missing integrations gracefully
  }

  // ── Start run record ───────────────────────────────────────────────────────
  const run = await prisma.automationRun.create({
    data: { automationId, status: 'running', steps: [] },
  })

  await prisma.automation.update({
    where: { id: automationId },
    data: { lastRunAt: new Date(), lastRunStatus: 'running' },
  })

  try {
    const agentData = automation.agent as any
    const setupAnswers = agentData.setupAnswers ?? {}
    const memory = agentData.memory ?? ''

    // ── Call the Python agent's /automate endpoint ─────────────────────────
    const res = await fetch(`${PYTHON_URL()}/automate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: automation.agent.name,
        agent_id: automation.agentId,
        setup_answers: setupAnswers,
        memory,
        goal,
        integrations: integrationTokens,
        connected_integrations: integrationContext.connectedIntegrations,
      }),
    })

    if (!res.ok) throw new Error(`Agent service error: ${res.status}`)
    const data = await res.json()

    const finalResult: string = data.final_result ?? ''
    const steps: any[] = data.steps ?? []

    // ── Deliver result ─────────────────────────────────────────────────────
    await deliverResult(automation, finalResult, integrationTokens)

    // ── Save run ───────────────────────────────────────────────────────────
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        steps,
        finalResult: finalResult.slice(0, 20000),
        completedAt: new Date(),
        deliveredTo: automation.deliveryType,
      },
    }).catch(console.error)

    await prisma.automation.update({
      where: { id: automationId },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: 'success',
        lastRunResult: finalResult.slice(0, 500),
      },
    }).catch(console.error)
  } catch (err) {
    const errMsg = (err as Error).message
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        steps: [],
        finalResult: `Error: ${errMsg}`,
        completedAt: new Date(),
      },
    }).catch(console.error)
    await prisma.automation.update({
      where: { id: automationId },
      data: { lastRunAt: new Date(), lastRunStatus: 'failed' },
    }).catch(console.error)
  }
}

// ─── Deliver result ───────────────────────────────────────────────────────────

async function deliverResult(
  automation: { deliveryType: string; deliveryTarget: string | null; agentId: string; userId: string; name: string },
  result: string,
  integrationTokens: Record<string, string>,
): Promise<void> {
  if (!result) return

  if (automation.deliveryType === 'chat') {
    await prisma.message.create({
      data: {
        agentId: automation.agentId,
        userId: automation.userId,
        role: 'assistant',
        content: `**Automation: ${automation.name}**\n\n${result}`,
      },
    }).catch(console.error)
    return
  }

  if (automation.deliveryType === 'group_chat' && automation.deliveryTarget) {
    await prisma.groupChatMessage.create({
      data: {
        groupChatId: automation.deliveryTarget,
        senderName: automation.name,
        senderRole: 'automation',
        role: 'assistant',
        content: result,
      },
    }).catch(console.error)
    return
  }

  if (automation.deliveryType === 'email') {
    const token = integrationTokens['google']
    if (!token) return
    const meRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!meRes.ok) return
    const me = await meRes.json()
    const to = me.emailAddress
    const raw = btoa(unescape(encodeURIComponent(
      `To: ${to}\r\nSubject: ${automation.name} Results\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${result}`
    )))
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    }).catch(console.error)
    return
  }

  if (automation.deliveryType === 'slack') {
    const token = integrationTokens['slack']
    if (!token) return
    const channel = automation.deliveryTarget ?? '#general'
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text: `*${automation.name}*\n${result}` }),
    }).catch(console.error)
  }
}

// ─── Cron scheduler ───────────────────────────────────────────────────────────

export function syncAutomation(a: { id: string; active: boolean; schedule: string | null }): void {
  jobs.get(a.id)?.stop()
  jobs.delete(a.id)
  if (!a.active || !a.schedule) return
  if (!cron.validate(a.schedule)) return
  jobs.set(a.id, cron.schedule(a.schedule, () => runAutomation(a.id)))
}

export async function loadAutomations(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const automations = await prisma.automation.findMany({
      where: { userId: user.id, active: true },
      select: { id: true, active: true, schedule: true },
    })
    automations.forEach(syncAutomation)
    console.log(`Automations: registered ${automations.filter((a) => a.schedule).length} scheduled job(s)`)
  } catch (err) {
    console.error('Automations init error:', err)
  }
}
