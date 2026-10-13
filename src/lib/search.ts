// Search state, URL (de)serialisation and RPC argument builders. Pure TypeScript with no browser or
// Supabase-client imports, so the accuracy tests (scripts/test-search.ts) run the exact same code as the page.
import { ASPECT_RATIOS, CONTENT_TYPES, SKILLS, SPECIALIZATIONS, TOOLS } from './taxonomy.js'

export type Mode = 'keyword' | 'semantic'
export const SORTS = [
  { value: 'best', label: 'Best match' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'verified', label: 'Most verified' },
  { value: 'newest', label: 'Newest' },
] as const
export type Sort = (typeof SORTS)[number]['value']

export const PAGE_SIZE = 12
export const BUDGET_MIN = 3000
export const BUDGET_MAX = 100000
export const BUDGET_STEP = 1000

/** The array-valued filter groups. Keys are the SQL parameter names. */
export const GROUPS = ['specializations', 'skills', 'tools', 'content_types', 'aspect_ratios', 'cities'] as const
export type Group = (typeof GROUPS)[number]

export interface Filters {
  q: string
  specializations: string[]
  skills: string[]
  tools: string[]
  content_types: string[]
  aspect_ratios: string[]
  cities: string[]
  budget_max: number | null
  commercial_ready: boolean
  verified_only: boolean
  match_all_tools: boolean
}

export const EMPTY_FILTERS: Filters = {
  q: '', specializations: [], skills: [], tools: [], content_types: [], aspect_ratios: [], cities: [],
  budget_max: null, commercial_ready: false, verified_only: false, match_all_tools: false,
}

export interface SearchState {
  filters: Filters
  mode: Mode
  sort: Sort
}

/** Fixed option lists per group. Cities are not a taxonomy; they come from the data. */
export const TAXONOMY_OPTIONS: Record<Exclude<Group, 'cities'>, readonly string[]> = {
  specializations: SPECIALIZATIONS,
  skills: SKILLS,
  tools: TOOLS,
  content_types: CONTENT_TYPES,
  aspect_ratios: ASPECT_RATIOS,
}

export const GROUP_LABELS: Record<Group, string> = {
  specializations: 'Specialization',
  skills: 'Skills',
  tools: 'Tools',
  content_types: 'Content type',
  aspect_ratios: 'Aspect ratio',
  cities: 'City',
}

// ───────────── URL ─────────────

const URL_KEYS: Record<Group, string> = {
  specializations: 'spec', skills: 'skill', tools: 'tool', content_types: 'ct', aspect_ratios: 'ar', cities: 'city',
}

export function parseParams(sp: URLSearchParams): SearchState {
  const list = (group: Group) => {
    const raw = (sp.get(URL_KEYS[group]) ?? '').split(',').map((v) => v.trim()).filter(Boolean)
    const allowed = group === 'cities' ? null : TAXONOMY_OPTIONS[group]
    // Unknown values (a mistyped or stale link) are dropped rather than silently returning nothing.
    return [...new Set(allowed ? raw.filter((v) => allowed.includes(v)) : raw)]
  }
  const budget = Number(sp.get('budget'))
  const sort = sp.get('sort') as Sort
  return {
    filters: {
      q: (sp.get('q') ?? '').slice(0, 200),
      specializations: list('specializations'),
      skills: list('skills'),
      tools: list('tools'),
      content_types: list('content_types'),
      aspect_ratios: list('aspect_ratios'),
      cities: list('cities'),
      budget_max: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : null,
      commercial_ready: sp.get('commercial') === '1',
      verified_only: sp.get('verified') === '1',
      match_all_tools: sp.get('alltools') === '1',
    },
    mode: sp.get('mode') === 'semantic' ? 'semantic' : 'keyword',
    sort: SORTS.some((s) => s.value === sort) ? sort : 'best',
  }
}

