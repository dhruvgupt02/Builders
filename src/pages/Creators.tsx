import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  activeChips, EMPTY_FILTERS, FACET_OPTIONS, filtersJson, PAGE_SIZE, parseParams, searchArgs, SORTS, toParams, withoutChip,
  type Facets, type Filters, type Mode, type SearchResult, type SearchRow, type SearchState, type Sort,
} from '../lib/search'
import EmptyResults from '../components/search/EmptyResults'
import FilterPanel from '../components/search/FilterPanel'
import SearchResultCard, { ResultSkeleton } from '../components/search/SearchResultCard'
import { Button, Card, EmptyState, Notice, PageContainer, Tabs } from '../components/ui'

const MODES = [
  { id: 'keyword', label: 'Keyword' },
  { id: 'semantic', label: '✦ Describe what you need' },
] as const

const EXAMPLES = [
  'dreamy anime-style product reel for a skincare brand',
  'festive ad film with warm cinematic lighting',
  '3D product launch for a new gadget',
  'explainer video with an AI presenter for an edtech course',
]

interface Loaded {
  rows: SearchRow[]
  total: number
  /** how these rows were found, which is also how "Load more" must continue */
  via: 'keyword' | 'semantic' | 'filters-only'
}

/** One page of keyword results, straight from the search_creators SQL function. */
async function keywordPage(filters: Filters, sort: Sort, off: number): Promise<SearchResult> {
  const { data, error } = await supabase.rpc('search_creators', searchArgs(filters, sort, PAGE_SIZE, off))
  if (error) throw new Error(error.message)
  return data as SearchResult
}

/** One page of semantic results, or a notice explaining why it fell back. Never throws. */
async function semanticPage(filters: Filters, off: number): Promise<SearchResult | { notice: string }> {
  try {
    const res = await fetch('/api/search/semantic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: filters.q.trim(), filters: filtersJson({ ...filters, q: '' }), lim: PAGE_SIZE, off }),
      signal: AbortSignal.timeout(25000),
    })
    const json = await res.json().catch(() => null)
    if (res.ok && json && Array.isArray(json.rows)) return json as SearchResult
    return { notice: json?.notice ?? 'Smart search is not available right now. Showing keyword results instead.' }
  } catch {
    return { notice: 'Smart search is not responding right now. Showing keyword results instead.' }
  }
}

