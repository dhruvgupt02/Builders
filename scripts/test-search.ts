// npm run test:search — accuracy tests for creator search.
//
// Every case calls the real SQL functions through the public (anon, logged-out) API and compares the answer with
// an INDEPENDENT computation done here in TypeScript from the base tables (creators, portfolio_items,
// verifications), read with the service role. Nothing below reuses the SQL logic.
import { createClient } from '@supabase/supabase-js'
import { adminClient, requireEnv } from './env.js'
import { EMPTY_FILTERS, FACET_OPTIONS, filtersJson, searchArgs, type Facets, type Filters, type Group, type SearchResult, type SearchRow, type Sort } from '../src/lib/search.js'
import { TOOLS } from '../src/lib/taxonomy.js'

const admin = adminClient()
const anon = createClient(requireEnv('SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

// ───────────── base data + independent model ─────────────

interface Model {
  id: string
  name: string
  headline: string
  bio: string
  city: string | null
  specializations: string[]
  skills: string[]
  tools: string[]
  price_min: number | null
  price_max: number | null
  created_at: string
  contentTypes: Set<string>
  aspectRatios: Set<string>
  itemCount: number
  verifiedCount: number
  verifiedTools: Set<string>
  verifiedWorkflow: boolean
  verifiedPastWork: boolean
  commercialReady: boolean
  portfolioText: string
}

async function all<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return rows
  }
}

const creators = await all<any>('creators', 'id,name,headline,bio,city,specializations,skills,tools,price_min,price_max,created_at')
const items = await all<any>('portfolio_items', 'id,creator_id,title,description,style_tags,content_type,aspect_ratio,commercial_use_status')
const verifications = await all<any>('verifications', 'id,creator_id,type,label,status')

const models: Model[] = creators.map((c) => {
  const mine = items.filter((i) => i.creator_id === c.id)
  const verified = verifications.filter((v) => v.creator_id === c.id && v.status === 'verified')
  return {
    ...c,
    headline: c.headline ?? '', bio: c.bio ?? '',
    contentTypes: new Set(mine.map((i) => i.content_type).filter(Boolean)),
    aspectRatios: new Set(mine.map((i) => i.aspect_ratio).filter(Boolean)),
    itemCount: mine.length,
    verifiedCount: verified.length,
    verifiedTools: new Set(verified.filter((v) => v.type === 'tool' && v.label).map((v) => v.label)),
    verifiedWorkflow: verified.some((v) => v.type === 'workflow'),
    verifiedPastWork: verified.some((v) => v.type === 'past_work'),
    commercialReady: mine.some((i) => i.commercial_use_status === 'licensed' || i.commercial_use_status === 'client_delivered'),
    portfolioText: mine.map((i) => [i.title, i.description, ...(i.style_tags ?? [])].filter(Boolean).join(' ')).join(' ').toLowerCase(),
  }
})

const any = (have: Iterable<string>, want: string[]) => want.length === 0 || want.some((w) => [...have].includes(w))
const every = (have: string[], want: string[]) => want.every((w) => have.includes(w))

function textMatches(m: Model, q: string) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = [m.name, m.headline, m.bio, m.city ?? '', ...m.specializations, ...m.skills, ...m.tools].join(' \u0000 ').toLowerCase() + ' \u0000 ' + m.portfolioText
  return words.every((w) => haystack.includes(w))
}

/** The rules from the spec, written from scratch. */
function expected(f: Filters): Model[] {
  return models.filter(
    (m) =>
      any(m.skills, f.skills) &&
      (f.tools.length === 0 || (f.match_all_tools && f.tools.length > 1 ? every(m.tools, f.tools) : any(m.tools, f.tools))) &&
      any(m.specializations, f.specializations) &&
      any(m.contentTypes, f.content_types) &&
      any(m.aspectRatios, f.aspect_ratios) &&
      (f.cities.length === 0 || (m.city !== null && f.cities.includes(m.city))) &&
      (f.budget_max === null || (m.price_min !== null && m.price_min <= f.budget_max)) &&
      (!f.commercial_ready || m.commercialReady) &&
      (!f.verified_only || m.verifiedCount > 0) &&
      (!f.q.trim() || textMatches(m, f.q)),
  )
}

