import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { PortfolioItem, Verification } from '../lib/types'
import { aspectClass, formatDuration } from '../lib/format'
import { Badge, Chip, Media } from './ui'
import VerificationBadges from './VerificationBadges'

const STATUS_BADGE = {
  client_delivered: { label: 'Client work', tone: 'orange' },
  licensed: { label: 'Licensed', tone: 'ink' },
  personal: { label: 'Personal', tone: 'muted' },
} as const

interface Props {
  item: PortfolioItem
  /** The creator's verifications; used to badge this piece if its workflow or delivery was verified. */
  verifications?: Verification[]
  /** Extra controls under the card body (edit / delete on the dashboard). */
  footer?: ReactNode
}

export default function PortfolioCard({ item, verifications, footer }: Props) {
  const status = item.commercial_use_status ? STATUS_BADGE[item.commercial_use_status] : null
  const duration = formatDuration(item.duration_sec)
  return (
    <article className="group rounded-card bg-cream p-2 shadow-card transition-transform duration-200 hover:-translate-y-1">
      <Link to={`/portfolio/${item.id}`} className="relative block overflow-hidden rounded-[0.9rem] bg-paper-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
        <Media src={item.thumbnail_url ?? undefined} alt={item.title} loading="lazy"
          className={`${aspectClass(item.aspect_ratio)} w-full object-cover group-hover:scale-105 transition-transform duration-300`} />
        <span className="absolute left-2 top-2 flex gap-1">
          {item.content_type && <Badge tone="ink">{item.content_type}</Badge>}
        </span>
        {(item.media_type === 'video' || duration) && (
          <span className="absolute right-2 bottom-2 rounded-md bg-ink/85 px-1.5 py-0.5 text-[10px] font-bold text-cream">
            {item.media_type === 'video' ? '▶ ' : ''}{duration ?? 'Video'}
          </span>
        )}
      </Link>
      <div className="px-2 pt-3 pb-2">
        <Link to={`/portfolio/${item.id}`} className="block text-sm font-bold leading-snug hover:text-brand">{item.title}</Link>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          {[item.aspect_ratio, item.client_name].filter(Boolean).join(' · ')}
        </p>
        {item.tools.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {item.tools.slice(0, 2).map((t) => <Chip key={t}>{t}</Chip>)}
            {item.tools.length > 2 && <Chip>+{item.tools.length - 2}</Chip>}
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          <VerificationBadges verifications={verifications} itemId={item.id} size="compact" focusable={false} tooltip="native" />
        </div>
        {footer && <div className="mt-3 border-t border-line pt-3">{footer}</div>}
      </div>
    </article>
  )
}
