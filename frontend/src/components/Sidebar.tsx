'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, Agent } from '@/lib/api'

const SIDEBAR_AGENT_ORDER_KEY = 'sidebarAgentOrder'
const SIDEBAR_NAV_ORDER_KEY = 'sidebarNavOrder'
const SIDEBAR_CHATS_EXPANDED_KEY = 'sidebarChatsExpanded'

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
  { href: '/workflows', label: 'Workflows', Icon: WorkflowIcon },
  { href: '/scheduler', label: 'Automations', Icon: ClockIcon },
  { href: '/credentials', label: 'Credentials', Icon: KeyIcon },
  { href: '/settings', label: 'Settings', Icon: GearIcon },
]

export function Sidebar() {
  const pathname = usePathname()
  const [navItems, setNavItems] = useState(NAV_ITEMS)
  const [agents, setAgents] = useState<Agent[]>([])
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [isBinDragOver, setIsBinDragOver] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null)
  const [dragOverAgentId, setDragOverAgentId] = useState<string | null>(null)
  const [draggingNavHref, setDraggingNavHref] = useState<string | null>(null)
  const [dragOverNavHref, setDragOverNavHref] = useState<string | null>(null)
  const [chatsExpanded, setChatsExpanded] = useState(true)

  function sortNavBySavedOrder(list: typeof NAV_ITEMS): typeof NAV_ITEMS {
    try {
      const raw = localStorage.getItem(SIDEBAR_NAV_ORDER_KEY)
      if (!raw) return list
      const orderedHrefs = JSON.parse(raw) as string[]
      if (!Array.isArray(orderedHrefs) || orderedHrefs.length === 0) return list

      const rank = new Map<string, number>()
      orderedHrefs.forEach((href, index) => rank.set(href, index))

      return [...list].sort((a, b) => {
        const aRank = rank.get(a.href)
        const bRank = rank.get(b.href)
        if (aRank == null && bRank == null) return 0
        if (aRank == null) return 1
        if (bRank == null) return -1
        return aRank - bRank
      })
    } catch {
      return list
    }
  }

  function saveNavOrder(list: typeof NAV_ITEMS) {
    localStorage.setItem(SIDEBAR_NAV_ORDER_KEY, JSON.stringify(list.map((i) => i.href)))
  }

  function sortAgentsBySavedOrder(list: Agent[]): Agent[] {
    try {
      const raw = localStorage.getItem(SIDEBAR_AGENT_ORDER_KEY)
      if (!raw) return list
      const orderedIds = JSON.parse(raw) as string[]
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) return list

      const rank = new Map<string, number>()
      orderedIds.forEach((id, index) => rank.set(id, index))

      return [...list].sort((a, b) => {
        const aRank = rank.get(a.id)
        const bRank = rank.get(b.id)
        if (aRank == null && bRank == null) return 0
        if (aRank == null) return 1
        if (bRank == null) return -1
        return aRank - bRank
      })
    } catch {
      return list
    }
  }

  function saveAgentOrder(list: Agent[]) {
    localStorage.setItem(SIDEBAR_AGENT_ORDER_KEY, JSON.stringify(list.map((a) => a.id)))
  }

  useEffect(() => {
    setNavItems(sortNavBySavedOrder(NAV_ITEMS))
    try {
      const raw = localStorage.getItem(SIDEBAR_CHATS_EXPANDED_KEY)
      if (raw != null) {
        setChatsExpanded(raw === 'true')
      }
    } catch {
      setChatsExpanded(true)
    }

    api.agents.list().then((list) => {
      const agentList = Array.isArray(list) ? list : []
      setAgents(sortAgentsBySavedOrder(agentList))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_CHATS_EXPANDED_KEY, String(chatsExpanded))
  }, [chatsExpanded])

  function handleNavDragStart(href: string) {
    setDraggingNavHref(href)
    setDragOverNavHref(href)
  }

  function handleNavDragOver(href: string) {
    setDragOverNavHref(href)
  }

  function handleNavDragEnd() {
    setDraggingNavHref(null)
    setDragOverNavHref(null)
  }

  function handleNavDrop() {
    if (!draggingNavHref || !dragOverNavHref || draggingNavHref === dragOverNavHref) {
      handleNavDragEnd()
      return
    }

    const reordered = [...navItems]
    const fromIndex = reordered.findIndex((i) => i.href === draggingNavHref)
    const toIndex = reordered.findIndex((i) => i.href === dragOverNavHref)
    if (fromIndex < 0 || toIndex < 0) {
      handleNavDragEnd()
      return
    }

    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setNavItems(reordered)
    saveNavOrder(reordered)
    handleNavDragEnd()
  }

  function handleAgentDragStart(agentId: string) {
    setDraggingAgentId(agentId)
    setDragOverAgentId(agentId)
  }

  function handleAgentDragOver(agentId: string) {
    setDragOverAgentId(agentId)
  }

  function handleAgentDragEnd() {
    setDraggingAgentId(null)
    setDragOverAgentId(null)
    setIsBinDragOver(false)
  }

  function handleAgentDrop() {
    if (deleteMode) {
      handleAgentDragEnd()
      return
    }
    if (!draggingAgentId || !dragOverAgentId || draggingAgentId === dragOverAgentId) {
      handleAgentDragEnd()
      return
    }

    const reordered = [...agents]
    const fromIndex = reordered.findIndex((a) => a.id === draggingAgentId)
    const toIndex = reordered.findIndex((a) => a.id === dragOverAgentId)
    if (fromIndex < 0 || toIndex < 0) {
      handleAgentDragEnd()
      return
    }

    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setAgents(reordered)
    saveAgentOrder(reordered)
    handleAgentDragEnd()
  }

  function toggleAgentSelection(agentId: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    )
  }

  function removeAgentsLocally(idsToRemove: string[]) {
    const nextAgents = agents.filter((a) => !idsToRemove.includes(a.id))
    setAgents(nextAgents)
    setSelectedAgentIds((prev) => prev.filter((id) => !idsToRemove.includes(id)))
    saveAgentOrder(nextAgents)
  }

  async function deleteAgents(idsToDelete: string[]) {
    if (idsToDelete.length === 0 || isDeleting) return
    const count = idsToDelete.length
    const confirmed = confirm(count === 1 ? 'Delete this agent?' : `Delete ${count} selected agents?`)
    if (!confirmed) return

    setIsDeleting(true)
    try {
      await Promise.all(idsToDelete.map((id) => api.agents.delete(id)))
      removeAgentsLocally(idsToDelete)
      setDeleteMode(false)
    } catch {
      alert('Could not delete one or more agents. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleDropIntoBin() {
    setIsBinDragOver(false)
    if (!draggingAgentId) return
    const id = draggingAgentId
    handleAgentDragEnd()
    await deleteAgents([id])
  }

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
        {navItems.map(({ href, label, Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const isDragging = draggingNavHref === href
          const isDropTarget = dragOverNavHref === href && draggingNavHref !== href
          return (
            <div
              key={href}
              draggable
              onDragStart={() => handleNavDragStart(href)}
              onDragOver={(e) => {
                e.preventDefault()
                handleNavDragOver(href)
              }}
              onDrop={handleNavDrop}
              onDragEnd={handleNavDragEnd}
              className={`rounded-lg transition-all ${isDragging ? 'opacity-60 scale-[1.01]' : ''} ${isDropTarget ? 'ring-1 ring-white/25 bg-white/5' : ''}`}
            >
              <Link
                href={href}
                className="flex items-center gap-2.5 py-2 rounded-lg text-sm transition-colors"
                style={{
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  backgroundColor: 'transparent',
                  fontWeight: isActive ? 500 : 400,
                  borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  paddingLeft: '9px',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* Chats section */}
      <div
        className="flex-1 flex flex-col min-h-0 mt-1"
        style={{ borderTop: '0.5px solid var(--border)' }}
      >
        <div className="flex items-center gap-2 px-2.5 py-2 shrink-0">
          <button
            type="button"
            onClick={() => setChatsExpanded((prev) => !prev)}
            className="flex items-center justify-between px-1 py-0.5 w-full text-left"
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Chats
            </span>
            <span className={`text-white/35 text-[10px] transition-transform ${chatsExpanded ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>
        </div>

        {chatsExpanded ? (
        <div className="flex-1 overflow-y-auto px-1.5 pb-2">
          {agents.map((agent, idx) => {
            const isActive = pathname === `/agents/${agent.id}`
            const isDragging = draggingAgentId === agent.id
            const isDropTarget = dragOverAgentId === agent.id && draggingAgentId !== agent.id
            const isSelected = selectedAgentIds.includes(agent.id)
            return (
              <div
                key={agent.id}
                draggable
                onDragStart={() => handleAgentDragStart(agent.id)}
                onDragOver={(e) => {
                  e.preventDefault()
                  handleAgentDragOver(agent.id)
                }}
                onDrop={handleAgentDrop}
                onDragEnd={handleAgentDragEnd}
                className={`rounded-lg mb-0.5 transition-all ${isDragging ? 'opacity-60 scale-[1.01]' : ''} ${isDropTarget ? 'ring-1 ring-white/25 bg-white/5' : ''}`}
              >
                <Link
                  href={`/agents/${agent.id}`}
                  className="flex items-center gap-2.5 py-1.5 rounded-lg text-xs truncate transition-colors"
                  style={{
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: isSelected ? 'rgba(239,68,68,0.14)' : 'transparent',
                    borderLeft: isActive && !isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    paddingLeft: '7px',
                  }}
                  onClick={(e) => {
                    if (deleteMode) {
                      e.preventDefault()
                      toggleAgentSelection(agent.id)
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive && !isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? 'rgba(239,68,68,0.14)' : 'transparent'
                  }}
                >
                  {deleteMode ? (
                    <span
                      className="shrink-0 w-3.5 h-3.5 rounded border"
                      style={{
                        borderColor: isSelected ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.25)',
                        backgroundColor: isSelected ? 'rgba(239,68,68,0.8)' : 'transparent',
                        display: 'inline-block',
                      }}
                    />
                  ) : null}
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
              </div>
            )
          })}
        </div>
        ) : null}

        <div className="px-2.5 pb-2 pt-1 shrink-0 flex justify-start">
          <button
            type="button"
            onClick={() => {
              if (deleteMode && selectedAgentIds.length > 0) {
                void deleteAgents(selectedAgentIds)
                return
              }
              if (deleteMode) {
                setDeleteMode(false)
                setSelectedAgentIds([])
                setIsBinDragOver(false)
              } else {
                setDeleteMode(true)
              }
            }}
            disabled={isDeleting}
            onDragOver={(e) => {
              if (!deleteMode) return
              e.preventDefault()
              if (draggingAgentId) setIsBinDragOver(true)
            }}
            onDragLeave={() => setIsBinDragOver(false)}
            onDrop={(e) => {
              if (!deleteMode) return
              e.preventDefault()
              void handleDropIntoBin()
            }}
            className="w-7 h-7 rounded-md border flex items-center justify-center shrink-0 transition-colors"
            style={{
              borderColor: isBinDragOver
                ? 'rgba(239,68,68,0.85)'
                : (deleteMode ? 'rgba(239,68,68,0.55)' : 'rgba(255,255,255,0.18)'),
              backgroundColor: isBinDragOver
                ? 'rgba(239,68,68,0.18)'
                : (deleteMode ? 'rgba(239,68,68,0.12)' : 'transparent'),
              color: deleteMode ? 'rgba(252,165,165,1)' : 'rgba(255,255,255,0.45)',
            }}
            title={
              deleteMode
                ? (selectedAgentIds.length > 0 ? `Delete selected (${selectedAgentIds.length})` : 'Delete mode active')
                : 'Open delete mode'
            }
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path
                d="M4 7h16"
                style={{
                  transformOrigin: '7px 7px',
                  transform: isBinDragOver ? 'rotate(-16deg) translate(-1px, -1px)' : 'none',
                  transition: 'transform 160ms ease',
                }}
                strokeLinecap="round"
              />
              <path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" strokeLinecap="round" />
              <rect x="6" y="7" width="12" height="13" rx="2" />
              <path d="M10 10.5v6M14 10.5v6" strokeLinecap="round" />
            </svg>
          </button>
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
