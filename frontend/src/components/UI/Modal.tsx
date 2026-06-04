import React, { ReactNode } from 'react'

export default function Modal({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="bg-white rounded shadow-lg z-10 max-w-lg w-full p-4" style={{ border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
