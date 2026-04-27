import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { getUserIntegrationContext } from '../lib/integrationContext'

const PYTHON_URL = () => process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000'

const jobs = new Map<string, cron.ScheduledTask>()

// ─── Build goal from workflow nodes ──────────────────────────────────────────
//
// Converts the node graph into a clear instruction the agent can follow.
// The agent already has all the tools it needs (send_email, create_calendar_event, etc.)
// — this just tells it what to do and in what order.

function buildGoalFromNodes(workflow: { name: string; description: string | null; nodes: any[]; edges: any[] }): string {
  const nodes: any[] = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges: any[] = Array.isArray(workflow.edges) ? workflow.edges : []

  if (nodes.length === 0) return workflow.description || workflow.name

  // Build adjacency so we can traverse in order
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, [])
    outgoing.get(edge.source)!.push(edge.target)
  }

  // Find trigger node (first node, or type=trigger)
  const incomingTargets = new Set(edges.map((e: any) => e.target))
  const startNode = nodes.find((n: any) => n.type === 'trigger') ||
    nodes.find((n: any) => !incomingTargets.has(n.id)) ||
    nodes[0]

  // Traverse nodes in order following edges
  const ordered: any[] = []
  const visited = new Set<string>()
  const queue = [startNode.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = nodes.find((n: any) => n.id === id)
    if (node) {
      ordered.push(node)
      const next = outgoing.get(id) ?? []
      queue.push(...next)
    }
  }

  // Format each step
  const stepLines = ordered.map((node: any, i: number) => {
    const data = node.data ?? {}
    const label: string = data.label || node.label || ''
    const capability: string = data.capability || node.capability || ''
    const params: Record<string, any> = data.parameters || node.parameters || {}

    let line = `Step ${i + 1} [${node.type}]: ${label}`
    if (capability) line += ` — use ${capability}`
    if (Object.keys(params).length > 0) {
      const paramStr = Object.entries(params)
        .filter(([k]) => k !== 'cron') // skip the schedule cron, it's just a trigger setting
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(', ')
      if (paramStr) line += ` (${paramStr})`
    }
    return line
  })

  return (
    `Execute workflow: "${workflow.name}"\n` +
    (workflow.description ? `Goal: ${workflow.description}\n\n` : '\n') +
    stepLines.join('\n') +
    '\n\nComplete all steps using your available tools. Report what you did when finished.'
  )
}

// ─── Run a workflow ───────────────────────────────────────────────────────────

export async function runWorkflow(workflowId: string): Promise<void> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  }).catch(() => null)

  if (!workflow || workflow.status === 'paused') return

  const user = await getDefaultUser().catch(() => null)
  if (!user) return

  const integrationContext = await getUserIntegrationContext(user.id).catch(() => ({ tokens: {}, connectedIntegrations: [] }))
  const integrationTokens = integrationContext.tokens

  const run = await prisma.workflowRun.create({
    data: { workflowId, status: 'running' },
  })

  await prisma.workflow.update({
    where: { id: workflowId },
    data: { lastRunAt: new Date(), lastRunStatus: 'running' },
  })

  try {
    const goal = buildGoalFromNodes(workflow as any)

    // Use the first agent connected to this user, or fall back to a generic call
    const agent = await prisma.agent.findFirst({
      where: { userId: user.id },
    }).catch(() => null)

    const res = await fetch(`${PYTHON_URL()}/automate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_name: agent?.name ?? 'Cluster',
        agent_id: agent?.id ?? 'system',
        setup_answers: (agent as any)?.setupAnswers ?? {},
        memory: (agent as any)?.memory ?? '',
        goal,
        integrations: integrationTokens,
        connected_integrations: integrationContext.connectedIntegrations,
      }),
    })

    if (!res.ok) throw new Error(`Agent service error: ${res.status}`)
    const data = await res.json()
    const result: string = data.final_result ?? ''

    // Save the result as a chat message so the user sees it
    if (agent && result) {
      await prisma.message.create({
        data: {
          agentId: agent.id,
          userId: user.id,
          role: 'assistant',
          content: `**Workflow: ${workflow.name}**\n\n${result}`,
        },
      }).catch(console.error)
    }

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'success', result: result.slice(0, 10000), completedAt: new Date() },
    })

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { lastRunAt: new Date(), lastRunStatus: 'success' },
    })
  } catch (err) {
    const msg = (err as Error).message
    console.error(`Workflow ${workflowId} run failed:`, msg)

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'failed', result: `Error: ${msg}`, completedAt: new Date() },
    })

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { lastRunAt: new Date(), lastRunStatus: 'failed' },
    })
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────
//
// When a workflow has a trigger node with parameters.cron set and status is "active",
// register a cron job to fire it automatically.

function getCronFromWorkflow(workflow: { nodes: any }): string | null {
  const nodes: any[] = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const trigger = nodes.find((n: any) => n.type === 'trigger')
  if (!trigger) return null
  const params = trigger.data?.parameters ?? trigger.parameters ?? {}
  return typeof params.cron === 'string' ? params.cron : null
}

export function syncWorkflow(w: { id: string; status: string; nodes: any }): void {
  jobs.get(w.id)?.stop()
  jobs.delete(w.id)

  if (w.status !== 'active') return

  const cronExpr = getCronFromWorkflow(w)
  if (!cronExpr) return
  if (!cron.validate(cronExpr)) return

  jobs.set(w.id, cron.schedule(cronExpr, () => runWorkflow(w.id)))
  console.log(`Workflow "${w.id}" scheduled: ${cronExpr}`)
}

export async function loadWorkflows(): Promise<void> {
  try {
    const user = await getDefaultUser()
    const workflows = await prisma.workflow.findMany({
      where: { userId: user.id, status: 'active' },
      select: { id: true, status: true, nodes: true },
    })
    const scheduled = workflows.filter((w) => getCronFromWorkflow(w))
    workflows.forEach(syncWorkflow)
    console.log(`Workflows: registered ${scheduled.length} scheduled job(s)`)
  } catch (err) {
    console.error('Workflows init error:', err)
  }
}
