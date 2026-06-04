'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001'

type Habit = {
  id: string
  name: string
  description?: string | null
  notes?: string | null
  priority?: number | string | null
  color?: string | null
  timeRangeStart?: string | null
  timeRangeEnd?: string | null
  timeOfDay?: string | null
  endTime?: string | null
  durationMinutes?: number | null
  materialize?: boolean | null
  cadence?: string | null
  rrule?: string | null
  scheduleReason?: string | null
}

function formatDuration(durationMinutes?: number | null) {
  const duration = durationMinutes ?? 30
  if (duration >= 60 && duration % 60 === 0) return `${duration / 60} hr`
  if (duration >= 60) return `${Math.floor(duration / 60)} hr ${duration % 60} min`
  return `${duration} min`
}

function formatCompactTime(value?: string | null) {
  if (!value) return '08:00 AM'
  const [hoursRaw = '8', minutesRaw = '00'] = value.split(':')
  const hours = Math.min(23, Math.max(0, Number(hoursRaw)))
  const minutes = Math.min(59, Math.max(0, Number(minutesRaw)))
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`
}

function formatHoursRange(habit: Habit, use12Hour: boolean) {
  const start = habit.timeRangeStart ?? habit.timeOfDay ?? '08:00'
  const end = habit.timeRangeEnd ?? habit.endTime ?? '18:00'
  return `${formatDisplayTime(start, use12Hour)} - ${formatDisplayTime(end, use12Hour)}`
}

function formatDisplayTime(value: string | undefined | null, use12Hour: boolean) {
  if (!value) return use12Hour ? '08:00 AM' : '08:00'
  const [hoursRaw = '0', minutesRaw = '0'] = value.split(':')
  const hours = Math.min(23, Math.max(0, Number(hoursRaw)))
  const minutes = Math.min(59, Math.max(0, Number(minutesRaw)))
  if (!use12Hour) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${String(displayHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`
}

function formatScheduleReason(reason?: string | null) {
  const fallback = 'Cluster checked your calendar with Groq and picked the best available time.'
  if (!reason) return fallback

  const cleaned = reason.replace(/^Cluster AI note:\s*/i, '').replace(/^AI note:\s*/i, '').trim()
  if (/nearest open slot/i.test(cleaned)) return 'Cluster checked your calendar with Groq and used the nearest open slot.'
  if (/best available time|best time/i.test(cleaned)) return fallback
  if (/suggests|optimized scheduling|cleared this time slot|available time slot/i.test(cleaned)) return fallback
  return cleaned || fallback
}

function formatScheduleLabel(habit: Habit) {
  const days = habit.rrule?.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(',').filter(Boolean) ?? []
  if (habit.cadence === 'daily' || days.length === 7) return 'Every day'
  if (habit.cadence === 'weekly' || days.length > 0) return 'Weekly'
  return 'Set schedule'
}

function parsePriority(value: unknown) {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 3
  return Math.min(5, Math.max(1, Math.round(parsed)))
}

