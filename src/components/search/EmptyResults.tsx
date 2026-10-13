import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  activeChips, describeFilters, EMPTY_FILTERS, filtersJson, searchArgs, suggestTerms, withoutChip,
  type Filters, type SearchResult, type SearchRow, type Suggestion,
} from '../../lib/search'
import { Button } from '../ui'
import SearchResultCard from './SearchResultCard'

interface Relaxation {
  key: string
  label: string
  filters: Filters
  total: number
}

interface Props {
  filters: Filters
  cities: string[]
  onApply: (next: Filters) => void
  /** Offer "describe what you need" for a text query that found nothing. Omitted when already in that mode. */
  onTrySemantic?: () => void
}

const count = async (f: Filters) => {
  const { data } = await supabase.rpc('search_creators', searchArgs(f, 'best', 0, 0))
  return (data as SearchResult | null)?.total ?? 0
}

/**
 * Shown when a search has no results. Instead of a dead end it works out, from the same search functions:
 *  - what each filter is costing ("remove X → N creators"), best first
 *  - close taxonomy terms for a mistyped query ("runaway" → Runway)
 *  - the creators who satisfy the most filters, labelled with what they miss
 */
export default function EmptyResults({ filters, cities, onApply, onTrySemantic }: Props) {
  const [relaxations, setRelaxations] = useState<Relaxation[] | null>(null)
  const [suggestions, setSuggestions] = useState<(Suggestion & { filters: Filters; total: number })[]>([])
  const [closest, setClosest] = useState<SearchRow[] | null>(null)
  const key = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setRelaxations(null)
    setClosest(null)
    setSuggestions([])

    // 1. Remove one filter at a time.
    const options: Omit<Relaxation, 'total'>[] = activeChips(filters).map((chip) => ({
      key: chip.key,
      label: `Remove ${chip.label}`,
      filters: withoutChip(filters, chip),
    }))
    if (filters.match_all_tools && filters.tools.length > 1)
      options.push({ key: 'any-tool', label: 'Match any selected tool, not all', filters: { ...filters, match_all_tools: false } })
    Promise.all(options.map(async (o) => ({ ...o, total: await count(o.filters) }))).then((done) => {
      if (!cancelled) setRelaxations(done.sort((a, b) => b.total - a.total))
    })

    // 2. "Did you mean": swap the mistyped word for the real filter, and only offer it if it finds someone.
    if (filters.q.trim()) {
      const terms = suggestTerms(filters.q, cities)
      const fix = (base: Filters, s: Suggestion): Filters => ({
        ...base,
        q: base.q.split(/\s+/).filter((w) => w.toLowerCase() !== s.from).join(' '),
        [s.group]: [...new Set([...base[s.group], s.term])],
      })
      // One fix per mistyped word. With several typos ("midjorney mumbay") no single fix finds anyone,
      // so also offer all of the best fixes together.
      const bestPerWord = terms.filter((s, i) => terms.findIndex((t) => t.from === s.from) === i)
      const options = terms.map((s) => ({ ...s, filters: fix(filters, s) }))
      if (bestPerWord.length > 1)
        options.unshift({ ...bestPerWord[0], term: bestPerWord.map((s) => s.term).join(' + '), filters: bestPerWord.reduce(fix, filters) })
      Promise.all(options.map(async (o) => ({ ...o, total: await count(o.filters) }))).then((done) => {
        if (!cancelled) setSuggestions(done.filter((d) => d.total > 0))
      })
    }

    // 3. Closest matches.
    supabase.rpc('search_closest', { filters: filtersJson(filters), lim: 6 }).then(({ data }) => {
      if (!cancelled) setClosest((data as SearchRow[] | null) ?? [])
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cities.join('|')])

  const helpful = relaxations?.filter((r) => r.total > 0) ?? []

  return (
    <div>
      <div className="rounded-card bg-ink text-cream p-6 sm:p-8">
        <div className="dots h-9 w-9" aria-hidden />
        <h2 className="display mt-4 text-2xl sm:text-3xl">No creators match</h2>
        <p className="mt-2 text-lg text-cream/90 break-words">{describeFilters(filters)}</p>
        <p className="mt-2 text-sm text-cream/60">No single creator has all of these at once. Here is how to get results.</p>

        {suggestions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand">Did you mean</h3>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button key={s.term} size="sm" variant="light" onClick={() => onApply(s.filters)}>
                  {s.term} · {s.total} {s.total === 1 ? 'creator' : 'creators'}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand">Try removing one filter</h3>
          {relaxations === null ? (
            <p className="mt-2.5 text-sm text-cream/60">Checking what each filter is costing you…</p>
          ) : helpful.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {helpful.map((r) => (
                <Button key={r.key} size="sm" variant="primary" onClick={() => onApply(r.filters)}>
                  {r.label} → {r.total} {r.total === 1 ? 'creator' : 'creators'}
                </Button>
              ))}
            </div>
          ) : (
            <p className="mt-2.5 text-sm text-cream/80">Removing any single filter still finds no one, so more than one of them is in the way.</p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-cream/15 pt-5">
          <Button size="sm" variant="light" onClick={() => onApply(EMPTY_FILTERS)}>Clear all filters</Button>
          {onTrySemantic && filters.q.trim() && (
            <Button size="sm" variant="light" onClick={onTrySemantic}>✦ Describe what you need instead</Button>
          )}
        </div>
      </div>

      {closest && closest.length > 0 && (
        <section className="mt-10">
          <h2 className="display text-xl sm:text-2xl">Closest matches</h2>
          <p className="mt-1 text-sm text-ink-soft">These creators meet most of what you asked for. Each card says what is missing.</p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {closest.map((row) => <SearchResultCard key={row.id} row={row} filters={filters} />)}
          </div>
        </section>
      )}
    </div>
  )
}
