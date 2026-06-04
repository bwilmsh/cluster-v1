'use client'
import React, { useState } from 'react'

type Task = {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  start_time?: string
  assignee?: string
  tags?: string[]
}

const STATUS_COLORS = {
  todo: '#6b7280',
  'in-progress': '#f59e0b',
  done: '#10b981',
}

const PRIORITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
}

export default function ListView({ tasks, onUpdateStatus, onEdit, onDelete }: { tasks: Task[]; onUpdateStatus: (id: string, status: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'status'>('priority')
  const [filter, setFilter] = useState<string | null>(null)

  const filtered = filter ? tasks.filter(t => t.status === filter) : tasks
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'priority') {
      const prio = { high: 3, medium: 2, low: 1 }
      return (prio[b.priority as keyof typeof prio] ?? 0) - (prio[a.priority as keyof typeof prio] ?? 0)
    }
    if (sortBy === 'due') {
      return new Date(a.start_time ?? 0).getTime() - new Date(b.start_time ?? 0).getTime()
    }
    return 0
  })

  const formatDate = (date?: string) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex gap-3 items-center">
        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Sort by:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="ml-2 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <option value="priority">Priority</option>
            <option value="due">Due Date</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Filter:
          <select value={filter ?? ''} onChange={(e) => setFilter(e.target.value || null)} className="ml-2 px-2 py-1 rounded text-xs" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
            <option value="">All</option>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
          </select>
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full">
          <thead style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Title</th>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Due</th>
              <th className="px-4 py-3 text-left text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Assignee</th>
              <th className="px-4 py-3 text-center text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => (
              <tr key={task.id} style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>
                  {task.title}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="px-2 py-1 rounded text-xs" style={{ backgroundColor: `${PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? '#6b7280'}20`, color: PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? '#6b7280' }}>
                    {task.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <select value={task.status} onChange={(e) => onUpdateStatus(task.id, e.target.value)} className="px-2 py-1 rounded text-xs" style={{ backgroundColor: `${STATUS_COLORS[task.status as keyof typeof STATUS_COLORS] ?? '#6b7280'}20`, color: STATUS_COLORS[task.status as keyof typeof STATUS_COLORS] ?? '#6b7280', border: `1px solid ${STATUS_COLORS[task.status as keyof typeof STATUS_COLORS] ?? '#6b7280'}` }}>
                    <option value="todo">To Do</option>
                    <option value="in-progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {formatDate(task.start_time)}
                </td>
                <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {task.assignee ?? '-'}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex gap-2 justify-center">
                    <button onClick={() => onEdit(task.id)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--accent)', color: '#fff' }} onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>
                      Edit
                    </button>
                    <button onClick={() => onDelete(task.id)} className="text-xs px-2 py-1 rounded" style={{ color: '#ef4444' }} onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-8">
          <p style={{ color: 'var(--text-tertiary)' }}>No tasks found</p>
        </div>
      )}
    </div>
  )
}
