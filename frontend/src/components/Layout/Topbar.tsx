'use client'

import React from 'react'
import { useTheme } from '@/lib/themeContext'

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.5V3M8 13V14.5M1.5 8H3M13 8H14.5M3.1 3.1L4.1 4.1M11.9 11.9L12.9 12.9M12.9 3.1L11.9 4.1M4.1 11.9L3.1 12.9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M11.5 10.7A5.5 5.5 0 0 1 5.3 4.5a5.8 5.8 0 1 0 6.2 6.2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  )
}

export default function Topbar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="flex items-center justify-between border-b px-4 py-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-3">
        <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Cluster</div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Scheduler</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <MoonIcon /> : <SunIcon />}
        </button>
        <button className="rounded-full px-3 py-1.5 text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--text-on-accent)' }}>New</button>
      </div>
    </header>
  )
}
