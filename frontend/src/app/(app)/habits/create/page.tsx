'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

type PriorityLevel = 'low' | 'medium' | 'high'
type DayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

type ColorOption = {
  name: string
  value: string
}

const PRIORITY_OPTIONS: Array<{ label: string; value: PriorityLevel; detail: string }> = [
  { label: 'Low priority', value: 'low', detail: 'Light-weight focus block' },
  { label: 'Medium priority', value: 'medium', detail: 'Default scheduling priority' },
  { label: 'High priority', value: 'high', detail: 'Protected habit block' },
]

const COLOR_OPTIONS: ColorOption[] = [
  { name: 'Blush', value: '#d8c6c2' },
  { name: 'Sand', value: '#d8c7ab' },
  { name: 'Sky', value: '#c7d2fe' },
  { name: 'Mint', value: '#c5efe0' },
  { name: 'Lilac', value: '#d8d3ff' },
  { name: 'Slate', value: '#cbd5e1' },
]

const CATEGORY_OPTIONS = ['Solo work', 'Focus', 'Health', 'Learning', 'Personal', 'Admin']
const HOUR_OPTIONS = ['One-off hours', 'Daily hours', 'Weekly hours']
const DAY_OPTIONS: Array<{ code: DayCode; label: string }> = [
  { code: 'MO', label: 'Mo' },
  { code: 'TU', label: 'Tu' },
  { code: 'WE', label: 'We' },
  { code: 'TH', label: 'Th' },
  { code: 'FR', label: 'Fr' },
  { code: 'SA', label: 'Sa' },
  { code: 'SU', label: 'Su' },
]

function priorityToNumber(priority: PriorityLevel) {
  if (priority === 'low') return 2
  if (priority === 'high') return 4
  return 3
}

function toIdealTime(startTime: string) {
  const hour = Number(startTime.split(':')[0] ?? '8')
  if (Number.isNaN(hour)) return 'MORNING'
  if (hour < 12) return 'MORNING'
  if (hour < 17) return 'AFTERNOON'
  return 'EVENING'
}

function buildRRule(days: DayCode[]) {
  if (days.length === 0) return null
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`
}

function dayName(code: DayCode) {
  return DAY_OPTIONS.find((item) => item.code === code)?.label ?? code
}

function formatTime(value: string) {
  const [hoursRaw = '9', minutesRaw = '00'] = value.split(':')
  const hours = Math.min(23, Math.max(0, Number(hoursRaw)))
  const minutes = Math.min(59, Math.max(0, Number(minutesRaw)))
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, '0')}${period}`
}

