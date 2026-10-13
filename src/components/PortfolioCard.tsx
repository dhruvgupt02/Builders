import { Link } from 'react-router-dom'
import type { PortfolioItem } from '../lib/types'
import { aspectClass } from '../lib/format'

export default function PortfolioCard({ item }: { item: PortfolioItem }) {
  return (
    <Link to={`/portfolio/${item.id}`} className="group block">
      <div className={`${aspectClass(item.aspect_ratio)} w-full overflow-hidden rounded-xl bg-gray-100`}>
        {item.thumbnail_url && (
          <img src={item.thumbnail_url} alt={item.title} loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        )}
      </div>
      <h4 className="mt-2 text-sm font-semibold text-gray-900 group-hover:text-brand">{item.title}</h4>
      <p className="text-xs text-gray-500">{[item.content_type, item.aspect_ratio].filter(Boolean).join(' · ')}</p>
    </Link>
  )
}
