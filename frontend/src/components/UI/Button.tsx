import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }

export default function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  const base = 'px-3 py-1 rounded text-sm'
  const variantCls = variant === 'primary' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border'
  return (
    <button className={`${base} ${variantCls} ${className}`} {...rest}>
      {children}
    </button>
  )
}
