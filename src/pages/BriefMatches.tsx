import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { authedPost } from '../lib/api'
import { loadBrief, type LoadedBrief } from '../lib/briefs-db'
import { invite, loadBriefEngagements, removeFromShortlist, shortlist, STATUS_LABELS, type Engagement } from '../lib/engagements'
import { reasonFromBreakdown, weakMatchAdvice, type MatchResult, type MatchRow } from '../lib/matching'
import { formatDeliverable } from '../lib/brief'
import { formatPriceRange } from '../lib/format'
import type { Verification } from '../lib/types'
import ScoreBreakdown, { ScoreBadge } from '../components/match/ScoreBreakdown'
import ToolChips from '../components/ToolChips'
import VerificationBadges from '../components/VerificationBadges'
import { ArrowIcon, Avatar, Badge, Button, Card, EmptyState, Input, Media, Notice, PageContainer, Spinner, Switch, Textarea } from '../components/ui'

const WEAK = 40

function verificationsOf(row: MatchRow): Verification[] {
  return [
    ...row.verified_tool_labels.map((label, i) => ({ id: `t${i}`, type: 'tool' as const, label, status: 'verified' as const })),
    ...(row.has_verified_workflow ? [{ id: 'w', type: 'workflow' as const, label: null, status: 'verified' as const }] : []),
    ...(row.has_verified_past_work ? [{ id: 'p', type: 'past_work' as const, label: null, status: 'verified' as const }] : []),
  ]
}

