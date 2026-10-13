// Brief-to-creator matching: the shape of a match row, the weights, and the plain-English reason built from the
// breakdown when the AI is not available. Pure TypeScript, shared by the page, the API route and the tests.
// The scoring itself is the SQL function match_creators_for_brief (supabase/migrations/006_matching.sql);
// docs/matching.md explains the weights.
import type { SearchRow, Thumb } from './search.js'

export const WEIGHTS = { tools: 25, format: 20, style: 25, budget: 15, commercial: 10, verification: 5 } as const
export type Part = keyof typeof WEIGHTS

export const PART_LABELS: Record<Part, string> = {
  tools: 'Tools',
  format: 'Format',
  style: 'Style',
  budget: 'Budget',
  commercial: 'Commercial',
  verification: 'Verification',
}

export const PART_HELP: Record<Part, string> = {
  tools: 'Share of the required tools this creator uses, minus 10 for each excluded tool most of their work relies on.',
  format: 'Share of the brief’s deliverables for which they have a portfolio piece of the same content type and aspect ratio.',
  style: 'How close their best-matching portfolio piece is to the brief’s description.',
  budget: 'Full marks when their price range overlaps the budget, less the further outside it they are.',
  commercial: 'Full marks if they have licensed or client-delivered work, or if the brief is for organic social only.',
  verification: 'Verified tool 2, verified workflow 1.5, verified past work 1.5.',
}

/** The five bars shown on a card. Verification is shown as badges instead. */
export const BAR_PARTS: Part[] = ['tools', 'format', 'style', 'budget', 'commercial']

export interface MatchDetails {
  tools_matched: string[]
  tools_missing: string[]
  excluded_relied_on: string[]
  deliverables_covered: number
  deliverable_count: number
  similarity: number | null
  brief_embedded: boolean
  within_budget: boolean
  price_min: number | null
  price_max: number | null
}

export interface MatchRow extends Omit<SearchRow, 'best_item'> {
  score: number
  breakdown: Record<Part, number>
  details: MatchDetails
  best_item: Thumb | null
  reason: string | null
}

export interface MatchResult {
  brief_embedded: boolean
  rows: MatchRow[]
}

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/**
 * One sentence saying why a creator matched, built only from the numbers. Used when the AI reasons are
 * unavailable, and shown until they arrive.
 */
export function reasonFromBreakdown(m: Pick<MatchRow, 'breakdown' | 'details' | 'best_item' | 'has_verified_past_work' | 'verified_tool_labels'>): string {
  const d = m.details
  const good: string[] = []
  const gaps: string[] = []

  if (d.tools_matched.length && !d.tools_missing.length) good.push(`uses ${d.tools_matched.length === 1 ? d.tools_matched[0] : `all ${d.tools_matched.length} required tools`}`)
  else if (d.tools_matched.length) {
    good.push(`uses ${list(d.tools_matched)}`)
    gaps.push(`does not list ${list(d.tools_missing)}`)
  } else if (d.tools_missing.length) gaps.push(`does not list ${list(d.tools_missing)}`)
  if (d.excluded_relied_on.length) gaps.push(`relies on ${list(d.excluded_relied_on)}, which the brief rules out`)

  if (d.deliverable_count > 0) {
    if (d.deliverables_covered === d.deliverable_count) good.push(d.deliverable_count === 1 ? 'has work in the format you need' : `has work in all ${d.deliverable_count} formats you need`)
    else if (d.deliverables_covered > 0) good.push(`has work in ${d.deliverables_covered} of your ${d.deliverable_count} formats`)
    else gaps.push('has no portfolio piece in your formats yet')
  }

  if (m.breakdown.style >= WEIGHTS.style * 0.6 && m.best_item) good.push(`“${m.best_item.title}” is close to the style you describe`)

  if (d.within_budget) good.push('fits your budget')
  else if (d.price_min != null && m.breakdown.budget < WEIGHTS.budget) gaps.push(`starts at ₹${d.price_min.toLocaleString('en-IN')}, outside your budget`)

  if (m.has_verified_past_work) good.push('has verified past work')
  else if (m.verified_tool_labels.length) good.push('has verified tools')

  const lead = good.length ? `${good[0].charAt(0).toUpperCase()}${good[0].slice(1)}${good.length > 1 ? `, ${good.length > 2 ? `${good.slice(1, -1).join(', ')} and ${good[good.length - 1]}` : `and ${good[1]}`}` : ''}` : 'A partial match'
  return `${lead}${gaps.length ? `; ${gaps.slice(0, 2).join(' and ')}` : ''}.`
}

/** Suggestions for a brief whose best match is weak. */
export function weakMatchAdvice(rows: MatchRow[], brief: { required_tools: string[]; budget_max: number | null }): string[] {
  const advice: string[] = []
  if (!rows.length) return ['There are no creators to match yet.']
  const top = rows.slice(0, 10)
  if (brief.required_tools.length) {
    const have = (tool: string) => rows.filter((r) => r.tools.includes(tool)).length
    const rare = [...brief.required_tools].sort((a, b) => have(a) - have(b))[0]
    const all = rows.filter((r) => r.details.tools_missing.length === 0).length
    advice.push(`Relax the required tools: only ${all} of ${rows.length} creators use ${brief.required_tools.length === 1 ? rare : `all ${brief.required_tools.length}`}. ${brief.required_tools.length > 1 ? `${rare} is the rarest (${have(rare)} creators).` : ''}`.trim())
  }
  const over = top.filter((r) => !r.details.within_budget && r.details.price_min != null && brief.budget_max != null && r.details.price_min > brief.budget_max)
  if (over.length >= top.length / 2 && brief.budget_max != null) {
    const cheapest = Math.min(...over.map((r) => r.details.price_min!))
    advice.push(`Widen the budget: ${over.length} of the ${top.length} closest creators start above ₹${brief.budget_max.toLocaleString('en-IN')}. The nearest starts at ₹${cheapest.toLocaleString('en-IN')}.`)
  }
  if (top.every((r) => r.details.deliverable_count > 0 && r.details.deliverables_covered === 0))
    advice.push('None of the closest creators has work in your exact formats. Check the content type and aspect ratio of each deliverable.')
  if (!advice.length) advice.push('Add more detail on style and mood so the brief can be compared with portfolio pieces, or publish it and invite the closest creators anyway.')
  return advice
}
