import { BAR_PARTS, PART_HELP, PART_LABELS, WEIGHTS, type MatchDetails, type Part } from '../../lib/matching'

/** The score as a number in a ring-like block. */
export function ScoreBadge({ score, tone = 'ink' }: { score: number; tone?: 'ink' | 'cream' }) {
  const strong = score >= 70
  return (
    <div
      className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ${strong ? 'bg-brand text-white' : tone === 'cream' ? 'bg-cream/15 text-cream' : 'bg-ink text-cream'}`}
      title={`Match score ${score} out of 100`}
    >
      <span className="display text-2xl leading-none">{score}</span>
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider opacity-80">match</span>
    </div>
  )
}

function note(part: Part, d: MatchDetails): string {
  switch (part) {
    case 'tools':
      return d.excluded_relied_on.length ? `relies on ${d.excluded_relied_on.join(', ')}`
        : d.tools_missing.length ? `missing ${d.tools_missing.join(', ')}`
        : d.tools_matched.length ? `has ${d.tools_matched.join(', ')}` : 'none required'
    case 'format':
      return d.deliverable_count ? `${d.deliverables_covered} of ${d.deliverable_count} formats` : 'no deliverables set'
    case 'style':
      return !d.brief_embedded ? 'brief not analysed yet' : d.similarity != null ? `${Math.round(d.similarity * 100)}% similar` : 'no pieces to compare'
    case 'budget':
      return d.within_budget ? 'within budget' : d.price_min != null ? `from ₹${d.price_min.toLocaleString('en-IN')}` : 'no price listed'
    default:
      return ''
  }
}

interface Props {
  breakdown: Record<Part, number>
  details: MatchDetails
  /** on a dark card */
  tone?: 'ink' | 'cream'
  /** also show the verification row */
  all?: boolean
}

/** One bar per part of the score, with the points and a short note on what is behind them. */
export default function ScoreBreakdown({ breakdown, details, tone = 'ink', all }: Props) {
  const parts: Part[] = all ? [...BAR_PARTS, 'verification'] : BAR_PARTS
  const track = tone === 'cream' ? 'bg-cream/15' : 'bg-ink/10'
  const soft = tone === 'cream' ? 'text-cream/60' : 'text-ink-soft'
  return (
    <dl className="space-y-1.5">
      {parts.map((part) => {
        const value = Number(breakdown[part])
        const pct = Math.round((value / WEIGHTS[part]) * 100)
        return (
          <div key={part} title={PART_HELP[part]} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-xs">
            <dt className="font-bold uppercase tracking-wider">{PART_LABELS[part]}</dt>
            <dd className="min-w-0">
              <div className={`h-2 rounded-full ${track}`} role="img" aria-label={`${PART_LABELS[part]}: ${value} of ${WEIGHTS[part]} points`}>
                <div className={`h-full rounded-full ${pct >= 70 ? 'bg-lime ring-1 ring-ink/15' : pct >= 35 ? 'bg-brand/60' : 'bg-brand'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
              </div>
              {note(part, details) && <span className={`mt-0.5 block truncate text-[11px] ${soft}`}>{note(part, details)}</span>}
            </dd>
            <dd className={`text-right font-semibold tabular-nums ${soft}`}>{value % 1 ? value.toFixed(1) : value}/{WEIGHTS[part]}</dd>
          </div>
        )
      })}
    </dl>
  )
}
