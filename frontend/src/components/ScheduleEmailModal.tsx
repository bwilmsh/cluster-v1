'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { api, ScheduledEmail } from '@/lib/api'

interface ScheduleEmailModalProps {
  isOpen: boolean
  googleConnected: boolean
  onClose: () => void
  onSave: (email: ScheduledEmail) => void
}

function formatLocalDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

export function ScheduleEmailModal({ isOpen, googleConnected, onClose, onSave }: ScheduleEmailModalProps) {
  const defaultSendAt = useMemo(() => formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000)), [])
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sendAt, setSendAt] = useState(defaultSendAt)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setLoading(false)
    setTo('')
    setSubject('')
    setBody('')
    setSendAt(formatLocalDateTime(new Date(Date.now() + 60 * 60 * 1000)))
  }, [isOpen])

  async function handleSave() {
    try {
      setLoading(true)
      setError(null)

      if (!googleConnected) {
        throw new Error('Connect Google in Settings before scheduling email.')
      }

      if (!to.trim() || !subject.trim() || !body.trim() || !sendAt) {
        throw new Error('Fill in To, Subject, Body, and Send At.')
      }

      const sendAtIso = new Date(sendAt).toISOString()
      const created = await api.scheduledEmails.create({
        to: to.trim(),
        subject: subject.trim(),
        body,
        sendAt: sendAtIso,
      })

      onSave(created)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scheduled email')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(5, 10, 18, 0.72)' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="relative w-full max-w-2xl rounded-[28px] border p-5 md:p-6"
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">Schedule Email</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Compose a scheduled email</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Pick a recipient, write the message, and choose when it should be sent automatically.
          </p>
        </div>

        {!googleConnected ? (
          <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Connect Google in <Link href="/settings" className="underline underline-offset-2">Settings</Link> first so Gmail can send the message.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm text-white/75">
            <span>To</span>
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="alex@example.com"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40"
            />
          </label>

          <label className="grid gap-2 text-sm text-white/75">
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Follow-up about tomorrow"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40"
            />
          </label>

          <label className="grid gap-2 text-sm text-white/75">
            <span>Body</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write the email body..."
              rows={7}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-emerald-300/40"
            />
          </label>

          <label className="grid gap-2 text-sm text-white/75 md:max-w-sm">
            <span>Send At</span>
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(event) => setSendAt(event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-emerald-300/40"
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
            disabled={loading || !googleConnected}
            className="rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_30px_rgba(52,211,153,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save Scheduled Email'}
          </button>
        </div>
      </div>
    </div>
  )
}