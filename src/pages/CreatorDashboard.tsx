import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCreatorGate } from '../lib/useCreatorGate'
import { loadMyEngagements, type Engagement } from '../lib/engagements'
import type { Creator, PortfolioItem, Verification } from '../lib/types'
import { formatPriceRange } from '../lib/format'
import EngagementList from '../components/engagement/EngagementList'
import PortfolioCard from '../components/PortfolioCard'
import VerificationBadges from '../components/VerificationBadges'
import VerificationCenter from '../components/VerificationCenter'
import { ArrowIcon, Avatar, Button, Card, Notice, PageContainer, Spinner } from '../components/ui'

export default function CreatorDashboard() {
  const { gate, userId, creatorId } = useCreatorGate()
  const [creator, setCreator] = useState<Creator | null>(null)
  const [items, setItems] = useState<PortfolioItem[] | null>(null)
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!creatorId) return
    const [c, p, v, e] = await Promise.all([
      supabase.from('creators').select('*').eq('id', creatorId).maybeSingle(),
      supabase.from('portfolio_items').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }),
      supabase.from('verifications').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }),
      loadMyEngagements(),
    ])
    setCreator(c.data as Creator | null)
    setItems((p.data as PortfolioItem[]) ?? [])
    setVerifications((v.data as Verification[]) ?? [])
    setEngagements(e.filter((x) => x.creator_id === creatorId))
  }, [creatorId])

  useEffect(() => {
    load()
  }, [load])

  if (gate) return gate
  if (!creator || items === null) return <Spinner label="Loading your dashboard…" />

  async function deleteItem(item: PortfolioItem) {
    setConfirmDelete(null)
    const { data, error } = await supabase.from('portfolio_items').delete().eq('id', item.id).select('id')
    if (error || !data?.length) return setNotice({ tone: 'error', text: `"${item.title}" could not be deleted. ${error?.message ?? ''}` })
    setNotice({ tone: 'success', text: `"${item.title}" was deleted.` })
    load()
  }

  const invitations = engagements.filter((e) => e.status === 'invited')
  const active = engagements.filter((e) => e.status !== 'invited')

  return (
    <PageContainer>
      {/* Profile summary */}
      <Card tone="ink" className="!p-6 sm:!p-8">
        <div className="flex flex-col md:flex-row gap-6 md:items-center">
          <Avatar src={creator.avatar_url} name={creator.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Creator dashboard</p>
            <h1 className="display mt-2 text-3xl sm:text-4xl break-words">{creator.name}</h1>
            <p className="mt-2 text-cream/85">{creator.headline}</p>
            <p className="mt-1.5 text-sm text-cream/60">
              {[creator.city, formatPriceRange(creator.price_min, creator.price_max), creator.availability].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-3"><VerificationBadges verifications={verifications} /></div>
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
            <Button to="/onboarding/creator" variant="light">Edit profile</Button>
            <Button to={`/creators/${creator.id}`} variant="primary" icon={<ArrowIcon />}>View public profile</Button>
          </div>
        </div>
      </Card>

      {notice && <div className="mt-5"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      {/* Invitations and projects */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-2xl sm:text-3xl">Invitations and projects</h2>
            <p className="mt-1 text-sm text-ink-soft">{invitations.length ? `${invitations.length} ${invitations.length === 1 ? 'invitation is' : 'invitations are'} waiting for your reply.` : 'Brands invite you from their brief matches.'}</p>
          </div>
          <Button to="/briefs" variant="outline" size="sm">Browse open briefs</Button>
        </div>
        {engagements.length === 0 ? (
          <p className="mt-4 rounded-card border-[1.5px] border-dashed border-line p-5 text-sm text-ink-soft">No invitations yet. A complete profile, a documented workflow and verified tools all raise your match score.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {invitations.length > 0 && <EngagementList engagements={invitations} role="creator" />}
            {active.length > 0 && <EngagementList engagements={active} role="creator" />}
          </div>
        )}
      </section>

      {/* Portfolio */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-5">
          <div>
            <h2 className="display text-2xl sm:text-3xl">Your portfolio</h2>
            <p className="mt-1 text-sm text-ink-soft">{items.length} {items.length === 1 ? 'piece' : 'pieces'}</p>
          </div>
          <Button to="/portfolio/new" icon={<span className="text-lg leading-none">+</span>}>Add portfolio item</Button>
        </div>
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="dots mx-auto h-10 w-10" aria-hidden />
            <p className="display mt-5 text-xl">No pieces yet</p>
            <p className="mt-2 text-sm text-ink-soft">Add your first piece with the tools and workflow behind it.</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {items.map((item) => (
              <PortfolioCard
                key={item.id}
                item={item}
                verifications={verifications}
                footer={
                  confirmDelete === item.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold">Delete this piece?</span>
                      <Button size="sm" onClick={() => deleteItem(item)}>Yes, delete</Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Keep</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" variant="dark" to={`/portfolio/${item.id}/edit`}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(item.id)}>Delete</Button>
                    </div>
                  )
                }
              />
            ))}
          </div>
        )}
      </section>

      <VerificationCenter creator={creator} items={items} verifications={verifications} userId={userId!} onChange={load} />
    </PageContainer>
  )
}
