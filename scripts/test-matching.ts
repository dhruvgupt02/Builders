// npm run test:matching — tests for match_creators_for_brief.
//
// Builds a throwaway brief and a set of throwaway creators that differ from a baseline creator in exactly one
// respect each, so every part of the score can be checked in isolation against the documented formula.
// Everything it creates is deleted at the end.
import { randomUUID } from 'node:crypto'
import { adminClient } from './env.js'
import { WEIGHTS, reasonFromBreakdown, type MatchResult } from '../src/lib/matching.js'

const db = adminClient()
const TAG = 'ZZ matching test'

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
const near = (a: number, b: number, tolerance = 0.11) => Math.abs(a - b) <= tolerance
const ok = (res: { error: { message: string } | null }, what: string) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
}

// ───────────── fixtures ─────────────

// Real vectors, so the style part behaves as in production. Every test creator gets the same item embedding,
// which makes their style score identical and lets the other parts be compared exactly.
const { data: anyItem } = await db.from('portfolio_items').select('embedding').not('embedding', 'is', null).limit(1).single()
const { data: anyBrief } = await db.from('briefs').select('embedding, brand_id').not('embedding', 'is', null).limit(1).single()
if (!anyItem || !anyBrief) throw new Error('Needs embedded sample data. Run npm run seed and npm run embed first.')

const briefId = randomUUID()
const organicBriefId = randomUUID()
const bareBriefId = randomUUID()
const REQUIRED = ['Runway', 'Kling']
const EXCLUDED = ['Sora']
const BUDGET = { min: 20000, max: 40000 }
const DELIVERABLES = [
  { content_type: 'Video', aspect_ratio: '9:16' },
  { content_type: 'Video', aspect_ratio: '16:9' },
  { content_type: 'Image', aspect_ratio: '1:1' },
]

interface Spec {
  key: string
  tools: string[]
  price: [number, number] | null
  /** [content type, aspect ratio, tools, commercial status] per portfolio item */
  items: [string, string, string[], string][]
  verified?: ('tool' | 'workflow' | 'past_work')[]
}
const FULL_ITEMS: Spec['items'] = [
  ['Video', '9:16', ['Runway'], 'licensed'],
  ['Video', '16:9', ['Kling'], 'licensed'],
  ['Image', '1:1', ['Runway'], 'licensed'],
]
const base: Omit<Spec, 'key'> = { tools: ['Runway', 'Kling', 'Premiere Pro'], price: [25000, 35000], items: FULL_ITEMS }

const SPECS: Spec[] = [
  { key: 'baseline', ...base },
  { key: 'no_tools', ...base, tools: ['Premiere Pro'] },
  { key: 'one_tool', ...base, tools: ['Runway', 'Premiere Pro'] },
  // Sora in 2 of 3 items = "most of their work"
  { key: 'relies_on_excluded', ...base, tools: ['Runway', 'Kling', 'Sora'], items: [['Video', '9:16', ['Runway', 'Sora'], 'licensed'], ['Video', '16:9', ['Kling', 'Sora'], 'licensed'], ['Image', '1:1', ['Runway'], 'licensed']] },
  // Sora in 1 of 3 items is not "most"
  { key: 'excluded_once', ...base, tools: ['Runway', 'Kling', 'Sora'], items: [['Video', '9:16', ['Runway', 'Sora'], 'licensed'], ['Video', '16:9', ['Kling'], 'licensed'], ['Image', '1:1', ['Runway'], 'licensed']] },
  { key: 'over_budget_25pct', ...base, price: [50000, 60000] },
  { key: 'over_budget_2x', ...base, price: [80000, 100000] },
  { key: 'under_budget_half', ...base, price: [5000, 10000] },
  { key: 'edge_of_budget', ...base, price: [40000, 90000] },
  { key: 'no_price', ...base, price: null },
  { key: 'formats_2_of_3', ...base, items: FULL_ITEMS.slice(0, 2) },
  { key: 'formats_1_of_3', ...base, items: FULL_ITEMS.slice(0, 1) },
  // right content type, wrong aspect ratio: must not count
  { key: 'formats_wrong_ratio', ...base, items: [['Video', '4:5', ['Runway'], 'licensed'], ['Image', '16:9', ['Kling'], 'licensed']] },
  { key: 'not_commercial', ...base, items: FULL_ITEMS.map(([c, a, t]) => [c, a, t, 'personal']) },
  { key: 'fully_verified', ...base, verified: ['tool', 'workflow', 'past_work'] },
  { key: 'tool_verified_only', ...base, verified: ['tool'] },
]

