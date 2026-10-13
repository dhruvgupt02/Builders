import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authedPost } from '../lib/api'
import { MAX_EVIDENCE_MB, uploadFile, validateFile } from '../lib/storage'
import type { Creator, PortfolioItem, Verification, VerificationType } from '../lib/types'
import { summarizeVerifications, VERIFICATION_INFO, verificationMethod } from '../lib/verification'
import ToolChips from './ToolChips'
import { Badge, Button, Card, Field, FileDrop, Notice, Select, Tabs } from './ui'

const STATUS_TONE = { pending: 'muted', verified: 'blue', rejected: 'orange' } as const
const TABS = [
  { id: 'tool', label: 'Tool' },
  { id: 'workflow', label: 'Workflow' },
  { id: 'past_work', label: 'Past work' },
] as const

interface ConfirmationLink {
  id: string
  token: string
  portfolio_item_id: string
  client_name: string | null
  expires_at: string
  used_at: string | null
  confirmed_name: string | null
  confirmed_company: string | null
}

interface Props {
  creator: Creator
  items: PortfolioItem[]
  verifications: Verification[]
  userId: string
  /** reload the dashboard after something changed */
  onChange: () => void
}

interface Verdict {
  status: 'verified' | 'needs_review'
  confidence: number
  reason: string
}

