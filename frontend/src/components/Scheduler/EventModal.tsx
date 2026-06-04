'use client'
import React, { useState } from 'react'
import { toLocalISOWithOffset } from '../../lib/time'

export default function EventModal({
  initial,
  event,
  onSave,
  onClose,
}: {
  initial?: any
  event?: any
  onSave: (payload: any) => void
  onClose: () => void
}) {
  const init = event || initial || {}
  const [title, setTitle] = useState(init.title || '')
  const [description, setDescription] = useState(init.description || '')
  const [date, setDate] = useState(init.date || (init.start_time ? new Date(init.start_time).toISOString().slice(0, 10) : ''))
  const [time, setTime] = useState(init.time || (init.start_time ? new Date(init.start_time).toISOString().slice(11, 16) : '09:00'))
  const [endTime, setEndTime] = useState(init.end_time ? new Date(init.end_time).toISOString().slice(11, 16) : '')
  const [location, setLocation] = useState(init.location || '')
  const [status, setStatus] = useState(init.status || 'todo')
  const [priority, setPriority] = useState(init.priority || 'medium')
  const [assignee, setAssignee] = useState(init.assignee || '')
  const [tags, setTags] = useState((init.tags || []).join(', '))

  function clientOffset() {
    const tzMin = -new Date().getTimezoneOffset()
    const sign = tzMin >= 0 ? '+' : '-'
    const abs = Math.abs(tzMin)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    return `${sign}${hh}:${mm}`
  }

  function submit() {
    if (!title) return alert('Title required')
    if (!date || !time) return alert('Date and time required')
    const dt = new Date(`${date}T${time}`)
    const start_time = toLocalISOWithOffset(dt)
    let end_time = undefined
    if (endTime) {
      const ed = new Date(`${date}T${endTime}`)
      end_time = toLocalISOWithOffset(ed)
    }
    const payload: any = { title, description, start_time, client_tz_offset: clientOffset(), location, status, priority, assignee, tags: tags.split(',').map((t: string) => t.trim()).filter((t: string) => Boolean(t)) }
    if (end_time) payload.end_time = end_time
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded p-4 w-[420px]">
        <h3 className="font-semibold mb-2">{initial ? 'Edit event' : 'Create event'}</h3>
        <div className="space-y-2">
          <input className="w-full p-2 border rounded" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex gap-2">
            <input type="date" className="p-2 border rounded flex-1" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className="p-2 border rounded w-28" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <input type="time" className="p-2 border rounded w-28" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <input className="p-2 border rounded flex-1" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="px-3 py-1 rounded" onClick={onClose}>Cancel</button>
            <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={submit}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}
