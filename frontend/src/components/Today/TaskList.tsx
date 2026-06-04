'use client'
import React, { useState } from 'react'

type Task = {
  id: string
  title: string
  description?: string
  status?: string
  priority?: string
  tags?: string[]
}

export default function TaskList({
  tasks,
  onCreate,
  onOpenFullModal,
  onToggleDone,
  onEdit,
}: {
  tasks: Task[]
  onCreate: (title: string) => void
  onOpenFullModal: () => void
  onToggleDone: (id: string) => void
  onEdit: (id: string) => void
}) {
  const [draft, setDraft] = useState('')

  function submit() {
    const t = draft.trim()
    if (!t) return
    onCreate(t)
    setDraft('')
  }

  return (
    <section
      className="rounded-lg p-4 flex flex-col"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <h2
        className="text-[11px] font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Tasks
      </h2>

      {/* Quick-add */}
      <div
        className="flex items-center gap-1 mb-3 pb-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <label htmlFor="today-quick-add" className="sr-only">
          Add a task
        </label>
        <input
          id="today-quick-add"
          type="text"
          placeholder="+ Add a task..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          className="flex-1 bg-transparent outline-none text-sm py-1.5 px-1 placeholder:text-[color:var(--text-tertiary)]"
          style={{ color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={onOpenFullModal}
          className="shrink-0 w-7 h-7 rounded text-base leading-none flex items-center justify-center transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          aria-label="More options"
          title="More options"
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = 'transparent')
          }
        >
          ⋯
        </button>
      </div>

      {/* List */}
      {tasks.length === 0 ? (
        <div
          className="text-sm text-center py-8"
          style={{ color: 'var(--text-tertiary)' }}
        >
          All clear. Add a task above to get started.
        </div>
      ) : (
        <ul className="-mx-1 space-y-0.5 max-h-[420px] overflow-y-auto">
          {tasks.map((t) => {
            const isInProgress = t.status === 'in-progress'
            return (
              <li key={t.id}>
                <div
                  className="flex items-center gap-2.5 px-2 py-2 rounded-md transition-colors"
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleDone(t.id)
                    }}
                    className="shrink-0 w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors"
                    style={{
                      border: `1.5px solid ${isInProgress ? 'var(--accent)' : 'var(--text-tertiary)'}`,
                      background: isInProgress
                        ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                        : 'transparent',
                    }}
                    aria-label={`Mark "${t.title}" done`}
                    title="Mark done"
                  >
                    {isInProgress && (
                      <span
                        className="block w-1.5 h-1.5 rounded-[1px]"
                        style={{ background: 'var(--accent)' }}
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(t.id)}
                    className="flex-1 text-left text-sm truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {t.title}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
