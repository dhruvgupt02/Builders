import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'
import { loadBrief, type LoadedBrief } from '../lib/briefs-db'
import {
  loadEngagement, moveTo, postMessage, reviewSubmission, STATUS_LABELS, submitVersion, TIMELINE,
  type Engagement, type EngagementMessage, type EngagementStatus, type Submission,
} from '../lib/engagements'
import { formatDeliverable, rightsSentence, type DeliverableDraft } from '../lib/brief'
import { uploadFile, validateFile } from '../lib/storage'
import { formatINR } from '../lib/format'
import { AspectShape } from '../components/brief/AspectShape'
import { EngagementStatusBadge, nextStep } from '../components/engagement/EngagementList'
import Lightbox from '../components/Lightbox'
import { Avatar, Badge, Button, Card, EmptyState, Notice, PageContainer, Spinner, Textarea } from '../components/ui'

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function EngagementPage() {
  const { id } = useParams()
  const { session, userId, loading: authLoading } = useAuth()
  const [data, setData] = useState<{ engagement: Engagement; messages: EngagementMessage[]; submissions: Submission[] } | null | undefined>(undefined)
  const [brief, setBrief] = useState<LoadedBrief | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null)
  // creator upload form, per deliverable
  const [upload, setUpload] = useState<Record<string, { file: File | null; notes: string }>>({})
  // brand review form, per submission
  const [review, setReview] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!id) return
    const loaded = await loadEngagement(id)
    setData(loaded)
    if (loaded) setBrief(await loadBrief(loaded.engagement.brief_id, userId))
  }, [id, userId])

  useEffect(() => {
    if (!authLoading && session) void load()
  }, [authLoading, session, load])

  if (authLoading) return <Spinner />
  if (!session) return <EmptyState title="Log in to see this project" action={{ to: '/login', label: 'Log in' }} />
  if (data === undefined) return <Spinner label="Loading project…" />
  if (data === null) return <EmptyState title="Project not found" body="Only the brand and the invited creator can open a project." action={{ to: '/', label: 'Go home' }} />

  const { engagement: e, messages, submissions } = data
  const role: 'brand' | 'creator' = e.creators?.profile_id === userId ? 'creator' : 'brand'
  const b = brief?.draft
  const deliverables: (DeliverableDraft | null)[] = b?.deliverables.length ? b.deliverables : [null]
  const limit = e.briefs?.revision_rounds ?? b?.revision_rounds ?? 0
  const canUpload = role === 'creator' && ['accepted', 'in_progress', 'revision_requested'].includes(e.status)
  const canReview = role === 'brand' && e.status === 'delivered'
  const ended = e.status === 'declined' || e.status === 'cancelled'
  const todo = nextStep(e.status, role)
  const versionsOf = (deliverableId: string | null) => submissions.filter((s) => s.deliverable_id === deliverableId).sort((x, y) => x.version - y.version)
  const latestEach = deliverables.map((d) => versionsOf(d?.key ?? null).at(-1))
  const allApproved = latestEach.length > 0 && latestEach.every((s) => s?.status === 'approved')

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(null)
  }

  async function send(deliverableId: string | null) {
    const key = deliverableId ?? 'none'
    const form = upload[key]
    if (!form?.file) return setError('Choose the file for this version first.')
    const problem = validateFile(form.file, ['image', 'video'])
    if (problem) return setError(problem)
    await act(`upload:${key}`, async () => {
      const url = await uploadFile('portfolio-media', form.file!, userId!)
      await submitVersion(e.id, deliverableId, url, form.file!.type.startsWith('video/') ? 'video' : 'image', form.notes)
      if (e.status === 'accepted') await moveTo(e.id, 'in_progress', 'creator', 'Work has started: the first version was uploaded.')
      setUpload((u) => ({ ...u, [key]: { file: null, notes: '' } }))
    })
  }

  return (
    <PageContainer>
      <Link to={role === 'brand' ? `/briefs/${e.brief_id}/matches` : '/dashboard/creator'} className="text-sm font-semibold text-ink-soft hover:text-brand">← {role === 'brand' ? 'Matches for this brief' : 'My dashboard'}</Link>

      {/* Pinned: what the brand may do with the work */}
      {b && (
        <Card tone="ink" className="mt-4 !p-4 sm:!p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Commercial use agreed for this project</p>
          <p className="mt-1.5 text-sm leading-relaxed">{rightsSentence(b)}</p>
        </Card>
      )}

      <header className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-line pb-6">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{e.briefs?.brand_name ?? 'Brand'} × {e.creators?.name}</p>
          <h1 className="display mt-2 text-3xl sm:text-4xl break-words">{e.briefs?.title ?? 'Project'}</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {[e.agreed_price ? `Offered ${formatINR(e.agreed_price)}` : null, e.briefs?.deadline ? `due ${new Date(`${e.briefs.deadline}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : null, `${limit} revision ${limit === 1 ? 'round' : 'rounds'} included`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EngagementStatusBadge status={e.status} />
          <Button size="sm" variant="outline" to={`/briefs/${e.brief_id}`}>Read the brief</Button>
          {role === 'brand' && e.creators && <Button size="sm" variant="outline" to={`/creators/${e.creators.id}?brief=${e.brief_id}`}>Creator profile</Button>}
        </div>
      </header>

      {/* Status timeline */}
      <ol className="mt-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Project status">
        {TIMELINE.map((s, i) => {
          const current = e.status === 'revision_requested' ? 'in_progress' : e.status
          const at = TIMELINE.indexOf(current as EngagementStatus)
          const state = ended ? 'off' : i < at ? 'done' : i === at ? 'now' : 'todo'
          return (
            <li key={s} className="flex-1 min-w-[6.5rem]" aria-current={state === 'now' ? 'step' : undefined}>
              <span className={`block h-1.5 rounded-full ${state === 'now' ? 'bg-brand' : state === 'done' ? 'bg-ink' : 'bg-ink/15'}`} />
              <span className={`mt-1.5 block text-xs font-bold uppercase tracking-wider ${state === 'now' ? 'text-ink' : 'text-ink-soft'}`}>{state === 'done' ? '✓ ' : ''}{STATUS_LABELS[s]}</span>
            </li>
          )
        })}
      </ol>
      {e.status === 'revision_requested' && <p className="mt-2 text-sm font-semibold text-brand-dark">A revision was requested. The creator is working on a new version.</p>}
      {ended && <p className="mt-2 text-sm font-semibold">This project ended: {STATUS_LABELS[e.status].toLowerCase()}.</p>}

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {/* What to do now */}
      {(todo || (role === 'brand' && allApproved && e.status === 'delivered')) && (
        <Card className="mt-5 !p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Your move</p>
          {role === 'creator' && e.status === 'invited' && (
            <>
              <p className="mt-1 font-semibold">{e.briefs?.brand_name} invited you to this project{e.agreed_price ? ` for ${formatINR(e.agreed_price)}` : ''}. Read the brief and the commercial-use terms above, then reply.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => act('accept', () => moveTo(e.id, 'accepted', 'creator', 'The creator accepted the invitation.'))} disabled={busy !== null}>{busy === 'accept' ? 'Accepting…' : 'Accept invitation'}</Button>
                <Button variant="outline" onClick={() => act('decline', () => moveTo(e.id, 'declined', 'creator', 'The creator declined the invitation.'))} disabled={busy !== null}>Decline</Button>
              </div>
            </>
          )}
          {role === 'creator' && canUpload && (
            <>
              <p className="mt-1 font-semibold">{e.status === 'revision_requested' ? 'Upload a revised version for each deliverable the brand commented on, then mark it delivered.' : 'Upload a version for each deliverable below, then mark the project delivered.'}</p>
              <div className="mt-4">
                <Button onClick={() => act('deliver', () => moveTo(e.id, 'delivered', 'creator', 'The creator marked the work as delivered.'))} disabled={busy !== null || submissions.length === 0}>{busy === 'deliver' ? 'Sending…' : 'Mark as delivered'}</Button>
                {submissions.length === 0 && <span className="ml-3 text-xs text-ink-soft">Upload at least one version first.</span>}
              </div>
            </>
          )}
          {role === 'brand' && e.status === 'shortlisted' && (
            <>
              <p className="mt-1 font-semibold">This creator is on your shortlist. They cannot see that until you invite them.</p>
              <div className="mt-4"><Button to={`/briefs/${e.brief_id}/matches`}>Invite from the matches page</Button></div>
            </>
          )}
          {role === 'brand' && e.status === 'delivered' && (
            <>
              <p className="mt-1 font-semibold">{allApproved ? 'Every deliverable is approved. Approve the delivery to finish the project.' : 'Review the latest version of each deliverable below: approve it, or ask for a revision.'}</p>
              {allApproved && <div className="mt-4"><Button onClick={() => act('approve-all', () => moveTo(e.id, 'approved', 'brand', 'The brand approved the delivery. The project is complete.'))} disabled={busy !== null}>{busy === 'approve-all' ? 'Approving…' : 'Approve delivery'}</Button></div>}
            </>
          )}
        </Card>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
        {/* Deliverables and versions */}
        <section className="min-w-0 space-y-5">
          <h2 className="display text-xl sm:text-2xl">Deliverables</h2>
          {deliverables.map((d, index) => {
            const deliverableId = d?.key ?? null
            const key = deliverableId ?? 'none'
            const versions = versionsOf(deliverableId)
            const latest = versions.at(-1)
            const used = versions.filter((v) => v.status === 'revision_requested').length
            const form = upload[key] ?? { file: null, notes: '' }
            return (
              <Card key={key} className="!p-4 sm:!p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 font-bold">
                    <span className="display flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-cream text-xs">{index + 1}</span>
                    {d?.aspect_ratio && <AspectShape ratio={d.aspect_ratio} size={22} />}
                    {d ? formatDeliverable(d) : 'Delivery'}
                  </h3>
                  <span className="text-xs font-semibold text-ink-soft">{versions.length} {versions.length === 1 ? 'version' : 'versions'} · {used} of {limit} revisions used</span>
                </div>
                {d?.notes && <p className="mt-1 text-sm text-ink-soft">{d.notes}</p>}

                {versions.length === 0 ? (
                  <p className="mt-4 rounded-btn border-[1.5px] border-dashed border-line p-4 text-sm text-ink-soft">No version uploaded yet.</p>
                ) : (
                  // all versions side by side, oldest first
                  <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                    {versions.map((v) => (
                      <figure key={v.id} className={`w-56 shrink-0 rounded-xl bg-white p-2 ring-1 ${v === latest ? 'ring-ink' : 'ring-line'}`}>
                        <div className="flex h-36 items-center justify-center overflow-hidden rounded-lg bg-ink">
                          {v.media_type === 'video' ? (
                            <video src={v.media_url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
                          ) : (
                            <button type="button" className="h-full w-full cursor-zoom-in" onClick={() => setZoom({ src: v.media_url, alt: `Version ${v.version}` })} aria-label={`Zoom version ${v.version}`}>
                              <img src={v.media_url} alt={`Version ${v.version}`} className="h-full w-full object-contain" loading="lazy" />
                            </button>
                          )}
                        </div>
                        <figcaption className="px-1 pt-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="display text-sm">v{v.version}</span>
                            <Badge tone={v.status === 'approved' ? 'blue' : v.status === 'revision_requested' ? 'orange' : 'muted'}>{v.status === 'submitted' ? 'awaiting review' : v.status.replace('_', ' ')}</Badge>
                          </div>
                          <p className="mt-1 text-[11px] text-ink-soft">{when(v.created_at)}</p>
                          {v.notes && <p className="mt-1 text-xs">{v.notes}</p>}
                          {v.review_comment && <p className="mt-1.5 rounded bg-brand/10 p-1.5 text-xs"><span className="font-bold">Brand: </span>{v.review_comment}</p>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}

                {/* brand: review the latest version */}
                {canReview && latest?.status === 'submitted' && (
                  <div className="mt-4 border-t border-line pt-4">
                    <Textarea label={`Review v${latest.version}`} rows={2} value={review[latest.id] ?? ''} onChange={(ev) => setReview((r) => ({ ...r, [latest.id]: ev.target.value }))} placeholder="What should change? Required for a revision, optional when approving." maxLength={600} />
                    {used >= limit ? (
                      <div className="mt-2"><Notice tone="error">All {limit} included revision {limit === 1 ? 'round has' : 'rounds have'} been used for this deliverable. Approve this version, or agree extra revisions with the creator by message.</Notice></div>
                    ) : used === limit - 1 ? (
                      <div className="mt-2"><Notice>This would be the last revision included in the brief ({limit} {limit === 1 ? 'round' : 'rounds'}). Put everything you need changed in one comment.</Notice></div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => act(`approve:${latest.id}`, () => reviewSubmission(latest, 'approved', review[latest.id] ?? ''))} disabled={busy !== null}>Approve v{latest.version}</Button>
                      <Button
                        size="sm" variant="outline" disabled={busy !== null || used >= limit || (review[latest.id] ?? '').trim().length < 5}
                        onClick={() => act(`revise:${latest.id}`, async () => {
                          await reviewSubmission(latest, 'revision_requested', review[latest.id] ?? '')
                          await moveTo(e.id, 'revision_requested', 'brand', `The brand asked for a revision (${used + 1} of ${limit} used).`)
                        })}
                      >
                        Request revision
                      </Button>
                      {(review[latest.id] ?? '').trim().length < 5 && used < limit && <span className="self-center text-xs text-ink-soft">Write a comment to request a revision.</span>}
                    </div>
                  </div>
                )}

                {/* creator: upload the next version */}
                {canUpload && (
                  <div className="mt-4 border-t border-line pt-4">
                    <p className="text-xs font-bold uppercase tracking-wider">Upload v{(latest?.version ?? 0) + 1}</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] gap-2 items-center">
                      <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-btn bg-ink/[0.07] px-4 text-xs font-bold hover:bg-ink/15">
                        {form.file ? form.file.name.slice(0, 22) : 'Choose image or video'}
                        <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" className="sr-only" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) setUpload((u) => ({ ...u, [key]: { ...form, file: f } })); ev.target.value = '' }} />
                      </label>
                      <input value={form.notes} onChange={(ev) => setUpload((u) => ({ ...u, [key]: { ...form, notes: ev.target.value } }))} placeholder="Note for the brand (optional)" maxLength={300} aria-label="Note for the brand"
                        className="h-11 min-w-0 rounded-btn bg-white px-3.5 text-sm ring-[1.5px] ring-inset ring-ink/25 placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-brand" />
                      <Button size="md" variant="dark" onClick={() => send(deliverableId)} disabled={busy !== null || !form.file}>{busy === `upload:${key}` ? 'Uploading…' : 'Upload'}</Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </section>

        {/* Timeline and messages */}
        <aside className="lg:sticky lg:top-6">
          <Card className="!p-5">
            <h2 className="display text-base">Timeline and messages</h2>
            <ol className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              <li className="text-xs text-ink-soft">{when(e.created_at)} · Project created</li>
              {messages.map((m) => (
                <li key={m.id} className={m.kind === 'status' ? 'text-xs text-ink-soft' : ''}>
                  {m.kind === 'status' ? (
                    <>{when(m.created_at)} · {m.body}</>
                  ) : (
                    <div className={`rounded-xl p-3 text-sm ${m.sender_role === role ? 'bg-ink text-cream' : 'bg-white ring-1 ring-line'}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${m.sender_role === role ? 'text-brand' : 'text-ink-soft'}`}>
                        {m.sender_role === 'brand' ? e.briefs?.brand_name ?? 'Brand' : e.creators?.name ?? 'Creator'}{m.kind === 'invite' ? ' · invitation' : m.kind === 'revision' ? ' · revision request' : ''} · {when(m.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-line break-words">{m.body}</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {e.status !== 'shortlisted' && (
              <form className="mt-4 border-t border-line pt-4" onSubmit={(ev) => { ev.preventDefault(); if (message.trim()) void act('message', async () => { await postMessage(e.id, role, message); setMessage('') }) }}>
                <Textarea rows={2} value={message} onChange={(ev) => setMessage(ev.target.value)} placeholder={`Message ${role === 'brand' ? e.creators?.name?.split(' ')[0] ?? 'the creator' : e.briefs?.brand_name ?? 'the brand'}…`} maxLength={1000} aria-label="Message" />
                <div className="mt-2"><Button type="submit" size="sm" variant="dark" disabled={busy !== null || !message.trim()}>{busy === 'message' ? 'Sending…' : 'Send'}</Button></div>
              </form>
            )}
          </Card>

          {e.creators && role === 'brand' && (
            <Link to={`/creators/${e.creators.id}?brief=${e.brief_id}`} className="mt-4 flex items-center gap-3 rounded-card bg-cream p-4 shadow-card hover:text-brand">
              <Avatar src={e.creators.avatar_url} name={e.creators.name} />
              <span className="min-w-0"><span className="block font-bold leading-tight">{e.creators.name}</span><span className="block truncate text-xs text-ink-soft">{e.creators.headline}</span></span>
            </Link>
          )}
          {role === 'brand' && !['approved', 'cancelled', 'declined'].includes(e.status) && (
            <button type="button" disabled={busy !== null} onClick={() => window.confirm('Cancel this project? The creator will see it as cancelled.') && act('cancel', () => moveTo(e.id, 'cancelled', 'brand', 'The brand cancelled the project.'))} className="mt-4 text-xs font-bold text-ink-soft underline underline-offset-4 hover:text-brand">
              Cancel this project
            </button>
          )}
        </aside>
      </div>

      {zoom && <Lightbox src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </PageContainer>
  )
}