export default function BriefMatches() {
  const { id } = useParams()
  const { session, userId, loading: authLoading } = useAuth()
  const [brief, setBrief] = useState<LoadedBrief | null | undefined>(undefined)
  const [rows, setRows] = useState<MatchRow[] | null>(null)
  const [embedded, setEmbedded] = useState(true)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [reasonSource, setReasonSource] = useState<string | null>(null)
  const [engagements, setEngagements] = useState<Record<string, Engagement>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // filters
  const [minScore, setMinScore] = useState(0)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [withinBudget, setWithinBudget] = useState(false)

  // invite composer
  const [composer, setComposer] = useState<{ creatorId: string; text: string; price: string; drafting: boolean; note?: string } | null>(null)

  const loadEngagements = useCallback(async () => {
    if (!id) return
    setEngagements(Object.fromEntries((await loadBriefEngagements(id)).map((e) => [e.creator_id, e])))
  }, [id])

  useEffect(() => {
    if (!id || authLoading || !session) return
    let cancelled = false
    ;(async () => {
      const loaded = await loadBrief(id, userId)
      if (cancelled) return
      setBrief(loaded)
      if (!loaded?.isOwner) return
      const { data, error } = await supabase.rpc('brief_matches', { brief_id: id, lim: 100 })
      if (cancelled) return
      if (error) return setError(error.message)
      const result = data as MatchResult
      setRows(result.rows)
      setEmbedded(result.brief_embedded)
      setReasons(Object.fromEntries(result.rows.filter((r) => r.reason).map((r) => [r.id, r.reason!])))
      void loadEngagements()
      // One call writes (or fetches the cached) sentences for the top ten.
      const res = await authedPost<{ reasons: Record<string, string>; source: string }>('/api/ai/match-reasons', { briefId: id })
      if (!cancelled && res.json?.reasons) {
        setReasons((r) => ({ ...r, ...res.json!.reasons }))
        setReasonSource(res.json.source)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, session, userId, authLoading, loadEngagements])

  const shown = useMemo(
    () => (rows ?? []).filter((r) => r.score >= minScore && (!verifiedOnly || r.verification_count > 0) && (!withinBudget || r.details.within_budget)),
    [rows, minScore, verifiedOnly, withinBudget],
  )

  if (authLoading) return <Spinner />
  if (!session) return <EmptyState title="Log in to see matches" action={{ to: '/login', label: 'Log in' }} />
  if (brief === undefined) return <Spinner label="Loading brief…" />
  if (brief === null) return <EmptyState title="Brief not found" action={{ to: '/dashboard/brand', label: 'My briefs' }} />
  if (!brief.isOwner) return <EmptyState title="Matches are private" body="Only the brand that wrote a brief can see who matches it." action={{ to: `/briefs/${brief.id}`, label: 'View the brief' }} />

  const b = brief.draft
  const best = rows?.[0]?.score ?? 0
  const weak = rows !== null && best < WEAK

  async function toggleShortlist(row: MatchRow) {
    setBusy(row.id)
    setError(null)
    try {
      const existing = engagements[row.id]
      if (existing?.status === 'shortlisted') await removeFromShortlist(existing.id)
      else if (!existing) await shortlist(brief!.id, row.id, row.score)
      await loadEngagements()
    } catch (err) {
      setError(`Could not update the shortlist: ${(err as Error).message}`)
    }
    setBusy(null)
  }

  async function openComposer(row: MatchRow) {
    setComposer({ creatorId: row.id, text: '', price: b.budget_max ? String(b.budget_max) : '', drafting: true })
    const res = await authedPost<{ text?: string; source?: string; error?: string }>('/api/ai/invite-message', { briefId: brief!.id, creatorId: row.id })
    setComposer((c) =>
      c?.creatorId !== row.id ? c
      : res.json?.text ? { ...c, text: res.json.text, drafting: false, note: res.json.source === 'ai' ? 'Drafted by AI. Edit anything before sending.' : 'A standard draft (the AI was not available). Edit anything before sending.' }
      : { ...c, drafting: false, note: res.json?.error ?? 'The draft could not be written. Write your own message below.' })
  }

  async function sendInvite(row: MatchRow) {
    if (!composer || composer.text.trim().length < 20) return
    setBusy(row.id)
    setError(null)
    try {
      const engagement = engagements[row.id] ?? (await shortlist(brief!.id, row.id, row.score))
      await invite(engagement, composer.text, Number(composer.price) > 0 ? Math.round(Number(composer.price)) : null)
      setComposer(null)
      await loadEngagements()
    } catch (err) {
      setError(`The invitation was not sent: ${(err as Error).message}`)
    }
    setBusy(null)
  }

  return (
    <PageContainer>
      <Link to={`/briefs/${brief.id}`} className="text-sm font-semibold text-ink-soft hover:text-brand">← Back to the brief</Link>
      <header className="mt-4 border-b border-line pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Matching creators</p>
        <h1 className="display mt-2 text-3xl sm:text-5xl break-words">{b.title}</h1>
        <p className="mt-3 text-sm text-ink-soft">
          {[b.deliverables.map(formatDeliverable).join(' · '), b.required_tools.length ? `needs ${b.required_tools.join(', ')}` : null, b.budget_max ? `up to ₹${b.budget_max.toLocaleString('en-IN')}` : null].filter(Boolean).join('  |  ')}
        </p>
        <p className="mt-2 text-xs text-ink-soft">
          Scores are out of 100: tools 25, format 20, style 25, budget 15, commercial 10, verification 5. <Link to="/trust#matching" className="font-bold underline underline-offset-2 hover:text-brand">How matching works</Link>
        </p>
      </header>

      {!embedded && <div className="mt-4"><Notice>This brief has not been analysed for style yet, so every creator gets half marks for style. Open the brief editor and save it once to fix that.</Notice></div>}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {/* Filters */}
      <Card className="mt-5 !p-4 sm:!p-5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_auto_auto] gap-x-8 gap-y-3 items-center">
          <label className="block">
            <span className="flex items-baseline justify-between text-xs font-bold uppercase tracking-wider">
              Minimum score <output className="text-sm tabular-nums normal-case tracking-normal">{minScore === 0 ? 'Any' : `${minScore}+`}</output>
            </span>
            <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="mt-2 w-full accent-brand" aria-label="Minimum match score" />
          </label>
          <div className="md:w-44"><Switch checked={verifiedOnly} onChange={setVerifiedOnly} label="Verified only" /></div>
          <div className="md:w-44"><Switch checked={withinBudget} onChange={setWithinBudget} label="Within budget" /></div>
        </div>
      </Card>

      {rows === null ? (
        <Spinner label="Scoring creators…" />
      ) : (
        <>
          <p className="mt-6 display text-lg" aria-live="polite">
            {shown.length} of {rows.length} creators{minScore || verifiedOnly || withinBudget ? ' after filters' : ''}
            {reasonSource === 'rules' && <span className="ml-2 font-sans text-xs font-semibold normal-case tracking-normal text-ink-soft">reasons written from the score breakdown (AI unavailable)</span>}
          </p>

          {weak && (
            <Card tone="ink" className="mt-4 !p-6">
              <div className="dots h-8 w-8" aria-hidden />
              <h2 className="display mt-3 text-xl sm:text-2xl">No strong matches yet</h2>
              <p className="mt-1 text-cream/80">The best score is {best}, below {WEAK}. Nobody fits this brief well as it stands. Things that would help:</p>
              <ul className="mt-3 space-y-2">
                {weakMatchAdvice(rows, { required_tools: b.required_tools, budget_max: b.budget_max }).map((a) => (
                  <li key={a} className="flex gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />{a}</li>
                ))}
              </ul>
              <div className="mt-5"><Button size="sm" variant="light" to={`/briefs/${brief.id}/edit`}>Edit the brief</Button></div>
            </Card>
          )}

          {shown.length === 0 ? (
            <div className="py-14 text-center">
              <div className="dots mx-auto h-10 w-10" aria-hidden />
              <p className="display mt-5 text-xl">No creators pass these filters</p>
              <p className="mt-2 text-sm text-ink-soft">The best score is {best}. Lower the minimum score or switch a filter off.</p>
              <div className="mt-5"><Button variant="dark" onClick={() => { setMinScore(0); setVerifiedOnly(false); setWithinBudget(false) }}>Show all {rows.length}</Button></div>
            </div>
          ) : (
            <ol className="mt-5 space-y-4">
              {shown.map((row, index) => {
                const engagement = engagements[row.id]
                const tools = [...row.tools.filter((t) => b.required_tools.includes(t)), ...row.tools.filter((t) => !b.required_tools.includes(t))]
                const composing = composer?.creatorId === row.id
                return (
                  <li key={row.id}>
                    <Card padded={false} className="overflow-hidden">
                      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem] gap-0">
                        <div className="p-5">
                          <div className="flex items-start gap-4">
                            <ScoreBadge score={row.score} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-xs font-bold text-ink-soft">#{rows.indexOf(row) + 1}</span>
                                <Link to={`/creators/${row.id}?brief=${brief.id}`} className="flex items-center gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
                                  <Avatar src={row.avatar_url} name={row.name} />
                                  <span>
                                    <span className="display block text-lg leading-tight hover:text-brand">{row.name}</span>
                                    <span className="block text-sm text-ink-soft">{[row.city, formatPriceRange(row.price_min, row.price_max)].filter(Boolean).join(' · ')}</span>
                                  </span>
                                </Link>
                                {engagement && <Badge tone={engagement.status === 'shortlisted' ? 'muted' : 'blue'}>{STATUS_LABELS[engagement.status]}</Badge>}
                              </div>
                              <p className="mt-3 rounded-btn bg-ink/[0.05] p-3 text-sm">
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-brand">Why this match</span>
                                {reasons[row.id] ?? (index < 10 && reasonSource === null ? <span className="text-ink-soft">{reasonFromBreakdown(row)}</span> : reasonFromBreakdown(row))}
                              </p>
                              <div className="mt-3"><ToolChips tools={tools.slice(0, 6)} verified={new Set(row.verified_tool_labels)} tone="white" /></div>
                              <div className="mt-2"><VerificationBadges verifications={verificationsOf(row)} size="compact" /></div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_11rem] gap-4 border-t border-line pt-4">
                            <ScoreBreakdown breakdown={row.breakdown} details={row.details} />
                            {row.best_item && (
                              <Link to={`/portfolio/${row.best_item.id}`} className="group block">
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-soft">Closest piece</span>
                                <Media src={row.best_item.thumbnail_url ?? undefined} alt={row.best_item.title} loading="lazy" className="mt-1 h-24 w-full rounded-lg object-cover" />
                                <span className="mt-1 block truncate text-xs font-semibold group-hover:text-brand">{row.best_item.title}</span>
                              </Link>
                            )}
                          </div>
                        </div>

                        {/* actions */}
                        <div className="flex flex-col justify-center gap-2 bg-ink p-5 text-cream">
                          {engagement && engagement.status !== 'shortlisted' ? (
                            <>
                              <p className="text-sm">{STATUS_LABELS[engagement.status]}{engagement.agreed_price ? ` · ₹${engagement.agreed_price.toLocaleString('en-IN')}` : ''}</p>
                              <Button variant="primary" full to={`/engagements/${engagement.id}`} icon={<ArrowIcon />}>Open engagement</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="primary" full onClick={() => (composing ? setComposer(null) : openComposer(row))} disabled={busy === row.id}>{composing ? 'Close' : 'Invite'}</Button>
                              <Button variant="light" full onClick={() => toggleShortlist(row)} disabled={busy === row.id}>{engagement ? '✓ Shortlisted (remove)' : 'Shortlist'}</Button>
                            </>
                          )}
                          <Link to={`/creators/${row.id}?brief=${brief.id}`} className="text-center text-xs font-bold underline underline-offset-4 hover:text-brand">View profile and fit</Link>
                        </div>
                      </div>

                      {composing && (
                        <div className="border-t border-line bg-white p-5">
                          <h3 className="display text-base">Invite {row.name.split(' ')[0]}</h3>
                          {composer.drafting ? (
                            <p className="mt-3 text-sm text-ink-soft" role="status">Drafting a message…</p>
                          ) : (
                            <>
                              {composer.note && <p className="mt-1 text-xs text-ink-soft">{composer.note}</p>}
                              <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_12rem] gap-4">
                                <Textarea label="Message" rows={7} value={composer.text} onChange={(e) => setComposer({ ...composer, text: e.target.value })} maxLength={1500} />
                                <Input label="Offered price (INR)" type="number" inputMode="numeric" min={0} step={1000} value={composer.price} onChange={(e) => setComposer({ ...composer, price: e.target.value })} hint="Optional. For all deliverables." />
                              </div>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button onClick={() => sendInvite(row)} disabled={busy === row.id || composer.text.trim().length < 20} icon={<ArrowIcon />}>{busy === row.id ? 'Sending…' : 'Send invitation'}</Button>
                                <Button variant="outline" onClick={() => setComposer(null)}>Cancel</Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}
    </PageContainer>
  )
}
