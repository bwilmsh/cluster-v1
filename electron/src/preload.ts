import { contextBridge, ipcRenderer } from 'electron'

type Unsubscribe = () => void

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,

  // ─── Computer Use ──────────────────────────────────────────────────────────

  computerUse: {
    checkPermission: (): Promise<boolean> =>
      ipcRenderer.invoke('computer-use:check-permission'),

    requestPermission: (): Promise<boolean> =>
      ipcRenderer.invoke('computer-use:request-permission'),

    start: (task: string): Promise<string> =>
      ipcRenderer.invoke('computer-use:start', task),

    stop: (): void => ipcRenderer.send('computer-use:stop'),

    onUpdate: (cb: (data: { status: string; action?: string }) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, data: any) => cb(data)
      ipcRenderer.on('computer-use:update', handler)
      return () => ipcRenderer.off('computer-use:update', handler)
    },

    onScreenshot: (cb: (dataUrl: string) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, url: string) => cb(url)
      ipcRenderer.on('computer-use:screenshot', handler)
      return () => ipcRenderer.off('computer-use:screenshot', handler)
    },
  },

  // ─── Notifications ─────────────────────────────────────────────────────────

  notify: (title: string, body: string): void =>
    ipcRenderer.send('desktop:notify', { title, body }),

  // ─── Files ─────────────────────────────────────────────────────────────────

  openFileDialog: (): Promise<{ path: string; content: string } | null> =>
    ipcRenderer.invoke('desktop:open-file'),

  // ─── App ───────────────────────────────────────────────────────────────────

  settings: {
    isApiKeySet: (): Promise<boolean> => ipcRenderer.invoke('settings:get-api-key-set'),
    setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:set-api-key', key),
    clearApiKey: (): Promise<void> => ipcRenderer.invoke('settings:clear-api-key'),
  },

  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    checkForUpdates: (): void => ipcRenderer.send('app:check-update'),
    onUpdateAvailable: (cb: (info: any) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, info: any) => cb(info)
      ipcRenderer.on('app:update-available', handler)
      return () => ipcRenderer.off('app:update-available', handler)
    },
    onUpdateDownloaded: (cb: (info: any) => void): Unsubscribe => {
      const handler = (_: Electron.IpcRendererEvent, info: any) => cb(info)
      ipcRenderer.on('app:update-downloaded', handler)
      return () => ipcRenderer.off('app:update-downloaded', handler)
    },
    installUpdate: (): void => ipcRenderer.send('app:install-update'),
  },
})
