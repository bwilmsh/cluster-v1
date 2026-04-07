import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { loadTemplate, resolveVariables, interpolate, TemplateStep } from './templateLoader'
import { getUserIntegrationTokens } from '../routes/integrations'
import { decrypt } from '../lib/crypto'

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

// ─── Step result accumulator ──────────────────────────────────────────────────

interface StepLog {
  id: number
  type: string
  action: string
  status: 'success' | 'failed' | 'skipped' | 'ai_recovered'
  output: string
  error?: string
  ai_recovery_note?: string
}

// ─── Execute a single step ────────────────────────────────────────────────────

async function executeBrowseStep(
  step: TemplateStep,
  vars: Record<string, string>,
  credentials: Record<string, { username: string; password: string }>,
): Promise<string> {
  const url = step.url ? interpolate(step.url, vars) : ''
  const instructions = step.instructions ? interpolate(step.instructions, vars) : ''

  if (step.action === 'login' && step.credentials_key) {
    const cred = credentials[step.credentials_key]
    if (!cred) throw new Error(`Credentials not found: ${step.credentials_key}`)
    const fullInstructions = `${instructions}. Username: ${cred.username}, Password: ${cred.password}`
    const res = await fetch(`${PYTHON_URL()}/execute-browse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, instructions: fullInstructions }),
    })
    if (!res.ok) throw new Error(`Browse service error: ${res.status}`)
    const data = await res.json()
    return data.result ?? ''
  }

  const res = await fetch(`${PYTHON_URL()}/execute-browse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, instructions }),
  })
  if (!res.ok) throw new Error(`Browse service error: ${res.status}`)
  const data = await res.json()
  return data.result ?? ''
}

async function executeApiStep(
  step: TemplateStep,
  vars: Record<string, string>,
  integrationTokens: Record<string, string>,
): Promise<string> {
  const provider = step.provider ?? ''
  const token = integrationTokens[provider]
  if (!token) throw new Error(`No ${provider} integration connected`)

  // Resolve params
  const params: Record<string, string> = {}
  for (const [k, v] of Object.entries(step.params ?? {})) {
    params[k] = interpolate(v, vars)
  }

  // Map endpoint to actual API call
  if (provider === 'google') {
    if (step.endpoint === 'gmail.users.messages.list') {
      const q = encodeURIComponent(params.q ?? '')
      const max = params.maxResults ?? '50'
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=${max}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error(`Gmail API error: ${res.status}`)
      const data = await res.json()
      const messages = data.messages ?? []
      return JSON.stringify({ message_ids: messages.map((m: any) => m.id), total: messages.length })
    }

    if (step.endpoint === 'gmail.users.messages.get') {
      // This is called after list — return a summary signal so report step can use it
      return JSON.stringify({ status: 'emails_fetched', note: 'Email metadata available for summarisation' })
    }

    if (step.endpoint === 'sheets.spreadsheets.values.get') {
      const sheetUrl = vars['sheet_url'] ?? ''
      const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)
      if (!sheetIdMatch) throw new Error('Invalid Google Sheet URL')
      const sheetId = sheetIdMatch[1]
      const range = encodeURIComponent(params.range ?? 'Sheet1!A1:Z100')
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error(`Sheets API error: ${res.status}`)
      const data = await res.json()
      const rows = data.values ?? []
      return JSON.stringify({ rows, total_rows: rows.length })
    }

    if (step.endpoint === 'gmail.users.drafts.create') {
      return JSON.stringify({ status: 'drafts_queued', note: 'Drafts would be created via Gmail API' })
    }
  }

  return JSON.stringify({ status: 'ok', endpoint: step.endpoint })
}

async function executeReportStep(
  step: TemplateStep,
  collectedData: string[],
  vars: Record<string, string>,
  agentName: string,
  templateName: string,
): Promise<string> {
  const res = await fetch(`${PYTHON_URL()}/summarise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: step.format ?? 'summary',
      include: step.include ?? [],
      data: collectedData,
      variables: vars,
      agent_name: agentName,
      template_name: templateName,
      action: step.action,
    }),
  })
  if (!res.ok) throw new Error(`Summarise service error: ${res.status}`)
  const data = await res.json()
  return data.result ?? ''
}

async function executeDeliveryStep(
  step: TemplateStep,
  result: string,
  automationId: string,
  userId: string,
  vars: Record<string, string>,
  integrationTokens: Record<string, string>,
): Promise<string> {
  if (step.type === 'notify_chat') {
    // Will be handled by the runner after all steps complete
    return 'Scheduled for chat delivery'
  }

  if (step.type === 'send_email') {
    const token = integrationTokens['google']
    if (!token) return 'No Google integration — email skipped'
    // Get user email
    const meRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const me = meRes.ok ? await meRes.json() : {}
    const to = step.to === 'user_email' ? me.emailAddress : interpolate(step.to ?? '', vars)
    if (!to) return 'No recipient — email skipped'
    const subject = step.subject_template ? interpolate(step.subject_template, vars) : 'Automation Result'
    const body = btoa(unescape(encodeURIComponent(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${result}`
    )))
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: body }),
    })
    return sendRes.ok ? `Email sent to ${to}` : `Email failed: ${sendRes.status}`
  }

  if (step.type === 'post_slack') {
    const token = integrationTokens['slack']
    if (!token) return 'No Slack integration — post skipped'
    const channel = vars[step.channel_variable ?? ''] ?? '#general'
    const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text: result }),
    })
    return slackRes.ok ? `Posted to Slack ${channel}` : `Slack post failed: ${slackRes.status}`
  }

  if (step.type === 'write_sheet') {
    const token = integrationTokens['google']
    if (!token) return 'No Google integration — sheet write skipped'
    const sheetUrl = step.sheet_id_variable ? vars[step.sheet_id_variable] : ''
    const sheetIdMatch = sheetUrl?.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (!sheetIdMatch) return 'No sheet URL — write skipped'
    return `Would write to sheet ${sheetIdMatch[1]}`
  }

  if (step.type === 'alert') {
    return `Alert: ${step.condition ?? 'condition checked'} — result: ${result}`
  }

  return 'Step completed'
}