const ids = new Map<string, string>()

async function setup() {
  await cleanup()
  const brief = (id: string, extra: object) => ({
    id, brand_id: anyBrief!.brand_id, title: `${TAG} brief`, status: 'draft', brand_name: TAG, content_type: 'Video',
    required_tools: REQUIRED, excluded_tools: EXCLUDED, budget_min: BUDGET.min, budget_max: BUDGET.max, embedding: anyBrief!.embedding, ...extra,
  })
  ok(await db.from('briefs').insert([
    brief(briefId, {}),
    brief(organicBriefId, {}),
    brief(bareBriefId, { required_tools: [], excluded_tools: [], budget_min: null, budget_max: null, embedding: null }),
  ]), 'insert briefs')
  ok(await db.from('brief_rights').insert([
    { brief_id: briefId, usage_platforms: ['Paid social ads', 'Organic social'] },
    { brief_id: organicBriefId, usage_platforms: ['Organic social'] },
  ]), 'insert rights')
  ok(await db.from('brief_deliverables').insert([briefId, organicBriefId].flatMap((b) => DELIVERABLES.map((d, i) => ({ brief_id: b, position: i + 1, quantity: 1, ...d })))), 'insert deliverables')

  for (const spec of SPECS) {
    const id = randomUUID()
    ids.set(spec.key, id)
    ok(await db.from('creators').insert({
      id, name: `${TAG} ${spec.key}`, headline: 'Test creator', city: 'Testville', tools: spec.tools, skills: [], specializations: [],
      price_min: spec.price?.[0] ?? null, price_max: spec.price?.[1] ?? null, is_sample: false,
    }), `insert creator ${spec.key}`)
    ok(await db.from('portfolio_items').insert(spec.items.map(([content_type, aspect_ratio, tools, status], i) => ({
      creator_id: id, title: `${spec.key} item ${i + 1}`, media_type: 'image', content_type, aspect_ratio, tools, commercial_use_status: status, embedding: anyItem!.embedding,
    }))), `insert items ${spec.key}`)
    if (spec.verified?.length)
      ok(await db.from('verifications').insert(spec.verified.map((type) => ({ creator_id: id, type, label: type === 'tool' ? 'Runway' : 'test', status: 'verified', verified_by: 'manual' }))), `insert verifications ${spec.key}`)
  }
}

async function cleanup() {
  await db.from('briefs').delete().eq('brand_name', TAG)
  await db.from('creators').delete().like('name', `${TAG}%`)
}

interface Row {
  creator_id: string
  score: number
  tools_fit: number
  format_fit: number
  style_fit: number
  budget_fit: number
  commercial_fit: number
  verification_fit: number
  best_item_id: string | null
  details: Record<string, any>
}
async function match(brief = briefId, lim = 1000): Promise<Row[]> {
  const { data, error } = await db.rpc('match_creators_for_brief', { brief_id: brief, lim })
  if (error) throw new Error(error.message)
  return data as Row[]
}
const pick = (rows: Row[], key: string) => {
  const row = rows.find((r) => r.creator_id === ids.get(key))
  if (!row) throw new Error(`${key} is missing from the results`)
  return row
}

// ───────────── tests ─────────────

