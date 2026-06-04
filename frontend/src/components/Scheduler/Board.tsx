'use client'
import React, { useEffect, useState } from 'react'
import { WeeklyBoard } from './index'
import MonthView from './MonthView'
import DayView from './DayView'
import BoardViewKanban from './BoardViewKanban'
import ListView from './ListView'
import { toLocalISOWithOffset } from '../../lib/time'
import EventModal from './EventModal'

type EventRec = {
  id: string
  title: string
  description?: string
  start_time: string
  end_time?: string
  location?: string
  status?: string
  priority?: string
  assignee?: string
  tags?: string[]
 }

 type ViewType = 'week' | 'month' | 'day' | 'board' | 'list'

 export default function SchedulerBoard() {
   const [events, setEvents] = useState<EventRec[]>([])
   const [loading, setLoading] = useState(false)
   const [editing, setEditing] = useState<any>(null)
   const [view, setView] = useState<ViewType>('week')

   async function load() {
     setLoading(true)
     try {
       const r = await fetch('/api/scheduler/events')
       if (!r.ok) throw new Error(await r.text())
       const data = await r.json()
       setEvents(data)
     } catch (err) {
       console.error('Failed to load events', err)
     } finally {
       setLoading(false)
     }
   }

   useEffect(() => {
     load()
   }, [])

  async function createEventForDay(dayISO: string) {
    const d = new Date(dayISO)
    const isoDate = d.toISOString().slice(0, 10)
    const isoTime = d.toISOString().slice(11, 16)
    setEditing({ date: isoDate, time: isoTime || '09:00' })
  }

   async function editEvent(id: string) {
     const ev = events.find((e) => String(e.id) === String(id))
     if (!ev) return
     setEditing({
       id: ev.id,
       title: ev.title,
       description: ev.description,
       start_time: ev.start_time,
       end_time: ev.end_time,
       location: ev.location,
       status: ev.status,
       priority: ev.priority,
       assignee: ev.assignee,
       tags: ev.tags,
     })
   }

   async function deleteEvent(id: string) {
     if (!confirm('Delete this event?')) return
     try {
       const r = await fetch(`/api/scheduler/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
       if (r.ok) await load()
       else alert('Delete failed: ' + (await r.text()))
     } catch (err) {
       alert('Delete failed: ' + String(err))
     }
   }

   async function updateEventStatus(id: string, status: string) {
     try {
       const r = await fetch(`/api/scheduler/events/${encodeURIComponent(id)}`, {
         method: 'PUT',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ status }),
       })
       if (r.ok) await load()
     } catch (err) {
       console.error('Status update failed:', err)
     }
   }

   async function resizeEvent(id: string, deltaMinutes: number) {
     const ev = events.find((e) => String(e.id) === String(id))
     if (!ev) return
     const start = new Date(ev.start_time)
     const currentEnd = ev.end_time ? new Date(ev.end_time) : new Date(start.getTime() + 60 * 60 * 1000)
     const newEnd = new Date(currentEnd.getTime() + deltaMinutes * 60 * 1000)
     const payload = { end_time: toLocalISOWithOffset(newEnd) }
     const r = await fetch(`/api/scheduler/events/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
     if (r.ok) await load()
   }

   async function handleModalSave(payload: any) {
     try {
       if (editing?.id) {
         const r = await fetch(`/api/scheduler/events/${encodeURIComponent(editing.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
         if (!r.ok) throw new Error(await r.text())
       } else {
         const r = await fetch('/api/scheduler/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
         if (!r.ok) throw new Error(await r.text())
       }
       setEditing(null)
       await load()
     } catch (err) {
       alert('Save failed: ' + String(err))
     }
   }

   async function onDropEvent(eventId: string, dayISO: string) {
     const ev = events.find((e) => String(e.id) === String(eventId))
     if (!ev) return
     const src = new Date(ev.start_time)
     const target = new Date(dayISO)
     target.setHours(src.getHours(), src.getMinutes(), 0, 0)
     const payload = { start_time: toLocalISOWithOffset(target) }
     const r = await fetch(`/api/scheduler/events/${encodeURIComponent(ev.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
     if (r.ok) await load()
   }

   return (
     <div className="flex flex-col h-full gap-4 p-4">
       {/* Header */}
       <div className="flex items-center justify-between">
         <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Scheduler & Tasks</h2>
         <button onClick={load} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
           Refresh
         </button>
       </div>

       {/* View toggle */}
       <div className="flex gap-2">
         {(['week', 'month', 'day', 'board', 'list'] as ViewType[]).map((v) => (
           <button
             key={v}
             onClick={() => setView(v)}
             className="px-3 py-1 rounded text-sm transition-colors"
             style={{
               backgroundColor: view === v ? 'var(--accent)' : 'var(--bg-secondary)',
               color: view === v ? '#fff' : 'var(--text-primary)',
               border: '1px solid var(--border)',
             }}
           >
             {v.charAt(0).toUpperCase() + v.slice(1)}
           </button>
         ))}
       </div>

       {/* Content */}
       {loading ? (
         <div className="flex-1 flex items-center justify-center">
           <p style={{ color: 'var(--text-tertiary)' }}>Loading...</p>
         </div>
       ) : (
         <div className="flex-1 overflow-auto">
           {view === 'week' && (
             <WeeklyBoard
               events={events}
               onDropEvent={(id, iso) => onDropEvent(id, iso)}
               onEdit={(id) => editEvent(id)}
               onResize={(id, delta) => resizeEvent(id, delta)}
               onCreate={(iso) => createEventForDay(iso)}
             />
           )}
           {view === 'month' && (
             <MonthView
               events={events}
               onDayClick={(date) => createEventForDay(date)}
               onEventClick={(id) => editEvent(id)}
               onDropEvent={(id, iso) => onDropEvent(id, iso)}
             />
           )}
           {view === 'day' && (
             <DayView
               events={events}
               onEdit={(id) => editEvent(id)}
               onDelete={(id) => deleteEvent(id)}
             />
           )}
            {view === 'board' && (
             <BoardViewKanban
               tasks={events.filter(e => e.status) as any}
               onUpdateStatus={(id, status) => updateEventStatus(id, status)}
               onEdit={(id) => editEvent(id)}
               onDelete={(id) => deleteEvent(id)}
             />
           )}
           {view === 'list' && (
             <ListView
               tasks={events.filter(e => e.status) as any}
               onUpdateStatus={(id, status) => updateEventStatus(id, status)}
               onEdit={(id) => editEvent(id)}
               onDelete={(id) => deleteEvent(id)}
             />
           )}
         </div>
       )}

       {/* Modal */}
       {editing && (
         <EventModal
           event={editing}
           onSave={handleModalSave}
           onClose={() => setEditing(null)}
         />
       )}
     </div>
   )
 }

