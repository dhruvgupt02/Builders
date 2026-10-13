import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Creator, PortfolioItem } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import { isVerified } from '../components/CreatorCard'
import PortfolioCard from '../components/PortfolioCard'
import { Avatar, Badge, Card, Chip, ChipList, EmptyState, PageContainer, Spinner, VerifiedBadge } from '../components/ui'

const VERIFICATION_LABELS = { tool: 'Tool', workflow: 'Workflow', past_work: 'Past work' } as const

const sectionLabel = 'text-xs font-bold uppercase tracking-wider mb-2.5'

export default function CreatorProfile() {
  const { id } = useParams()
  const [creator, setCreator] = useState<Creator | null | undefined>(undefined)
  const [items, setItems] = useState<PortfolioItem[]>([])

  useEffect(() => {
    if (!id) return
    setCreator(undefined)
    Promise.all([
      supabase.from('creators').select('*, verifications(id,type,label,status)').eq('id', id).maybeSingle(),
      supabase.from('portfolio_items').select('*').eq('creator_id', id).order('created_at'),
    ]).then(([c, p]) => {
      setCreator((c.data as Creator) ?? null)
      setItems((p.data as PortfolioItem[]) ?? [])
    })
  }, [id])

  if (creator === undefined) return <Spinner label="Loading profile…" />
  if (creator === null)
    return <EmptyState title="Creator not found" body="This profile may have been removed." action={{ to: '/creators', label: 'Browse creators' }} />

  const verified = (creator.verifications ?? []).filter((v) => v.status === 'verified')

  return (
    <PageContainer>
      <Link to="/creators" className="text-sm font-semibold text-ink-soft hover:text-brand">← All creators</Link>

      <Card tone="ink" className="mt-5 !p-6 sm:!p-8">
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <Avatar src={creator.avatar_url} name={creator.name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="display text-3xl sm:text-5xl break-words">{creator.name}</h1>
              {isVerified(creator) && <VerifiedBadge />}
            </div>
            <p className="mt-3 text-lg text-cream/90">{creator.headline}</p>
            <p className="mt-2 text-sm text-cream/60">
              {[creator.city, creator.languages?.join(', ')].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="md:text-right shrink-0 border-t md:border-t-0 md:border-l border-cream/15 pt-5 md:pt-0 md:pl-8">
            <p className="text-xs font-bold uppercase tracking-wider text-cream/60">Typical project</p>
            <p className="mt-1 display text-xl sm:text-2xl text-brand whitespace-nowrap">{formatPriceRange(creator.price_min, creator.price_max)}</p>
            {creator.availability && <div className="mt-3"><Badge tone="orange">{creator.availability}</Badge></div>}
          </div>
        </div>
      </Card>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="display text-xl">About</h2>
          <p className="mt-3 text-lg leading-relaxed whitespace-pre-line">{creator.bio}</p>
          {verified.length > 0 && (
            <div className="mt-7">
              <h3 className={sectionLabel}>Verifications</h3>
              <div className="flex flex-wrap gap-1.5">
                {verified.map((v) => (
                  <Chip key={v.id} tone="blue">✓ {VERIFICATION_LABELS[v.type]}{v.label ? `: ${v.label}` : ''}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
        <Card className="space-y-5 self-start">
          <div><h3 className={sectionLabel}>Specializations</h3><ChipList items={creator.specializations} tone="orange" /></div>
          <div><h3 className={sectionLabel}>Tools & models</h3><ChipList items={creator.tools} tone="ink" /></div>
          <div><h3 className={sectionLabel}>Skills</h3><ChipList items={creator.skills} /></div>
        </Card>
      </div>

      <div className="mt-12 flex items-end justify-between border-t border-line pt-8">
        <h2 className="display text-2xl sm:text-4xl">Portfolio</h2>
        {items.length > 0 && <Badge tone="ink">{items.length} pieces</Badge>}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">No portfolio items yet.</p>
      ) : (
        <div className="mt-6 columns-2 md:columns-3 gap-3 sm:gap-5">
          {items.map((i) => (
            <div key={i.id} className="break-inside-avoid mb-3 sm:mb-5"><PortfolioCard item={i} /></div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
