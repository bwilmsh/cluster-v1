'use client'
import React, { useState } from 'react'

type EventRec = {
  id: string
  title: string
  start_time: string
  end_time?: string
  status?: string
  location?: string
}

export default function DayView({ events, onEdit, onDelete }: { events: EventRec[]; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const [currentDate, setCurrentDate] = useState(new Date())

  const dateStr = currentDate.toISOString().split('T')[0]
  const dayEvents = events
    .filter(e => {
      const eventDate = new Date(e.start_time)
      return eventDate.toISOString().split('T')[0] === dateStr
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

  const goToPrevDay = () => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() - 1)
    setCurrentDate(d)
  }

  const goToNextDay = () => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + 1)
    setCurrentDate(d)
  }

  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const dayName = currentDate.toLocaleString('default', { weekday: 'long' })
  const monthDay = currentDate.toLocaleString('default', { month: 'short', day: 'numeric' })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {dayName}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {monthDay}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={goToPrevDay} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            ← Prev
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            Today
          </button>
          <button onClick={goToNextDay} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            Next →
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {dayEvents.length === 0 ? (
          <div className="text-center py-12">
            <p style={{ color: 'var(--text-tertiary)' }}>No events scheduled for this day</p>
          </div>
        ) : (
          dayEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-4 rounded-lg border"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {evt.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatTime(evt.start_time)}
                      {evt.end_time && ` - ${formatTime(evt.end_time)}`}
                    </span>
                    {evt.location && (
                      <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        📍 {evt.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(evt.id)}
                    className="px-2 py-1 rounded text-xs"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(evt.id)}
                    className="px-2 py-1 rounded text-xs"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
