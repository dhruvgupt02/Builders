import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'
import { loadOpenBriefs, type LoadedBrief } from '../lib/briefs-db'
import { ASPECT_RATIOS, CONTENT_TYPES } from '../lib/taxonomy'
import BriefCard from '../components/brief/BriefCard'
import { AspectShape } from '../components/brief/AspectShape'
import { Button, EmptyState, PageContainer, PageHeader, Spinner } from '../components/ui'

const heading = 'text-xs font-bold uppercase tracking-wider'

function Toggle({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled && !on}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
        on ? 'bg-ink text-cream' : disabled ? 'bg-ink/[0.04] text-ink/35 cursor-not-allowed' : 'bg-cream ring-1 ring-inset ring-line hover:ring-[1.5px] hover:ring-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Open briefs from all brands. Read-only cards; filters narrow by what the brief asks for. */
export default function BriefsBoard() {
  const { session, userId, role, loading } = useAuth()
  const [briefs, setBriefs] = useState<LoadedBrief[] | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [ratios, setRatios] = useState<string[]>([])

  useEffect(() => {
    if (!loading && session) loadOpenBriefs(userId).then(setBriefs)
  }, [loading, session, userId])

  const typesOf = (b: LoadedBrief) => b.draft.deliverables.map((d) => d.content_type)
  const ratiosOf = (b: LoadedBrief) => b.draft.deliverables.map((d) => d.aspect_ratio)
  // A brief matches when it asks for any selected content type AND any selected aspect ratio.
  const matches = (b: LoadedBrief, t: string[], r: string[]) => (t.length === 0 || t.some((x) => typesOf(b).includes(x))) && (r.length === 0 || r.some((x) => ratiosOf(b).includes(x)))

  const shown = useMemo(() => (briefs ?? []).filter((b) => matches(b, types, ratios)), [briefs, types, ratios]) // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  if (loading) return <Spinner />
  if (!session)
    return <EmptyState title="Log in to see open briefs" body="Brands post briefs here for AI creators. Log in or try the demo creator account." action={{ to: '/login', label: 'Log in' }} />
  if (briefs === null) return <Spinner label="Loading open briefs…" />

  const filtered = types.length + ratios.length > 0

  return (
    <PageContainer>
      <PageHeader
        eyebrow="For creators"
        title="Open briefs"
        subtitle="Briefs brands have published, with the formats, budget and usage rights spelled out."
        actions={role === 'brand' ? <Button to="/briefs/new">Create brief</Button> : undefined}
      />

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <h2 className={heading}>Content type</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CONTENT_TYPES.map((t) => {
              const n = briefs.filter((b) => matches(b, [t], ratios)).length
              return <Toggle key={t} on={types.includes(t)} disabled={n === 0} onClick={() => setTypes(flip(types, t))}>{t} <span className="tabular-nums opacity-60">{n}</span></Toggle>
            })}
          </div>
        </div>
        <div>
          <h2 className={heading}>Aspect ratio</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ASPECT_RATIOS.map((r) => {
              const n = briefs.filter((b) => matches(b, types, [r])).length
              const on = ratios.includes(r)
              return <Toggle key={r} on={on} disabled={n === 0} onClick={() => setRatios(flip(ratios, r))}><AspectShape ratio={r} size={16} tone={on ? 'cream' : 'ink'} />{r} <span className="tabular-nums opacity-60">{n}</span></Toggle>
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="display text-lg" aria-live="polite">{shown.length} open {shown.length === 1 ? 'brief' : 'briefs'}</p>
        {filtered && <button type="button" onClick={() => { setTypes([]); setRatios([]) }} className="text-xs font-bold underline underline-offset-4 hover:text-brand">Clear filters</button>}
      </div>

      {briefs.length === 0 ? (
        <EmptyState title="No open briefs yet" body="When a brand publishes a brief it appears here." />
      ) : shown.length === 0 ? (
        <div className="py-14 text-center">
          <div className="dots mx-auto h-10 w-10" aria-hidden />
          <p className="display mt-5 text-xl">No open briefs ask for {[...types, ...ratios].join(' + ')}</p>
          <p className="mt-2 text-sm text-ink-soft">Try fewer filters. There are {briefs.length} open briefs in total.</p>
          <div className="mt-5"><Button variant="dark" onClick={() => { setTypes([]); setRatios([]) }}>Show all {briefs.length}</Button></div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {shown.map((b) => <BriefCard key={b.id} brief={b} />)}
        </div>
      )}
    </PageContainer>
  )
}
