import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { VERIFICATION_COLUMNS, type PortfolioItem } from '../lib/types'
import { COMMERCIAL_USE_LABELS, type CommercialUseStatus } from '../lib/taxonomy'
import { summarizeVerifications } from '../lib/verification'
import { useAuth } from '../lib/useAuth'
import { aspectClass, formatDuration } from '../lib/format'
import Lightbox from '../components/Lightbox'
import PortfolioCard from '../components/PortfolioCard'
import ToolChips from '../components/ToolChips'
import VerificationBadges from '../components/VerificationBadges'
import { ArrowIcon, Avatar, Badge, Button, Card, ChipList, EmptyState, Media, PageContainer, Spinner } from '../components/ui'

const COMMERCIAL_EXPLAIN: Record<CommercialUseStatus, string> = {
  personal: 'A personal or concept piece. Ask the creator before using anything like it commercially.',
  licensed: 'Made with commercially licensed tools, so work like this can be produced for brand use.',
  client_delivered: 'Delivered to a paying client and used commercially.',
}
const COMMERCIAL_TONE = { personal: 'muted', licensed: 'ink', client_delivered: 'orange' } as const

const sectionLabel = 'text-xs font-bold uppercase tracking-wider'

export default function PortfolioViewer() {
  const { id } = useParams()
  const { creatorId: myCreatorId } = useAuth()
  const [item, setItem] = useState<PortfolioItem | null | undefined>(undefined)
  const [more, setMore] = useState<PortfolioItem[]>([])
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)

  useEffect(() => {
    if (!id) return
    setItem(undefined)
    setMore([])
    window.scrollTo({ top: 0 })
    supabase
      .from('portfolio_items')
      .select(`*, workflow_steps(*), creators(id,name,avatar_url,city,headline,verifications(${VERIFICATION_COLUMNS}))`)
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const found = (data as PortfolioItem) ?? null
        setItem(found)
        if (found)
          supabase
            .from('portfolio_items')
            .select('*')
            .eq('creator_id', found.creator_id)
            .neq('id', found.id)
            .order('created_at', { ascending: false })
            .limit(4)
            .then(({ data: rest }) => setMore((rest as PortfolioItem[]) ?? []))
      })
  }, [id])

  if (item === undefined) return <Spinner label="Loading portfolio piece…" />
  if (item === null)
    return <EmptyState title="Portfolio piece not found" body="It may have been removed by its creator." action={{ to: '/creators', label: 'Browse creators' }} />

  const creator = item.creators
  const verifications = creator?.verifications
  const summary = summarizeVerifications(verifications)
  const steps = [...(item.workflow_steps ?? [])].sort((a, b) => a.step_order - b.step_order)
  const vertical = item.aspect_ratio === '9:16' || item.aspect_ratio === '4:5'
  const isVideo = item.media_type === 'video' && !!item.media_url
  const image = item.media_url || item.thumbnail_url
  const status = item.commercial_use_status
  const facts: [string, string | null][] = [
    ['Content type', item.content_type],
    ['Aspect ratio', item.aspect_ratio],
    ['Duration', formatDuration(item.duration_sec)],
    ['Resolution', item.resolution],
    ['Client', item.client_name],
  ]

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {creator && (
          <Link to={`/creators/${creator.id}`} className="text-sm font-semibold text-ink-soft hover:text-brand">← Back to {creator.name}</Link>
        )}
        {myCreatorId === item.creator_id && <Button size="sm" variant="dark" to={`/portfolio/${item.id}/edit`}>Edit this piece</Button>}
      </div>

      {/* Media, panel, then the making-of. On mobile they stack in that order; on desktop the panel sits beside the rest. */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-x-10 items-start">
        <div className={`lg:col-span-3 w-full ${vertical ? 'max-w-md mx-auto' : ''}`}>
          <div className="rounded-card bg-cream p-2 shadow-card">
            <div className={`${aspectClass(item.aspect_ratio)} relative w-full rounded-[0.9rem] overflow-hidden bg-ink`}>
              {isVideo ? (
                <video src={item.media_url!} poster={item.thumbnail_url ?? undefined} controls playsInline preload="metadata" className="h-full w-full object-contain" />
              ) : (
                <button
                  type="button"
                  onClick={() => image && setZoom({ src: image, alt: item.title })}
                  className="group block h-full w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-blue"
                  aria-label={`Zoom image: ${item.title}`}
                >
                  <Media src={image ?? undefined} alt={item.title} className="h-full w-full object-cover" />
                  <span className="absolute right-3 bottom-3 rounded-btn bg-ink/85 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cream opacity-90 group-hover:bg-brand">
                    Click to zoom
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <aside className="lg:col-span-2 lg:row-span-2 lg:sticky lg:top-6">
          <Card className="!p-6">
            <div className="flex flex-wrap gap-1.5">
              {item.content_type && <Badge tone="ink">{item.content_type}</Badge>}
              <VerificationBadges verifications={verifications} itemId={item.id} />
            </div>
            <h1 className="display mt-3 text-2xl sm:text-3xl break-words">{item.title}</h1>

            {creator && (
              <Link to={`/creators/${creator.id}`} className="group mt-4 flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-line hover:ring-ink">
                <Avatar src={creator.avatar_url} name={creator.name} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-tight group-hover:text-brand">{creator.name}</span>
                  <span className="block truncate text-xs text-ink-soft">{[creator.city, creator.headline].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-cream group-hover:bg-brand"><ArrowIcon /></span>
              </Link>
            )}

            {item.description && <p className="mt-4 leading-relaxed">{item.description}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-line py-4">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{k}</dt>
                  <dd className="mt-0.5 font-semibold break-words">{v}</dd>
                </div>
              ))}
            </dl>

            {status && (
              <div className="mt-4">
                <h2 className={sectionLabel}>Commercial use</h2>
                <div className="mt-2"><Badge tone={COMMERCIAL_TONE[status]}>{COMMERCIAL_USE_LABELS[status]}</Badge></div>
                <p className="mt-2 text-sm text-ink-soft">{COMMERCIAL_EXPLAIN[status]}</p>
              </div>
            )}

            {item.style_tags.length > 0 && (
              <div className="mt-5">
                <h2 className={`${sectionLabel} mb-2`}>Style</h2>
                <ChipList items={item.style_tags} />
              </div>
            )}
          </Card>
        </aside>

        {/* Made with + workflow */}
        <div className="lg:col-span-3 min-w-0">
          <section>
            <h2 className="display text-xl sm:text-2xl">Made with</h2>
            <div className="mt-3"><ToolChips tools={item.tools} verified={summary.verifiedTools} /></div>
            {item.tools.some((t) => summary.verifiedTools.has(t)) && (
              <p className="mt-2 text-xs text-ink-soft">A blue tick means BRIVIO verified that {creator?.name ?? 'the creator'} works with the tool.</p>
            )}
          </section>

          <section className="mt-9 border-t border-line pt-7">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="display text-xl sm:text-2xl">Workflow</h2>
              {summary.workflowItems.has(item.id) && <Badge tone="blue">✓ Verified</Badge>}
            </div>
            {steps.length === 0 ? (
              <p className="mt-3 text-sm text-ink-soft">No workflow steps were shared for this piece.</p>
            ) : (
              <ol className="mt-6">
                {steps.map((s, i) => (
                  <li key={s.id} className="relative flex gap-3 sm:gap-4 pb-6 last:pb-0">
                    {/* connector line between step numbers */}
                    {i < steps.length - 1 && <span className="absolute left-5 top-10 bottom-0 w-0.5 -translate-x-1/2 bg-ink/15" aria-hidden />}
                    <span className="display relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-cream text-sm">{i + 1}</span>
                    <div className="min-w-0 flex-1 rounded-card bg-cream p-4 shadow-card">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="min-w-0 flex-1">
                          <ToolChips tools={[s.tool]} verified={summary.verifiedTools} tone="orange" />
                          <p className="mt-2.5 font-bold leading-snug">{s.action}</p>
                          {s.note && <p className="mt-1.5 text-sm text-ink-soft">{s.note}</p>}
                        </div>
                        {s.step_media_url && (
                          <button
                            type="button"
                            onClick={() => setZoom({ src: s.step_media_url!, alt: `Step ${i + 1}: ${s.action}` })}
                            className="shrink-0 cursor-zoom-in overflow-hidden rounded-xl sm:w-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                            aria-label={`Zoom image for step ${i + 1}`}
                          >
                            <Media src={s.step_media_url} alt={`Step ${i + 1}: ${s.action}`} loading="lazy" className="aspect-video w-full object-cover transition-transform hover:scale-105" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      {/* More from this creator */}
      {creator && more.length > 0 && (
        <section className="mt-14 border-t border-line pt-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="display text-2xl sm:text-3xl">More from {creator.name.split(' ')[0]}</h2>
            <Link to={`/creators/${creator.id}`} className="display text-xs tracking-normal underline underline-offset-4 decoration-2 hover:text-brand whitespace-nowrap">Full profile</Link>
          </div>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 items-start">
            {more.map((m) => <PortfolioCard key={m.id} item={m} verifications={verifications} />)}
          </div>
        </section>
      )}

      {zoom && <Lightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </PageContainer>
  )
}
