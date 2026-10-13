import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { duplicateBrief, loadBrief, setBriefStatus, type LoadedBrief } from '../lib/briefs-db'
import { deliverableTotal, formatDeliverable, type BriefDraft } from '../lib/brief'
import { searchLink } from '../lib/search'
import { BRIEF_STATUSES, BRIEF_STATUS_LABELS, TOOLS, type BriefStatus } from '../lib/taxonomy'
import BriefSummary from '../components/brief/BriefSummary'
import { formatDate, StatusBadge } from '../components/brief/BriefCard'
import { Button, Card, EmptyState, Notice, PageContainer, Spinner } from '../components/ui'

/** Search filters that describe who could deliver this brief. Scores per creator come in the matching phase. */
function matchingLink(b: BriefDraft) {
  const uniq = (values: string[]) => [...new Set(values.filter(Boolean))]
  return searchLink({
    content_types: uniq(b.deliverables.map((d) => d.content_type)),
    aspect_ratios: uniq(b.deliverables.map((d) => d.aspect_ratio)),
    tools: b.required_tools.filter((t) => (TOOLS as readonly string[]).includes(t)),
    budget_max: b.budget_max,
    commercial_ready: true,
  })
}

export default function BriefView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, userId, loading: authLoading } = useAuth()
  const [brief, setBrief] = useState<LoadedBrief | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    if (!id || authLoading || !session) return
    setBrief(undefined)
    loadBrief(id, userId).then(setBrief)
  }, [id, session, userId, authLoading])

  if (authLoading) return <Spinner />
  if (!session)
    return <EmptyState title="Log in to view this brief" body="Briefs are visible to logged-in BRIVIO members." action={{ to: '/login', label: 'Log in' }} />
  if (brief === undefined) return <Spinner label="Loading brief…" />
  if (brief === null) return <EmptyState title="Brief not found" body="It may be a draft that only its brand can see, or it was removed." action={{ to: '/briefs', label: 'Open briefs' }} />

  const b = brief.draft
  const total = deliverableTotal(b)

  async function changeStatus(status: BriefStatus) {
    setBusy('status')
    const ok = await setBriefStatus(brief!.id, status)
    setBusy(null)
    if (!ok) return setNotice({ tone: 'error', text: 'The status could not be changed.' })
    setBrief({ ...brief!, draft: { ...b, status } })
    setNotice({ tone: 'success', text: status === 'open' ? 'This brief is open: creators can see it on the briefs board.' : status === 'closed' ? 'This brief is closed. It no longer appears on the board.' : 'This brief is a draft again: only you can see it.' })
  }

  async function duplicate() {
    setBusy('duplicate')
    try {
      navigate(`/briefs/${await duplicateBrief(brief!, userId!)}/edit`)
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not duplicate: ${(err as Error).message}` })
      setBusy(null)
    }
  }

  return (
    <PageContainer>
      <Link to={brief.isOwner ? '/dashboard/brand' : '/briefs'} className="text-sm font-semibold text-ink-soft hover:text-brand">← {brief.isOwner ? 'My briefs' : 'Open briefs'}</Link>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <div className="min-w-0">
          <Card tone="ink" className="!p-6 sm:!p-8">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{b.brand_name || 'Brand'}</p>
              <StatusBadge status={b.status} />
            </div>
            <h1 className="display mt-3 text-3xl sm:text-5xl break-words">{b.title}</h1>
            {b.goal && <p className="mt-4 text-lg text-cream/90">{b.goal}</p>}
            <p className="mt-4 text-sm text-cream/60">{b.deliverables.map(formatDeliverable).join('  ·  ')}</p>
          </Card>

          {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

          <Card className="mt-6"><BriefSummary brief={b} /></Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="!p-5">
            <h2 className="display text-base">Find matching creators</h2>
            <p className="mt-1 text-sm text-ink-soft">{brief.isOwner ? 'Every creator scored against this brief out of 100, with the reasons, and buttons to shortlist or invite.' : 'Opens search filtered by this brief: its content types, aspect ratios, required tools and budget.'}</p>
            <div className="mt-4"><Button to={brief.isOwner ? `/briefs/${brief.id}/matches` : matchingLink(b)} full>Find matching creators</Button></div>
          </Card>

          <Card className="!p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Deliverables</dt><dd className="font-semibold">{total}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Deadline</dt><dd className="font-semibold">{formatDate(b.deadline) || 'Not set'}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Posted</dt><dd className="font-semibold">{formatDate(brief.created_at)}</dd></div>
              <div><dt className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Last edited</dt><dd className="font-semibold">{formatDate(brief.updated_at)}</dd></div>
            </dl>
          </Card>

          {brief.isOwner ? (
            <Card tone="ink" className="!p-5">
              <h2 className="display text-base">Manage this brief</h2>
              <p className="mt-1 text-xs text-cream/70">Completeness {brief.completeness}%</p>
              <fieldset className="mt-4" disabled={busy !== null}>
                <legend className="text-xs font-bold uppercase tracking-wider text-cream/70">Status</legend>
                <div className="mt-2 flex gap-1.5">
                  {BRIEF_STATUSES.map((s) => (
                    <button key={s} type="button" aria-pressed={b.status === s} onClick={() => b.status !== s && changeStatus(s)}
                      className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ${b.status === s ? 'bg-brand text-white' : 'bg-cream/15 hover:bg-cream/25'}`}>
                      {BRIEF_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-cream/70">{b.status === 'draft' ? 'Only you can see a draft.' : b.status === 'open' ? 'Visible to creators on the briefs board.' : 'Closed briefs are hidden from the board.'}</p>
              </fieldset>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="light" to={`/briefs/${brief.id}/edit`}>Edit</Button>
                <Button size="sm" variant="light" onClick={duplicate} disabled={busy !== null}>{busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}</Button>
              </div>
            </Card>
          ) : (
            <Card className="!p-5">
              <h2 className="display text-base">Read-only</h2>
              <p className="mt-1 text-sm text-ink-soft">Only {b.brand_name || 'the brand'} can change this brief.</p>
            </Card>
          )}
        </aside>
      </div>
    </PageContainer>
  )
}
