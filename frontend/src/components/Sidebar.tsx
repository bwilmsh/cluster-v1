'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, Agent } from '@/lib/api'

const AGENT_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
  '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4',
]

function getColor(index: number): string {
  return AGENT_COLORS[index % AGENT_COLORS.length]
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1.5 6.5L8 1.5L14.5 6.5V14H10V10H6V14H1.5V6.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14 8C14 11.3137 11.3137 14 8 14C6.92774 14 5.92037 13.7074 5.05573 13.1983L2 14L2.80168 10.9443C2.29258 10.0796 2 9.07226 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 1.5L9.5 6.5L14.5 8L9.5 9.5L8 14.5L6.5 9.5L1.5 8L6.5 6.5L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9 9L14 14M11.5 11.5L13 13" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function PlugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 10.5V14M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <rect x="3.5" y="4.5" width="9" height="6" rx="2" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M8 1.5V3M8 13V14.5M14.5 8H13M3 8H1.5M12.7 3.3L11.6 4.4M4.4 11.6L3.3 12.7M12.7 12.7L11.6 11.6M4.4 4.4L3.3 3.3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="3" cy="3" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="3" cy="13" r="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M4.5 3.5L11.5 7M4.5 12.5L11.5 8.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M2 6.5H14M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { href: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { href: '/', label: 'Chat', Icon: ChatIcon },
  { href: '/groupchats', label: 'Group Chats', Icon: ChatIcon },
  { href: '/cluster', label: 'Cluster AI', Icon: SparkleIcon },
  { href: '/workflows', label: 'Workflows', Icon: WorkflowIcon },
  { href: '/scheduler', label: 'Automations', Icon: ClockIcon },
  { href: '/credentials', label: 'Credentials', Icon: KeyIcon },
  { href: '/integrations', label: 'Integrations', Icon: PlugIcon },
  { href: '/settings', label: 'Settings', Icon: GearIcon },
]

export function Sidebar() {
  const pathname = usePathname()
  const [agents, setAgents] = useState<Agent[]>([])

  useEffect(() => {
    api.agents.list().then((list) => {
      setAgents(Array.isArray(list) ? list : [])
    }).catch(() => {})
  }, [])

  return (
    <div
      className="shrink-0 h-full flex flex-col"
      style={{
        width: '220px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '0.5px solid var(--border)',
      }}
    >
      {/* Brand */}
      <div
        className="px-4 h-14 flex items-center gap-2.5 shrink-0"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '5px',
            backgroundColor: 'var(--accent)',
            flexShrink: 0,
          }}
        />
        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Cluster
        </p>
      </div>

      {/* Nav items */}
      <nav className="p-2.5 space-y-0.5 shrink-0">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isActive
                  ? 'rgba(255,255,255,0.07)'
                  : 'transparent'
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Chats section */}
      <div
        className="flex-1 flex flex-col min-h-0 mt-1"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-3 py-2 shrink-0">
          <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Chats
          </span>
          <Link
            href="/"
            className="text-xs transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            + New
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {agents.map((agent, idx) => {
            const isActive = pathname === `/agents/${agent.id}`
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg mb-0.5 text-xs truncate transition-colors"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isActive ? 'var(--bg-tertiary)' : 'transparent'
                }}
              >
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: '6px',
                    height: '6px',
                    backgroundColor: getColor(idx),
                    display: 'inline-block',
                  }}
                />
                {agent.name}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Hire Agent CTA */}
      <div
        className="p-3 shrink-0"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <Link
          href="/agents/new"
          className="flex items-center justify-center w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
        >
          + Hire Agent
        </Link>
      </div>
    </div>
  )
}
