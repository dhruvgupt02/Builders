import { Link } from 'react-router-dom'
import type { Creator } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import { Avatar, Chip, VerifiedBadge } from './ui'

export function isVerified(c: Creator) {
  return (c.verifications ?? []).some((v) => v.status === 'verified')
}

export default function CreatorCard({ creator }: { creator: Creator }) {
  return (
    <Link
      to={`/creators/${creator.id}`}
      className="block border border-gray-200 rounded-2xl p-5 hover:border-brand hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <Avatar src={creator.avatar_url} name={creator.name} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{creator.name}</h3>
            {isVerified(creator) && <VerifiedBadge />}
          </div>
          <p className="text-sm text-gray-500">{creator.city}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-700 line-clamp-2 min-h-10">{creator.headline}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {creator.tools.slice(0, 3).map((t) => <Chip key={t} tone="brand">{t}</Chip>)}
      </div>
      <p className="mt-4 text-sm font-semibold text-gray-900">{formatPriceRange(creator.price_min, creator.price_max)}</p>
    </Link>
  )
}
