'use client'
import React, { useState } from 'react'

type EventRec = {
  id: string
  title: string
  start_time: string
  end_time?: string
  status?: string
}

export default function MonthView({ events, onDayClick, onEventClick, onDropEvent }: { events: EventRec[]; onDayClick: (date: string) => void; onEventClick: (id: string) => void; onDropEvent?: (eventId: string, dateISO: string) => void }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())

  const days: Date[] = []
  let current = new Date(startDate)
  while (current <= lastDay || current.getDay() !== 0) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }

  const getEventsForDay = (date: Date) => {
    return events.filter(e => {
      const eventDate = new Date(e.start_time)
      return eventDate.getFullYear() === date.getFullYear() &&
             eventDate.getMonth() === date.getMonth() &&
             eventDate.getDate() === date.getDate()
    })
  }

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const formatDate = (date: Date) => date.toISOString().split('T')[0]
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long' })
  const now = new Date()

  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    e.dataTransfer.setData('eventId', eventId)
    e.dataTransfer.effectAllowed = 'move'
    e.stopPropagation()
  }

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateStr)
  }

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverDate(null)
    const eventId = e.dataTransfer.getData('eventId')
    if (eventId && onDropEvent) {
      const targetDateISO = date.toISOString().split('T')[0]
      onDropEvent(eventId, targetDateISO + 'T00:00:00Z')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          {monthName} {year}
        </h2>
        <div className="flex gap-2">
          <button onClick={goToPrevMonth} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            ← Prev
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            Today
          </button>
          <button onClick={goToNextMonth} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            Next →
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="p-3 text-center text-xs font-semibold" style={{ color: 'var(--text-secondary)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((date, i) => {
            const dayEvents = getEventsForDay(date)
            const isCurrentMonth = date.getMonth() === month
            const isToday = date.toDateString() === now.toDateString()
            const dateStr = formatDate(date)
            const isDragOver = dragOverDate === dateStr

            return (
              <div
                key={i}
                onClick={() => onDayClick(formatDate(date))}
                className="min-h-28 p-2 border-r border-b cursor-pointer transition-all"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: isDragOver ? 'var(--accent)' : (isCurrentMonth ? 'var(--bg-primary)' : 'var(--bg-secondary)'),
                  opacity: isDragOver ? 0.9 : (isCurrentMonth ? 1 : 0.5),
                }}
                onDragOver={(e) => handleDragOver(e, dateStr)}
                onDragLeave={() => setDragOverDate(null)}
                onDrop={(e) => handleDrop(e, date)}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'p-1 rounded-full w-fit' : ''}`} style={{ color: isToday ? '#fff' : 'var(--text-secondary)', backgroundColor: isToday ? 'var(--accent)' : 'transparent' }}>
                  {date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 2).map((evt) => (
                    <div
                      key={evt.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, evt.id)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEventClick(evt.id)
                      }}
                      className="text-xs px-1 py-0.5 rounded truncate cursor-move transition-opacity hover:opacity-80"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                      }}
                    >
                      {evt.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      +{dayEvents.length - 2} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