/** Where a creator earns the three trust badges. Each has its own kind of proof. */
export default function VerificationCenter({ creator, items, verifications, userId, onChange }: Props) {
  const [tab, setTab] = useState<VerificationType>('tool')
  const [tool, setTool] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [piece, setPiece] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null)
  const [links, setLinks] = useState<ConfirmationLink[]>([])
  const [steps, setSteps] = useState<Record<string, { total: number; withImage: number }>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const summary = summarizeVerifications(verifications)
  const titleOf = (id: string | null | undefined) => items.find((i) => i.id === id)?.title ?? 'a portfolio piece'

  const loadExtras = useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.from('client_confirmations').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false }),
      items.length ? supabase.from('workflow_steps').select('portfolio_item_id, step_media_url').in('portfolio_item_id', items.map((i) => i.id)) : Promise.resolve({ data: [] }),
    ])
    setLinks((l.data ?? []) as ConfirmationLink[])
    const counts: Record<string, { total: number; withImage: number }> = {}
    for (const row of (s.data ?? []) as { portfolio_item_id: string; step_media_url: string | null }[]) {
      counts[row.portfolio_item_id] ??= { total: 0, withImage: 0 }
      counts[row.portfolio_item_id].total++
      if (row.step_media_url) counts[row.portfolio_item_id].withImage++
    }
    setSteps(counts)
  }, [creator.id, items])

  useEffect(() => {
    void loadExtras()
  }, [loadExtras])

  const report = (v: Verdict | null, what: string) =>
    setMessage(
      !v ? { tone: 'info', text: `${what} is saved and waiting for review. The automatic check could not be reached.` }
      : v.status === 'verified' ? { tone: 'success', text: `Verified (${Math.round(v.confidence * 100)}% confidence). ${v.reason}` }
      : { tone: 'info', text: `Not verified automatically. ${v.reason} It stays pending for a manual review.` })

  async function runCheck(verificationId: string, what: string) {
    const res = await authedPost<Verdict & { error?: string }>('/api/ai/verify-evidence', { verificationId })
    report(res.json && res.json.status ? res.json : null, what)
    onChange()
  }

  async function verifyTool() {
    setMessage(null)
    if (!tool) return setMessage({ tone: 'error', text: 'Choose the tool you want verified.' })
    if (!file) return setMessage({ tone: 'error', text: 'Attach a screenshot of your account, plan page or generation history in that tool.' })
    setBusy('tool')
    try {
      const evidenceUrl = await uploadFile('verification-evidence', file, userId)
      const { data, error } = await supabase.from('verifications').insert({ creator_id: creator.id, type: 'tool', label: tool, evidence_url: evidenceUrl, status: 'pending' }).select('id').single()
      if (error) throw new Error(error.message)
      setFile(null)
      setTool('')
      await runCheck(data.id, `Your ${tool} request`)
    } catch (err) {
      setMessage({ tone: 'error', text: `The request could not be sent: ${(err as Error).message}` })
    }
    setBusy(null)
  }

  async function verifyWorkflow() {
    setMessage(null)
    if (!piece) return setMessage({ tone: 'error', text: 'Choose the portfolio piece.' })
    setBusy('workflow')
    try {
      const { data, error } = await supabase.from('verifications').insert({ creator_id: creator.id, portfolio_item_id: piece, type: 'workflow', label: titleOf(piece), status: 'pending' }).select('id').single()
      if (error) throw new Error(error.message)
      setPiece('')
      await runCheck(data.id, 'Your workflow request')
    } catch (err) {
      setMessage({ tone: 'error', text: `The request could not be sent: ${(err as Error).message}` })
    }
    setBusy(null)
  }

  async function createLink() {
    setMessage(null)
    const item = items.find((i) => i.id === piece)
    if (!item) return setMessage({ tone: 'error', text: 'Choose the piece you made for a client.' })
    setBusy('past_work')
    const { error } = await supabase.from('client_confirmations').insert({ creator_id: creator.id, portfolio_item_id: item.id, client_name: item.client_name })
    setBusy(null)
    if (error) return setMessage({ tone: 'error', text: `The link could not be created: ${error.message}` })
    setPiece('')
    setMessage({ tone: 'success', text: 'Link created. Copy it below and send it to your client. It works once and expires in 14 days.' })
    void loadExtras()
  }

  async function copy(link: ConfirmationLink) {
    const url = `${window.location.origin}/confirm/${link.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(link.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  async function withdraw(v: Verification) {
    const { data, error } = await supabase.from('verifications').delete().eq('id', v.id).select('id')
    setMessage(error || !data?.length ? { tone: 'error', text: `The request was not withdrawn. ${error?.message ?? ''}` } : { tone: 'success', text: 'Request withdrawn.' })
    onChange()
  }

  function onEvidence(f: File) {
    const problem = validateFile(f, ['image'], MAX_EVIDENCE_MB)
    setMessage(problem ? { tone: 'error', text: problem } : null)
    if (!problem) setFile(f)
  }

  const taken = (t: string) => verifications.some((v) => v.type === 'tool' && v.label === t && v.status !== 'rejected')
  const toolOptions = creator.tools.filter((t) => !taken(t))
  const clientPieces = items.filter((i) => i.client_name)
  const chosen = steps[piece]
  const documented = (id: string) => (steps[id]?.total ?? 0) >= 3 && steps[id].withImage === steps[id].total
  const linkState = (l: ConfirmationLink) => (l.used_at ? 'used' : Date.parse(l.expires_at) <= Date.now() ? 'expired' : 'waiting')

  return (
    <section className="mt-12 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <div className="lg:col-span-3">
        <h2 className="display text-2xl sm:text-3xl">Verification</h2>
        <p className="mt-1 text-sm text-ink-soft">{summary.text.charAt(0).toUpperCase() + summary.text.slice(1)}. <Link to="/trust" className="font-bold underline underline-offset-2 hover:text-brand">What the badges mean</Link></p>
        <div className="mt-4"><ToolChips tools={creator.tools} verified={summary.verifiedTools} tone="white" /></div>

        {verifications.length === 0 ? (
          <p className="mt-6 text-sm text-ink-soft">No verification requests yet. Verified creators rank higher in brief matches.</p>
        ) : (
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {verifications.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                    {VERIFICATION_INFO[v.type].short}
                    {v.status === 'verified' && verificationMethod(v.type, v.verified_by) && <span className="normal-case tracking-normal font-semibold"> · {verificationMethod(v.type, v.verified_by)}</span>}
                  </p>
                  <p className="font-semibold break-words">{v.label ?? 'Untitled'}</p>
                  {v.reason && <p className="mt-0.5 text-sm text-ink-soft">{v.reason}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {v.evidence_url && <a href={v.evidence_url} target="_blank" rel="noreferrer" className="text-xs font-bold underline underline-offset-4 hover:text-brand">Evidence</a>}
                  <Badge tone={STATUS_TONE[v.status]}>{v.status === 'pending' ? 'needs review' : v.status}</Badge>
                  {v.status === 'pending' && v.type !== 'past_work' && (
                    <button disabled={busy !== null} onClick={async () => { setBusy(v.id); await runCheck(v.id, 'This request'); setBusy(null) }} className="text-xs font-bold underline underline-offset-4 hover:text-brand disabled:opacity-50">{busy === v.id ? 'Checking…' : 'Check again'}</button>
                  )}
                  {v.status === 'pending' && <button onClick={() => withdraw(v)} className="text-xs font-bold text-ink-soft underline underline-offset-4 hover:text-brand">Withdraw</button>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {links.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xs font-bold uppercase tracking-wider">Client confirmation links</h3>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {links.map((l) => {
                const state = linkState(l)
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold break-words">{titleOf(l.portfolio_item_id)}{l.client_name ? ` · ${l.client_name}` : ''}</p>
                      <p className="text-xs text-ink-soft">
                        {state === 'used' ? `Confirmed by ${l.confirmed_name}${l.confirmed_company ? ` of ${l.confirmed_company}` : ''}` : state === 'expired' ? 'Expired without being used' : `Waiting for the client · expires ${new Date(l.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    <Badge tone={state === 'used' ? 'blue' : state === 'expired' ? 'orange' : 'muted'}>{state}</Badge>
                    {state === 'waiting' && <Button size="sm" variant="dark" onClick={() => copy(l)}>{copied === l.id ? 'Copied' : 'Copy link'}</Button>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      <Card ticket notchY="6.25rem" className="lg:col-span-2">
        <h3 className="display text-lg">Get verified</h3>
        <div className="mt-3"><Tabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setPiece(''); setMessage(null) }} /></div>
        <div className="mt-5 space-y-4 border-t border-dashed border-ink/25 pt-5">
          <p className="text-sm text-ink-soft">
            {tab === 'tool' ? 'Upload a screenshot of your own account, plan page or generation history. An AI check looks for the tool’s name and your account or work.'
              : tab === 'workflow' ? 'A piece with at least 3 workflow steps and an image on every step is “documented”. An AI check then confirms the steps lead to the finished piece.'
              : 'Send your client a one-time link. When they confirm they commissioned the piece, it becomes client-confirmed.'}
          </p>

          {tab === 'tool' && (
            toolOptions.length === 0 ? <Notice>Every tool on your profile is already verified or waiting for review.</Notice> : (
              <>
                <Select label="Tool" options={toolOptions} placeholder="Choose…" value={tool} onChange={(e) => setTool(e.target.value)} />
                <Field as="div" label="Screenshot" hint={`PNG, JPG or WebP, up to ${MAX_EVIDENCE_MB} MB. Hide anything private such as card numbers.`}>
                  <FileDrop compact accept="image/png,image/jpeg,image/webp" onFile={onEvidence} title="Attach a screenshot" hint={file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Account, plan or history page'} preview={file && <p className="text-center text-sm font-semibold">✓ Screenshot attached</p>} />
                </Field>
                <Button variant="dark" full onClick={verifyTool} disabled={busy !== null}>{busy === 'tool' ? 'Checking the screenshot…' : 'Check with AI'}</Button>
              </>
            )
          )}

          {tab === 'workflow' && (
            items.length === 0 ? <Notice>Add a portfolio piece first. <Link to="/portfolio/new" className="underline font-bold">Add one now</Link></Notice> : (
              <>
                <Select label="Portfolio piece" options={items.map((i) => ({ value: i.id, label: `${i.title}${documented(i.id) ? ' (documented)' : ''}` }))} placeholder="Choose…" value={piece} onChange={(e) => setPiece(e.target.value)} />
                {piece && (
                  documented(piece) ? <Notice tone="success">Workflow documented: {chosen.total} steps, each with an image. Ready to check.</Notice>
                    : <Notice>Not documented yet: {chosen?.total ?? 0} {chosen?.total === 1 ? 'step' : 'steps'}, {chosen?.withImage ?? 0} with an image. It needs at least 3 steps and an image on every one. <Link to={`/portfolio/${piece}/edit`} className="underline font-bold">Edit the piece</Link></Notice>
                )}
                <Button variant="dark" full onClick={verifyWorkflow} disabled={busy !== null || !piece || !documented(piece)}>{busy === 'workflow' ? 'Checking the steps…' : 'Verify this workflow'}</Button>
              </>
            )
          )}

          {tab === 'past_work' && (
            clientPieces.length === 0 ? <Notice>None of your pieces names a client. Edit a piece and add the client name first.</Notice> : (
              <>
                <Select label="Piece made for a client" options={clientPieces.map((i) => ({ value: i.id, label: `${i.title} · ${i.client_name}` }))} placeholder="Choose…" value={piece} onChange={(e) => setPiece(e.target.value)} />
                <Button variant="dark" full onClick={createLink} disabled={busy !== null || !piece}>{busy === 'past_work' ? 'Creating…' : 'Create confirmation link'}</Button>
              </>
            )
          )}

          {message && <Notice tone={message.tone}>{message.text}</Notice>}
        </div>
      </Card>
    </section>
  )
}
