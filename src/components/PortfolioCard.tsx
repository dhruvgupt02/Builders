import { Link } from 'react-router-dom'
import type { PortfolioItem } from '../lib/types'
import { aspectClass } from '../lib/format'
import { Media } from './ui'

export default function PortfolioCard({ item }: { item: PortfolioItem }) {
  return (
    <Link to={`/portfolio/${item.id}`} className="group block rounded-card bg-cream p-2 shadow-card transition-transform duration-200 hover:-translate-y-1">
      <div className={`${aspectClass(item.aspect_ratio)} w-full overflow-hidden rounded-[0.9rem] bg-paper-deep`}>
        <Media src={item.thumbnail_url ?? undefined} alt={item.title} loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      </div>
      <div className="px-2 pt-3 pb-2">
        <h4 className="text-sm font-bold leading-snug group-hover:text-brand">{item.title}</h4>
        <p className="mt-1 text-xs font-medium uppercase tracking-wider text-ink-soft">
          {[item.content_type, item.aspect_ratio].filter(Boolean).join(' · ')}
        </p>
      </div>
    </Link>
  )
}