export function toParams({ filters: f, mode, sort }: SearchState): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q.trim()) sp.set('q', f.q.trim())
  if (mode === 'semantic') sp.set('mode', 'semantic')
  for (const g of GROUPS) if (f[g].length) sp.set(URL_KEYS[g], f[g].join(','))
  if (f.budget_max) sp.set('budget', String(f.budget_max))
  if (f.commercial_ready) sp.set('commercial', '1')
  if (f.verified_only) sp.set('verified', '1')
  if (f.match_all_tools && f.tools.length > 1) sp.set('alltools', '1')
  if (sort !== 'best') sp.set('sort', sort)
  return sp
}

/** Link to the search page with some filters preset, e.g. searchLink({ specializations: ['AI ads'] }). */
export function searchLink(partial: Partial<Filters>): string {
  const qs = toParams({ filters: { ...EMPTY_FILTERS, ...partial }, mode: 'keyword', sort: 'best' }).toString()
  return qs ? `/creators?${qs}` : '/creators'
}

// ───────────── RPC arguments ─────────────

/** Arguments for the search_creators SQL function. */
export function searchArgs(f: Filters, sort: Sort = 'best', lim = PAGE_SIZE, off = 0) {
  return {
    q: f.q.trim() || null,
    skills: f.skills,
    tools: f.tools,
    specializations: f.specializations,
    content_types: f.content_types,
    aspect_ratios: f.aspect_ratios,
    cities: f.cities,
    budget_max: f.budget_max,
    commercial_ready: f.commercial_ready,
    verified_only: f.verified_only,
    match_all_tools: f.match_all_tools && f.tools.length > 1,
    sort,
    lim,
    off,
  }
}

/** The filters as JSON, for search_facets, search_closest and search_semantic. */
export function filtersJson(f: Filters) {
  const { sort: _sort, lim: _lim, off: _off, ...rest } = searchArgs(f)
  return rest
}

/** Option lists sent to search_facets so every taxonomy option gets a count, including ones nobody has. */
export const FACET_OPTIONS = TAXONOMY_OPTIONS

// ───────────── Results ─────────────

export interface Thumb {
  id: string
  title: string
  thumbnail_url: string | null
  aspect_ratio: string | null
  content_type: string | null
}

export interface MissedGroup {
  group: Group | 'q' | 'budget' | 'commercial_ready' | 'verified_only'
  values: (string | number | null)[]
  all?: boolean
}

export interface SearchRow {
  id: string
  name: string
  headline: string | null
  bio: string | null
  city: string | null
  avatar_url: string | null
  specializations: string[]
  skills: string[]
  tools: string[]
  languages: string[]
  price_min: number | null
  price_max: number | null
  availability: string | null
  created_at: string
  content_types: string[]
  aspect_ratios: string[]
  item_count: number
  verified_tool_labels: string[]
  has_verified_workflow: boolean
  has_verified_past_work: boolean
  verification_count: number
  commercial_ready: boolean
  thumbs: Thumb[]
  matched: string[]
  relevance?: number
  /** semantic search */
  similarity?: number
  best_item?: (Thumb & { similarity: number }) | null
  /** closest matches */
  missed?: MissedGroup[]
  satisfied?: number
}

export interface SearchResult {
  total: number
  rows: SearchRow[]
}

export type Facets = Record<Group, Record<string, number>> & { total: number; commercial_ready: number; verified_only: number }

// ───────────── Active filters as chips ─────────────

