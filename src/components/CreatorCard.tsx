import type { Creator } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import { ArrowIcon, Avatar, Card, Chip, VerifiedBadge } from './ui'

export function isVerified(c: Creator) {
  return (c.verifications ?? []).some((v) => v.status === 'verified')
}

export default function CreatorCard({ creator }: { creator: Creator }) {
  return (
    <Card to={`/creators/${creator.id}`} padded={false} className="group flex flex-col h-full overflow-hidden">
      <div className="p-5 flex-1">
        <div className="flex items-start gap-3">
          <Avatar src={creator.avatar_url} name={creator.name} />
          <div className="min-w-0 flex-1">
            <h3 className="display text-base leading-tight break-words">{creator.name}</h3>
            <p className="mt-1 text-sm text-ink-soft">{creator.city}</p>
          </div>
          {isVerified(creator) && <VerifiedBadge />}
        </div>
        <p className="mt-4 text-sm text-ink line-clamp-2 min-h-10">{creator.headline}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {creator.tools.slice(0, 3).map((t) => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 bg-ink text-cream pl-5 pr-2 py-2">
        <p className="text-sm font-semibold">{formatPriceRange(creator.price_min, creator.price_max)}</p>
        <span className="h-9 w-9 rounded-lg bg-brand text-white flex items-center justify-center transition-transform group-hover:rotate-45">
          <ArrowIcon />
        </span>
      </div>
    </Card>
  )
}
