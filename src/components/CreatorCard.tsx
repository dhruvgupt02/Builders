import { Link } from 'react-router-dom'
import type { Creator } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import { ArrowIcon, Avatar, Chip } from './ui'
import VerificationBadges from './VerificationBadges'

export function isVerified(c: Creator) {
  return (c.verifications ?? []).some((v) => v.status === 'verified')
}

export default function CreatorCard({ creator }: { creator: Creator }) {
  const to = `/creators/${creator.id}`
  return (
    <article className="group flex h-full flex-col rounded-card bg-cream shadow-card transition-transform duration-200 hover:-translate-y-1">
      <div className="flex-1 p-5">
        <Link to={to} className="flex items-start gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue rounded-lg">
          <Avatar src={creator.avatar_url} name={creator.name} />
          <div className="min-w-0 flex-1">
            <h3 className="display text-base leading-tight break-words group-hover:text-brand">{creator.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">{creator.city}</p>
          </div>
        </Link>
        <p className="mt-4 text-sm text-ink line-clamp-2 min-h-10">{creator.headline}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {creator.tools.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
        {/* Outside the link so each badge can show its own tooltip on hover or focus. */}
        <div className="mt-3 min-h-5">
          <VerificationBadges verifications={creator.verifications} size="compact" />
        </div>
      </div>
      <Link to={to} tabIndex={-1} aria-hidden className="flex items-center justify-between gap-3 rounded-b-card bg-ink text-cream pl-5 pr-2 py-2">
        <p className="text-sm font-semibold">{formatPriceRange(creator.price_min, creator.price_max)}</p>
        <span className="h-9 w-9 rounded-lg bg-brand text-white flex items-center justify-center transition-transform group-hover:rotate-45">
          <ArrowIcon />
        </span>
      </Link>
    </article>
  )
}
