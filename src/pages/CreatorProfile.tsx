import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Creator, PortfolioItem } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import { isVerified } from '../components/CreatorCard'
import PortfolioCard from '../components/PortfolioCard'
import { Avatar, Chip, ChipList, EmptyState, PageContainer, Spinner, VerifiedBadge } from '../components/ui'

const VERIFICATION_LABELS = { tool: 'Tool', workflow: 'Workflow', past_work: 'Past work' } as const

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
      <Link to="/creators" className="text-sm text-gray-500 hover:text-brand">← All creators</Link>
      <div className="mt-6 flex flex-col sm:flex-row gap-6 sm:items-center">
        <Avatar src={creator.avatar_url} name={creator.name} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">{creator.name}</h1>
            {isVerified(creator) && <VerifiedBadge />}
          </div>
          <p className="mt-1 text-gray-700">{creator.headline}</p>
          <p className="mt-1 text-sm text-gray-500">
            {[creator.city, creator.languages?.join(', '), creator.availability].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wide text-gray-500">Typical project</p>
          <p className="text-lg font-bold text-gray-900">{formatPriceRange(creator.price_min, creator.price_max)}</p>
        </div>
      </div>

      <div className="mt-10 grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2">
          <h2 className="font-semibold text-gray-900">About</h2>
          <p className="mt-2 text-gray-700 whitespace-pre-line">{creator.bio}</p>
        </div>
        <div className="space-y-5">
          <div><h3 className="text-sm font-semibold text-gray-900 mb-2">Specializations</h3><ChipList items={creator.specializations} tone="brand" /></div>
          <div><h3 className="text-sm font-semibold text-gray-900 mb-2">Tools & models</h3><ChipList items={creator.tools} /></div>
          <div><h3 className="text-sm font-semibold text-gray-900 mb-2">Skills</h3><ChipList items={creator.skills} /></div>
          {verified.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Verifications</h3>
              <div className="flex flex-wrap gap-2">
                {verified.map((v) => (
                  <Chip key={v.id}>✓ {VERIFICATION_LABELS[v.type]}{v.label ? `: ${v.label}` : ''}</Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-12 text-xl font-bold text-gray-900">Portfolio</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No portfolio items yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 gap-6 items-start">
          {items.map((i) => <PortfolioCard key={i.id} item={i} />)}
        </div>
      )}
    </PageContainer>
  )
}
