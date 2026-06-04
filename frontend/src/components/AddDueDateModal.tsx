'use client'

import { useEffect, useMemo, useState } from 'react'
import { api, DueDateCategory, DueDateItem, DueDatePriority } from '@/lib/api'

interface AddDueDateModalProps {
  isOpen: boolean
  mode?: 'create' | 'edit'
  item?: DueDateItem | null
  onClose: () => void
  onSave: () => void
}

function formatLocalDate(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function formatLocalTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function parseDueAt(date: string, time: string) {
  const parsed = new Date(`${date}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function AddDueDateModal({ isOpen, item, onClose, onSave }: AddDueDateModalProps) {
  const defaultDueAt = useMemo(() => {
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 1)
    dueDate.setHours(9, 0, 0, 0)
    return {
      date: formatLocalDate(dueDate),
      time: formatLocalTime(dueDate),
    }
  }, [])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueAt.date)
  const [dueTime, setDueTime] = useState(defaultDueAt.time)
  const [priority, setPriority] = useState<DueDatePriority>('MEDIUM')
  const [category, setCategory] = useState<DueDateCategory>('PERSONAL')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setLoading(false)
    const base = item ? new Date(item.dueAt) : (() => {
      const next = new Date()
      next.setDate(next.getDate() + 1)
      next.setHours(9, 0, 0, 0)
      return next
    })()

    setTitle(item?.title ?? '')
    setDescription(item?.description ?? '')
    setDueDate(item ? formatLocalDate(base) : defaultDueAt.date)
    setDueTime(item ? formatLocalTime(base) : defaultDueAt.time)
    setPriority(item?.priority ?? 'MEDIUM')
    setCategory(item?.category ?? 'PERSONAL')
  }, [defaultDueAt.date, defaultDueAt.time, item, isOpen])

  async function handleSave() {
    try {
      setLoading(true)
      setError(null)

      const parsedDueAt = parseDueAt(dueDate, dueTime)
      if (!title.trim() || !parsedDueAt) {
        throw new Error('Enter a title, date, and time.')
      }

      const dueAtIso = parsedDueAt.toISOString()
      if (item) {
        await api.dueDates.update(item.id, {
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueAtIso,
          dueTime,
          priority,
          category,
        })
      } else {
        await api.dueDates.create({
          title: title.trim(),
          description: description.trim() || null,
          dueDate: dueAtIso,
          dueTime,
          priority,
          category,
        })
      }

      onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save due date')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end p-4"
      style={{ background: 'rgba(5, 10, 18, 0.72)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="relative flex h-full w-full max-w-xl flex-col rounded-[28px] border p-5 md:p-6"
        style={{
          background: 'linear-gradient(180deg, rgba(13, 19, 33, 0.98), rgba(9, 13, 24, 0.98))',
          borderColor: 'rgba(255,255,255,0.12)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 px-3 py-1 text-xs text-white/45 hover:text-white/80"
        >
          Close
        </button>

        <div className="pr-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-200/80">{item ? 'Edit Due Date' : 'Add Due Date'}</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{item ? 'Edit deadline' : 'Create a due date'}</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {item ? 'Update the deadline details and save your changes.' : 'Save an important deadline. It will appear in Due Dates as soon as you save it.'}
          </p>
        </div>

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-white/75">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Submit project draft"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-teal-300/40"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-white/75">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as DueDateCategory)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-teal-300/40"
              >
                <option value="ASSIGNMENT">Assignment</option>
                <option value="EXAM">Exam</option>
                <option value="WORK">Work</option>
                <option value="PERSONAL">Personal</option>
              </select>
            </label>

            <label className="grid gap-2 text-sm text-white/75">
              <span>Priority</span>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as DueDatePriority)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-teal-300/40"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4">
            <label className="grid gap-2 text-sm text-white/75">
              <span>Due date &amp; time</span>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-teal-300/40"
                />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                  className="w-36 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-teal-300/40"
                />
              </div>
            </label>
          </div>

          <label className="grid gap-2 text-sm text-white/75">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional notes, context, or instructions..."
              rows={4}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-teal-300/40"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white/70 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded-2xl bg-teal-300 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_30px_rgba(45,212,191,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving…' : item ? 'Save Changes' : 'Save Due Date'}
          </button>
        </div>
      </div>
    </div>
  )
}