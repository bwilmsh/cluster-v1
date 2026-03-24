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
  onComplete: () => void
}

export function SetupModal({ agentId, agentName, onComplete }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.agents
      .generateQuestions(agentName)
      .then((data) => {
        setQuestions(data.questions ?? [])
      })
      .finally(() => setLoading(false))
  }, [agentName])

  function setAnswer(qId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qId]: value }))
    setCustomAnswers((prev) => ({ ...prev, [qId]: '' }))
  }

  function setCustom(qId: string, value: string) {
    setCustomAnswers((prev) => ({ ...prev, [qId]: value }))
    setAnswers((prev) => ({ ...prev, [qId]: '__custom__' }))
  }

  async function handleSubmit() {
    const finalAnswers: Record<string, string> = {}
    for (const q of questions) {
      const val = answers[q.id]
      if (val === '__custom__') {
        finalAnswers[q.question] = customAnswers[q.id] ?? ''
      } else {
        finalAnswers[q.question] = val ?? ''
      }
    }
    setSaving(true)
    await api.agents.update(agentId, { setupAnswers: finalAnswers })
    onComplete()
  }

  const allAnswered = questions.every(
    (q) =>
      (answers[q.id] && answers[q.id] !== '__custom__') ||
      (answers[q.id] === '__custom__' && customAnswers[q.id]?.trim())
  )

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface-raised border border-surface-border rounded-2xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Set up {agentName}</h2>
        <p className="text-sm text-white/40 mb-6">
          Answer a few questions to help your agent understand their role.
        </p>

        {loading ? (
          <div className="text-white/30 text-sm text-center py-8">Generating questions...</div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, i) => (
              <div key={q.id}>
                <p className="text-sm font-medium text-white/80 mb-2">
                  {i + 1}. {q.question}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswer(q.id, opt)}
                      className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                        answers[q.id] === opt
                          ? 'border-accent bg-accent/10 text-white'
                          : 'border-surface-border text-white/50 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Or type a custom answer..."
                  value={customAnswers[q.id] ?? ''}
                  onChange={(e) => setCustom(q.id, e.target.value)}
                  className="w-full bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-white/30"
                />
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={!allAnswered || saving}
              className="w-full py-2.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Saving...' : 'Finish setup'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
