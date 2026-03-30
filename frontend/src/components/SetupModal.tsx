'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface Question {
  id: string
  question: string
  options: string[]
}

interface Props {
  agentId: string
  agentName: string
  businessContext?: string
  onComplete: () => void
}

export function SetupModal({ agentId, agentName, businessContext, onComplete }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [textValues, setTextValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Combine name + business context so questions are tailored to both
    const context = businessContext
      ? `${agentName} — ${businessContext}`
      : agentName
    api.agents
      .generateQuestions(context)
      .then((data) => setQuestions(data.questions ?? []))
      .finally(() => setLoading(false))
  }, [agentName, businessContext])

  function handleDropdownChange(qId: string, value: string) {
    if (value === '') return
    setTextValues((prev) => ({ ...prev, [qId]: value }))
  }

  function handleTextChange(qId: string, value: string) {
    setTextValues((prev) => ({ ...prev, [qId]: value }))
  }

  async function handleSubmit() {
    const finalAnswers: Record<string, string> = {}
    // Pre-seed business context so agent always has this in memory
    if (businessContext) {
      finalAnswers['Business type / role'] = businessContext
    }
    for (const q of questions) {
      finalAnswers[q.question] = textValues[q.id]?.trim() ?? ''
    }
    setSaving(true)
    await api.agents.update(agentId, { setupAnswers: finalAnswers })
    onComplete()
  }

  const allAnswered = questions.every((q) => textValues[q.id]?.trim())

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Set up {agentName}</h2>
        <p className="text-sm text-white/40 mb-6">
          A few quick questions so your agent knows what they&apos;re working with.
        </p>

        {loading ? (
          <div className="text-white/30 text-sm text-center py-8">Thinking of the right questions...</div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, i) => (
              <div key={q.id}>
                <p className="text-sm font-medium text-white/80 mb-2">
                  {i + 1}. {q.question}
                </p>
                <select
                  onChange={(e) => handleDropdownChange(q.id, e.target.value)}
                  defaultValue=""
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-white/30 mb-2 appearance-none"
                >
                  <option value="" disabled>
                    Pick an option...
                  </option>
                  {q.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Or type your own..."
                  value={textValues[q.id] ?? ''}
                  onChange={(e) => handleTextChange(q.id, e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-white/30"
                />
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={!allAnswered || saving}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Setting up...' : "Let's go"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
