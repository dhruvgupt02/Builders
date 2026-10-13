import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { deleteBrief, duplicateBrief, loadMyBriefs, type LoadedBrief } from '../lib/briefs-db'
import { loadMyEngagements, type Engagement } from '../lib/engagements'
import EngagementList from '../components/engagement/EngagementList'
import { BRIEF_STATUSES, BRIEF_STATUS_LABELS, type BriefStatus } from '../lib/taxonomy'
import BriefCard from '../components/brief/BriefCard'
import { Button, EmptyState, Notice, PageContainer, PageHeader, Spinner, Tabs } from '../components/ui'

export default function BrandDashboard() {
  const navigate = useNavigate()
  const { session, userId, role, loading } = useAuth()
  const [briefs, setBriefs] = useState<LoadedBrief[] | null>(null)
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [tab, setTab] = useState<'all' | BriefStatus>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(() => {
    if (!userId) return
    loadMyBriefs(userId).then(setBriefs)
    loadMyEngagements().then(setEngagements)
  }, [userId])
  useEffect(load, [load])

  if (loading) return <Spinner />
  if (!session) return <EmptyState title="Log in to see your briefs" action={{ to: '/login', label: 'Log in' }} />
  if (role !== 'brand') return <EmptyState title="Brands only" body="This page lists the briefs written by a brand account. Creators can browse open briefs." action={{ to: '/briefs', label: 'Open briefs' }} />
  if (briefs === null) return <Spinner label="Loading your briefs…" />

  async function duplicate(brief: LoadedBrief) {
    setBusy(brief.id)
    try {
      navigate(`/briefs/${await duplicateBrief(brief, userId!)}/edit`)
    } catch (err) {
      setNotice({ tone: 'error', text: `Could not duplicate: ${(err as Error).message}` })
      setBusy(null)
    }
  }

  async function remove(brief: LoadedBrief) {
    setConfirmDelete(null)
    setBusy(brief.id)
    const ok = await deleteBrief(brief.id)
    setBusy(null)
    setNotice(ok ? { tone: 'success', text: `"${brief.draft.title}" was deleted.` } : { tone: 'error', text: `"${brief.draft.title}" could not be deleted.` })
    if (ok) load()
  }

  const count = (s: BriefStatus) => briefs.filter((b) => b.draft.status === s).length
  const tabs = [{ id: 'all' as const, label: 'All', count: briefs.length }, ...BRIEF_STATUSES.map((s) => ({ id: s, label: BRIEF_STATUS_LABELS[s], count: count(s) }))]
  const shown = tab === 'all' ? briefs : briefs.filter((b) => b.draft.status === tab)

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Brand dashboard"
        title="My briefs"
        subtitle="Write a brief, publish it for creators, and find people who can deliver it."
        actions={<Button to="/briefs/new" icon={<span className="text-lg leading-none">+</span>}>Create brief</Button>}
      />

      {notice && <div className="mt-5"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      {briefs.length === 0 ? (
        <EmptyState title="No briefs yet" body="Start from a rough idea and let AI draft the brief, or fill it in yourself." action={{ to: '/briefs/new', label: 'Create your first brief' }} />
      ) : (
        <>
          <div className="mt-6"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>
          {shown.length === 0 ? (
            <p className="mt-8 text-sm text-ink-soft">No {BRIEF_STATUS_LABELS[tab as BriefStatus].toLowerCase()} briefs.</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {shown.map((brief) => (
                <BriefCard
                  key={brief.id}
                  brief={brief}
                  manage
                  footer={
                    confirmDelete === brief.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold">Delete this brief for good?</span>
                        <Button size="sm" onClick={() => remove(brief)}>Yes, delete</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>Keep</Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" to={`/briefs/${brief.id}/matches`}>Matches</Button>
                        <Button size="sm" variant="dark" to={`/briefs/${brief.id}/edit`}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => duplicate(brief)} disabled={busy !== null}>{busy === brief.id ? 'Working…' : 'Duplicate'}</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(brief.id)} disabled={busy !== null}>Delete</Button>
                      </div>
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {engagements.length > 0 && (
        <section className="mt-12">
          <h2 className="display text-2xl sm:text-3xl">Shortlists and projects</h2>
          <p className="mt-1 text-sm text-ink-soft">Creators you have shortlisted or invited, and work in progress.</p>
          <div className="mt-4"><EngagementList engagements={engagements} role="brand" /></div>
        </section>
      )}
    </PageContainer>
  )
}
