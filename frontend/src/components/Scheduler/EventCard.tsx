import React from 'react'

type Event = {
  id: string
  title: string
  start_time: string
  end_time?: string
  itemType?: string
  location?: string
}

export default function EventCard({
  event,
  onEdit,
  onResize,
}: {
  event: Event
  onEdit?: (id: string) => void
  onResize?: (id: string, deltaMinutes: number) => void
}) {
  const start = new Date(event.start_time)
  const end = event.end_time ? new Date(event.end_time) : undefined

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/plain', event.id)
    // allow move
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleEdit() {
    if (onEdit) onEdit(event.id)
  }

  function handleResize(delta: number) {
    if (onResize) onResize(event.id, delta)
  }

  return (
    <div draggable onDragStart={onDragStart} className="bg-blue-600 rounded shadow p-2 mb-1 cursor-move text-white text-xs" data-event-id={event.id}>
      <div className="font-semibold truncate">{event.title}</div>
      <div className="text-blue-100 text-xs">
        {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {end ? ` – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>
      {event.location ? <div className="text-blue-50 text-xs truncate">📍 {event.location}</div> : null}
      <div className="flex gap-1 mt-1">
        <button onClick={handleEdit} className="text-xs px-2 py-0.5 bg-blue-700 hover:bg-blue-800 rounded transition-colors">Edit</button>
      </div>
    </div>
  )
}
