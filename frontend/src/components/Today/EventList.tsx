'use client'
import React from 'react'

type EventRec = {
  id: string
  title: string
  start_time: string
  end_time?: string
  itemType?: string
  status?: string
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatWeekday(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short' })
}

export default function EventList({
  todaysEvents,
  restOfWeekEvents,
  onEdit,
}: {
  todaysEvents: EventRec[]
  restOfWeekEvents: EventRec[]
  onEdit: (id: string) => void
}) {
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
        Today's Events
      </h2>

      {/* Today */}
      {todaysEvents.length === 0 ? (
        <div
          className="text-sm py-2 px-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          No events today.
        </div>
      ) : (
        <ul className="space-y-0.5 -mx-1">
          {todaysEvents.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onEdit(e.id)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-left transition-colors"
                onMouseEnter={(ev) =>
                  (ev.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                }
                onMouseLeave={(ev) =>
                  (ev.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span
                  className="text-xs tabular-nums shrink-0 w-12"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {formatTime(e.start_time)}
                </span>
                <span
                  className="text-sm truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {e.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Rest of week */}
      {restOfWeekEvents.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-5 mb-2" aria-hidden>
            <span
              className="flex-1 h-px"
              style={{ background: 'var(--border)' }}
            />
            <h3
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Rest of week
            </h3>
            <span
              className="flex-1 h-px"
              style={{ background: 'var(--border)' }}
            />
          </div>
          <ul className="space-y-0.5 -mx-1 overflow-y-auto">
            {restOfWeekEvents.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onEdit(e.id)}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-left transition-colors"
                  onMouseEnter={(ev) =>
                    (ev.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                  }
                  onMouseLeave={(ev) =>
                    (ev.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span
                    className="text-xs font-medium shrink-0 w-9"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {formatWeekday(e.start_time)}
                  </span>
                  <span
                    className="text-xs tabular-nums shrink-0 w-12"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    {formatTime(e.start_time)}
                  </span>
                  <span
                    className="text-sm truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {e.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
