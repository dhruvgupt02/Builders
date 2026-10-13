import { useState, type ReactNode } from 'react'
import Button, { ArrowIcon } from './Button'

export function PageContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 ${className}`}>{children}</div>
}

interface PageHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between border-b border-line pb-6 sm:pb-8">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h1 className="display mt-2 text-3xl sm:text-5xl break-words">{title}</h1>
        {subtitle && <p className="mt-3 max-w-xl text-base text-ink-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
    </header>
  )
}

interface EmptyStateProps {
  title: string
  body?: string
  action?: { to: string; label: string }
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center py-16 sm:py-24 px-4">
      <div className="dots h-12 w-12" aria-hidden />
      <h2 className="display mt-6 text-2xl sm:text-3xl">{title}</h2>
      {body && <p className="mt-3 text-sm text-ink-soft max-w-md">{body}</p>}
      {action && <Button to={action.to} className="mt-7" icon={<ArrowIcon />}>{action.label}</Button>}
    </div>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-ink-soft" role="status">
      <div className="w-9 h-9 border-4 border-ink/15 border-t-brand rounded-full animate-spin" />
      <p className="mt-4 text-xs font-bold uppercase tracking-wider">{label}</p>
    </div>
  )
}

export function Avatar({ src, name, size = 'md' }: { src: string | null | undefined; name: string; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-24 h-24 sm:w-28 sm:h-28 text-3xl rounded-2xl' : 'w-12 h-12 text-base rounded-xl'
  const [failed, setFailed] = useState(false)
  if (src && !failed)
    return <img src={src} alt={name} className={`${dim} shrink-0 object-cover bg-paper-deep`} loading="lazy" onError={() => setFailed(true)} />
  return <div className={`${dim} shrink-0 bg-brand text-white display flex items-center justify-center`}>{name.charAt(0)}</div>
}
