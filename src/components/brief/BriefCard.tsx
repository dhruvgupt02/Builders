import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LoadedBrief } from '../../lib/briefs-db'
import { deliverableTotal } from '../../lib/brief'
import { BRIEF_STATUS_LABELS } from '../../lib/taxonomy'
import { formatINR } from '../../lib/format'
import { Badge, Chip } from '../ui'
import { AspectShape } from './AspectShape'

const STATUS_TONE = { draft: 'muted', open: 'blue', closed: 'ink' } as const

export const formatDate = (d: string) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export function StatusBadge({ status }: { status: LoadedBrief['draft']['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{BRIEF_STATUS_LABELS[status]}</Badge>
}

interface Props {
  brief: LoadedBrief
  /** Owner view: shows status, completeness and last edited instead of the brand line. */
  manage?: boolean
  footer?: ReactNode
}

/** A brief at a glance: who, what, formats, budget, deadline, where it will be used. */
export default function BriefCard({ brief, manage, footer }: Props) {
  const b = brief.draft
  const types = [...new Set(b.deliverables.map((d) => d.content_type).filter(Boolean))]
  const ratios = [...new Set(b.deliverables.map((d) => d.aspect_ratio).filter(Boolean))]
  const total = deliverableTotal(b)
  const to = `/briefs/${brief.id}`
  return (
    <article className="group flex h-full flex-col rounded-card bg-cream shadow-card">
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-xs font-bold uppercase tracking-[0.14em] text-brand break-words">{b.brand_name || 'Brand'}</p>
          {manage && <StatusBadge status={b.status} />}
        </div>
        <Link to={to} className="mt-1.5 block rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
          <h3 className="display text-lg leading-tight break-words group-hover:text-brand">{b.title}</h3>
        </Link>
        {b.goal && <p className="mt-2 text-sm text-ink-soft line-clamp-2">{b.goal}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {types.map((t) => <Chip key={t} tone="ink">{t}</Chip>)}
          {ratios.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-bold ring-1 ring-inset ring-line"><AspectShape ratio={r} size={16} />{r}</span>
          ))}
        </div>
        {b.usage_platforms.length > 0 && (
          <p className="mt-3 text-xs"><span className="font-bold uppercase tracking-wider text-ink-soft">Used on: </span><span className="font-semibold">{b.usage_platforms.join(', ')}</span></p>
        )}

        {manage && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-xs font-bold uppercase tracking-wider">
              <span className="text-ink-soft">Completeness</span><span>{brief.completeness}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-ink/10"><div className="h-full rounded-full bg-lime ring-1 ring-ink/15" style={{ width: `${brief.completeness}%` }} /></div>
            <p className="mt-2 text-xs text-ink-soft">Last edited {formatDate(brief.updated_at)}</p>
          </div>
        )}
        {footer && <div className="mt-4 border-t border-line pt-3">{footer}</div>}
      </div>
      <Link to={to} tabIndex={-1} aria-hidden className="grid grid-cols-3 gap-2 rounded-b-card bg-ink px-5 py-3 text-cream">
        <span><span className="block text-[10px] font-bold uppercase tracking-wider text-cream/60">Budget</span><span className="block text-sm font-semibold">{b.budget_max ? `up to ${formatINR(b.budget_max)}` : 'Not set'}</span></span>
        <span><span className="block text-[10px] font-bold uppercase tracking-wider text-cream/60">Deadline</span><span className="block text-sm font-semibold">{formatDate(b.deadline) || 'Not set'}</span></span>
        <span><span className="block text-[10px] font-bold uppercase tracking-wider text-cream/60">Deliverables</span><span className="block text-sm font-semibold">{total}</span></span>
      </Link>
    </article>
  )
}
