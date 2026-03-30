'use client'

import { useEffect, useRef, useState } from 'react'

interface ComputerUsePanelProps {
  agentName: string
  onResult: (result: string) => void
  onClose: () => void
}

type Phase = 'task-entry' | 'permission' | 'running' | 'done' | 'error'

const ACTION_LABELS: Record<string, string> = {
  screenshot: 'Taking screenshot…',
  left_click: 'Clicking…',
  right_click: 'Right-clicking…',
  double_click: 'Double-clicking…',
  mouse_move: 'Moving mouse…',
  type: 'Typing…',
  key: 'Pressing key…',
  scroll: 'Scrolling…',
  thinking: 'Thinking…',
  acting: 'Acting…',
  complete: 'Done',
  error: 'Error',
}

export function ComputerUsePanel({ agentName, onResult, onClose }: ComputerUsePanelProps) {
  const [phase, setPhase] = useState<Phase>('task-entry')
  const [task, setTask] = useState('')
  const [status, setStatus] = useState('Initializing…')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const cleanupRef = useRef<(() => void)[]>([])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).electronAPI

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((fn) => fn())
    }
  }, [])

  async function handleStart() {
    if (!task.trim()) return

    // Check permission first
    const hasPermission = await api.computerUse.checkPermission()
    if (!hasPermission) {
      setPhase('permission')
      return
    }
    startTask()
  }

  async function handleGrantPermission() {
    const granted = await api.computerUse.requestPermission()
    if (granted) startTask()
    else setPhase('task-entry')
  }

  function startTask() {
    setPhase('running')
    setScreenshot(null)
    setStatus('Starting…')

    // Subscribe to updates
    const unsubUpdate = api.computerUse.onUpdate(({ status: s, action, result: r }: any) => {
      if (s === 'thinking') setStatus('Thinking…')
      else if (s === 'acting' && action) setStatus(ACTION_LABELS[action] ?? `Performing: ${action}`)
      else if (s === 'complete') {
        setResult(r ?? 'Done.')
        setPhase('done')
      } else if (s === 'error') {
        setError(action ?? 'Unknown error')
        setPhase('error')
      }
    })

    const unsubScreenshot = api.computerUse.onScreenshot((url: string) => {
      setScreenshot(url)
    })

    cleanupRef.current = [unsubUpdate, unsubScreenshot]

    // Start the computer use task (fires and forgets — updates come via events)
    api.computerUse.start(task).catch((err: Error) => {
      setError(err.message)
      setPhase('error')
    })
  }

  function handleStop() {
    api.computerUse.stop()
    setPhase('done')
    setResult('Stopped.')
  }

  function handleAcceptResult() {
    onResult(result || 'Computer control task completed.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              phase === 'running' ? 'bg-yellow-400 animate-pulse' :
              phase === 'done' ? 'bg-green-400' :
              phase === 'error' ? 'bg-red-400' :
              'bg-white/20'
            }`} />
            <h2 className="text-white font-medium text-sm">
              {phase === 'running' ? 'Computer Control Active' :
               phase === 'done' ? 'Task Complete' :
               phase === 'error' ? 'Error' :
               phase === 'permission' ? 'Permission Required' :
               `${agentName} — Computer Control`}
            </h2>
          </div>
          {phase !== 'running' && (
            <button onClick={onClose} className="text-white/30 hover:text-white/70 text-xl leading-none transition-colors">
              ×
            </button>
          )}
        </div>

        {/* Task Entry */}
        {phase === 'task-entry' && (
          <div className="p-6 space-y-4">
            <p className="text-white/50 text-sm">
              Describe what you want {agentName} to do on your computer. Be specific about the goal.
            </p>
            <textarea
              autoFocus
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleStart() }}
              placeholder="e.g. Open Chrome, go to analytics.google.com, and take a screenshot of today's traffic stats"
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 resize-none focus:outline-none focus:border-white/20 transition-colors"
            />
            <div className="flex gap-3">
              <button
                onClick={handleStart}
                disabled={!task.trim()}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-30"
              >
                Start Task
              </button>
              <button onClick={onClose} className="px-5 py-2.5 text-white/40 hover:text-white text-sm transition-colors">
                Cancel
              </button>
            </div>
            <p className="text-white/20 text-xs">
              The agent will control your mouse and keyboard. You can stop it at any time.
            </p>
          </div>
        )}

        {/* Permission */}
        {phase === 'permission' && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-400/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium text-sm mb-1">Computer Control Permission</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  Cluster needs permission to control your mouse and keyboard to complete this task. This only activates when you explicitly start a task.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleGrantPermission}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Allow Computer Control
              </button>
              <button onClick={onClose} className="px-5 py-2.5 text-white/40 hover:text-white text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Running */}
        {phase === 'running' && (
          <div className="p-6 space-y-4">
            {/* Live screenshot */}
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/5 aspect-video">
              {screenshot ? (
                <img src={screenshot} alt="Screen" className="w-full h-full object-contain" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex gap-1.5">
                    {[0, 150, 300].map((delay) => (
                      <div key={delay} className="w-2 h-2 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              {/* Status overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
                <p className="text-white/70 text-xs font-mono">{status}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-white/60 text-sm">Computer control active</span>
              </div>
              <button
                onClick={handleStop}
                className="px-4 py-2 border border-red-400/30 text-red-400 hover:bg-red-400/10 rounded-lg text-sm transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="p-6 space-y-4">
            <div className="bg-white/3 rounded-xl p-4 border border-white/5">
              <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{result}</p>
            </div>
            {screenshot && (
              <img src={screenshot} alt="Final state" className="w-full rounded-lg border border-white/5 opacity-70" />
            )}
            <div className="flex gap-3">
              <button
                onClick={handleAcceptResult}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Add to Chat
              </button>
              <button onClick={onClose} className="px-5 py-2.5 text-white/40 hover:text-white text-sm transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="p-6 space-y-4">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => setPhase('task-entry')}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
