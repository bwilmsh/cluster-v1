import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  Notification,
  nativeImage,
  dialog,
} from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'
import dotenv from 'dotenv'
import { autoUpdater } from 'electron-updater'
import { runComputerUse, stopComputerUse } from './computer-use'

// ─── Init ─────────────────────────────────────────────────────────────────────

// Try loading .env from several locations (dev first, then packaged app dir)
const envCandidates = [
  path.join(__dirname, '..', '..', '.env'),           // dev: cluster/.env
  path.join(path.dirname(app.getPath('exe')), '.env'), // next to installed exe
  path.join(process.resourcesPath ?? '', '..', '.env'),
]
for (const p of envCandidates) {
  if (fs.existsSync(p)) { dotenv.config({ path: p }); break }
}

const isDev = !app.isPackaged

// Simple JSON settings file (avoids electron-store type issues)
function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}
function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch { return {} }
}
function writeSetting(key: string, value: unknown): void {
  const settings = readSettings()
  settings[key] = value
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2))
}
function getSetting<T>(key: string, defaultValue: T): T {
  return (readSettings()[key] as T) ?? defaultValue
}

function getAnthropicKey(): string | null {
  // 1. System/process env var (works in dev via .env)
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  // 2. Saved in app settings
  return getSetting<string | null>('anthropicApiKey', null)
}

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'
const BACKEND_PORT = process.env.BACKEND_PORT ?? '3001'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
const childProcesses: ChildProcess[] = []

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  win.once('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (tray) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

async function loadWindow(win: BrowserWindow) {
  if (isDev) {
    await win.loadURL(FRONTEND_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Production: serve Next.js standalone
    await win.loadURL(`http://localhost:3000`)
  }
}

// ─── Service Spawning (production only) ───────────────────────────────────────

function spawnService(name: string, command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ChildProcess {
  const proc = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
  })

  proc.stdout?.on('data', (d) => console.log(`[${name}]`, d.toString().trim()))
  proc.stderr?.on('data', (d) => console.error(`[${name}]`, d.toString().trim()))
  proc.on('exit', (code) => console.log(`[${name}] exited with code ${code}`))

  childProcesses.push(proc)
  return proc
}

function spawnServicesIfProduction() {
  if (isDev) return // In dev, services are started separately

  const root = path.join(app.getAppPath(), '..', '..') // up from resources/app

  // Backend
  spawnService('backend', 'node', ['backend/dist/index.js'], root)

  // Agent (Python) — assumes python3 in PATH or bundled
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  spawnService('agent', pythonCmd, ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000'], path.join(root, 'agent'))

  // Next.js standalone (if built)
  const nextServer = path.join(root, 'frontend', '.next', 'standalone', 'server.js')
  if (fs.existsSync(nextServer)) {
    spawnService('frontend', 'node', [nextServer], root, { PORT: '3000', HOSTNAME: '127.0.0.1' })
  }
}

// ─── System Tray ──────────────────────────────────────────────────────────────

function createTray(): Tray {
  // Use a simple 16x16 icon — replace with real icon in production
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()

  const t = new Tray(icon)
  t.setToolTip('Cluster — Your AI team')

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Cluster',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    {
      label: 'Dashboard',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.loadURL(FRONTEND_URL + '/')
      },
    },
    {
      label: 'Cluster AI',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
        mainWindow?.webContents.loadURL(FRONTEND_URL + '/cluster')
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray = null // allow close
        app.quit()
      },
    },
  ])

  t.setContextMenu(menu)
  t.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  return t
}

// ─── Auto Updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(win: BrowserWindow) {
  autoUpdater.logger = console

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('app:update-available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('app:update-downloaded', info)

    new Notification({
      title: 'Cluster update ready',
      body: `Version ${info.version} has been downloaded. Restart to apply.`,
    }).show()
  })

  // Check once per hour
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify()
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 60 * 60 * 1000)
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers(win: BrowserWindow) {

  // ── Computer use: permission ──────────────────────────────────────────────

  ipcMain.handle('computer-use:check-permission', () => {
    return getSetting<boolean>('computerUsePermission', false)
  })

  ipcMain.handle('computer-use:request-permission', async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Computer Control',
      message: 'Allow Computer Control?',
      detail:
        'Cluster will control your mouse and keyboard to complete tasks on your behalf.\n\n' +
        '• Only activates when you explicitly start a task\n' +
        '• You can stop it at any time\n' +
        '• All actions are logged in the agent\'s activity\n\n' +
        'You can revoke this permission in Settings at any time.',
      buttons: ['Allow', 'Don\'t Allow'],
      defaultId: 0,
      cancelId: 1,
    })

    const granted = response === 0
    writeSetting('computerUsePermission', granted)
    return granted
  })

  // ── Computer use: run ─────────────────────────────────────────────────────

  ipcMain.handle('computer-use:start', async (_event, task: string) => {
    const hasPermission = getSetting<boolean>('computerUsePermission', false)
    if (!hasPermission) throw new Error('Computer control permission not granted')

    const apiKey = getAnthropicKey()
    if (!apiKey) throw new Error('Anthropic API key not set. Go to Settings → API Key to add it.')

    try {
      const result = await runComputerUse(task, win, apiKey)
      win.webContents.send('computer-use:update', { status: 'complete', result })
      return result
    } catch (err: any) {
      win.webContents.send('computer-use:update', { status: 'error', action: err.message })
      throw err
    }
  })

  // ── Settings: API key ─────────────────────────────────────────────────────

  ipcMain.handle('settings:get-api-key-set', () => !!getAnthropicKey())

  ipcMain.handle('settings:set-api-key', (_event, key: string) => {
    writeSetting('anthropicApiKey', key.trim())
    process.env.ANTHROPIC_API_KEY = key.trim()
  })

  ipcMain.handle('settings:clear-api-key', () => {
    writeSetting('anthropicApiKey', null)
    delete process.env.ANTHROPIC_API_KEY
  })

  ipcMain.on('computer-use:stop', () => {
    stopComputerUse()
  })

  // ── Desktop notifications ─────────────────────────────────────────────────

  ipcMain.on('desktop:notify', (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })

  // ── File access ───────────────────────────────────────────────────────────

  ipcMain.handle('desktop:open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Open file',
      properties: ['openFile'],
      filters: [
        { name: 'Text files', extensions: ['txt', 'md', 'csv', 'json', 'ts', 'js', 'py'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })

    if (canceled || !filePaths.length) return null

    const filePath = filePaths[0]
    const content = fs.readFileSync(filePath, 'utf-8')
    return { path: filePath, content: content.slice(0, 50000) }
  })

  // ── App ───────────────────────────────────────────────────────────────────

  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.on('app:check-update', () => {
    if (!isDev) autoUpdater.checkForUpdatesAndNotify()
  })

  ipcMain.on('app:install-update', () => {
    autoUpdater.quitAndInstall()
  })
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  spawnServicesIfProduction()

  // Brief wait for services to start (production only)
  if (!isDev) await new Promise((r) => setTimeout(r, 3000))

  mainWindow = createWindow()
  tray = createTray()
  registerIpcHandlers(mainWindow)
  setupAutoUpdater(mainWindow)
  await loadWindow(mainWindow)
})

app.on('window-all-closed', () => {
  // On macOS, keep app alive in tray
  if (process.platform !== 'darwin') {
    // Only quit if tray was removed
    if (!tray) app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('before-quit', () => {
  for (const proc of childProcesses) {
    proc.kill()
  }
})