export interface FilterChip {
  /** unique within the current filters */
  key: string
  kind: Group | 'q' | 'budget' | 'commercial_ready' | 'verified_only'
  value?: string
  label: string
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

export function activeChips(f: Filters): FilterChip[] {
  const chips: FilterChip[] = []
  if (f.q.trim()) chips.push({ key: 'q', kind: 'q', label: `“${f.q.trim()}”` })
  for (const g of ['tools', 'skills', 'specializations', 'content_types', 'aspect_ratios', 'cities'] as const)
    for (const v of f[g]) chips.push({ key: `${g}:${v}`, kind: g, value: v, label: v })
  if (f.budget_max) chips.push({ key: 'budget', kind: 'budget', label: `under ${inr(f.budget_max)}` })
  if (f.commercial_ready) chips.push({ key: 'commercial_ready', kind: 'commercial_ready', label: 'Commercial-ready' })
  if (f.verified_only) chips.push({ key: 'verified_only', kind: 'verified_only', label: 'Verified only' })
  return chips
}

export function withoutChip(f: Filters, chip: FilterChip): Filters {
  switch (chip.kind) {
    case 'q': return { ...f, q: '' }
    case 'budget': return { ...f, budget_max: null }
    case 'commercial_ready': return { ...f, commercial_ready: false }
    case 'verified_only': return { ...f, verified_only: false }
    default: return { ...f, [chip.kind]: f[chip.kind].filter((v) => v !== chip.value) }
  }
}

export function toggleValue(f: Filters, group: Group, value: string): Filters {
  const on = f[group].includes(value)
  return { ...f, [group]: on ? f[group].filter((v) => v !== value) : [...f[group], value] }
}

/** "Kling + 4:5 + under ₹5,000" */
export function describeFilters(f: Filters): string {
  return activeChips(f).map((c) => c.label).join(' + ')
}

export function countActive(f: Filters): number {
  return activeChips(f).length
}

/** Human text for one missed filter group, e.g. "4:5", "Kling or Runway", "over budget (from ₹15,000)". */
export function describeMissed(m: MissedGroup): string {
  switch (m.group) {
    case 'q': return `“${m.values[0]}”`
    case 'budget': return m.values[0] == null ? 'no listed price' : `over budget (from ${inr(Number(m.values[0]))})`
    case 'commercial_ready': return 'commercial-ready work'
    case 'verified_only': return 'verification'
    default: return m.values.join(m.all ? ' and ' : ' or ')
  }
}

// ───────────── "Did you mean" ─────────────

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length]
}

export interface Suggestion {
  term: string
  group: Group
  /** the word in the query it replaces */
  from: string
}

/**
 * Taxonomy terms (and cities) close to the words of a query that found nothing: "runaway" → Runway,
 * "midjorney" → Midjourney, "skincare reels" → Social reels. At most four, closest first.
 */
export function suggestTerms(q: string, cities: readonly string[] = []): Suggestion[] {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
  const candidates: { term: string; group: Group }[] = [
    ...TOOLS.map((term) => ({ term, group: 'tools' as const })),
    ...SKILLS.map((term) => ({ term, group: 'skills' as const })),
    ...SPECIALIZATIONS.map((term) => ({ term, group: 'specializations' as const })),
    ...CONTENT_TYPES.map((term) => ({ term, group: 'content_types' as const })),
    ...cities.map((term) => ({ term, group: 'cities' as const })),
  ]
  const scored: (Suggestion & { score: number })[] = []
  for (const { term, group } of candidates) {
    // Compare against the whole term and each of its words ("reels" should find "Social reels").
    const parts = [term.toLowerCase(), ...term.toLowerCase().split(/[\s/-]+/).filter((p) => p.length >= 3)]
    let best: { score: number; from: string } | null = null
    for (const word of words)
      for (const part of parts) {
        const d = editDistance(word, part)
        const allowed = Math.min(2, Math.floor(Math.max(word.length, part.length) / 4))
        if (d <= allowed && (!best || d < best.score)) best = { score: d, from: word }
      }
    if (best) scored.push({ term, group, ...best })
  }
  const seen = new Set<string>()
  return scored
    .sort((a, b) => a.score - b.score || a.term.length - b.term.length)
    .filter((s) => !seen.has(s.term) && seen.add(s.term))
    .slice(0, 4)
    .map(({ term, group, from }) => ({ term, group, from }))
}