export default function Creators() {
  const [sp, setSp] = useSearchParams()
  const urlKey = sp.toString()
  const state = useMemo(() => parseParams(new URLSearchParams(urlKey)), [urlKey])
  const { filters, mode, sort } = state

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [draft, setDraft] = useState(filters.q)
  const request = useRef(0)

  // Everything lives in the URL: shareable links, and Back/Forward step through filter changes.
  const apply = useCallback(
    (next: Partial<SearchState>, replace = false) => setSp(toParams({ ...state, ...next }), { replace }),
    [state, setSp],
  )
  const setFilters = (f: Filters) => apply({ filters: f })

  useEffect(() => setDraft(filters.q), [filters.q])

  // Keyword mode searches as you type (replacing the history entry so Back is not one letter at a time).
  // "Describe what you need" only runs on submit, because each run costs an embedding call.
  useEffect(() => {
    if (mode !== 'keyword' || draft.trim() === filters.q.trim()) return
    const timer = setTimeout(() => apply({ filters: { ...filters, q: draft } }, true), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, mode])

  const wantsSemantic = mode === 'semantic' && filters.q.trim().length >= 3

  useEffect(() => {
    const id = ++request.current
    setLoaded(null)
    setError(null)
    setNotice(null)
    ;(async () => {
      try {
        let via: Loaded['via'] = 'keyword'
        let result: SearchResult | null = null
        let message: string | null = null

        if (wantsSemantic) {
          const semantic = await semanticPage(filters, 0)
          if ('rows' in semantic) {
            result = semantic
            via = 'semantic'
          } else message = semantic.notice
        }
        if (!result) {
          result = await keywordPage(filters, sort, 0)
          // A sentence rarely matches word for word; if the fallback finds nothing, show the filtered list instead.
          if (wantsSemantic && result.total === 0) {
            result = await keywordPage({ ...filters, q: '' }, sort, 0)
            via = 'filters-only'
            message = `${message ?? ''} No creator contains all of those words, so this is everyone who fits your filters.`.trim()
          }
        }
        if (id !== request.current) return
        setLoaded({ rows: result.rows, total: result.total, via })
        setNotice(message)

        // Counts follow the search that actually ran (the text only narrows keyword results).
        const facetFilters = via === 'keyword' ? filters : { ...filters, q: '' }
        const { data } = await supabase.rpc('search_facets', { filters: filtersJson(facetFilters), options: FACET_OPTIONS })
        if (id === request.current) setFacets((data as Facets | null) ?? null)
      } catch (err) {
        if (id === request.current) setError((err as Error).message)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey])

  async function loadMore() {
    if (!loaded) return
    const id = request.current
    setLoadingMore(true)
    try {
      const off = loaded.rows.length
      const next =
        loaded.via === 'semantic' ? await semanticPage(filters, off)
        : await keywordPage(loaded.via === 'filters-only' ? { ...filters, q: '' } : filters, sort, off)
      if (id !== request.current) return
      if ('rows' in next) {
        const seen = new Set(loaded.rows.map((r) => r.id))
        setLoaded({ ...loaded, total: next.total, rows: [...loaded.rows, ...next.rows.filter((r) => !seen.has(r.id))] })
      } else setNotice('Could not load more smart-search results just now. Please try again in a moment.')
    } catch (err) {
      setNotice(`Could not load more: ${(err as Error).message}`)
    }
    setLoadingMore(false)
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    apply({ filters: { ...filters, q: draft } })
  }

  const chips = activeChips(mode === 'semantic' ? { ...filters, q: '' } : filters)
  const filterCount = activeChips({ ...filters, q: '' }).length
  const cities = Object.keys(facets?.cities ?? {})
  const total = loaded?.total ?? 0
  const noun = total === 1 ? 'creator' : 'creators'

  return (
    <PageContainer>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Discover</p>
        <h1 className="display mt-2 text-3xl sm:text-5xl">Find AI creators</h1>
      </header>

      {/* Search box + mode */}
      <Card className="mt-6 !p-4 sm:!p-5">
        <Tabs tabs={MODES} active={mode} onChange={(m: Mode) => apply({ mode: m, filters: { ...filters, q: draft } })} />
        <form onSubmit={onSubmit} role="search" className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={mode === 'keyword' ? 'Search creators by keyword' : 'Describe what you need'}
            placeholder={mode === 'keyword' ? 'Name, tool, skill, city, style… e.g. Kling, lip sync, Mumbai, festive' : 'e.g. dreamy anime-style product reel for a skincare brand'}
            maxLength={200}
            className="h-14 flex-1 min-w-0 rounded-btn bg-white px-4 text-base ring-[1.5px] ring-inset ring-ink/25 placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <Button type="submit" size="lg">Search</Button>
        </form>
        {mode === 'semantic' ? (
          <div className="mt-3">
            <p className="text-xs text-ink-soft">Describe the piece in plain language. BRIVIO compares it with every creator's profile and portfolio and ranks the closest. Try:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => apply({ filters: { ...filters, q: e } })} className="rounded-lg bg-ink/[0.06] px-2.5 py-1 text-left text-xs font-semibold hover:bg-ink hover:text-cream">
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-soft">Searches names, headlines, bios, cities, specializations, skills, tools and portfolio titles, descriptions and style tags. Every word must match.</p>
        )}
      </Card>

      {/* Count, filters button, sort */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="display text-lg sm:text-xl" aria-live="polite">
          {loaded ? <>{total} {noun}{loaded.via === 'semantic' && <span className="ml-2 font-sans text-sm font-semibold normal-case tracking-normal text-ink-soft">closest to your description first</span>}</> : 'Searching…'}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="dark" size="sm" className="lg:hidden" onClick={() => setDrawer(true)}>
            Filters{filterCount ? ` (${filterCount})` : ''}
          </Button>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={loaded?.via === 'semantic' ? 'best' : sort}
              disabled={loaded?.via === 'semantic'}
              onChange={(e) => apply({ sort: e.target.value as Sort })}
              aria-label="Sort results"
              className="h-9 rounded-btn bg-cream px-3 pr-7 text-sm font-semibold normal-case tracking-normal ring-[1.5px] ring-inset ring-ink/25 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
            >
              {loaded?.via === 'semantic' ? <option value="best">Closest match</option> : SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Active filters */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilters(withoutChip(filters, c))}
              aria-label={`Remove filter ${c.label}`}
              className="group inline-flex items-center gap-1.5 rounded-lg bg-ink text-cream pl-2.5 pr-1.5 py-1 text-xs font-semibold hover:bg-brand"
            >
              {c.label}
              <span className="flex h-4 w-4 items-center justify-center rounded bg-cream/20 leading-none" aria-hidden>×</span>
            </button>
          ))}
          <button type="button" onClick={() => apply({ filters: { ...EMPTY_FILTERS, q: mode === 'semantic' ? filters.q : '' } })} className="ml-1 text-xs font-bold underline underline-offset-4 hover:text-brand">
            Clear all
          </button>
        </div>
      )}

      {notice && <div className="mt-4"><Notice>{notice}</Notice></div>}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[18.5rem_minmax(0,1fr)] gap-6 items-start">
        {/* Desktop filter panel */}
        <aside className="hidden lg:block" aria-label="Filters">
          <Card className="!p-5">
            <h2 className="display text-lg mb-4">Filters</h2>
            <FilterPanel filters={filters} facets={facets} onChange={setFilters} />
          </Card>
        </aside>

        {/* Results */}
        <div className="min-w-0">
          {error ? (
            <EmptyState title="Search is not available" body={error} />
          ) : !loaded ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" role="status" aria-label="Loading results">
              {Array.from({ length: 6 }, (_, i) => <ResultSkeleton key={i} />)}
            </div>
          ) : total === 0 && chips.length === 0 ? (
            <EmptyState title="No creators yet" body="Check back soon — new AI creators are joining." />
          ) : total === 0 ? (
            <EmptyResults
              filters={loaded.via === 'keyword' ? filters : { ...filters, q: '' }}
              cities={cities}
              onApply={(f) => apply({ filters: f })}
              onTrySemantic={mode === 'keyword' ? () => apply({ mode: 'semantic' }) : undefined}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {loaded.rows.map((row) => <SearchResultCard key={row.id} row={row} filters={filters} />)}
              </div>
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-sm text-ink-soft">Showing {loaded.rows.length} of {total} {noun}</p>
                {loaded.rows.length < total && (
                  <Button variant="dark" onClick={loadMore} disabled={loadingMore}>{loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_SIZE, total - loaded.rows.length)} more`}</Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-ink/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-paper shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="display text-lg">Filters</h2>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close filters" className="h-10 w-10 rounded-btn bg-ink text-cream text-lg">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <FilterPanel filters={filters} facets={facets} onChange={setFilters} />
            </div>
            <div className="flex gap-2 border-t border-line px-5 py-4">
              <Button variant="outline" onClick={() => apply({ filters: { ...EMPTY_FILTERS, q: filters.q } })}>Clear</Button>
              <Button full onClick={() => setDrawer(false)}>{loaded ? `Show ${total} ${noun}` : 'Show results'}</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
