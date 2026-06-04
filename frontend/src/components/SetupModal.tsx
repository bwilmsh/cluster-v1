'use client'

import { useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  agentId: string
  agentName: string
  onComplete: (agentId: string) => void
}

export function SetupModal({ agentId, agentName, onComplete }: Props) {
  const [selectedIdentity, setSelectedIdentity] = useState('')
  const [customIdentity, setCustomIdentity] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const identityTiles: Array<{ id: string; label: string; tone: string }> = [
    { id: 'Work', label: 'Work', tone: 'Efficient' },
    { id: 'Business', label: 'Business', tone: 'Professional' },
    { id: 'Helpful', label: 'Helpful', tone: 'Friendly' },
    { id: 'Creative', label: 'Creative', tone: 'Inventive' },
    { id: 'Sales', label: 'Sales', tone: 'Persuasive' },
    { id: 'Support', label: 'Support', tone: 'Patient' },
    { id: 'Analyst', label: 'Analyst', tone: 'Data-driven' },
    { id: 'Other', label: 'Other', tone: 'Custom' },
  ]

  async function handleSubmit() {
    if (!selectedIdentity) return
    if (selectedIdentity === 'Other' && !customIdentity.trim()) return

    setSaveError('')
    const finalAnswers: Record<string, string> = {}

    const personalitySummary =
      selectedIdentity === 'Other'
        ? customIdentity.trim()
        : `${selectedIdentity} (${identityTiles.find((tile) => tile.id === selectedIdentity)?.tone ?? 'Custom'})`
    finalAnswers['Personality selection'] = personalitySummary

    setSaving(true)
    try {
      await api.agents.update(agentId, { setupAnswers: finalAnswers })
      onComplete(agentId)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save agent setup')
    } finally {
      setSaving(false)
    }
  }

  const identityReady = selectedIdentity && (selectedIdentity !== 'Other' || customIdentity.trim())

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Set up {agentName}</h2>
        <p className="text-sm text-white/40 mb-6">
          Choose your agent&apos;s personality.
        </p>

        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium text-white/80 mb-3">Choose personality</p>
            <div className="grid grid-cols-2 gap-3">
              {identityTiles.map((tile) => {
                const active = selectedIdentity === tile.id
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => setSelectedIdentity(tile.id)}
                    className={`text-left rounded-xl border px-4 py-4 transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 ring-1 ring-accent/50'
                        : 'border-surface-border bg-surface hover:border-white/25'
                    }`}
                  >
                    <p className="text-base font-semibold text-white">{tile.label}</p>
                    <p className="text-xs text-white/55 mt-1">{tile.tone}</p>
                  </button>
                )
              })}
            </div>

            {selectedIdentity === 'Other' && (
              <input
                type="text"
                placeholder="Describe your custom personality..."
                value={customIdentity}
                onChange={(e) => setCustomIdentity(e.target.value)}
                className="w-full mt-3 bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-white/30"
              />
            )}
          </div>

          {saveError && <p className="text-xs text-red-300">{saveError}</p>}

          <button
            onClick={handleSubmit}
            disabled={!identityReady || saving}
            className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving agent...' : 'Save Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
