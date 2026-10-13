import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PortfolioItem } from '../lib/types'
import { COMMERCIAL_USE_LABELS } from '../lib/taxonomy'
import { aspectClass, formatDuration } from '../lib/format'
import { ChipList, EmptyState, PageContainer, Spinner } from '../components/ui'

export default function PortfolioViewer() {
  const { id } = useParams()
  const [item, setItem] = useState<PortfolioItem | null | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    setItem(undefined)
    supabase
      .from('portfolio_items')
      .select('*, workflow_steps(*), creators(id,name,avatar_url,city)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setItem((data as PortfolioItem) ?? null))
  }, [id])

  if (item === undefined) return <Spinner label="Loading portfolio piece…" />
  if (item === null)
    return <EmptyState title="Portfolio piece not found" action={{ to: '/creators', label: 'Browse creators' }} />

  const steps = [...(item.workflow_steps ?? [])].sort((a, b) => a.step_order - b.step_order)
  const vertical = item.aspect_ratio === '9:16' || item.aspect_ratio === '4:5'
  const media = item.media_url || item.thumbnail_url
  const meta: [string, string | null][] = [
    ['Content type', item.content_type],
    ['Aspect ratio', item.aspect_ratio],
    ['Duration', formatDuration(item.duration_sec)],
    ['Resolution', item.resolution],
    ['Client', item.client_name],
    ['Commercial use', item.commercial_use_status ? COMMERCIAL_USE_LABELS[item.commercial_use_status] : null],
  ]

  return (
    <PageContainer>
      {item.creators && (
        <Link to={`/creators/${item.creators.id}`} className="text-sm text-gray-500 hover:text-brand">
          ← Back to {item.creators.name}
        </Link>
      )}
      <div className="mt-6 grid lg:grid-cols-5 gap-10">
        <div className={`lg:col-span-3 ${vertical ? 'max-w-sm mx-auto w-full' : ''}`}>
          <div className={`${aspectClass(item.aspect_ratio)} w-full rounded-2xl overflow-hidden bg-gray-100`}>
            {media && (item.media_type === 'video' && item.media_url ? (
              <video src={item.media_url} poster={item.thumbnail_url ?? undefined} controls className="w-full h-full object-cover" />
            ) : (
              <img src={media} alt={item.title} className="w-full h-full object-cover" />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <h1 className="text-2xl font-bold text-gray-900">{item.title}</h1>
          <p className="mt-3 text-gray-700">{item.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-4">
            {meta.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-gray-500">{k}</dt>
                <dd className="text-sm font-medium text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-sm font-semibold text-gray-900 mb-2">Tools used</h3>
          <ChipList items={item.tools} tone="brand" />
          <h3 className="mt-5 text-sm font-semibold text-gray-900 mb-2">Style</h3>
          <ChipList items={item.style_tags} />
        </div>
      </div>

      <h2 className="mt-12 text-xl font-bold text-gray-900">Workflow</h2>
      {steps.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No workflow steps shared for this piece.</p>
      ) : (
        <ol className="mt-6 relative border-l-2 border-brand-light ml-4">
          {steps.map((s, i) => (
            <li key={s.id} className="ml-8 mb-8 last:mb-0">
              <span className="absolute -left-[17px] w-8 h-8 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <p className="text-sm font-semibold text-brand">{s.tool}</p>
              <p className="font-medium text-gray-900">{s.action}</p>
              {s.note && <p className="text-sm text-gray-600 mt-1">{s.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </PageContainer>
  )
}