function addMinutesToTimeString(timeStr: string, minutesToAdd: number) {
  const [hoursRaw = '0', minutesRaw = '0'] = timeStr.split(':')
  let total = Number(hoursRaw) * 60 + Number(minutesRaw) + minutesToAdd
  if (Number.isNaN(total)) total = 0
  total = Math.max(0, Math.min(22 * 60, total))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function timeToMinutes(value: string) {
  const [hoursRaw = '0', minutesRaw = '0'] = value.split(':')
  return Math.max(0, Math.min(24 * 60, Number(hoursRaw) * 60 + Number(minutesRaw)))
}

function minutesToTime(totalMinutes: number) {
  const normalized = Math.max(0, Math.min(22 * 60, Math.round(totalMinutes)))
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const SLIDER_MINUTES = 6 * 60
const SLIDER_MAX_MINUTES = 22 * 60
const MIN_DURATION = 15

export default function HabitsPage() {
  const router = useRouter()
  const [use12Hour, setUse12Hour] = useState(true)
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [managerError, setManagerError] = useState<string | null>(null)
  const [managerName, setManagerName] = useState('')
  const [managerNotes, setManagerNotes] = useState('')
  const [managerStart, setManagerStart] = useState('08:00')
  const [managerEnd, setManagerEnd] = useState('18:00')
  const [managerDuration, setManagerDuration] = useState(30)
  const [managerMaterialize, setManagerMaterialize] = useState(true)
  const sliderRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ mode: 'move'; offset: number } | null>(null)
  const dragListenersRef = useRef<{ onMove: (event: MouseEvent) => void; onUp: () => void } | null>(null)

  const selectedHabit = useMemo(() => habits.find((habit) => habit.id === selectedHabitId) ?? null, [habits, selectedHabitId])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('cluster:use12Hour')
      if (raw === 'false') setUse12Hour(false)
      else setUse12Hour(true)
    } catch (e) {
      setUse12Hour(true)
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('cluster:use12Hour', use12Hour ? 'true' : 'false')
    } catch (e) {
      // ignore
    }
  }, [use12Hour])

  useEffect(() => {
    let cancelled = false

    async function loadHabits() {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch(`${BACKEND_URL}/api/habits`)
        if (!res.ok) {
          throw new Error(`Failed to load habits (${res.status})`)
        }

        const payload = await res.json()
        const data = Array.isArray(payload?.data) ? payload.data : []
        const mapped = data.map((habit: any) => ({
          id: habit.id,
          name: habit.name,
          description: habit.description,
          notes: habit.notes,
          priority: habit.priority,
          color: habit.color,
          timeRangeStart: habit.timeRangeStart,
          timeRangeEnd: habit.timeRangeEnd,
          timeOfDay: habit.timeOfDay,
          endTime: habit.endTime,
          durationMinutes: habit.durationMinutes,
          materialize: habit.materialize,
          cadence: habit.cadence,
          rrule: habit.rrule,
          scheduleReason: habit.scheduleReason,
        }))

        if (!cancelled) {
          setHabits(mapped)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load habits')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadHabits()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedHabit) return
    setManagerName(selectedHabit.name)
    setManagerNotes(selectedHabit.notes ?? '')
    setManagerStart(selectedHabit.timeRangeStart ?? selectedHabit.timeOfDay ?? '08:00')
    setManagerEnd(selectedHabit.timeRangeEnd ?? selectedHabit.endTime ?? '18:00')
    setManagerDuration(selectedHabit.durationMinutes ?? 30)
    setManagerMaterialize(Boolean(selectedHabit.materialize ?? true))
    setManagerError(null)
  }, [selectedHabit])

  useEffect(() => {
    const diff = timeToMinutes(managerEnd) - timeToMinutes(managerStart)
    if (diff > 0 && diff !== managerDuration) {
      setManagerDuration(diff)
    }
  }, [managerStart, managerEnd, managerDuration])

  function stopSliderDrag() {
    if (dragListenersRef.current) {
      window.removeEventListener('mousemove', dragListenersRef.current.onMove)
      window.removeEventListener('mouseup', dragListenersRef.current.onUp)
      dragListenersRef.current = null
    }
    dragRef.current = null
  }

  function startSliderDrag(event: React.MouseEvent<HTMLDivElement>) {
    const rect = sliderRef.current?.getBoundingClientRect()
    if (!rect) return

    stopSliderDrag()

    const startMinutes = timeToMinutes(managerStart)
    const endMinutes = timeToMinutes(managerEnd)
    const currentDuration = Math.max(MIN_DURATION, endMinutes - startMinutes)
    const pointerMinutes = SLIDER_MINUTES + ((event.clientX - rect.left) / rect.width) * (SLIDER_MAX_MINUTES - SLIDER_MINUTES)

    dragRef.current = { mode: 'move', offset: pointerMinutes - startMinutes }

    const onMove = (moveEvent: MouseEvent) => {
      if (!sliderRef.current || !dragRef.current) return
      const moveRect = sliderRef.current.getBoundingClientRect()
      const movePointerMinutes = SLIDER_MINUTES + ((moveEvent.clientX - moveRect.left) / moveRect.width) * (SLIDER_MAX_MINUTES - SLIDER_MINUTES)
      const nextStart = Math.max(SLIDER_MINUTES, Math.min(SLIDER_MAX_MINUTES - currentDuration, Math.round(movePointerMinutes - dragRef.current.offset)))
      const nextEnd = nextStart + currentDuration

      setManagerStart(minutesToTime(nextStart))
      setManagerEnd(minutesToTime(nextEnd))
      setManagerDuration(currentDuration)
    }

    const onUp = () => {
      stopSliderDrag()
    }

    dragListenersRef.current = { onMove, onUp }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    event.preventDefault()
  }

  async function refreshHabits() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/habits`)
      if (!res.ok) return
      const payload = await res.json()
      const data = Array.isArray(payload?.data) ? payload.data : []
      setHabits(
        data.map((habit: any) => ({
          id: habit.id,
          name: habit.name,
          description: habit.description,
          notes: habit.notes,
          priority: habit.priority,
          color: habit.color,
          timeRangeStart: habit.timeRangeStart,
          timeRangeEnd: habit.timeRangeEnd,
          timeOfDay: habit.timeOfDay,
          endTime: habit.endTime,
          durationMinutes: habit.durationMinutes,
          materialize: habit.materialize,
          cadence: habit.cadence,
          rrule: habit.rrule,
          scheduleReason: habit.scheduleReason,
        }))
      )
    } catch {
      // ignore
    }
  }

  async function saveManagerEdits() {
    if (!selectedHabit) return
    const name = managerName.trim()
    if (!name) {
      setManagerError('Habit name is required')
      return
    }

    const windowLength = Math.max(0, (Number(managerEnd.split(':')[0]) * 60 + Number(managerEnd.split(':')[1])) - (Number(managerStart.split(':')[0]) * 60 + Number(managerStart.split(':')[1])))
    if (managerDuration > windowLength) {
      setManagerError(`Duration (${managerDuration}m) exceeds scheduling window (${windowLength}m)`)
      return
    }

    const response = await fetch(`${BACKEND_URL}/api/habits/${selectedHabit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        notes: managerNotes.trim() || null,
        durationMinutes: managerDuration,
        timeRangeStart: managerStart,
        timeRangeEnd: managerEnd,
        materialize: managerMaterialize,
      }),
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      setManagerError(details || `Failed to update habit (${response.status})`)
      return
    }
    await refreshHabits()
    // close the manager and return to the main habits page
    setSelectedHabitId(null)
    try {
      router.push('/habits')
    } catch (e) {
      // ignore navigation errors
    }
  }

  async function snoozeManagerHabit() {
    if (!selectedHabit) return
    const input = window.prompt('Snooze this habit for how many days?', '7')
    if (!input) return

    const days = Math.max(1, Math.min(90, Number(input)))
    if (Number.isNaN(days)) return

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const skippedDates = Array.from({ length: days }, (_, index) => {
      const current = new Date(start)
      current.setDate(start.getDate() + index + 1)
      return current.toISOString().slice(0, 10)
    })

    const response = await fetch(`${BACKEND_URL}/api/habits/${selectedHabit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skippedDates, materialize: true }),
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      setManagerError(details || `Failed to snooze habit (${response.status})`)
      return
    }

    await refreshHabits()
  }

  async function deleteManagerHabit() {
    if (!selectedHabit) return
    const confirmed = window.confirm(`Delete "${selectedHabit.name}"? This will remove it from your calendar too.`)
    if (!confirmed) return

    const response = await fetch(`${BACKEND_URL}/api/habits/${selectedHabit.id}`, { method: 'DELETE' })
    if (!response.ok) {
      const details = await response.text().catch(() => '')
      setManagerError(details || `Failed to delete habit (${response.status})`)
      return
    }

    setSelectedHabitId(null)
    await refreshHabits()
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-[#f5f6fa] px-4 py-6 text-slate-950 md:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-6 border-b border-black/5 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Cluster</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Habits</h1>
            <div className="mt-7 flex items-center gap-8">
              <button type="button" className="relative pb-3 text-sm font-semibold transition-colors" style={{ color: '#111827' }}>
                All Habits
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-opacity" style={{ background: '#6b5cff', opacity: 1 }} />
              </button>
              <button type="button" className="relative pb-3 text-sm font-semibold transition-colors" style={{ color: '#6b7280' }} onClick={() => router.push('/habits/create')}>
                Templates
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full transition-opacity" style={{ background: '#6b5cff', opacity: 0 }} />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/habits/create')}
            className="inline-flex items-center gap-3 self-start rounded-full px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(107,92,255,0.22)] transition-transform hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(180deg, #7c6cff 0%, #6154ff 100%)' }}
          >
            <span className="text-base leading-none">+</span>
            <span>New Habit</span>
            <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">⌄</span>
          </button>
        </header>

        {error ? (
          <div className="rounded-[24px] border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            {error}
          </div>
        ) : null}

        <section>
          {loading ? (
            <div className="rounded-[24px] border border-black/5 bg-white px-6 py-12 text-sm text-slate-500 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              Loading habits...
            </div>
          ) : habits.length === 0 ? (
            <div className="rounded-[24px] border border-black/5 bg-white px-6 py-12 text-sm text-slate-500 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
              No habits yet. Use New Habit to create one.
            </div>
          ) : (
            <div className={`grid gap-6 ${selectedHabit ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]' : 'md:grid-cols-2'}`}>
              <div className="grid gap-4 md:grid-cols-2">
                {habits.map((habit) => (
                  <button
                    key={habit.id}
                    type="button"
                    onClick={() => setSelectedHabitId(habit.id)}
                    className={`group self-start flex w-full max-w-full flex-col gap-2 rounded-[12px] border px-4 py-3 text-left shadow-sm transition-colors hover:border-[#6b5cff]/30 ${selectedHabit?.id === habit.id ? 'border-[#6b5cff]/30 bg-[#6b5cff]/5' : 'border-black/5 bg-white'}`}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold tracking-[-0.03em] text-slate-950">{habit.name}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="rounded-full border border-black/8 bg-slate-50 px-2 py-0.5">Duration: {formatDuration(habit.durationMinutes)}</span>
                        <span className="rounded-full border border-black/8 bg-slate-50 px-2 py-0.5">Schedule: {formatScheduleLabel(habit)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedHabit ? (
                <aside className="rounded-[24px] border border-black/5 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)] lg:sticky lg:top-6 lg:self-start">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Habit manager</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{selectedHabit.name}</h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                        Edit the habit, snooze it, disable scheduling, or delete it.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedHabitId(null)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50"
                      aria-label="Close habit manager"
                    >
                      X
                    </button>
                  </div>

                  {managerError ? (
                    <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {managerError}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-slate-600">Habit name</span>
                      <input value={managerName} onChange={(event) => setManagerName(event.target.value)} className="rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition-colors focus:border-[#6b5cff]" />
                    </label>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-slate-600">AI note</span>
                      <textarea
                        value={managerNotes}
                        onChange={(event) => setManagerNotes(event.target.value)}
                        rows={3}
                        placeholder="Tell Cluster what to remember when scheduling this habit"
                        className="rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition-colors focus:border-[#6b5cff]"
                      />
                    </label>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-600">Time format</span>
                      <button
                        type="button"
                        onClick={() => setUse12Hour((v) => !v)}
                        className="ml-2 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium"
                        aria-pressed={use12Hour}
                      >
                        <span>{use12Hour ? '12-hour' : '24-hour'}</span>
                      </button>
                    </div>

                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-slate-600">Duration</span>
                      <select
                        value={managerDuration}
                        onChange={(event) => {
                          const next = Number(event.target.value)
                          setManagerDuration(next)
                          setManagerEnd(addMinutesToTimeString(managerStart, next))
                        }}
                        className="rounded-2xl border border-black/10 bg-slate-50 px-4 py-3 text-slate-950 outline-none transition-colors focus:border-[#6b5cff]"
                      >
                        <option value={15}>15min</option>
                        <option value={30}>30min</option>
                        <option value={60}>1hr</option>
                        <option value={120}>2hr</option>
                      </select>
                    </label>

                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                        <span>{formatDisplayTime(minutesToTime(SLIDER_MINUTES), use12Hour)}</span>
                        <span>{formatDisplayTime(minutesToTime(SLIDER_MAX_MINUTES), use12Hour)}</span>
                      </div>

                      <div className="flex items-center justify-center text-sm font-medium text-slate-700 mt-2 mb-2">
                        {formatDisplayTime(managerStart, use12Hour)} — {formatDisplayTime(managerEnd, use12Hour)}
                      </div>
                      <div
                        ref={sliderRef}
                        className="relative h-10 rounded-2xl border border-black/5 bg-white"
                        style={{ background: 'linear-gradient(90deg, #f8fafc, #eef2ff)', cursor: 'grab' }}
                        onMouseDown={startSliderDrag}
                      >
                        {(() => {
                          const startMinutes = timeToMinutes(managerStart)
                          const endMinutes = timeToMinutes(managerEnd)
                          const range = SLIDER_MAX_MINUTES - SLIDER_MINUTES
                          const left = ((Math.max(SLIDER_MINUTES, startMinutes) - SLIDER_MINUTES) / range) * 100
                          const width = ((Math.max(startMinutes + MIN_DURATION, endMinutes) - Math.max(SLIDER_MINUTES, startMinutes)) / range) * 100
                          return (
                            <>
                              <div
                                className="absolute top-1 h-8 rounded-2xl bg-[linear-gradient(90deg,rgba(107,92,255,0.20),rgba(107,92,255,0.12))] shadow-[0_8px_20px_rgba(107,92,255,0.12)]"
                                style={{ left: `${left}%`, width: `${Math.max(6, width)}%`, minWidth: '24px', cursor: 'grab', pointerEvents: 'none' }}
                              >
                              </div>
                              {/* Slider text removed: only the draggable pill remains */}
                            </>
                          )
                        })()}
                      </div>
                      <p className="text-xs text-slate-500">Drag the bar to move the available time. The bar width stays fixed to the selected duration.</p>
                    </div>

                    <div className="rounded-2xl border border-black/10 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-950">Enable / Disable</p>
                          <p className="mt-1 text-xs text-slate-500">Pause scheduling in your calendar, then turn it back on whenever you want.</p>
                        </div>
                        <button type="button" onClick={() => setManagerMaterialize((value) => !value)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: managerMaterialize ? '#6b5cff' : 'rgba(148, 163, 184, 0.45)' }}>
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform" style={{ transform: managerMaterialize ? 'translateX(24px)' : 'translateX(2px)' }} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <button type="button" onClick={saveManagerEdits} className="rounded-2xl bg-[#6b5cff] px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60">
                      Save changes
                    </button>
                    <button type="button" onClick={snoozeManagerHabit} className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                      Snooze habit
                    </button>
                    <button type="button" onClick={deleteManagerHabit} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100">
                      Delete habit
                    </button>
                  </div>
                </aside>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
