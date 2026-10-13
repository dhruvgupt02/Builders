import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { describeMissed, type Filters, type SearchRow, type Thumb } from '../../lib/search'
import type { Verification } from '../../lib/types'
import { formatPriceRange } from '../../lib/format'
import { ArrowIcon, Avatar, Badge, Chip, Media } from '../ui'
import ToolChips from '../ToolChips'
import VerificationBadges from '../VerificationBadges'

const ratioOf = (r: string | null) => {
  const [w, h] = (r ?? '16:9').split(':').map(Number)
  return w && h ? w / h : 16 / 9
}

/** The search view carries verification as aggregates; turn them back into the shape VerificationBadges takes. */
function verificationsOf(row: SearchRow): Verification[] {
  return [
    ...row.verified_tool_labels.map((label, i) => ({ id: `t${i}`, type: 'tool' as const, label, status: 'verified' as const })),
    ...(row.has_verified_workflow ? [{ id: 'w', type: 'workflow' as const, label: null, status: 'verified' as const }] : []),
    ...(row.has_verified_past_work ? [{ id: 'p', type: 'past_work' as const, label: null, status: 'verified' as const }] : []),
  ]
}

/**
 * Up to three portfolio thumbnails side by side, each at its true aspect ratio and all the same height.
 * The height is the row width divided by the sum of the ratios, capped so one tall piece cannot take over the card.
 */