// ───────────── harness ─────────────

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn()
    passed++
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`)
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}
const F = (partial: Partial<Filters>): Filters => ({ ...EMPTY_FILTERS, ...partial })
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort()
const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function search(f: Filters, sort: Sort = 'best', lim = 1000, off = 0): Promise<SearchResult> {
  const { data, error } = await anon.rpc('search_creators', searchArgs(f, sort, lim, off))
  if (error) throw new Error(`search_creators: ${error.message}`)
  return data as SearchResult
}
async function facets(f: Filters): Promise<Facets> {
  const { data, error } = await anon.rpc('search_facets', { filters: filtersJson(f), options: FACET_OPTIONS })
  if (error) throw new Error(`search_facets: ${error.message}`)
  return data as Facets
}

/** Results must be exactly the independently computed set, and the total must equal its size. */
async function checkSet(f: Filters, perRow?: (row: SearchRow) => string | null) {
  const want = expected(f)
  const got = await search(f)
  assert(got.total === want.length, `total ${got.total}, manual count ${want.length}`)
  assert(same(ids(got.rows), ids(want)), `result ids differ: got ${got.rows.length} rows, expected ${want.length}`)
  for (const row of got.rows) {
    const problem = perRow?.(row)
    assert(!problem, `${row.name}: ${problem}`)
  }
  return `${want.length} of ${models.length} creators`
}

/** Pick values that actually occur, so the tests are meaningful on any data set. */
const byFrequency = (values: string[]) => [...new Set(values)].sort((a, b) => values.filter((v) => v === b).length - values.filter((v) => v === a).length || a.localeCompare(b))
const toolsUsed = byFrequency(models.flatMap((m) => m.tools))
const skillsUsed = byFrequency(models.flatMap((m) => m.skills))
const specsUsed = byFrequency(models.flatMap((m) => m.specializations))
const typesUsed = byFrequency(models.flatMap((m) => [...m.contentTypes]))
const ratiosUsed = byFrequency(models.flatMap((m) => [...m.aspectRatios]))
const citiesUsed = byFrequency(models.map((m) => m.city).filter((c): c is string => !!c))
const [toolA, toolB] = toolsUsed
const rareTool = toolsUsed[toolsUsed.length - 1]

console.log(`Data: ${models.length} creators, ${items.length} portfolio items, ${verifications.length} verifications. Calling the API logged out.\n`)

// ───────────── view ─────────────

await test('creator_search view: one row per creator with correct aggregates', async () => {
  const { data, error } = await anon.from('creator_search').select('*').limit(5000)
  if (error) throw new Error(error.message)
  assert(data.length === models.length, `${data.length} rows, ${models.length} creators`)
  for (const m of models) {
    const row = data.find((r) => r.id === m.id)
    assert(row, `${m.name} missing from view`)
    assert(same([...row.content_types].sort(), [...m.contentTypes].sort()), `${m.name}: content_types ${row.content_types} vs ${[...m.contentTypes]}`)
    assert(same([...row.aspect_ratios].sort(), [...m.aspectRatios].sort()), `${m.name}: aspect_ratios differ`)
    assert(row.item_count === m.itemCount, `${m.name}: item_count ${row.item_count} vs ${m.itemCount}`)
    assert(row.verification_count === m.verifiedCount, `${m.name}: verification_count ${row.verification_count} vs ${m.verifiedCount}`)
    assert(same([...row.verified_tool_labels].sort(), [...m.verifiedTools].sort()), `${m.name}: verified_tool_labels differ`)
    assert(row.has_verified_workflow === m.verifiedWorkflow && row.has_verified_past_work === m.verifiedPastWork, `${m.name}: verified flags differ`)
    assert(row.commercial_ready === m.commercialReady, `${m.name}: commercial_ready ${row.commercial_ready} vs ${m.commercialReady}`)
    assert(!('embedding' in row), 'view should not expose embeddings')
  }
})

// ───────────── filters ─────────────

await test('no filters returns every creator', () => checkSet(F({})))

await test(`single tool (${toolA}): every result really has it`, () =>
  checkSet(F({ tools: [toolA] }), (r) => (r.tools.includes(toolA) ? null : `does not list ${toolA}`)))

await test(`two tools, any (${toolA} or ${rareTool}): every result has at least one`, () =>
  checkSet(F({ tools: [toolA, rareTool] }), (r) => (r.tools.includes(toolA) || r.tools.includes(rareTool) ? null : 'has neither tool')))

await test(`match all tools (${toolA} and ${toolB}): every result has both, and it is narrower than "any"`, async () => {
  const detail = await checkSet(F({ tools: [toolA, toolB], match_all_tools: true }), (r) => (r.tools.includes(toolA) && r.tools.includes(toolB) ? null : 'is missing one of the tools'))
  const anyCount = expected(F({ tools: [toolA, toolB] })).length
  const allCount = expected(F({ tools: [toolA, toolB], match_all_tools: true })).length
  assert(allCount <= anyCount, 'match-all returned more than match-any')
  return `${detail}; any-of gives ${anyCount}`
})

await test(`skills, any of two (${skillsUsed[0]} or ${skillsUsed[1]})`, () =>
  checkSet(F({ skills: [skillsUsed[0], skillsUsed[1]] }), (r) => (r.skills.some((s) => [skillsUsed[0], skillsUsed[1]].includes(s)) ? null : 'has neither skill')))

await test(`specialization + aspect ratio (${specsUsed[0]} + ${ratiosUsed[0]}): AND across groups`, () =>
  checkSet(F({ specializations: [specsUsed[0]], aspect_ratios: [ratiosUsed[0]] }), (r) =>
    !r.specializations.includes(specsUsed[0]) ? 'wrong specialization' : !r.aspect_ratios.includes(ratiosUsed[0]) ? 'no portfolio piece in that ratio' : null))

await test(`content type + city (${typesUsed[1] ?? typesUsed[0]} in ${citiesUsed[0]})`, () =>
  checkSet(F({ content_types: [typesUsed[1] ?? typesUsed[0]], cities: [citiesUsed[0]] }), (r) => (r.city === citiesUsed[0] ? null : `is in ${r.city}`)))

for (const budget of [5000, 12000]) {
  await test(`budget: price_min <= ${budget}`, () =>
    checkSet(F({ budget_max: budget }), (r) => (r.price_min !== null && r.price_min <= budget ? null : `starts at ${r.price_min}`)))
}

await test('commercial-ready + verified only', () =>
  checkSet(F({ commercial_ready: true, verified_only: true }), (r) => (!r.commercial_ready ? 'not commercial-ready' : r.verification_count < 1 ? 'not verified' : null)))

await test('impossible combination returns 0 (all 20 tools at once, under ₹1)', async () => {
  const f = F({ tools: [...TOOLS], match_all_tools: true, budget_max: 1 })
  assert(expected(f).length === 0, 'the manual count is not 0, pick another impossible case')
  const got = await search(f)
  assert(got.total === 0 && got.rows.length === 0, `returned total ${got.total}, ${got.rows.length} rows`)
  return '0 rows, total 0'
})

await test(`five filter groups combined (${toolA} + ${skillsUsed[0]} + ${ratiosUsed[0]} + budget + verified)`, () =>
  checkSet(F({ tools: [toolA], skills: [skillsUsed[0]], aspect_ratios: [ratiosUsed[0]], budget_max: 20000, verified_only: true })))

// ───────────── text ─────────────

await test(`text: "${toolA.toUpperCase()}" is case-insensitive and finds the tool`, () => checkSet(F({ q: toolA.toUpperCase() })))

const cityWord = citiesUsed[0].toLowerCase()
await test(`text: two words must both match ("${cityWord} ${specsUsed[0].split(' ').pop()}")`, () => checkSet(F({ q: `${cityWord} ${specsUsed[0].split(' ').pop()}` })))

const styleWord = items.flatMap((i) => i.style_tags ?? [])[0] as string
await test(`text: finds portfolio style tags ("${styleWord}") and titles`, async () => {
  const a = await checkSet(F({ q: styleWord }))
  const titleWord = (items[0].title as string).split(/\s+/)[0]
  const b = await checkSet(F({ q: titleWord }))
  return `"${styleWord}" ${a}; "${titleWord}" ${b}`
})

await test(`text + filters ("${cityWord}" + ${ratiosUsed[0]} + commercial-ready)`, () => checkSet(F({ q: cityWord, aspect_ratios: [ratiosUsed[0]], commercial_ready: true })))

await test('text: a nonsense word returns 0', async () => {
  const got = await search(F({ q: 'zzqxnonsenseword' }))
  assert(got.total === 0, `total ${got.total}`)
})

// ───────────── sorting, paging, matched ─────────────

await test('sorts: price low-high, price high-low, most verified, newest', async () => {
  const f = F({ tools: [toolA, toolB] })
  const inOrder = (rows: SearchRow[], key: (r: SearchRow) => number, dir: 1 | -1) => rows.every((r, i) => i === 0 || (key(rows[i - 1]) - key(r)) * dir <= 0)
  const asc = await search(f, 'price_asc')
  assert(inOrder(asc.rows, (r) => r.price_min ?? Infinity, 1), 'price_asc is not ascending by price_min')
  const desc = await search(f, 'price_desc')
  assert(inOrder(desc.rows, (r) => r.price_max ?? -Infinity, -1), 'price_desc is not descending by price_max')
  const ver = await search(f, 'verified')
  assert(inOrder(ver.rows, (r) => r.verification_count, -1), 'verified is not descending by verification_count')
  const newest = await search(f, 'newest')
  assert(inOrder(newest.rows, (r) => Date.parse(r.created_at), -1), 'newest is not descending by created_at')
  for (const r of [asc, desc, ver, newest]) assert(same(ids(r.rows), ids(expected(f))), 'a sort changed which creators are returned')
  return `${asc.total} rows in each order`
})

await test('best match: creators matching more selected values come first; "matched" is exact', async () => {
  const f = F({ tools: [toolA, toolB], aspect_ratios: [ratiosUsed[0]] })
  const got = await search(f)
  for (const r of got.rows) {
    const want = [...f.tools.filter((t) => r.tools.includes(t)), ...f.aspect_ratios.filter((a) => r.aspect_ratios.includes(a))]
    assert(same([...r.matched].sort(), [...want].sort()), `${r.name}: matched ${JSON.stringify(r.matched)}, expected ${JSON.stringify(want)}`)
  }
  assert(got.rows.every((r, i) => i === 0 || got.rows[i - 1].matched.length >= r.matched.length), 'not ordered by number of matched values')
  return `${got.total} rows`
})

await test('paging: pages do not overlap, add up to the full list, total stays constant', async () => {
  const f = F({})
  const full = await search(f, 'price_asc')
  const p1 = await search(f, 'price_asc', 5, 0)
  const p2 = await search(f, 'price_asc', 5, 5)
  assert(p1.total === full.total && p2.total === full.total, 'total changed between pages')
  assert(same([...p1.rows, ...p2.rows].map((r) => r.id), full.rows.slice(0, 10).map((r) => r.id)), 'pages 1+2 are not the first 10 rows of the full list')
  const beyond = await search(f, 'price_asc', 5, 10000)
  assert(beyond.rows.length === 0 && beyond.total === full.total, 'offset past the end should give no rows but the same total')
})

await test('result cards carry up to 3 real thumbnails of that creator, preferring the selected aspect ratio', async () => {
  const ratio = ratiosUsed[ratiosUsed.length - 1]
  const got = await search(F({ aspect_ratios: [ratio] }))
  for (const r of got.rows) {
    const mine = items.filter((i) => i.creator_id === r.id)
    assert(r.thumbs.length === Math.min(3, mine.length), `${r.name}: ${r.thumbs.length} thumbs for ${mine.length} items`)
    assert(r.thumbs.every((t) => mine.some((i) => i.id === t.id)), `${r.name}: a thumbnail belongs to someone else`)
    assert(r.thumbs[0].aspect_ratio === ratio, `${r.name}: first thumbnail is ${r.thumbs[0].aspect_ratio}, expected a ${ratio} piece first`)
  }
  return `${got.total} cards checked`
})

// ───────────── facets ─────────────

/** Independent facet count: results if this option were added to the current filters. */
function expectedFacet(f: Filters, group: Group, value: string) {
  return expected({ ...f, [group]: f[group].includes(value) ? f[group] : [...f[group], value] }).length
}

async function checkFacets(f: Filters) {
  const got = await facets(f)
  assert(got.total === expected(f).length, `facets.total ${got.total}, manual ${expected(f).length}`)
  let checked = 0
  const groups: [Group, readonly string[]][] = [...(Object.entries(FACET_OPTIONS) as [Group, readonly string[]][]), ['cities', citiesUsed]]
  for (const [group, options] of groups)
    for (const option of options) {
      const want = expectedFacet(f, group, option)
      const have = got[group][option]
      assert(have === want, `${group} "${option}": facet says ${have}, manual count ${want}`)
      checked++
    }
  assert(got.commercial_ready === expected({ ...f, commercial_ready: true }).length, 'commercial_ready count differs')
  assert(got.verified_only === expected({ ...f, verified_only: true }).length, 'verified_only count differs')
  return `${checked + 2} option counts`
}

await test('facet counts with no filters match manual counts for every taxonomy option and city', () => checkFacets(F({})))
await test(`facet counts with filters active (${toolA} + ${ratiosUsed[0]} + budget 30000)`, () => checkFacets(F({ tools: [toolA], aspect_ratios: [ratiosUsed[0]], budget_max: 30000 })))
await test(`facet counts with match-all tools and a text query ("${cityWord}")`, () => checkFacets(F({ tools: [toolA, toolB], match_all_tools: true, q: cityWord })))
await test('facet counts with toggles on and two specializations', () => checkFacets(F({ specializations: specsUsed.slice(0, 2), commercial_ready: true, verified_only: true })))

await test('a facet count equals the result count you get after clicking that option', async () => {
  const f = F({ specializations: [specsUsed[0]], budget_max: 40000 })
  const got = await facets(f)
  const picks: [Group, string][] = [['tools', toolA], ['tools', rareTool], ['skills', skillsUsed[0]], ['aspect_ratios', ratiosUsed[0]], ['content_types', typesUsed[0]], ['cities', citiesUsed[0]], ['specializations', specsUsed[1]]]
  for (const [group, value] of picks) {
    const clicked = await search({ ...f, [group]: [...f[group], value] }, 'best', 0)
    assert(clicked.total === got[group][value], `${group} "${value}": shown ${got[group][value]}, after clicking ${clicked.total}`)
  }
  return `${picks.length} options clicked`
})

// ───────────── empty-results helpers ─────────────

await test('closest matches: never a full match, and "missed" is exactly the failed filter groups', async () => {
  const f = F({ tools: [toolA], aspect_ratios: [ratiosUsed[0]], cities: [citiesUsed[citiesUsed.length - 1]], budget_max: 4000 })
  const { data, error } = await anon.rpc('search_closest', { filters: filtersJson(f), lim: 50 })
  if (error) throw new Error(error.message)
  const rows = data as SearchRow[]
  const full = new Set(expected(f).map((m) => m.id))
  assert(rows.length > 0, 'no closest matches returned')
  for (const r of rows) {
    assert(!full.has(r.id), `${r.name} is a full match but was listed as "closest"`)
    const m = models.find((x) => x.id === r.id)!
    const want = [
      !m.tools.includes(toolA) && 'tools',
      !m.aspectRatios.has(ratiosUsed[0]) && 'aspect_ratios',
      m.city !== f.cities[0] && 'cities',
      !(m.price_min !== null && m.price_min <= 4000) && 'budget',
    ].filter(Boolean) as string[]
    assert(same(r.missed!.map((x) => x.group).sort(), want.sort()), `${r.name}: missed ${r.missed!.map((x) => x.group)}, expected ${want}`)
    assert(r.satisfied === 4 - want.length, `${r.name}: satisfied ${r.satisfied}`)
  }
  assert(rows.every((r, i) => i === 0 || rows[i - 1].missed!.length <= r.missed!.length), 'not ordered by fewest missed filters')
  return `${rows.length} near matches`
})

await test('"remove one filter" counts equal the manual count without that filter', async () => {
  const f = F({ tools: [...TOOLS].slice(0, 3), match_all_tools: true, aspect_ratios: [ratiosUsed[ratiosUsed.length - 1]], budget_max: 6000 })
  const variants: [string, Filters][] = [
    ['without budget', { ...f, budget_max: null }],
    ['without aspect ratio', { ...f, aspect_ratios: [] }],
    ...f.tools.map((t): [string, Filters] => [`without ${t}`, { ...f, tools: f.tools.filter((x) => x !== t) }]),
  ]
  for (const [label, v] of variants) {
    const got = await search(v, 'best', 0)
    assert(got.total === expected(v).length, `${label}: ${got.total} vs manual ${expected(v).length}`)
  }
  return `${variants.length} variants`
})

// ───────────── semantic ─────────────

await test('match_creators: a creator\'s own embedding ranks that creator first at ~100%', async () => {
  const { data: withEmbedding } = await admin.from('creators').select('id,name,embedding').not('embedding', 'is', null).limit(3)
  assert(withEmbedding && withEmbedding.length > 0, 'no creators have embeddings; run npm run embed')
  for (const c of withEmbedding) {
    const { data, error } = await anon.rpc('match_creators', { query_embedding: c.embedding, lim: 5 })
    if (error) throw new Error(error.message)
    assert(data[0].creator_id === c.id, `${c.name}: top match is someone else`)
    assert(data[0].similarity > 0.999, `${c.name}: similarity ${data[0].similarity}`)
    assert(data.every((r: any, i: number) => i === 0 || data[i - 1].similarity >= r.similarity), 'not ordered by similarity')
  }
  return `${withEmbedding.length} creators`
})

await test('search_semantic: honours filters and returns the best-matching portfolio item', async () => {
  const { data: one } = await admin.from('portfolio_items').select('id,creator_id,embedding').not('embedding', 'is', null).limit(1).single()
  assert(one, 'no portfolio items have embeddings; run npm run embed')
  const f = F({ tools: [toolA] })
  const { data, error } = await anon.rpc('search_semantic', { query_embedding: one.embedding, filters: filtersJson(f), lim: 100, off: 0 })
  if (error) throw new Error(error.message)
  const res = data as SearchResult
  const allowed = new Set(expected(f).map((m) => m.id))
  assert(res.rows.every((r) => allowed.has(r.id)), 'a semantic result does not pass the filters')
  const unfiltered = (await anon.rpc('search_semantic', { query_embedding: one.embedding, filters: {}, lim: 3, off: 0 })).data as SearchResult
  assert(unfiltered.rows[0].id === one.creator_id, 'the owner of the item used as the query is not the top result')
  assert(unfiltered.rows[0].best_item?.id === one.id, 'best_item is not the item used as the query')
  assert(unfiltered.rows[0].similarity! > 0.999, `similarity ${unfiltered.rows[0].similarity}`)
  return `${res.total} filtered results`
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
