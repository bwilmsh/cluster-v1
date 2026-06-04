'use client'
import React, { useState } from 'react'
import { toLocalISOWithOffset } from '../../lib/time'

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

const STATUS_COLUMNS = [
  { key: 'todo', label: 'To Do', color: '#6b7280' },
  { key: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'done', label: 'Done', color: '#10b981' },
]

const PRIORITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
}

export default function BoardView({ tasks, onUpdateStatus, onEdit, onDelete }: { tasks: Task[]; onUpdateStatus: (id: string, status: string) => void; onEdit: (id: string) => void; onDelete: (id: string) => void }) {
  const [draggedTask, setDraggedTask] = useState<string | null>(null)

  const tasksByStatus = STATUS_COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter(t => t.status === col.key)
    return acc
  }, {} as Record<string, Task[]>)

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (status: string) => {
    if (draggedTask) {
      onUpdateStatus(draggedTask, status)
      setDraggedTask(null)
    }
  }

  return (
    <div className="flex gap-6 overflow-x-auto pb-4">
      {STATUS_COLUMNS.map((col) => (
        <div
          key={col.key}
          className="flex flex-col w-80 flex-shrink-0"
        >
          {/* Column header */}
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                {col.label}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                {tasksByStatus[col.key]?.length ?? 0}
              </span>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(col.key)}
            className="flex-1 space-y-3 p-3 rounded-lg border-2 border-dashed"
            style={{
              borderColor: draggedTask ? col.color : 'var(--border)',
              backgroundColor: draggedTask ? `${col.color}10` : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            {tasksByStatus[col.key]?.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={() => handleDragStart(task.id)}
                className="p-3 rounded-lg cursor-move transition-opacity hover:opacity-75"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {/* Priority dot */}
                {task.priority && (
                  <div className="flex items-start justify-between mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? '#6b7280' }} />
                  </div>
                )}

                {/* Title */}
                <p className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                  {task.title}
                </p>

                {/* Description */}
                {task.description && (
                  <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    {task.description.slice(0, 100)}...
                  </p>
                )}

                {/* Tags */}
                {task.tags && task.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {task.tags.slice(0, 2).map((tag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(task.id)}
                    className="text-xs px-2 py-1 rounded transition-opacity"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(task.id)}
                    className="text-xs px-2 py-1 rounded transition-opacity"
                    style={{ color: '#ef4444' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {tasksByStatus[col.key]?.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Drop tasks here
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