// ─── AI recovery ──────────────────────────────────────────────────────────────

async function tryAiRecovery(
  step: TemplateStep,
  error: string,
  collectedData: string[],
  agentName: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${PYTHON_URL()}/recover-step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step_type: step.type,
        step_action: step.action,
        error,
        collected_data: collectedData.slice(-2),
        agent_name: agentName,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.result ?? null
  } catch {
    return null
  }
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

  const run = await prisma.automationRun.create({
    data: { automationId, status: 'running', steps: [] },
  })

  await prisma.automation.updateMany({
    where: { id: automationId },
    data: { lastRunAt: new Date(), lastRunStatus: 'running' },
  })

  const stepLogs: StepLog[] = []
  let finalResult = ''
  let status = 'success'

  try {
    // Load template
    const template = loadTemplate(automation.templateId)
    if (!template) throw new Error(`Template not found: ${automation.templateId}`)

    const vars = resolveVariables(template, automation.variables as Record<string, string>)
    const integrationTokens = await getUserIntegrationTokens(automation.userId).catch(() => ({} as Record<string, string>))

    // Load credentials (web credentials for social logins)
    const webCreds = await prisma.webCredential.findMany({ where: { userId: automation.userId } })
    const credentials: Record<string, { username: string; password: string }> = {}
    for (const cred of webCreds) {
      const key = cred.siteName.toLowerCase().replace(/\s+/g, '_') + '_credentials'
      credentials[key] = {
        username: cred.username,
        password: decrypt(cred.password),
      }
    }

    const collectedData: string[] = []

    for (const step of template.steps) {
      let output = ''
      let stepStatus: StepLog['status'] = 'success'
      let error: string | undefined
      let aiNote: string | undefined

      try {
        if (step.type === 'browse') {
          output = await executeBrowseStep(step, vars, credentials)
        } else if (step.type === 'api') {
          output = await executeApiStep(step, vars, integrationTokens)
        } else if (step.type === 'extract') {
          // Extract just signals that data is ready — the actual data is in collectedData
          output = collectedData.length > 0
            ? `Extracted: ${collectedData[collectedData.length - 1].slice(0, 200)}`
            : 'No data to extract'
        } else if (step.type === 'report') {
          output = await executeReportStep(step, collectedData, vars, automation.agent.name, template.name)
          finalResult = output // The last report step becomes the final result
        } else {
          output = await executeDeliveryStep(step, finalResult || collectedData.join('\n'), automationId, automation.userId, vars, integrationTokens)
        }

        collectedData.push(output)
      } catch (err) {
        error = (err as Error).message
        stepStatus = 'failed'

        if (template.ai_recovery) {
          const recovered = await tryAiRecovery(step, error, collectedData, automation.agent.name)
          if (recovered) {
            output = recovered
            stepStatus = 'ai_recovered'
            aiNote = `AI recovered: ${recovered.slice(0, 100)}`
            collectedData.push(output)
            if (step.type === 'report') finalResult = recovered
          }
        }
      }

      stepLogs.push({
        id: step.id,
        type: step.type,
        action: step.action,
        status: stepStatus,
        output: output.slice(0, 500),
        error,
        ai_recovery_note: aiNote,
      })
    }

    if (!finalResult) {
      // Compile all collected data if no explicit report step ran successfully
      finalResult = collectedData.filter(Boolean).join('\n\n')
    }

    if (!finalResult) status = 'failed'

    // Deliver result based on deliveryType
    await deliverResult(automation, finalResult, integrationTokens)
  } catch (err) {
    status = 'failed'
    finalResult = `Error: ${(err as Error).message}`
  }

  await prisma.automationRun.update({
    where: { id: run.id },
    data: {
      status,
      steps: stepLogs,
      finalResult: finalResult.slice(0, 20000),
      completedAt: new Date(),
      deliveredTo: automation.deliveryType,
    },
  }).catch(console.error)

  await prisma.automation.updateMany({
    where: { id: automationId },
    data: { lastRunAt: new Date(), lastRunStatus: status },
  }).catch(console.error)
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