function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = COLOR_OPTIONS.find((color) => color.value === value) ?? COLOR_OPTIONS[0]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((currentValue) => !currentValue)}
        className="inline-flex h-12 min-w-[3rem] items-center justify-center rounded-lg border border-black/10 bg-white px-3 text-left shadow-[0_1px_0_rgba(15,23,42,0.02)]"
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-full border border-black/5" style={{ background: current.value }} />
          <span className="text-slate-500">▾</span>
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-52 rounded-2xl border border-black/10 bg-white p-3 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
          <div className="grid grid-cols-3 gap-2">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => {
                  onChange(color.value)
                  setOpen(false)
                }}
                className="flex flex-col items-center gap-1 rounded-xl border border-transparent p-2 text-[11px] text-slate-500 transition-colors hover:border-black/10 hover:bg-slate-50"
              >
                <span className="h-6 w-6 rounded-full border border-black/5" style={{ background: color.value }} />
                {color.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function HabitCreatePage() {
  const router = useRouter()
  const [name, setName] = useState('New Habit')
  const [priority, setPriority] = useState<PriorityLevel>('medium')
  const [category, setCategory] = useState('Solo work')
  const [aiNote, setAiNote] = useState('')
  const [color, setColor] = useState('#d8c6c2')
  const [hoursMode, setHoursMode] = useState('One-off hours')
  const [selectedDays, setSelectedDays] = useState<DayCode[]>(['MO', 'TU', 'WE', 'TH', 'FR'])
  const [minimumDuration, setMinimumDuration] = useState(15)
  const [maximumDuration, setMaximumDuration] = useState(2)
  const [windowStart, setWindowStart] = useState('09:00')
  const [windowEnd, setWindowEnd] = useState('17:00')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const titleValue = useMemo(() => name.trim(), [name])
  const canSave = titleValue.length > 0 && !isSaving
  const primaryDay = selectedDays[0] ?? 'MO'

  function toggleDay(day: DayCode) {
    setSelectedDays((current) => {
      if (current.includes(day)) {
        const next = current.filter((item) => item !== day)
        return next.length > 0 ? next : [day]
      }
      return [...current, day]
    })
  }

  async function handleSave() {
    const payload = {
      name: titleValue,
      description: category,
      notes: aiNote.trim() || null,
      priority: priorityToNumber(priority),
      priorityLevel: priority.toUpperCase(),
      color,
      frequency: selectedDays.length === 7 ? 'DAILY' : 'WEEKLY',
      idealTime: toIdealTime(windowStart),
      timeRangeStart: windowStart,
      timeRangeEnd: windowEnd,
      daysOfWeek: selectedDays,
      cadence: selectedDays.length === 7 ? 'daily' : 'weekly',
      rrule: buildRRule(selectedDays),
      timeOfDay: windowStart,
      endTime: windowEnd,
      durationMinutes: minimumDuration,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      active: true,
      isActive: true,
      autoReschedule: true,
      materialize: true,
      showAsBusy: true,
      hideDetails: false,
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`${BACKEND_URL}/api/habits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(details || `Failed to create habit (${response.status})`)
      }

      const result = await response.json().catch(() => null)
      if (result?.data) {
        sessionStorage.setItem('cluster:lastCreatedHabit', JSON.stringify(result.data))
      }

      // Navigate back to habits and do a full reload to ensure the list shows the new habit.
      try {
        window.location.href = '/habits'
      } catch {
        router.push('/habits')
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create habit')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6fb] text-slate-950">
      <div className="border-b border-black/5 bg-[#fbfbfd]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6 lg:px-8">
          <div className="text-[15px] font-medium tracking-[-0.02em] text-slate-800">
            <span>Habits</span>
            <span className="mx-2 text-slate-300">/</span>
            <span>Create</span>
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="hidden sm:inline">Setup guide</span>
            <button type="button" className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-slate-700 hover:bg-slate-100">
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">New Task</span>
            </button>
            <button type="button" className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Search">
              ⌕
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-slate-700 hover:bg-slate-100">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-[11px] font-semibold text-slate-700">A</span>
              <span className="hidden sm:inline">Account</span>
              <span>▾</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 lg:px-8 lg:py-8">
        <Link href="/habits" className="inline-flex items-center gap-2 text-sm font-medium text-[#6b5cff] hover:underline">
          <span>←</span>
          Back
        </Link>

        <div className="mt-6 rounded-[28px] border border-black/5 bg-white px-6 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:px-8 md:py-8">
          <div className="flex items-end gap-3 border-b border-[#6b5cff] pb-3">
            <span className="pb-1 text-2xl text-slate-400">☺</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full bg-transparent text-3xl font-semibold tracking-[-0.04em] text-slate-500 outline-none placeholder:text-slate-400"
              placeholder="New Habit"
            />
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-6">
            <section className="grid gap-3">
              <label className="text-sm font-semibold text-slate-800">Priority</label>
              <div className="w-fit">
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as PriorityLevel)}
                  className="h-11 rounded-lg border border-black/10 bg-white px-4 pr-10 text-sm text-slate-700 outline-none"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-slate-400">
                  {PRIORITY_OPTIONS.find((option) => option.value === priority)?.detail}
                </p>
              </div>
            </section>

            <section className="grid gap-3">
              <label className="flex items-center gap-1 text-sm font-semibold text-slate-800">
                Color & category
                <span className="text-slate-400">ⓘ</span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <ColorSwatchPicker value={color} onChange={setColor} />
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 min-w-[9rem] rounded-lg border border-black/10 bg-white px-4 text-sm text-slate-700 outline-none"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="grid gap-2">
              <label className="text-sm font-semibold text-slate-800">AI note</label>
              <textarea
                value={aiNote}
                onChange={(event) => setAiNote(event.target.value)}
                rows={3}
                placeholder="Add anything you want Cluster to remember when it schedules this habit"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-slate-700 outline-none"
              />
              <p className="text-xs text-slate-400">This note will be used by Cluster and Groq when choosing the best time.</p>
            </section>

            <section className="grid gap-2 pt-2">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-900">Scheduling</h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Tell Cluster the best time window to get your habit done, including an ideal time and minimum/maximum duration.
              </p>
            </section>

            <section className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Duration</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">Minimum</div>
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={minimumDuration}
                        onChange={(event) => setMinimumDuration(Number(event.target.value) || 15)}
                        className="h-11 w-full rounded-lg border border-black/10 bg-white px-4 text-sm text-slate-700 outline-none"
                      />
                      <div className="mt-1 text-xs text-slate-400">mins</div>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">Maximum</div>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={maximumDuration}
                        onChange={(event) => setMaximumDuration(Number(event.target.value) || 2)}
                        className="h-11 w-full rounded-lg border border-black/10 bg-white px-4 text-sm text-slate-700 outline-none"
                      />
                      <div className="mt-1 text-xs text-slate-400">hrs</div>
                    </div>
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-800">Hours</span>
                  <select
                    value={hoursMode}
                    onChange={(event) => setHoursMode(event.target.value)}
                    className="h-11 rounded-lg border border-black/10 bg-white px-4 text-sm text-slate-700 outline-none"
                  >
                    {HOUR_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {DAY_OPTIONS.map((day) => {
                  const active = selectedDays.includes(day.code)
                  return (
                    <button
                      key={day.code}
                      type="button"
                      onClick={() => toggleDay(day.code)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors"
                      style={{
                        background: active ? '#6b5cff' : '#ffffff',
                        borderColor: active ? '#6b5cff' : 'rgba(15, 23, 42, 0.08)',
                        color: active ? '#ffffff' : '#4b5563',
                      }}
                    >
                      {day.label}
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border-b border-slate-100 pb-4">
                  <div className="min-w-[8rem] text-sm font-semibold text-slate-800">{dayName(primaryDay)}</div>
                  <input
                    type="time"
                    value={windowStart}
                    onChange={(event) => setWindowStart(event.target.value)}
                    className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm text-slate-700 outline-none"
                  />
                  <span className="text-sm text-slate-500">to</span>
                  <input
                    type="time"
                    value={windowEnd}
                    onChange={(event) => setWindowEnd(event.target.value)}
                    className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm text-slate-700 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setWindowEnd(windowEnd)}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-[#6b5cff] hover:bg-[#6b5cff]/5"
                  >
                    <span>⊕</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDays((current) => (current.length > 0 ? current : ['MO']))}
                    className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-medium text-[#6b5cff] hover:bg-[#6b5cff]/5"
                  >
                    <span>⧉</span>
                    Copy to all
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  {selectedDays.length > 0 ? `Selected: ${selectedDays.map(dayName).join(', ')}` : 'Select days for this habit.'}
                </div>
              </div>
            </section>
          </div>

          <div className="mt-8 flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex h-11 items-center rounded-full bg-[#6b5cff] px-6 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(107,92,255,0.22)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <Link href="/habits" className="text-sm font-semibold text-[#6b5cff] hover:underline">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}