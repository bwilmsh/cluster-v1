interface ElectronAPI {
  isElectron: true

  computerUse: {
    checkPermission: () => Promise<boolean>
    requestPermission: () => Promise<boolean>
    start: (task: string) => Promise<string>
    stop: () => void
    onUpdate: (cb: (data: { status: string; action?: string; result?: string }) => void) => () => void
    onScreenshot: (cb: (dataUrl: string) => void) => () => void
  }

  settings: {
    isApiKeySet: () => Promise<boolean>
    setApiKey: (key: string) => Promise<void>
    clearApiKey: () => Promise<void>
  }

  notify: (title: string, body: string) => void

  openFileDialog: () => Promise<{ path: string; content: string } | null>

  app: {
    version: () => Promise<string>
    checkForUpdates: () => void
    onUpdateAvailable: (cb: (info: any) => void) => () => void
    onUpdateDownloaded: (cb: (info: any) => void) => () => void
    installUpdate: () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
