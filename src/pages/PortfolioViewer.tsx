import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { PortfolioItem } from '../lib/types'
import { COMMERCIAL_USE_LABELS } from '../lib/taxonomy'
import { aspectClass, formatDuration } from '../lib/format'
import { Badge, Card, ChipList, EmptyState, Media, PageContainer, Spinner } from '../components/ui'

const sectionLabel = 'text-xs font-bold uppercase tracking-wider mb-2.5'

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
  ]

  return (
    <PageContainer>
      {item.creators && (
        <Link to={`/creators/${item.creators.id}`} className="text-sm font-semibold text-ink-soft hover:text-brand">
          ← Back to {item.creators.name}
        </Link>
      )}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-start">
        <div className={`lg:col-span-3 w-full ${vertical ? 'max-w-sm mx-auto' : ''}`}>
          <div className="rounded-card bg-cream p-2 shadow-card">
            <div className={`${aspectClass(item.aspect_ratio)} w-full rounded-[0.9rem] overflow-hidden bg-paper-deep`}>
              {item.media_type === 'video' && item.media_url ? (
                <video src={item.media_url} poster={item.thumbnail_url ?? undefined} controls className="w-full h-full object-cover" />
              ) : (
                <Media src={media ?? undefined} alt={item.title} className="w-full h-full object-cover" />
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {item.commercial_use_status && (
            <Badge tone={item.commercial_use_status === 'personal' ? 'muted' : 'blue'}>
              {COMMERCIAL_USE_LABELS[item.commercial_use_status]}
            </Badge>
          )}
          <h1 className="display mt-3 text-3xl sm:text-4xl break-words">{item.title}</h1>
          <p className="mt-4 text-lg leading-relaxed">{item.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-line py-5">
            {meta.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className={`mt-6 ${sectionLabel}`}>Tools used</h3>
          <ChipList items={item.tools} tone="ink" />
          <h3 className={`mt-5 ${sectionLabel}`}>Style</h3>
          <ChipList items={item.style_tags} />
        </div>
      </div>

      <div className="mt-12 border-t border-line pt-8">
        <h2 className="display text-2xl sm:text-4xl">Workflow</h2>
        {steps.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">No workflow steps shared for this piece.</p>
        ) : (
          <ol className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <li key={s.id}>
                <Card ticket notchY="3.6rem" className="h-full">
                  <div className="flex items-center justify-between">
                    <span className="display text-sm h-10 w-10 rounded-lg bg-ink text-cream flex items-center justify-center">{i + 1}</span>
                    <span className="display text-xs text-brand">{s.tool}</span>
                  </div>
                  <div className="mt-5 border-t border-dashed border-ink/25 pt-4">
                    <p className="font-bold leading-snug">{s.action}</p>
                    {s.note && <p className="mt-1.5 text-sm text-ink-soft">{s.note}</p>}
                  </div>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PageContainer>
  )
}