function ThumbStrip({ thumbs, bestId }: { thumbs: Thumb[]; bestId?: string }) {
  if (!thumbs.length)
    return <div className="flex h-28 items-center justify-center rounded-[0.9rem] bg-paper-deep text-xs font-semibold text-ink-soft">No portfolio pieces yet</div>
  const sum = thumbs.reduce((s, t) => s + ratioOf(t.aspect_ratio), 0)
  const gaps = (thumbs.length - 1) * 4
  return (
    <div className="[container-type:inline-size]">
      <div className="flex gap-1 overflow-hidden rounded-[0.9rem]" style={{ height: `min(11rem, calc((100cqw - ${gaps}px) / ${sum}))` } as CSSProperties}>
        {thumbs.map((t) => (
          <Link
            key={t.id}
            to={`/portfolio/${t.id}`}
            title={`${t.title}${t.aspect_ratio ? ` (${t.aspect_ratio})` : ''}`}
            className="relative h-full shrink-0 overflow-hidden bg-paper-deep focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue"
            style={{ aspectRatio: String(ratioOf(t.aspect_ratio)) }}
          >
            <Media src={t.thumbnail_url ?? undefined} alt={t.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-105" />
            {t.id === bestId && <span className="absolute left-1 top-1 rounded bg-blue px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">Best match</span>}
            {t.aspect_ratio && <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1 py-px text-[9px] font-bold text-cream">{t.aspect_ratio}</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}

interface Props {
  row: SearchRow
  filters: Filters
}

export default function SearchResultCard({ row, filters }: Props) {
  const to = `/creators/${row.id}`
  const verified = new Set(row.verified_tool_labels)
  // Selected tools first, so the card shows why it matched; then the rest.
  const tools = [...row.tools.filter((t) => filters.tools.includes(t)), ...row.tools.filter((t) => !filters.tools.includes(t))]

  // In semantic mode, make sure the best-matching piece is in the strip, first.
  const best = row.best_item ?? null
  const thumbs = best ? [best, ...row.thumbs.filter((t) => t.id !== best.id)].slice(0, 3) : row.thumbs

  const matches = [
    ...row.matched,
    ...(filters.budget_max && row.price_min != null && row.price_min <= filters.budget_max ? ['within budget'] : []),
    ...(filters.commercial_ready && row.commercial_ready ? ['commercial-ready'] : []),
    ...(filters.verified_only && row.verification_count > 0 ? ['verified'] : []),
  ]

  return (
    <article className="group flex h-full flex-col rounded-card bg-cream shadow-card">
      <div className="p-2 pb-0">
        <ThumbStrip thumbs={thumbs} bestId={best?.id} />
      </div>

      <div className="flex-1 p-4">
        <div className="flex items-start gap-3">
          <Link to={to} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue">
            <Avatar src={row.avatar_url} name={row.name} />
            <span className="min-w-0 flex-1">
              <span className={`display block leading-tight break-words group-hover:text-brand ${row.name.split(/\s+/).some((w) => w.length > 10) ? 'text-sm' : 'text-base'}`}>{row.name}</span>
              <span className="mt-1 block text-sm text-ink-soft">{row.city}</span>
            </span>
          </Link>
          {row.similarity != null && (
            <span className="shrink-0 text-right" title="How closely this creator's profile and work match your description">
              <span className="display block text-xl text-blue">{Math.round(row.similarity * 100)}%</span>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-soft">match</span>
            </span>
          )}
        </div>

        <p className="mt-3 text-sm line-clamp-2">{row.headline}</p>
        {best && <p className="mt-2 text-xs text-ink-soft">Closest piece: <Link to={`/portfolio/${best.id}`} className="font-semibold text-ink underline underline-offset-2 hover:text-brand">{best.title}</Link></p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.specializations.map((s) => <Chip key={s} tone={filters.specializations.includes(s) ? 'orange' : 'paper'}>{s}</Chip>)}
        </div>
        <div className="mt-2">
          <ToolChips tools={tools.slice(0, 4)} verified={verified} tone="white" />
          {tools.length > 4 && <span className="mt-1 block text-xs text-ink-soft">+{tools.length - 4} more tools</span>}
        </div>
        <div className="mt-3 min-h-5">
          <VerificationBadges verifications={verificationsOf(row)} size="compact" />
        </div>

        {matches.length > 0 && (
          <p className="mt-3 border-t border-line pt-3 text-xs">
            <span className="font-bold uppercase tracking-wider text-ink-soft">Matches: </span>
            <span className="font-semibold">{matches.join(', ')}</span>
          </p>
        )}
        {row.missed && row.missed.length > 0 && (
          <p className={`text-xs ${matches.length ? 'mt-1' : 'mt-3 border-t border-line pt-3'}`}>
            <Badge tone="orange">Missing</Badge> <span className="font-semibold">{row.missed.map(describeMissed).join('; ')}</span>
          </p>
        )}
      </div>

      <Link to={to} className="flex items-center justify-between gap-3 rounded-b-card bg-ink text-cream pl-4 pr-2 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue">
        <span className="text-sm font-semibold">{formatPriceRange(row.price_min, row.price_max)}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-cream/70">{row.item_count} {row.item_count === 1 ? 'piece' : 'pieces'}</span>
          <span className="h-9 w-9 rounded-lg bg-brand text-white flex items-center justify-center transition-transform group-hover:rotate-45"><ArrowIcon /></span>
        </span>
      </Link>
    </article>
  )
}

export function ResultSkeleton() {
  return (
    <div className="rounded-card bg-cream shadow-card animate-pulse" aria-hidden>
      <div className="p-2 pb-0"><div className="h-32 rounded-[0.9rem] bg-ink/10" /></div>
      <div className="p-4 space-y-3">
        <div className="flex gap-3">
          <div className="h-12 w-12 rounded-xl bg-ink/10" />
          <div className="flex-1 space-y-2 pt-1"><div className="h-4 w-2/3 rounded bg-ink/10" /><div className="h-3 w-1/3 rounded bg-ink/10" /></div>
        </div>
        <div className="h-3 w-full rounded bg-ink/10" />
        <div className="h-3 w-4/5 rounded bg-ink/10" />
        <div className="flex gap-1.5"><div className="h-6 w-20 rounded-lg bg-ink/10" /><div className="h-6 w-16 rounded-lg bg-ink/10" /><div className="h-6 w-24 rounded-lg bg-ink/10" /></div>
      </div>
      <div className="h-[3.25rem] rounded-b-card bg-ink/80" />
    </div>
  )
}
