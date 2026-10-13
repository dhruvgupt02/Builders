import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { VERIFICATION_COLUMNS, type Creator, type PortfolioItem } from '../lib/types'
import { summarizeVerifications } from '../lib/verification'
import { useAuth } from '../lib/useAuth'
import { formatPriceRange } from '../lib/format'
import { reasonFromBreakdown, type MatchResult, type MatchRow } from '../lib/matching'
import ScoreBreakdown, { ScoreBadge } from '../components/match/ScoreBreakdown'
import PortfolioCard from '../components/PortfolioCard'
import ToolChips from '../components/ToolChips'
import VerificationBadges from '../components/VerificationBadges'
import { Avatar, Badge, Button, Card, ChipList, EmptyState, PageContainer, Spinner, Tabs } from '../components/ui'

const sectionLabel = 'text-xs font-bold uppercase tracking-wider mb-2.5'

function Stat({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="py-5 pr-4 sm:px-6 sm:first:pl-0">
      <p className="display text-3xl sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-xs font-bold uppercase tracking-wider">{label}</p>
      {detail && <p className="mt-0.5 text-xs text-ink-soft">{detail}</p>}
    </div>
  )
}

export default function CreatorProfile() {
  const { id } = useParams()
  const { creatorId: myCreatorId } = useAuth()
  const [creator, setCreator] = useState<Creator | null | undefined>(undefined)
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [tab, setTab] = useState('All')
  // Opened from a brief's matches (?brief=<id>): show how this creator fits that brief.
  const briefId = useSearchParams()[0].get('brief')
  const [fit, setFit] = useState<{ row: MatchRow; title: string } | null>(null)

  useEffect(() => {
    setFit(null)
    if (!id || !briefId) return
    let cancelled = false
    Promise.all([
      supabase.rpc('brief_matches', { brief_id: briefId, lim: 1, only_creator: id }),
      supabase.from('briefs').select('title').eq('id', briefId).maybeSingle(),
    ]).then(([m, b]) => {
      const row = (m.data as MatchResult | null)?.rows?.[0]
      // The brief is only readable by people allowed to see it; without it there is nothing to show.
      if (!cancelled && row && b.data) setFit({ row, title: b.data.title })
    })
    return () => {
      cancelled = true
    }
  }, [id, briefId])

  useEffect(() => {
    if (!id) return
    setCreator(undefined)
    setTab('All')
    Promise.all([
      supabase.from('creators').select(`*, verifications(${VERIFICATION_COLUMNS})`).eq('id', id).maybeSingle(),
      supabase.from('portfolio_items').select('*').eq('creator_id', id).order('created_at', { ascending: false }),
    ]).then(([c, p]) => {
      setCreator((c.data as Creator) ?? null)
      setItems((p.data as PortfolioItem[]) ?? [])
    })
  }, [id])

  const stats = useMemo(() => {
    const types = [...new Set(items.map((i) => i.content_type).filter((t): t is string => !!t))]
    const ratios = [...new Set(items.map((i) => i.aspect_ratio).filter((r): r is string => !!r))]
    const commercial = items.filter((i) => i.commercial_use_status === 'licensed' || i.commercial_use_status === 'client_delivered').length
    return { types, ratios, commercial }
  }, [items])

  if (creator === undefined) return <Spinner label="Loading profile…" />
  if (creator === null)
    return <EmptyState title="Creator not found" body="This profile may have been removed." action={{ to: '/creators', label: 'Browse creators' }} />

  const summary = summarizeVerifications(creator.verifications)
  const tabs = [{ id: 'All', label: 'All', count: items.length }, ...stats.types.map((t) => ({ id: t, label: t, count: items.filter((i) => i.content_type === t).length }))]
  const shown = tab === 'All' ? items : items.filter((i) => i.content_type === tab)

  return (
    <PageContainer>
      <Link to="/creators" className="text-sm font-semibold text-ink-soft hover:text-brand">← All creators</Link>

      {/* Header */}
      <Card tone="ink" className="mt-5 !p-6 sm:!p-8">
        <div className="flex flex-col md:flex-row gap-6 md:items-start">
          <Avatar src={creator.avatar_url} name={creator.name} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="display text-3xl sm:text-5xl break-words">{creator.name}</h1>
            <p className="mt-3 text-lg text-cream/90">{creator.headline}</p>
            <p className="mt-2 text-sm text-cream/60">{[creator.city, creator.languages?.join(', ')].filter(Boolean).join(' · ')}</p>
            <div className="mt-5 border-t border-cream/15 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-cream/60">Verification</p>
              <p className={`mt-1 font-semibold ${summary.any ? 'text-cream' : 'text-cream/60'}`}>
                {summary.text.charAt(0).toUpperCase() + summary.text.slice(1)}
              </p>
              <div className="mt-2.5"><VerificationBadges verifications={creator.verifications} /></div>
            </div>
          </div>
          <div className="shrink-0 md:text-right border-t md:border-t-0 md:border-l border-cream/15 pt-5 md:pt-0 md:pl-8">
            <p className="text-xs font-bold uppercase tracking-wider text-cream/60">Typical project</p>
            <p className="mt-1 display text-xl sm:text-2xl text-brand whitespace-nowrap">{formatPriceRange(creator.price_min, creator.price_max)}</p>
            {creator.availability && <div className="mt-3"><Badge tone="orange">{creator.availability}</Badge></div>}
            {myCreatorId === creator.id && <div className="mt-5"><Button to="/dashboard/creator" variant="light" size="sm">Manage profile</Button></div>}
          </div>
        </div>
      </Card>

      {/* Fit for the brief this profile was opened from */}
      {fit && (
        <Card className="mt-5 !p-5 sm:!p-6">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-center">
            <div className="flex items-start gap-4">
              <ScoreBadge score={fit.row.score} />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Fit for your brief</p>
                <h2 className="display mt-1 text-lg leading-tight break-words">{fit.title}</h2>
                <p className="mt-2 text-sm">{fit.row.reason ?? reasonFromBreakdown(fit.row)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" to={`/briefs/${briefId}/matches`} variant="dark">Back to all matches</Button>
                  {fit.row.best_item && <Button size="sm" variant="outline" to={`/portfolio/${fit.row.best_item.id}`}>See the closest piece</Button>}
                </div>
              </div>
            </div>
            <ScoreBreakdown breakdown={fit.row.breakdown} details={fit.row.details} all />
          </div>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-line sm:divide-x divide-line">
        <Stat value={String(items.length)} label="Portfolio pieces" />
        <Stat value={String(stats.types.length)} label="Content types" detail={stats.types.join(', ') || 'None yet'} />
        <Stat value={String(stats.ratios.length)} label="Aspect ratios" detail={stats.ratios.join(' · ') || 'None yet'} />
        <Stat
          value={stats.commercial ? 'Yes' : 'No'} label="Commercial-ready"
          detail={stats.commercial ? `${stats.commercial} licensed or client ${stats.commercial === 1 ? 'piece' : 'pieces'}` : 'No licensed or client work yet'}
        />
      </div>

      {/* About + craft */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="display text-xl">About</h2>
          <p className="mt-3 text-lg leading-relaxed whitespace-pre-line">{creator.bio}</p>
        </div>
        <Card className="space-y-5 self-start">
          <div><h3 className={sectionLabel}>Specializations</h3><ChipList items={creator.specializations} tone="orange" /></div>
          <div>
            <h3 className={sectionLabel}>Tools and models</h3>
            <ToolChips tools={creator.tools} verified={summary.verifiedTools} />
            {summary.verifiedTools.size > 0 && <p className="mt-2 text-xs text-ink-soft">A blue tick means BRIVIO verified the tool.</p>}
          </div>
          <div><h3 className={sectionLabel}>Skills</h3><ChipList items={creator.skills} /></div>
        </Card>
      </div>

      {/* Portfolio */}
      <div className="mt-12 border-t border-line pt-8">
        <h2 className="display text-2xl sm:text-4xl">Portfolio</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">No portfolio pieces yet.</p>
        ) : (
          <>
            <div className="mt-5"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>
            <div className="mt-6 columns-2 lg:columns-3 gap-3 sm:gap-5">
              {shown.map((i) => (
                <div key={i.id} className="break-inside-avoid pb-3 sm:pb-5"><PortfolioCard item={i} verifications={creator.verifications} /></div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
