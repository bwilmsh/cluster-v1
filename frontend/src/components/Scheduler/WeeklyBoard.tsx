'use client'
import React, { useEffect, useState } from 'react'

type Event = {
  id: string
  title: string
  start_time: string
  end_time?: string
  itemType?: string
  location?: string
}

type SourceKind = 'google' | 'task' | 'habit' | 'event'

function classifyEvent(e: Event): SourceKind {
  if (e.itemType === 'habit') return 'habit'
  if (e.itemType === 'task') return 'task'
  return 'event'
}

const START_HOUR = 6
const END_HOUR = 23
const HOUR_COUNT = END_HOUR - START_HOUR + 1
const VIEW_MINUTES = HOUR_COUNT * 60
const VIEW_START_MIN = START_HOUR * 60
const VIEW_END_MIN = (END_HOUR + 1) * 60
const TIME_COL = '64px'

function startOfWeek(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function hourFromX(clientX: number, rect: DOMRect) {
  const x = clientX - rect.left
  const pct = Math.max(0, Math.min(1, x / rect.width))
  return Math.max(START_HOUR, Math.min(END_HOUR, Math.floor(START_HOUR + pct * HOUR_COUNT)))
}

export default function WeeklyBoard({
  events = [],
  onDropEvent,
  onCreate,
  onEdit,
  onResize,
}: {
  events?: Event[]
  onDropEvent?: (eventId: string, dateISO: string) => void
  onCreate?: (dateISO: string) => void
  onEdit?: (id: string) => void
  onResize?: (id: string, deltaMinutes: number) => void
}) {
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const weekStart = startOfWeek(now)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => START_HOUR + i)

  function getEventsForDay(day: Date) {
    return events.filter((e) => new Date(e.start_time).toDateString() === day.toDateString())
  }

  function handleSlotClick(e: React.MouseEvent, day: Date) {
    if ((e.target as HTMLElement).closest('[draggable], button')) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const hour = hourFromX(e.clientX, rect)
    const d = new Date(day)
    d.setHours(hour, 0, 0, 0)
    onCreate?.(d.toISOString())
  }

  const gridCols = `${TIME_COL} repeat(${HOUR_COUNT}, 1fr)`

  return (
    <div className="w-full overflow-auto" style={{ background: 'var(--bg)' }}>
      {/* Hour header */}
      <div
        className="grid sticky top-0 z-10"
        style={{
          gridTemplateColumns: gridCols,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        <div />
        {hours.map((h) => (
          <div
            key={h}
            className="text-[10px] text-center py-1.5 font-medium tabular-nums tracking-wide"
            style={{
              color: 'var(--text-tertiary)',
              borderLeft: h === START_HOUR ? '1px solid var(--border)' : 'none',
            }}
          >
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>

      {/* Day rows */}
      <div>
        {days.map((day, idx) => {
          const dayEvents = getEventsForDay(day)
          const isToday = day.toDateString() === now.toDateString()
          const altRow = idx % 2 === 1
          const rowBg = isToday
            ? 'color-mix(in srgb, var(--accent) 7%, transparent)'
            : altRow
              ? 'color-mix(in srgb, var(--bg-secondary) 45%, transparent)'
              : 'transparent'

          return (
            <div
              key={day.toDateString()}
              className="grid items-stretch"
              style={{
                gridTemplateColumns: gridCols,
                borderBottom: '1px solid var(--border)',
                minHeight: 52,
                background: rowBg,
              }}
            >
              {/* Day label */}
              <div
                className="flex flex-col justify-center px-2"
                style={{
                  borderRight: '1px solid var(--border)',
                  borderLeft: `3px solid ${isToday ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <div
                  className="text-sm font-semibold leading-none"
                  style={{ color: isToday ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </div>
                <div
                  className="text-[11px] leading-none mt-1 tabular-nums"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {day.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                </div>
              </div>

              {/* Time slots */}
              <div
                className="relative"
                onClick={(e) => handleSlotClick(e, day)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData('text/plain')
                  if (!id) return
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const hour = hourFromX(e.clientX, rect)
                  const d = new Date(day)
                  d.setHours(hour, 0, 0, 0)
                  onDropEvent?.(id, d.toISOString())
                }}
                style={{
                  gridColumn: '2 / -1',
                  cursor: 'pointer',
                }}
              >
                {/* Hour gridlines — every 3rd hour gets a stronger line */}
                {hours.map((h, i) => {
                  if (i === 0) return null
                  const stronger = (h - START_HOUR) % 3 === 0
                  return (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        left: `${(i / HOUR_COUNT) * 100}%`,
                        top: 0,
                        bottom: 0,
                        width: '1px',
                        background: stronger
                          ? 'var(--border)'
                          : 'color-mix(in srgb, var(--border) 45%, transparent)',
                        pointerEvents: 'none',
                      }}
                    />
                  )
                })}

                {/* Current time indicator (today only, within visible range) */}
                {isToday && (() => {
                  const minutes = now.getHours() * 60 + now.getMinutes()
                  if (minutes < VIEW_START_MIN || minutes > VIEW_END_MIN) return null
                  const pct = ((minutes - VIEW_START_MIN) / VIEW_MINUTES) * 100
                  return (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          left: `${pct}%`,
                          top: 0,
                          bottom: 0,
                          width: '2px',
                          background: 'var(--accent)',
                          boxShadow: '0 0 8px color-mix(in srgb, var(--accent) 60%, transparent)',
                          zIndex: 4,
                          pointerEvents: 'none',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          left: `${pct}%`,
                          top: '50%',
                          width: '8px',
                          height: '8px',
                          marginLeft: '-4px',
                          marginTop: '-4px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          zIndex: 5,
                          pointerEvents: 'none',
                        }}
                      />
                    </>
                  )
                })()}

                {/* Events */}
                {dayEvents.map((evt) => {
                  const start = new Date(evt.start_time)
                  const end = evt.end_time
                    ? new Date(evt.end_time)
                    : new Date(start.getTime() + 60 * 60 * 1000)
                  const startMin = start.getHours() * 60 + start.getMinutes()
                  const rawEndMin = end.getHours() * 60 + end.getMinutes()
                  const endMin = Math.max(startMin + 15, rawEndMin)
                  const cs = Math.max(VIEW_START_MIN, startMin)
                  const ce = Math.min(VIEW_END_MIN, endMin)
                  if (ce <= VIEW_START_MIN || cs >= VIEW_END_MIN) return null
                  const startPct = ((cs - VIEW_START_MIN) / VIEW_MINUTES) * 100
                  const widthPct = Math.max(1.5, ((ce - cs) / VIEW_MINUTES) * 100)
                  const kind = classifyEvent(evt)
                  const palette = kind === 'habit'
                    ? { bg: 'var(--calendar-habit-bg)', color: 'var(--text-primary)' }
                    : { bg: 'var(--accent)', color: 'white' }

                  return (
                    <div
                      key={evt.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', evt.id)
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit?.(evt.id)
                      }}
                      className="absolute rounded-md px-2 text-[11px] font-medium text-white cursor-move hover:brightness-110 transition-all overflow-hidden"
                      style={{
                        left: `${startPct}%`,
                        width: `${widthPct}%`,
                        top: '4px',
                        bottom: '4px',
                        background: palette.bg,
                        color: palette.color,
                        boxShadow:
                          '0 1px 2px rgba(0,0,0,0.18), inset 0 0 0 1px color-mix(in srgb, white 18%, transparent)',
                        zIndex: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                      }}
                      title={evt.title}
                    >
                      <div className="truncate leading-tight">{evt.title}</div>
                      <div className="text-[10px] opacity-90 leading-tight truncate tabular-nums">
                        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {evt.end_time
                          ? ' – ' + end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
