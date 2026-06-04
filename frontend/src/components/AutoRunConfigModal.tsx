'use client'

import { useEffect, useState } from 'react'
import { api, AutoRunConfig, DueDateItem } from '@/lib/api'

interface AutoRunConfigModalProps {
  item: DueDateItem
  isOpen: boolean
  onClose: () => void
  onSave: (config: AutoRunConfig) => void
}

const ACTION_OPTIONS = [
  { value: 'sendEmail', label: 'Send email', description: 'Open email composer' },
  { value: 'createCalendarEvent', label: 'Create calendar event', description: 'Add to calendar' },
  { value: 'markTaskComplete', label: 'Mark task complete', description: 'Auto-complete task' },
  { value: 'sendNotification', label: 'Send notification', description: 'Desktop notification' },
]

export function AutoRunConfigModal({ item, isOpen, onClose, onSave }: AutoRunConfigModalProps) {
  const [enabled, setEnabled] = useState(false)
  const [actionType, setActionType] = useState<string>('sendNotification')
  const [emailRecipient, setEmailRecipient] = useState('')
  const [notificationText, setNotificationText] = useState('Reminder: ' + item.title)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    setLoading(true)
    setError(null)

    api.dueDates
      .getAutoRun(item.id)
      .then((config) => {
        setEnabled(config.enabled)
        setActionType(config.actionType)
        if (config.config?.emailRecipient) {
          setEmailRecipient(config.config.emailRecipient)
        }
        if (config.config?.notificationText) {
          setNotificationText(config.config.notificationText)
        }
      })
      .catch(() => {
        // No existing config, use defaults
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, item.id])

  async function handleSave() {
    try {
      setLoading(true)
      setError(null)

      const config = {
        emailRecipient: emailRecipient || undefined,
        notificationText: notificationText || undefined,
      }

      const result = await api.dueDates.setAutoRun(item.id, 'task', enabled, actionType, config)
      onSave(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save auto run config')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border p-6"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.32)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-white/40 hover:text-white/80 transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-5">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Auto Run Configuration
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {item.title}
          </p>
        </div>

        {error && (
          <div
            className="mb-4 rounded-lg border px-3 py-2 text-sm"
            style={{
              background: 'rgba(248, 113, 113, 0.08)',
              borderColor: 'rgba(248, 113, 113, 0.22)',
              color: '#fecaca',
            }}
          >
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* Enable toggle */}
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 rounded cursor-pointer"
                style={{
                  background: enabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                  borderColor: 'var(--border)',
                }}
              />
              <span style={{ color: 'var(--text-primary)' }} className="font-medium">
                Enable Auto Run
              </span>
            </label>
          </div>

          {/* Action type selection */}
          {enabled && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  Action
                </label>
                <div className="space-y-2">
                  {ACTION_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <input
                        type="radio"
                        name="action"
                        value={option.value}
                        checked={actionType === option.value}
                        onChange={(e) => setActionType(e.target.value)}
                        className="w-4 h-4 mt-1"
                      />
                      <div>
                        <p style={{ color: 'var(--text-primary)' }} className="font-medium">
                          {option.label}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional fields */}
              {actionType === 'sendEmail' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Email recipient
                  </label>
                  <input
                    type="email"
                    value={emailRecipient}
                    onChange={(e) => setEmailRecipient(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              {actionType === 'sendNotification' && (
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Notification text
                  </label>
                  <textarea
                    value={notificationText}
                    onChange={(e) => setNotificationText(e.target.value)}
                    placeholder="Enter notification message..."
                    className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                    rows={3}
                    style={{
                      background: 'var(--bg-tertiary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
