import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { aspectClass } from '../lib/format'
import { Avatar, Button, Card, Input, Media, Notice, PageContainer, Spinner } from '../components/ui'

interface Confirmation {
  status: 'valid' | 'used' | 'expired' | 'not_found'
  client_name?: string | null
  expires_at?: string
  confirmed_name?: string | null
  confirmed_company?: string | null
  creator?: { id: string; name: string; avatar_url: string | null; city: string | null }
  item?: { id: string; title: string; description: string | null; thumbnail_url: string | null; media_url: string | null; media_type: string; aspect_ratio: string | null; content_type: string | null }
}

/**
 * Public page a creator's client opens from a one-time link, to confirm they commissioned a piece.
 * No login: the token in the address is the only credential, it works once and expires after 14 days.
 */
export default function ConfirmWork() {
  const { token } = useParams()
  const [info, setInfo] = useState<Confirmation | null>(null)
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    supabase.rpc('get_client_confirmation', { token: token ?? '' }).then(({ data }) => setInfo((data as Confirmation) ?? { status: 'not_found' }))
  }, [token])

  async function confirm(ev: FormEvent) {
    ev.preventDefault()
    setError(null)
    if (name.trim().length < 2 || company.trim().length < 2) return setError('Enter your name and your company.')
    setBusy(true)
    const { data, error } = await supabase.rpc('confirm_client_work', { token: token ?? '', name, company })
    setBusy(false)
    if (error || !data?.ok) return setError(data?.error ?? 'The confirmation could not be saved. Please try again.')
    setDone(true)
  }

  if (!info) return <Spinner label="Opening confirmation link…" />

  const problem =
    info.status === 'not_found' ? ['This link is not valid', 'Check that you copied the whole link, or ask the creator to send it again.']
    : info.status === 'expired' ? ['This link has expired', 'Confirmation links last 14 days. Ask the creator for a new one.']
    : info.status === 'used' && !done ? ['This link has already been used', `${info.confirmed_name ?? 'Someone'}${info.confirmed_company ? ` of ${info.confirmed_company}` : ''} confirmed this work. Each link works once.`]
    : null

  if (problem || !info.item || !info.creator)
    return (
      <PageContainer className="!max-w-xl">
        <Card className="text-center !p-8">
          <div className="dots mx-auto h-9 w-9" aria-hidden />
          <h1 className="display mt-4 text-2xl">{problem?.[0] ?? 'This link is not valid'}</h1>
          <p className="mt-2 text-ink-soft">{problem?.[1]}</p>
          <div className="mt-6"><Button to="/" variant="dark">Go to BRIVIO</Button></div>
        </Card>
      </PageContainer>
    )

  const { item, creator } = info
  return (
    <PageContainer className="!max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Client confirmation</p>
      <h1 className="display mt-2 text-3xl sm:text-4xl">Did you commission this work?</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        {creator.name} lists this piece on BRIVIO as made for {info.client_name || 'a client'}. If that is you, confirming it adds a “Past work verified” badge to their profile, so other brands know it is real client work.
      </p>

      <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <Card padded={false} className="p-2">
          <div className={`${aspectClass(item.aspect_ratio)} mx-auto max-h-[28rem] overflow-hidden rounded-[0.9rem] bg-ink`}>
            {item.media_type === 'video' && item.media_url ? (
              <video src={item.media_url} poster={item.thumbnail_url ?? undefined} controls playsInline className="h-full w-full object-contain" />
            ) : (
              <Media src={item.media_url ?? item.thumbnail_url ?? undefined} alt={item.title} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="p-3">
            <h2 className="font-bold">{item.title}</h2>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{[item.content_type, item.aspect_ratio].filter(Boolean).join(' · ')}</p>
            {item.description && <p className="mt-2 text-sm text-ink-soft line-clamp-3">{item.description}</p>}
          </div>
        </Card>

        <Card ticket notchY="5.5rem">
          <Link to={`/creators/${creator.id}`} className="flex items-center gap-3">
            <Avatar src={creator.avatar_url} name={creator.name} />
            <span><span className="block font-bold leading-tight">{creator.name}</span><span className="block text-xs text-ink-soft">{creator.city}</span></span>
          </Link>
          {done ? (
            <div className="mt-8 border-t border-dashed border-ink/25 pt-6">
              <Notice tone="success">Thank you. Your confirmation is recorded and this piece now shows as client-confirmed.</Notice>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button to={`/portfolio/${item.id}`} variant="dark">See the piece on BRIVIO</Button>
                <Button to="/creators" variant="outline">Find more AI creators</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={confirm} noValidate className="mt-8 space-y-4 border-t border-dashed border-ink/25 pt-6">
              <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
              <Input label="Company" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={120} hint="Shown on the creator’s profile as the confirming client." />
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" full disabled={busy}>{busy ? 'Confirming…' : 'Confirm we commissioned this work'}</Button>
              <p className="text-xs text-ink-soft">Only confirm if you or your company paid for or approved this piece. This link works once{info.expires_at ? ` and expires on ${new Date(info.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. <Link to="/trust" className="font-bold underline underline-offset-2">How verification works</Link></p>
            </form>
          )}
        </Card>
      </div>
    </PageContainer>
  )
}
