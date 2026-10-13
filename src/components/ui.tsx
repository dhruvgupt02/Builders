import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Chip({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'brand' }) {
  const cls = tone === 'brand' ? 'bg-brand-light text-brand' : 'bg-gray-100 text-gray-700'
  return <span className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>{children}</span>
}

export function ChipList({ items, tone }: { items: string[] | null | undefined; tone?: 'gray' | 'brand' }) {
  if (!items?.length) return <p className="text-sm text-gray-400">None listed</p>
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => <Chip key={i} tone={tone}>{i}</Chip>)}
    </div>
  )
}

export function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden>
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
      </svg>
      Verified
    </span>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-gray-500" role="status">
      <div className="w-8 h-8 border-4 border-brand-light border-t-brand rounded-full animate-spin" />
      <p className="mt-3 text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: { to: string; label: string } }) {
  return (
    <div className="text-center py-24 px-4">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {body && <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">{body}</p>}
      {action && (
        <Link to={action.to} className="inline-block mt-6 px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark">
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function Avatar({ src, name, size = 'md' }: { src: string | null | undefined; name: string; size?: 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-24 h-24 text-2xl' : 'w-12 h-12 text-base'
  if (src) return <img src={src} alt={name} className={`${dim} rounded-full object-cover bg-gray-100`} loading="lazy" />
  return (
    <div className={`${dim} rounded-full bg-brand-light text-brand font-bold flex items-center justify-center`}>
      {name.charAt(0)}
    </div>
  )
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="max-w-6xl mx-auto px-4 py-10">{children}</div>
}
