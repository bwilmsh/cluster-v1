import React, { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
