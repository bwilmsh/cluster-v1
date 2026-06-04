import { BrowserWindow, desktopCapturer, screen } from 'electron'
// Use global fetch available in recent Node/Electron runtimes

let abortSignal = false
const GROQ_BASE_URL = process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'

export function stopComputerUse() {
  abortSignal = true
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

async function captureScreen(): Promise<string> {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  })

  if (!sources.length) throw new Error('No screen sources found')
  // thumbnail.toDataURL() returns 'data:image/png;base64,...'
  return sources[0].thumbnail.toDataURL()
}

// ─── Mouse & Keyboard ─────────────────────────────────────────────────────────

async function executeAction(action: string, input: Record<string, any>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let robot: any
  try {
    robot = require('@jitsi/robotjs')
  } catch {
    console.warn('robotjs not available — install @jitsi/robotjs + VS Build Tools to enable mouse/keyboard. Skipping:', action)
    await sleep(500)
    return
  }

  switch (action) {
    case 'left_click': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      robot.mouseClick('left')
      break
    }
    case 'right_click': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      robot.mouseClick('right')
      break
    }
    case 'middle_click': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      robot.mouseClick('middle')
      break
    }
    case 'double_click': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      robot.mouseClick('left', true)
      break
    }
    case 'mouse_move': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      break
    }
    case 'left_click_drag': {
      const [sx, sy] = input.start_coordinate as [number, number]
      const [ex, ey] = input.end_coordinate as [number, number]
      robot.moveMouse(sx, sy)
      robot.mouseToggle('down', 'left')
      await sleep(50)
      robot.dragMouse(ex, ey)
      await sleep(50)
      robot.mouseToggle('up', 'left')
      break
    }
    case 'type': {
      robot.typeString(input.text as string)
      break
    }
    case 'key': {
      if (input.key) parseAndTapKey(input.key as string, robot)
      break
    }
    case 'wait':
    case 'pause': {
      const ms = Math.min(Number(input.duration ?? input.ms ?? 1000), 5000)
      await sleep(ms)
      break
    }
    case 'scroll': {
      const [x, y] = input.coordinate as [number, number]
      robot.moveMouse(x, y)
      const amount = Math.abs(input.delta_y ?? 3)
      const dir = (input.delta_y ?? 0) < 0 ? 'up' : 'down'
      robot.scrollMouse(0, dir === 'up' ? -amount : amount)
      break
    }
    default:
      console.log('Unhandled action:', action)
  }
}

function parseAndTapKey(keyStr: string | undefined, robot: any): void {
  if (!keyStr) return
  const parts = keyStr.split('+').map((s) => s.trim().toLowerCase())
  const modifiers: string[] = []
  let key = ''

  const modMap: Record<string, string> = {
    ctrl: 'control', control: 'control',
    shift: 'shift',
    alt: 'alt',
    cmd: 'command', meta: 'command', super: 'command',
  }
  const keyMap: Record<string, string> = {
    return: 'return', enter: 'return',
    tab: 'tab',
    escape: 'escape', esc: 'escape',
    space: 'space',
    backspace: 'backspace',
    delete: 'delete',
    up: 'up', down: 'down', left: 'left', right: 'right',
    home: 'home', end: 'end',
    pageup: 'pageup', pagedown: 'pagedown',
  }

  for (const part of parts) {
    if (modMap[part]) {
      modifiers.push(modMap[part])
    } else {
      key = keyMap[part] ?? part
    }
  }

  if (key) {
    robot.keyTap(key, modifiers.length ? modifiers : undefined)
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractJsonObject(text: string): Record<string, any> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

// ─── Computer Use Loop ────────────────────────────────────────────────────────

export async function runComputerUse(
  task: string,
  win: BrowserWindow,
  apiKey: string,
): Promise<string> {
  abortSignal = false

  const sendUpdate = (status: string, action?: string) =>
    win.webContents.send('computer-use:update', { status, action })

  const sendScreenshot = (dataUrl: string) =>
    win.webContents.send('computer-use:screenshot', dataUrl)

  const model = 'llama-3.2-90b-vision-preview'
  const systemPrompt = [
    'You are Cluster\'s desktop automation agent.',
    'Inspect the screenshot and return exactly one JSON object.',
    'Use this schema:',
    '{"action":"left_click|right_click|middle_click|double_click|mouse_move|left_click_drag|type|key|wait|pause|scroll|screenshot|finish","input":{},"status":"continue|done","result":"optional final text"}',
    'Coordinate-based actions must include coordinate arrays in pixels.',
    'If you need another view, return {"action":"screenshot","status":"continue"}.',
    'When the task is complete, return {"action":"finish","status":"done","result":"..."}.',
    'Do not include markdown fences or extra text.',
  ].join(' ')

  const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Task: ${task}` },
        { type: 'image_url', image_url: { url: await captureScreen() } },
      ],
    },
  ]

  sendScreenshot((messages[0].content as Array<{ type: string; image_url?: { url: string } }>).find((part) => part.type === 'image_url')!.image_url!.url)

  let result = 'Task completed.'
  const MAX_ITERATIONS = 25

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (abortSignal) {
      result = 'Stopped by user.'
      break
    }

    sendUpdate('thinking')

    // Build a simple prompt string for Groq from system + messages
    const parts: string[] = []
    parts.push(`SYSTEM: ${systemPrompt}`)
    for (const m of messages) {
      if (Array.isArray(m.content)) {
        const contentText = m.content
          .map((p: any) => (typeof p === 'string' ? p : p?.text ?? (p?.image_url?.url ? `[IMAGE] ${p.image_url.url}` : '')))
          .join(' ')
        parts.push(`${m.role.toUpperCase()}: ${contentText}`)
      } else {
        parts.push(`${m.role.toUpperCase()}: ${String(m.content)}`)
      }
    }

    const prompt = parts.join('\n')

    const resp = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: 1024,
      }),
    })
    const responseText = await resp.text()

    if (!resp.ok) {
      throw new Error(`Groq API error ${resp.status}: ${responseText.slice(0, 500)}`)
    }

    const data = JSON.parse(responseText)
    const rawText = String(data?.choices?.[0]?.message?.content ?? '')

    const plan = extractJsonObject(rawText)
    if (!plan) {
      result = rawText.trim() || 'Task completed.'
      break
    }

    const action = String(plan.action ?? '').trim()
    const actionInput = (plan.input ?? {}) as Record<string, any>

    if (plan.status === 'done' || action === 'finish') {
      result = String(plan.result ?? actionInput.result ?? rawText).trim() || 'Task completed.'
      break
    }

    if (!action) {
      result = 'Task completed.'
      break
    }

    sendUpdate('acting', action)

    if (action === 'screenshot') {
      const screenshot = await captureScreen()
      sendScreenshot(screenshot)
      messages.push({ role: 'assistant', content: rawText })
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Screenshot captured. Continue with the next action.' },
          { type: 'image_url', image_url: { url: screenshot } },
        ],
      })
      continue
    }

    await executeAction(action, actionInput)
    await sleep(300)

    const nextScreenshot = await captureScreen()
    sendScreenshot(nextScreenshot)

    messages.push({ role: 'assistant', content: rawText })
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `Executed ${action}. Continue from the updated screenshot.` },
        { type: 'image_url', image_url: { url: nextScreenshot } },
      ],
    })
  }

  return result
}
