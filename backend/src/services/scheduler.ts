import cron from 'node-cron'
import * as nodemailer from 'nodemailer'
import { prisma, getDefaultUser } from '../db'

function getPythonUrl() {
  return process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'
}

// Active cron jobs keyed by task id
const activeJobs = new Map<string, cron.ScheduledTask>()

// ─── Call agent via SSE stream ────────────────────────────────────────────────

async function callAgent(agent: any, message: string, userId: string): Promise<string> {
  let integrationsMap: Record<string, any> = {}
  try {
    const integrations = await prisma.integration.findMany({ where: { userId } })
    for (const i of integrations) {
      integrationsMap[i.provider] = { access_token: i.accessToken }
    }
  } catch {}

  let result = ''
  try {
    const resp = await fetch(`${getPythonUrl()}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agent.name,
        agent_id: agent.id,
        setup_answers: agent.setupAnswers ?? {},
        memory: agent.memory ?? '',
        history: [],
        message,
        integrations: integrationsMap,
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
              } catch {}
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

// ─── Generate plan ────────────────────────────────────────────────────────────

export async function generatePlan(taskId: string): Promise<void> {
  const task = await prisma.scheduledTask.findUnique({
    where: { id: taskId },
    include: { agent: true },
  })
  if (!task || !task.agent) return

  const planMessage =
    `You are being assigned a scheduled task. Generate a brief execution plan (3–5 bullet points) ` +
    `for how you will accomplish this task when it runs. ` +
    `Task: "${task.description}". Respond with ONLY the execution plan, no preamble.`

  const plan = await callAgent(task.agent, planMessage, task.userId)

  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { agentPlan: plan.trim() },
  })

  // Auto-approve after 60 seconds if not yet manually approved
  setTimeout(async () => {
    try {
      const current = await prisma.scheduledTask.findUnique({ where: { id: taskId } })
      if (current && !current.planApproved) {
        await prisma.scheduledTask.update({
          where: { id: taskId },
          data: { planApproved: true, active: true },
        })
        registerOrUnregisterCronJob({ id: current.id, active: true, cronExpr: current.cronExpr, planApproved: true })
      }
    } catch {}
  }, 60_000)
}

// ─── Deliver result ───────────────────────────────────────────────────────────

async function deliverResult(task: any, result: string, status: string): Promise<void> {
  let methods: any[] = []
  try {
    methods = Array.isArray(task.resultDelivery)
      ? task.resultDelivery
      : JSON.parse(String(task.resultDelivery || '[]'))
  } catch {}

  for (const method of methods) {
    try {
      if (method.type === 'email' && method.to && process.env.GMAIL_USER) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASSWORD },
        })
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: method.to,
          subject: `Scheduled Task Result: ${task.name}`,
          text: `Task: ${task.name}\nStatus: ${status}\n\n${result}`,
        })
      }

      if (method.type === 'groupchat' && method.groupChatId) {
        await prisma.groupChatMessage.create({
          data: {
            groupChatId: method.groupChatId,
            senderName: task.agent?.name ?? 'Scheduler',
            senderRole: 'agent',
            role: 'assistant',
            content: `**Scheduled task result: ${task.name}**\n\n${result}`,
          },
        })
      }
    } catch {}
  }
}

async function notifyFailure(task: any, errorMsg: string): Promise<void> {
  let methods: any[] = []
  try {
    methods = Array.isArray(task.resultDelivery)
      ? task.resultDelivery
      : JSON.parse(String(task.resultDelivery || '[]'))
  } catch {}

  const emailMethod = methods.find((m: any) => m.type === 'email' && m.to)
  if (!emailMethod || !process.env.GMAIL_USER) return

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASSWORD },
    })
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: emailMethod.to,
      subject: `Scheduled Task Failed: ${task.name}`,
      text: `Task: ${task.name}\nStatus: failed\n\nError: ${errorMsg}`,
    })
  } catch {}
}

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

  if (!task || !task.agent) return

  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { lastRunAt: new Date(), lastRunStatus: 'running' },
  })

  // First attempt
  let result = await callAgent(task.agent, task.description, task.userId)
  let status = 'success'

  if (!result || result.startsWith('Error:')) {
    // Second attempt — different approach
    const retryMsg = `Previous approach failed. Try a completely different approach: ${task.description}`
    result = await callAgent(task.agent, retryMsg, task.userId)
    if (!result || result.startsWith('Error:')) {
      status = 'failed'
    }
  }

  try {
    await prisma.taskResult.create({ data: { taskId, status, result: result.slice(0, 5000) } })
  } catch {}

  await prisma.scheduledTask.update({
    where: { id: taskId },
    data: { lastRunAt: new Date(), lastRunStatus: status, lastRunResult: result.slice(0, 2000) },
  })

  if (status === 'failed') {
    await notifyFailure(task, result)
  } else {
    await deliverResult(task, result, status)
  }
}

// ─── Register or unregister a cron job ───────────────────────────────────────

export function registerOrUnregisterCronJob(task: {
  id: string
  active: boolean
  cronExpr: string
  planApproved?: boolean
}): void {
  const existing = activeJobs.get(task.id)
  if (existing) {
    existing.stop()
    activeJobs.delete(task.id)
  }

  if (!task.active) return
  if (task.planApproved === false) return
  if (!cron.validate(task.cronExpr)) return

  const job = cron.schedule(task.cronExpr, () => runTask(task.id))
  activeJobs.set(task.id, job)
}

// ─── Load all active tasks on startup ────────────────────────────────────────

export async function loadAllActiveTasks(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const tasks = await prisma.scheduledTask.findMany({
      where: { userId: user.id, active: true, planApproved: true },
      select: { id: true, active: true, cronExpr: true, planApproved: true },
    })
    for (const task of tasks) {
      registerOrUnregisterCronJob(task)
    }
    console.log(`Scheduler: registered ${tasks.length} active task(s)`)
  } catch (err) {
    console.error('Scheduler init error:', err)
  }
}
