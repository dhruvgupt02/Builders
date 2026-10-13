import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MAX_EVIDENCE_MB, uploadFile, validateFile } from '../lib/storage'
import { useCreatorGate } from '../lib/useCreatorGate'
import type { Creator, PortfolioItem, Verification, VerificationType } from '../lib/types'
import { summarizeVerifications, VERIFICATION_INFO } from '../lib/verification'
import { formatPriceRange } from '../lib/format'
import PortfolioCard from '../components/PortfolioCard'
import ToolChips from '../components/ToolChips'
import VerificationBadges from '../components/VerificationBadges'
import { ArrowIcon, Avatar, Badge, Button, Card, Field, FileDrop, Notice, PageContainer, Select, Spinner } from '../components/ui'

const TYPE_OPTIONS = (Object.keys(VERIFICATION_INFO) as VerificationType[]).map((value) => ({ value, label: VERIFICATION_INFO[value].label }))
const STATUS_TONE = { pending: 'muted', verified: 'blue', rejected: 'orange' } as const
const MIGRATION_HINT = 'Deleting is not switched on for this database yet (run supabase/migrations/003_creator_delete.sql).'

export default function CreatorDashboard() {
  const { gate, userId, creatorId } = useCreatorGate()
  const [creator, setCreator] = useState<Creator | null>(null)
  const [items, setItems] = useState<PortfolioItem[] | null>(null)
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  // Verification request form
  const [vType, setVType] = useState<VerificationType>('tool')
  const [vTarget, setVTarget] = useState('')
  const [vFile, setVFile] = useState<File | null>(null)
  const [vError, setVError] = useState<string | null>(null)
  const [vBusy, setVBusy] = useState(false)

  const load = useCallback(async () => {
    if (!creatorId) return
    const [c, p, v] = await Promise.all([
      supabase.from('creators').select('*').eq('id', creatorId).maybeSingle(),
      supabase.from('portfolio_items').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }),
      supabase.from('verifications').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }),
    ])
    setCreator(c.data as Creator | null)
    setItems((p.data as PortfolioItem[]) ?? [])
    setVerifications((v.data as Verification[]) ?? [])
  }, [creatorId])

  useEffect(() => {
    load()
  }, [load])

  if (gate) return gate
  if (!creator || items === null) return <Spinner label="Loading your dashboard…" />

  const summary = summarizeVerifications(verifications)

  async function deleteItem(item: PortfolioItem) {
    setConfirmDelete(null)
    const { data, error } = await supabase.from('portfolio_items').delete().eq('id', item.id).select('id')
    if (error) return setNotice({ tone: 'error', text: `"${item.title}" could not be deleted: ${error.message}` })
    if (!data?.length) return setNotice({ tone: 'error', text: `"${item.title}" was not deleted. ${MIGRATION_HINT}` })
    setNotice({ tone: 'success', text: `"${item.title}" was deleted.` })
    load()
  }

  async function withdraw(v: Verification) {
    const { data, error } = await supabase.from('verifications').delete().eq('id', v.id).select('id')
    if (error || !data?.length) return setNotice({ tone: 'error', text: `The request was not withdrawn. ${error?.message ?? MIGRATION_HINT}` })
    setNotice({ tone: 'success', text: 'Verification request withdrawn.' })
    load()
  }

  async function requestVerification(ev: FormEvent) {
    ev.preventDefault()
    setVError(null)
    if (!vTarget) return setVError(vType === 'tool' ? 'Choose the tool you want verified.' : 'Choose the portfolio piece this is about.')
    if (!vFile) return setVError('Attach evidence: a screenshot or PDF that backs up the claim.')
    const item = vType === 'tool' ? null : items!.find((i) => i.id === vTarget)
    const label = item ? item.title : vTarget
    if (verifications.some((v) => v.type === vType && v.status !== 'rejected' && (item ? v.portfolio_item_id === item.id : v.label === label)))
      return setVError('You already have a request or a verification for this.')
    setVBusy(true)
    try {
      const evidenceUrl = await uploadFile('verification-evidence', vFile, userId!)
      const { error } = await supabase.from('verifications').insert({
        creator_id: creatorId, portfolio_item_id: item?.id ?? null, type: vType, label, evidence_url: evidenceUrl, status: 'pending',
      })
      if (error) throw new Error(error.message)
      setVFile(null)
      setVTarget('')
      setNotice({ tone: 'success', text: 'Verification requested. It will show as pending until it is reviewed.' })
      load()
    } catch (err) {
      setVError(`The request could not be sent: ${(err as Error).message}`)
    }
    setVBusy(false)
  }

  function onEvidence(file: File) {
    const problem = validateFile(file, ['image', 'pdf'], MAX_EVIDENCE_MB)
    setVError(problem)
    if (!problem) setVFile(file)
  }

  const targetOptions = vType === 'tool' ? creator.tools : items.map((i) => ({ value: i.id, label: i.title }))

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

      {/* Verification */}
      <section className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3">
          <h2 className="display text-2xl sm:text-3xl">Verification</h2>
          <p className="mt-1 text-sm text-ink-soft">{summary.text}</p>
          <div className="mt-4"><ToolChips tools={creator.tools} verified={summary.verifiedTools} tone="white" /></div>

          {verifications.length === 0 ? (
            <p className="mt-6 text-sm text-ink-soft">No verification requests yet. Verified creators stand out to brands.</p>
          ) : (
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {verifications.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{VERIFICATION_INFO[v.type].short}</p>
                    <p className="font-semibold break-words">{v.label ?? 'Untitled'}</p>
                    {v.reason && <p className="mt-0.5 text-sm text-ink-soft">{v.reason}</p>}
                  </div>
                  {v.evidence_url && <a href={v.evidence_url} target="_blank" rel="noreferrer" className="text-xs font-bold underline underline-offset-4 hover:text-brand">Evidence</a>}
                  <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge>
                  {v.status === 'pending' && (
                    <button onClick={() => withdraw(v)} className="text-xs font-bold text-ink-soft underline underline-offset-4 hover:text-brand">Withdraw</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card ticket notchY="4.75rem" className="lg:col-span-2">
          <h3 className="display text-lg">Request verification</h3>
          <p className="mt-1 text-sm text-ink-soft">Send evidence and get a badge.</p>
          <form onSubmit={requestVerification} noValidate className="mt-6 space-y-4 border-t border-dashed border-ink/25 pt-5">
            <Select
              label="What to verify" options={TYPE_OPTIONS} value={vType}
              onChange={(e) => { setVType(e.target.value as VerificationType); setVTarget(''); setVError(null) }}
              hint={VERIFICATION_INFO[vType].explain}
            />
            {vType !== 'tool' && items.length === 0 ? (
              <Notice>Add a portfolio piece first. <Link to="/portfolio/new" className="underline font-bold">Add one now</Link></Notice>
            ) : (
              <Select
                label={vType === 'tool' ? 'Tool' : 'Portfolio piece'} options={targetOptions} placeholder="Choose…"
                value={vTarget} onChange={(e) => setVTarget(e.target.value)}
              />
            )}
            <Field as="div" label="Evidence" hint={`Screenshot or PDF, up to ${MAX_EVIDENCE_MB} MB. For a tool: your account or project view.`}>
              <FileDrop
                compact accept="image/*,application/pdf" onFile={onEvidence} title="Attach a file" hint={vFile ? `${vFile.name} · ${(vFile.size / 1024 / 1024).toFixed(1)} MB` : 'PNG, JPG or PDF'}
                preview={vFile && <p className="text-center text-sm font-semibold">✓ File attached</p>}
              />
            </Field>
            {vError && <Notice tone="error">{vError}</Notice>}
            <Button type="submit" variant="dark" full disabled={vBusy}>{vBusy ? 'Sending…' : 'Request verification'}</Button>
          </form>
        </Card>
      </section>
    </PageContainer>
  )
}
