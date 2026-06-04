import React, { ReactNode } from 'react'

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-4 rounded shadow-sm bg-white ${className}`} style={{ border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}
