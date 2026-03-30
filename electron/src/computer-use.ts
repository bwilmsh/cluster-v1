import { BrowserWindow, desktopCapturer, screen } from 'electron'
import Anthropic from '@anthropic-ai/sdk'

let abortSignal = false

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

// ─── Computer Use Loop ────────────────────────────────────────────────────────

export async function runComputerUse(
  task: string,
  win: BrowserWindow,
  apiKey: string,
): Promise<string> {
  abortSignal = false
  const client = new Anthropic({ apiKey })
  const { width, height } = screen.getPrimaryDisplay().size

  const sendUpdate = (status: string, action?: string) =>
    win.webContents.send('computer-use:update', { status, action })

  const sendScreenshot = (dataUrl: string) =>
    win.webContents.send('computer-use:screenshot', dataUrl)

  type MessageContent = Anthropic.Beta.BetaContentBlockParam | { type: 'tool_result'; tool_use_id: string; content: any }

  const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
    { role: 'user', content: task },
  ]

  let result = 'Task completed.'
  const MAX_ITERATIONS = 25

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (abortSignal) {
      result = 'Stopped by user.'
      break
    }

    sendUpdate('thinking')

    const response = await (client.beta.messages as any).create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      tools: [
        {
          type: 'computer_20250124',
          name: 'computer',
          display_width_px: width,
          display_height_px: height,
          display_number: 1,
        },
      ],
      messages,
      betas: ['computer-use-2025-01-24'],
    })

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b: any) => b.type === 'text')
      result = textBlock?.text ?? 'Task completed.'
      break
    }

    if (response.stop_reason !== 'tool_use') break

    // Process tool calls
    const toolResults: MessageContent[] = []

    for (const block of response.content as any[]) {
      if (block.type !== 'tool_use') continue
      const actionInput = block.input as Record<string, any>
      const action = actionInput.action as string

      sendUpdate('acting', action)

      if (action === 'screenshot') {
        const screenshot = await captureScreen()
        sendScreenshot(screenshot)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.replace(/^data:image\/png;base64,/, ''),
              },
            },
          ],
        })
      } else {
        await executeAction(action, actionInput)
        await sleep(300) // brief pause after each action
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Action "${action}" executed successfully.`,
        })
      }
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
  }

  return result
}
