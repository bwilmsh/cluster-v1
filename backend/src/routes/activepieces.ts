import { Router, Request, Response as ExpressResponse } from 'express'

export const activepiecesRouter = Router()

const AP_URL = () => process.env.ACTIVEPIECES_URL || 'http://localhost:8080'

interface APSession {
  token: string
  projectId: string
}

let session: APSession | null = null

async function getSession(): Promise<APSession> {
  if (session) return session

  const email = process.env.ACTIVEPIECES_EMAIL
  const password = process.env.ACTIVEPIECES_PASSWORD

  if (!email || !password) {
    throw new Error('ACTIVEPIECES_EMAIL and ACTIVEPIECES_PASSWORD are required in .env')
  }

  const res = await fetch(`${AP_URL()}/api/v1/authentication/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Activepieces login failed (${res.status}): ${text}`)
  }

  const data = await res.json() as { token: string; projectId: string }
  session = { token: data.token, projectId: data.projectId }
  return session
}

// Invalidate cached session on auth errors so we re-login next request
function clearSession() {
  session = null
}

async function apFetch(path: string, options: RequestInit = {}): Promise<globalThis.Response> {
  const { token } = await getSession()
  const res = await fetch(`${AP_URL()}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    },
  })
  if (res.status === 401) {
    clearSession()
    throw new Error('Activepieces session expired — will re-authenticate on next request')
  }
  return res
}

// ─── Status ──────────────────────────────────────────────────────────────────

activepiecesRouter.get('/status', async (_req: Request, res: ExpressResponse) => {
  const email = process.env.ACTIVEPIECES_EMAIL
  const password = process.env.ACTIVEPIECES_PASSWORD

  if (!email || !password) {
    return res.json({ configured: false, reason: 'no_credentials' })
  }

  try {
    const { projectId } = await getSession()
    res.json({ configured: true, projectId })
  } catch (err: any) {
    clearSession()
    res.json({ configured: false, reason: 'unreachable', detail: err.message })
  }
})

// ─── Flows ────────────────────────────────────────────────────────────────────

activepiecesRouter.get('/flows', async (_req: Request, res: ExpressResponse) => {
  try {
    const { projectId } = await getSession()
    const r = await apFetch(`/flows?projectId=${projectId}&limit=50`)
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

activepiecesRouter.get('/flows/:id', async (req: Request, res: ExpressResponse) => {
  try {
    const r = await apFetch(`/flows/${req.params.id}`)
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

activepiecesRouter.delete('/flows/:id', async (req: Request, res: ExpressResponse) => {
  try {
    const r = await apFetch(`/flows/${req.params.id}`, { method: 'DELETE' })
    if (r.status === 204) return res.status(204).send()
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST /api/activepieces/flows/:id/toggle — enable or disable
activepiecesRouter.post('/flows/:id/toggle', async (req: Request, res: ExpressResponse) => {
  try {
    const flowRes = await apFetch(`/flows/${req.params.id}`)
    if (!flowRes.ok) return res.status(flowRes.status).json({ error: 'Flow not found' })
    const flow = await flowRes.json() as any
    const newStatus = flow.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'

    const r = await apFetch(`/flows/${req.params.id}`, {
      method: 'POST',
      body: JSON.stringify({ type: 'CHANGE_STATUS', request: { status: newStatus } }),
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// POST /api/activepieces/flows/:id/run — trigger a manual run
activepiecesRouter.post('/flows/:id/run', async (req: Request, res: ExpressResponse) => {
  try {
    const { projectId } = await getSession()

    const flowRes = await apFetch(`/flows/${req.params.id}`)
    if (!flowRes.ok) return res.status(flowRes.status).json({ error: 'Flow not found' })
    const flow = await flowRes.json() as any

    const flowVersionId = flow.publishedVersionId
    if (!flowVersionId) {
      return res.status(400).json({
        error: 'This flow has no published version. Open it in Activepieces and publish it first.',
      })
    }

    const r = await apFetch('/flow-runs', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        flowVersionId,
        environment: 'PRODUCTION',
        payload: {},
      }),
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// GET /api/activepieces/flows/:id/runs — run history
activepiecesRouter.get('/flows/:id/runs', async (req: Request, res: ExpressResponse) => {
  try {
    const { projectId } = await getSession()
    const r = await apFetch(`/flow-runs?projectId=${projectId}&flowId=${req.params.id}&limit=20`)
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// ─── Connections ──────────────────────────────────────────────────────────────

// GET /api/activepieces/connections — list connected OAuth accounts
activepiecesRouter.get('/connections', async (req: Request, res: ExpressResponse) => {
  try {
    const { projectId } = await getSession()
    const pieceName = req.query.pieceName ? `&pieceName=${req.query.pieceName}` : ''
    const r = await apFetch(`/app-connections?projectId=${projectId}&limit=50${pieceName}`)
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (err: any) {
    res.status(503).json({ error: err.message })
  }
})

// ─── Flow builder ─────────────────────────────────────────────────────────────

interface TriggerSpec {
  type: 'schedule' | 'webhook' | 'instant'
  cron?: string
  label?: string
}

interface ActionSpec {
  service: string
  action: string
  params: Record<string, unknown>
  label?: string
}

interface FlowBuildRequest {
  name: string
  trigger: TriggerSpec
  actions: ActionSpec[]
}

// Activepieces uses arrays for multi-recipient/multi-value fields.
// Convert comma-separated strings to arrays where the piece schema requires it.
const ARRAY_FIELDS: Record<string, string[]> = {
  'gmail/send_email':         ['to', 'cc', 'bcc', 'reply_to'],
  'gmail/send_email_html':    ['to', 'cc', 'bcc', 'reply_to'],
  'slack/send_message_to_channel': [],
  'sheets/append_row':        ['values'],
}

function normalizeParams(service: string, action: string, params: Record<string, unknown>): Record<string, unknown> {
  const key = `${service.toLowerCase()}/${action}`
  const arrayFields = ARRAY_FIELDS[key] ?? []
  const out: Record<string, unknown> = { ...params }
  for (const field of arrayFields) {
    if (typeof out[field] === 'string' && (out[field] as string).trim()) {
      out[field] = (out[field] as string).split(',').map((s) => s.trim()).filter(Boolean)
    } else if (Array.isArray(out[field])) {
      // already an array — leave it
    }
  }
  return out
}

// Maps service shorthand → Activepieces piece name + connection requirement
const PIECE_MAP: Record<string, { pieceName: string; requiresConnection: boolean }> = {
  gmail:    { pieceName: '@activepieces/piece-gmail',           requiresConnection: true },
  slack:    { pieceName: '@activepieces/piece-slack',           requiresConnection: true },
  notion:   { pieceName: '@activepieces/piece-notion',          requiresConnection: true },
  sheets:   { pieceName: '@activepieces/piece-google-sheets',   requiresConnection: true },
  calendar: { pieceName: '@activepieces/piece-google-calendar', requiresConnection: true },
  http:     { pieceName: '@activepieces/piece-http',            requiresConnection: false },
  code:     { pieceName: '@activepieces/piece-code',            requiresConnection: false },
  openai:   { pieceName: '@activepieces/piece-openai',          requiresConnection: true },
}

// Cache piece name → version, populated lazily
let _pieceVersions: Map<string, string> | null = null

async function fetchPieceVersions(): Promise<Map<string, string>> {
  if (_pieceVersions) return _pieceVersions
  try {
    const r = await apFetch('/pieces?includeHidden=false&edition=ce')
    if (!r.ok) return new Map()
    const list = await r.json() as Array<{ name: string; version: string }>
    _pieceVersions = new Map(Array.isArray(list) ? list.map((p) => [p.name, p.version]) : [])
    return _pieceVersions
  } catch {
    return new Map()
  }
}

async function pieceVersion(pieceName: string): Promise<string> {
  const versions = await fetchPieceVersions()
  return versions.get(pieceName) ?? '0.0.1'
}

/** Build the complete nested flow trigger+actions tree, then IMPORT_FLOW in one call */
async function importFlow(flowId: string, displayName: string, triggerNode: Record<string, any>): Promise<void> {
  const r = await apFetch(`/flows/${flowId}`, {
    method: 'POST',
    body: JSON.stringify({
      type: 'IMPORT_FLOW',
      request: { displayName, trigger: triggerNode },
    }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`IMPORT_FLOW failed (${r.status}): ${text}`)
  }
}

// POST /api/activepieces/flows/build — AI builds a flow from a simple spec
activepiecesRouter.post('/flows/build', async (req: Request, res: ExpressResponse) => {
  try {
    const { projectId } = await getSession()
    const spec: FlowBuildRequest = req.body

    if (!spec.name || !spec.trigger || !spec.actions?.length) {
      return res.status(400).json({ error: 'name, trigger, and actions are required' })
    }

    // 1. Create empty flow
    const createRes = await apFetch('/flows', {
      method: 'POST',
      body: JSON.stringify({ projectId, displayName: spec.name }),
    })
    if (!createRes.ok) {
      const err = await createRes.text()
      return res.status(createRes.status).json({ error: `Failed to create flow: ${err}` })
    }
    const flow = await createRes.json() as { id: string }
    const flowId = flow.id

    // 2. Look up real piece versions from the AP instance
    const schedVer = await pieceVersion('@activepieces/piece-schedule')
    const actionPieceNames = spec.actions.map((a) =>
      PIECE_MAP[a.service.toLowerCase()]?.pieceName ?? '@activepieces/piece-http'
    )
    const actionVers = await Promise.all(actionPieceNames.map((n) => pieceVersion(n)))

    // 3. Build the nested trigger → action chain (AP uses a linked-list via nextAction)
    // Build actions from last to first so we can set nextAction pointers
    let nextAction: Record<string, any> | undefined = undefined
    for (let i = spec.actions.length - 1; i >= 0; i--) {
      const a = spec.actions[i]
      const stepName = `step_${i + 1}`
      const pieceName = actionPieceNames[i]
      const ver = actionVers[i]

      nextAction = {
        name: stepName,
        type: 'PIECE',
        displayName: a.label || `${a.service} — ${a.action}`,
        settings: {
          pieceName,
          pieceVersion: ver,
          packageType: 'REGISTRY',
          pieceType: 'OFFICIAL',
          actionName: a.action,
          input: normalizeParams(a.service, a.action, a.params),
          inputUiInfo: {},
          errorHandlingOptions: {
            continueOnFailure: { value: false },
            retryOnFailure: { value: false },
          },
        },
        valid: false,
        ...(nextAction ? { nextAction } : {}),
      }
    }

    // Build trigger node with the action chain attached
    let triggerNode: Record<string, any>
    if (spec.trigger.type === 'schedule' && spec.trigger.cron) {
      triggerNode = {
        name: 'trigger',
        type: 'PIECE_TRIGGER',
        displayName: spec.trigger.label || 'Schedule',
        settings: {
          pieceName: '@activepieces/piece-schedule',
          pieceVersion: schedVer,
          packageType: 'REGISTRY',
          pieceType: 'OFFICIAL',
          triggerName: 'cron_expression',
          input: { cronExpression: spec.trigger.cron },
          inputUiInfo: {},
        },
        valid: true,
        ...(nextAction ? { nextAction } : {}),
      }
    } else if (spec.trigger.type === 'webhook') {
      triggerNode = {
        name: 'trigger',
        type: 'WEBHOOK',
        displayName: spec.trigger.label || 'Webhook',
        settings: { inputUiInfo: {} },
        valid: true,
        ...(nextAction ? { nextAction } : {}),
      }
    } else {
      triggerNode = {
        name: 'trigger',
        type: 'EMPTY',
        displayName: spec.trigger.label || 'Trigger',
        settings: {},
        valid: false,
        ...(nextAction ? { nextAction } : {}),
      }
    }

    // 4. Send the complete flow in one IMPORT_FLOW operation
    await importFlow(flowId, spec.name, triggerNode)

    // 5. Check which services still need OAuth
    const servicesNeeded = spec.actions
      .map((a) => a.service.toLowerCase())
      .filter((s) => PIECE_MAP[s]?.requiresConnection)

    const connectionsRes = await apFetch(`/app-connections?projectId=${projectId}&limit=50`)
    const connectionsData = await connectionsRes.json() as { data?: Array<{ pieceName: string }> }
    const connected = new Set((connectionsData.data ?? []).map((c) => c.pieceName))
    const needsConnection = servicesNeeded.filter(
      (s) => PIECE_MAP[s] && !connected.has(PIECE_MAP[s].pieceName)
    )

    res.json({
      flowId,
      name: spec.name,
      status: 'created',
      needsConnection,
      connectUrl: needsConnection.length > 0 ? 'http://localhost:8080/connections' : null,
      message: needsConnection.length > 0
        ? `Flow created. Connect these services in Activepieces to activate it: ${needsConnection.join(', ')}`
        : 'Flow created with all steps. Open Activepieces to publish and activate it.',
    })
  } catch (err: any) {
    console.error('[AP build]', err.message)
    res.status(503).json({ error: err.message })
  }
})