try {
  await setup()
  const rows = await match()
  const B = pick(rows, 'baseline')
  console.log(`Fixture: 3 test briefs and ${SPECS.length} test creators alongside ${rows.length - SPECS.length} real ones.\n`)

  await test('every score is a whole number from 0 to 100, and each part stays within its weight', async () => {
    for (const r of rows) {
      assert(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, `score ${r.score}`)
      const parts: [number, number][] = [[r.tools_fit, WEIGHTS.tools], [r.format_fit, WEIGHTS.format], [r.style_fit, WEIGHTS.style], [r.budget_fit, WEIGHTS.budget], [r.commercial_fit, WEIGHTS.commercial], [r.verification_fit, WEIGHTS.verification]]
      for (const [value, max] of parts) assert(value >= 0 && value <= max, `a part is ${value}, outside 0..${max}`)
      const sum = parts.reduce((s, [v]) => s + Number(v), 0)
      assert(Math.abs(sum - r.score) <= 0.6, `score ${r.score} is not the rounded sum of its parts (${sum.toFixed(1)})`)
    }
    return `${rows.length} creators, scores ${Math.min(...rows.map((r) => r.score))} to ${Math.max(...rows.map((r) => r.score))}`
  })

  await test('the baseline creator gets full marks for tools, format, budget and commercial', async () => {
    assert(near(B.tools_fit, 25) && near(B.format_fit, 20) && near(B.budget_fit, 15) && near(B.commercial_fit, 10), JSON.stringify(B))
    assert(near(B.verification_fit, 0), `verification ${B.verification_fit} for an unverified creator`)
    return `score ${B.score}`
  })

  await test('a creator with all required tools outranks an otherwise identical one with none', async () => {
    const none = pick(rows, 'no_tools')
    const one = pick(rows, 'one_tool')
    assert(near(none.tools_fit, 0) && near(one.tools_fit, 12.5), `tools: none=${none.tools_fit}, one of two=${one.tools_fit}`)
    assert(B.score - none.score === 25 && B.score - one.score >= 12 && B.score - one.score <= 13, `score gaps: ${B.score - none.score} and ${B.score - one.score}`)
    for (const k of ['format_fit', 'style_fit', 'budget_fit', 'commercial_fit', 'verification_fit'] as const) assert(near(none[k], B[k]), `${k} differs although only tools changed`)
    const order = rows.map((r) => r.creator_id)
    assert(order.indexOf(ids.get('baseline')!) < order.indexOf(ids.get('one_tool')!) && order.indexOf(ids.get('one_tool')!) < order.indexOf(ids.get('no_tools')!), 'ranking order is wrong')
    assert(none.details.tools_missing.join() === REQUIRED.join() && one.details.tools_matched.join() === 'Runway', 'tools_matched / tools_missing are wrong')
    return `${B.score} vs ${one.score} (one tool) vs ${none.score} (none)`
  })

  await test('relying on an excluded tool lowers the score by 10; using it in a minority of pieces does not', async () => {
    const relies = pick(rows, 'relies_on_excluded')
    const once = pick(rows, 'excluded_once')
    assert(near(relies.tools_fit, 15) && B.score - relies.score === 10, `tools ${relies.tools_fit}, score gap ${B.score - relies.score}`)
    assert(relies.details.excluded_relied_on.join() === 'Sora', `excluded_relied_on: ${relies.details.excluded_relied_on}`)
    assert(near(once.tools_fit, 25) && once.score === B.score && once.details.excluded_relied_on.length === 0, `1 of 3 pieces should not count: tools ${once.tools_fit}`)
    return `${B.score} -> ${relies.score}`
  })

  await test('budget fit: full inside the budget, scaled by distance outside it', async () => {
    const edge = pick(rows, 'edge_of_budget') // 40,000 start vs 40,000 max: still overlapping
    const over25 = pick(rows, 'over_budget_25pct') // 50,000 start: 25% over -> 15 * 0.75
    const over2x = pick(rows, 'over_budget_2x') // 80,000 start: 100% over -> 0
    const under = pick(rows, 'under_budget_half') // tops out at 10,000 vs 20,000 min: 50% under -> 15 * (1 - 0.25)
    const none = pick(rows, 'no_price') // unknown price -> half marks
    assert(near(edge.budget_fit, 15), `edge of budget: ${edge.budget_fit}`)
    assert(near(over25.budget_fit, 11.3), `25% over: ${over25.budget_fit}, expected 11.25`)
    assert(near(over2x.budget_fit, 0), `2x over: ${over2x.budget_fit}`)
    assert(near(under.budget_fit, 11.3), `50% under: ${under.budget_fit}, expected 11.25`)
    assert(near(none.budget_fit, 7.5), `no price: ${none.budget_fit}`)
    assert(B.score > over25.score && over25.score > over2x.score, 'further over budget should rank lower')
    assert(B.details.within_budget === true && over25.details.within_budget === false, 'within_budget flag is wrong')
    return `in budget 15, 25% over ${over25.budget_fit}, 2x over ${over2x.budget_fit}, 50% under ${under.budget_fit}, unknown ${none.budget_fit}`
  })

  await test('format fit counts deliverables covered by BOTH content type and aspect ratio', async () => {
    const two = pick(rows, 'formats_2_of_3')
    const one = pick(rows, 'formats_1_of_3')
    const wrong = pick(rows, 'formats_wrong_ratio')
    assert(B.details.deliverables_covered === 3 && B.details.deliverable_count === 3, JSON.stringify(B.details))
    assert(two.details.deliverables_covered === 2 && near(two.format_fit, 13.3), `2 of 3: ${two.format_fit}`)
    assert(one.details.deliverables_covered === 1 && near(one.format_fit, 6.7), `1 of 3: ${one.format_fit}`)
    assert(wrong.details.deliverables_covered === 0 && near(wrong.format_fit, 0), `a Video 4:5 piece counted for a Video 9:16 deliverable: ${wrong.format_fit}`)
    return `3/3 = 20, 2/3 = ${two.format_fit}, 1/3 = ${one.format_fit}, wrong ratio = 0`
  })

  await test('commercial fit: needs commercial-ready work, unless the brief is organic social only', async () => {
    const paid = pick(rows, 'not_commercial')
    assert(near(paid.commercial_fit, 0) && near(B.commercial_fit, 10), `paid brief: ${paid.commercial_fit}`)
    const organic = pick(await match(organicBriefId), 'not_commercial')
    assert(near(organic.commercial_fit, 10), `organic-only brief: ${organic.commercial_fit}`)
  })

  await test('verification: tool 2, workflow 1.5, past work 1.5', async () => {
    assert(near(pick(rows, 'fully_verified').verification_fit, 5) && near(pick(rows, 'tool_verified_only').verification_fit, 2), 'verification points are wrong')
    assert(pick(rows, 'fully_verified').score === B.score + 5, 'a fully verified creator should score exactly 5 more')
  })

  await test('style fit is the same for creators with the same closest piece, and names a best-matching item', async () => {
    assert(SPECS.every((s) => near(pick(rows, s.key).style_fit, B.style_fit)), 'style differs between creators whose items share one embedding')
    assert(B.style_fit > 0 && B.style_fit <= 25 && typeof B.details.similarity === 'number', `style ${B.style_fit}, similarity ${B.details.similarity}`)
    const { data: item } = await db.from('portfolio_items').select('creator_id').eq('id', B.best_item_id!).single()
    assert(item?.creator_id === ids.get('baseline'), 'best_item_id does not belong to the creator')
    return `similarity ${B.details.similarity} -> ${B.style_fit} of 25`
  })

  await test('a brief with nothing to go on gives half marks, not zero, for the parts it cannot judge', async () => {
    const r = pick(await match(bareBriefId), 'baseline')
    assert(near(r.tools_fit, 25), `no required tools should be full marks: ${r.tools_fit}`)
    assert(near(r.style_fit, 12.5) && near(r.budget_fit, 7.5) && near(r.format_fit, 10), `style ${r.style_fit}, budget ${r.budget_fit}, format ${r.format_fit}`)
    assert(r.details.brief_embedded === false && r.best_item_id, 'should still suggest a portfolio piece')
  })

  await test('results are identical across two runs, in the same order', async () => {
    const again = await match()
    assert(JSON.stringify(again) === JSON.stringify(rows), 'the second run differs from the first')
    assert(rows.every((r, i) => i === 0 || rows[i - 1].score >= r.score), 'not sorted by score')
    return `${rows.length} rows compared`
  })

  await test('lim and only_creator: top N is a prefix of the full list; one creator alone gets the same score', async () => {
    const top5 = await match(briefId, 5)
    assert(JSON.stringify(top5) === JSON.stringify(rows.slice(0, 5)), 'lim 5 is not the first 5 of the full ranking')
    const { data } = await db.rpc('match_creators_for_brief', { brief_id: briefId, lim: 5, only_creator: ids.get('one_tool') })
    assert(data.length === 1 && JSON.stringify(data[0]) === JSON.stringify(pick(rows, 'one_tool')), 'only_creator returned something different')
  })

  await test('brief_matches returns the same ranking as cards, and the rule-based reason reads correctly', async () => {
    const { data, error } = await db.rpc('brief_matches', { brief_id: briefId, lim: 1000 })
    if (error) throw new Error(error.message)
    const result = data as MatchResult
    assert(result.brief_embedded === true, 'brief_embedded flag')
    assert(JSON.stringify(result.rows.map((r) => [r.id, r.score])) === JSON.stringify(rows.map((r) => [r.creator_id, r.score])), 'cards are not in the same order with the same scores')
    const card = result.rows.find((r) => r.id === ids.get('one_tool'))!
    assert(card.breakdown.tools === 12.5 && card.best_item?.id && card.thumbs.length === 3, JSON.stringify(card.breakdown))
    const reason = reasonFromBreakdown(card)
    assert(/Runway/.test(reason) && /Kling/.test(reason) && /budget/.test(reason), `reason: ${reason}`)
    const bad = reasonFromBreakdown(result.rows.find((r) => r.id === ids.get('relies_on_excluded'))!)
    assert(/Sora/.test(bad), `reason should mention the excluded tool: ${bad}`)
    return `"${reason}"`
  })
} finally {
  await cleanup()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
