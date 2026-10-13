// npm run test:briefs — tests for the AI Brief Builder and for brief ownership rules.
//
// Part 1 runs the real builder (Gemini) on varied rough ideas and checks every response: it parses, every
// fixed-list value is in the taxonomy, every required field is present (given or assumed, with the assumption
// listed), and the deliverables fit the idea.
// Part 2 checks through the public API that only the owner can change a brief and that drafts stay private.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, requireEnv } from './env.js'
import { runBriefBuilder, runBriefCheck, type BuilderInput } from '../api/_lib/brief-ai.js'
import { builderProblems, deliverableTotal, emptyBrief, formatDeliverable, newDeliverable, publishProblems, ruleChecks, toRows, type BuilderResult } from '../src/lib/brief.js'

requireEnv('GEMINI_API_KEY')

let passed = 0
let failed = 0
async function test(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = await fn()
    passed++
    console.log(`PASS  ${name}${detail ? `\n      ${detail}` : ''}`)
  } catch (err) {
    failed++
    console.log(`FAIL  ${name}\n      ${(err as Error).message}`)
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message)
}

// ───────────── Part 1: the builder ─────────────

interface Case {
  name: string
  input: BuilderInput
  /** Checks specific to this idea. Return a problem, or null if fine. */
  expect: (r: BuilderResult) => string | null
}

const hasDeliverable = (r: BuilderResult, test: (d: BuilderResult['brief']['deliverables'][number]) => boolean) => r.brief.deliverables.some(test)
const assumes = (r: BuilderResult, field: string) => r.assumptions.some((a) => a.field.toLowerCase().includes(field))

const CASES: Case[] = [
  {
    name: 'short reel idea (the placeholder example)',
    input: { idea: '30-sec Diwali reel for my candle brand, cosy and warm, for Instagram ads' },
    expect: (r) =>
      !hasDeliverable(r, (d) => d.content_type === 'Video' && d.aspect_ratio === '9:16' && d.duration_sec === 30) ? 'expected a 30s 9:16 video deliverable'
      : !r.brief.usage_platforms.includes('Paid social ads') ? 'expected Paid social ads (the idea says Instagram ads)'
      : !assumes(r, 'territory') ? 'territory was not given, so it should be listed as an assumption'
      : null,
  },
  {
    name: 'product stills with a stated quantity',
    input: { idea: 'We need 5 product photos of our new vitamin C serum for our website and marketplace listings. Clean white background, minimal, premium.' },
    expect: (r) =>
      !r.brief.deliverables.every((d) => d.content_type === 'Image' || d.content_type === 'Graphic design') ? 'expected still deliverables only'
      : deliverableTotal(r.brief) !== 5 ? `expected 5 stills in total, got ${deliverableTotal(r.brief)}`
      : r.brief.deliverables.some((d) => d.duration_sec) ? 'stills should have no duration'
      : !r.brief.usage_platforms.includes('Website') ? 'expected Website usage'
      : null,
  },
  {
    name: 'detailed launch with cutdowns, rights and tools',
    input: { idea: 'Launch film for our electric scooter: one 45 second film for YouTube ads and TV, plus three 15 second vertical cutdowns for Instagram reels. Futuristic, neon city at night. We need exclusive rights worldwide for 2 years. Must be made with Runway, and do not use Sora.' },
    expect: (r) =>
      !hasDeliverable(r, (d) => d.aspect_ratio === '16:9' && d.duration_sec === 45) ? 'expected a 45s 16:9 film'
      : !hasDeliverable(r, (d) => d.aspect_ratio === '9:16' && d.duration_sec === 15 && d.quantity === 3) ? 'expected 3 × 15s 9:16 cutdowns'
      : !r.brief.exclusivity ? 'expected exclusivity'
      : r.brief.territory !== 'Global' ? `expected Global territory, got ${r.brief.territory}`
      : r.brief.rights_duration !== '2 years' ? `expected 2 years, got ${r.brief.rights_duration}`
      : !r.brief.required_tools.includes('Runway') ? 'expected Runway as a required tool'
      : !r.brief.excluded_tools.includes('Sora') ? 'expected Sora as an excluded tool'
      : !['TV', 'YouTube ads'].every((p) => r.brief.usage_platforms.includes(p)) ? 'expected TV and YouTube ads usage'
      : assumes(r, 'territory') || assumes(r, 'exclusiv') ? 'territory and exclusivity were stated, so they must not be listed as assumptions'
      : null,
  },
  {
    name: 'print and billboard',
    input: { idea: 'billboard and a print poster for our cafe monsoon menu in Mumbai, playful illustration style, steaming chai and pakoras' },
    expect: (r) =>
      !hasDeliverable(r, (d) => d.content_type === 'Image' || d.content_type === 'Graphic design') ? 'expected a still deliverable for print'
      : !r.brief.usage_platforms.some((p) => p === 'OOH/billboards' || p === 'Print') ? 'expected OOH/billboards or Print usage'
      : ruleChecks(r.brief).some((c) => c.kind === 'conflict') ? `the generated brief conflicts with itself: ${ruleChecks(r.brief).find((c) => c.kind === 'conflict')!.title}`
      : null,
  },
  {
    name: 'explainer with a stated length',
    input: { idea: 'animated explainer for our JEE maths course with a friendly AI presenter, in Hindi and English, 90 seconds, for YouTube' },
    expect: (r) =>
      !hasDeliverable(r, (d) => (d.content_type === 'Animation' || d.content_type === 'Video') && d.duration_sec === 90 && d.aspect_ratio === '16:9') ? 'expected a 90s 16:9 animation or video'
      : !r.brief.ai_voice_allowed ? 'an AI presenter needs AI voice allowed'
      : null,
  },
  {
    name: 'very vague idea in mixed Hindi-English',
    input: { idea: 'kuch cool sa chahiye for my clothing brand ke festive sale ke liye' },
    expect: (r) =>
      r.assumptions.length < 4 ? `a vague idea should come with several assumptions, got ${r.assumptions.length}`
      : r.questions.length < 1 ? 'a vague idea should come with at least one clarifying question'
      : null,
  },
  {
    name: 'brand name and budget supplied separately are used, not asked about',
    input: { idea: '30-sec Diwali reel for my candle brand, cosy and warm, for Instagram ads', brandName: 'Diya & Wick', budget: 25000 },
    expect: (r) =>
      r.brief.brand_name !== 'Diya & Wick' ? `brand name is "${r.brief.brand_name}"`
      : r.brief.budget_max !== 25000 ? `budget_max is ${r.brief.budget_max}, expected 25000`
      : r.questions.some((q) => /budget/i.test(q.field + q.question)) ? 'asked about budget although it was given'
      : null,
  },
  {
    name: 'answering clarifying questions refines the brief',
    input: {
      idea: '30-sec Diwali reel for my candle brand, cosy and warm, for Instagram ads',
      answers: [{ question: 'Where will this run?', answer: 'Worldwide' }, { question: 'Do you need exclusive rights?', answer: 'Yes, exclusive' }, { question: 'What is your budget?', answer: 'Around ₹40,000' }],
    },
    expect: (r) =>
      r.brief.territory !== 'Global' ? `territory is ${r.brief.territory}, expected Global after answering "Worldwide"`
      : !r.brief.exclusivity ? 'exclusivity should be on after answering yes'
      : !(r.brief.budget_max! >= 30000 && r.brief.budget_max! <= 50000) ? `budget_max ${r.brief.budget_max} does not reflect the answer`
      : assumes(r, 'territory') ? 'territory was answered, so it must not be an assumption'
      : null,
  },
]

console.log('Part 1: AI Brief Builder\n')
for (const c of CASES) {
  // The model is not deterministic. A case that fails is run once more; if the second attempt passes, the output
  // says so and shows why the first one failed, so flakiness stays visible.
  const attempt = async () => {
    const started = Date.now()
    const r = await runBriefBuilder(c.input) // throws if the response does not parse
    const problems = builderProblems(r) // taxonomy values, required fields, deliverables
    assert(problems.length === 0, `invalid brief: ${problems.join('; ')}`)
    const unfilled = publishProblems(r.brief).filter((p) => !r.assumptions.some((x) => x.field === p.field))
    assert(unfilled.length === 0, `required fields neither filled nor flagged: ${unfilled.map((p) => p.field).join(', ')}`)
    assert(r.brief.deliverables.length >= 1 && r.brief.deliverables.length <= 8, `${r.brief.deliverables.length} deliverables`)
    assert(r.assumptions.every((a) => a.field && a.note), 'an assumption is missing its field or note')
    assert(r.questions.length <= 3 && r.questions.every((q) => q.options.length >= 2), 'questions are malformed')
    const problem = c.expect(r)
    assert(!problem, problem ?? '')
    return [
      `"${r.brief.title}" · ${r.brief.deliverables.map(formatDeliverable).join(' + ')} · ${r.brief.usage_platforms.join(', ')} · ${r.brief.territory}, ${r.brief.rights_duration}`,
      `₹${r.brief.budget_min}–₹${r.brief.budget_max} · ${r.assumptions.length} assumptions · ${r.questions.length} questions${r.corrected.length ? ` · corrected: ${r.corrected.join(' | ')}` : ''} · ${r.model} · ${((Date.now() - started) / 1000).toFixed(1)}s`,
    ].join('\n      ')
  }
  await test(c.name, async () => {
    try {
      return await attempt()
    } catch (err) {
      const first = (err as Error).message
      return `${await attempt()}\n      NOTE: passed on the second attempt. The first attempt failed with: ${first}`
    }
  })
}

await test('server-side validation removes values that are not in the taxonomy', async () => {
  const { normalizeAiBrief } = await import('../src/lib/brief.js')
  const r = normalizeAiBrief(
    { title: 'x'.repeat(500), content_type: 'Hologram', required_tools: ['Runway', 'Photoshop'], territory: 'Mars', usage_platforms: ['TikTok', 'TV'], deliverables: [{ content_type: 'Video', aspect_ratio: '21:9', quantity: 999 }], budget_min: -5, questions: [{ question: 'q', options: ['only one'] }] },
    { idea: 'test idea' },
  )
  assert(builderProblems(r).length === 0, `still invalid after normalising: ${builderProblems(r).join('; ')}`)
  assert(r.brief.title.length <= 120, 'title was not trimmed')
  assert(!r.brief.required_tools.includes('Photoshop') && r.brief.required_tools.includes('Runway'), 'invalid tool kept or valid tool dropped')
  assert(r.brief.usage_platforms.join() === 'TV', `platforms: ${r.brief.usage_platforms}`)
  assert(r.brief.deliverables[0].aspect_ratio !== '21:9' && r.brief.deliverables[0].quantity === 1, 'invalid deliverable values kept')
  assert(r.corrected.length >= 4, `expected the removed values to be reported, got ${r.corrected.length}`)
  assert(r.questions.length === 0, 'a question with one option should be dropped')
  return `${r.corrected.length} values corrected and reported`
})

await test('"Check my brief" flags a 9:16-only brief used on TV and a low budget', async () => {
  const brief = { ...emptyBrief(), title: 'Test brief', brand_name: 'Test', goal: 'Sell more candles this Diwali', deadline: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), content_type: 'Video', style_tags: ['warm'],
    deliverables: [newDeliverable({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 30, quantity: 3 })], usage_platforms: ['TV'], territory: 'India', rights_duration: '1 year', ip_ownership: 'brand_owns', real_people_likeness: 'none', music_source: 'ai_generated', budget_min: 3000, budget_max: 6000 }
  const { items, aiAvailable } = await runBriefCheck(brief)
  assert(items.some((i) => i.kind === 'conflict' && /9:16/.test(i.title) && /TV/.test(i.title)), 'the 9:16 vs TV conflict was not reported')
  assert(items.some((i) => /budget seems low/i.test(i.title)), 'the low budget was not reported')
  return `${items.length} items (${items.filter((i) => i.kind === 'conflict').length} conflicts), AI review ${aiAvailable ? 'included' : 'unavailable, rules only'}`
})

// ───────────── Part 2: ownership ─────────────

console.log('\nPart 2: only the owner can change a brief\n')

const admin = adminClient()
const client = () => createClient(requireEnv('SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
async function signedIn(email: string): Promise<SupabaseClient> {
  const c = client()
  const { error } = await c.auth.signInWithPassword({ email, password: 'BrivioDemo123!' })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}
const owner = await signedIn('demo.brand@brivio.app')
const other = await signedIn('demo.creator@brivio.app') // any logged-in user who does not own the brief
const anon = client()

const { data: ownBrand } = await owner.from('brands').select('id').limit(1).single()
const rows = toRows({ ...emptyBrief(), title: 'Ownership test (safe to delete)', brand_name: 'Test', deliverables: [newDeliverable({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 15 })] })
const made = await owner.from('briefs').insert({ ...rows.brief, brand_id: ownBrand!.id, status: 'draft' }).select('id').single()
if (made.error) throw new Error(`could not create the test brief: ${made.error.message}`)
const briefId = made.data.id as string
await owner.from('brief_rights').insert({ brief_id: briefId, ...rows.rights })
await owner.from('brief_deliverables').insert(rows.deliverables.map((d) => ({ ...d, brief_id: briefId })))

try {
  await test('a draft is invisible to other users, with its rights and deliverables', async () => {
    const b = await other.from('briefs').select('id').eq('id', briefId)
    const r = await other.from('brief_rights').select('brief_id').eq('brief_id', briefId)
    const d = await other.from('brief_deliverables').select('id').eq('brief_id', briefId)
    assert(b.data?.length === 0 && r.data?.length === 0 && d.data?.length === 0, `non-owner sees ${b.data?.length} brief, ${r.data?.length} rights, ${d.data?.length} deliverables`)
    const mine = await owner.from('brief_deliverables').select('id').eq('brief_id', briefId)
    assert(mine.data?.length === 1, 'the owner cannot see their own draft deliverables')
  })

  await owner.from('briefs').update({ status: 'open' }).eq('id', briefId)

  await test('once open, other logged-in users can read it; logged-out visitors cannot', async () => {
    const b = await other.from('briefs').select('id, title').eq('id', briefId)
    const d = await other.from('brief_deliverables').select('id').eq('brief_id', briefId)
    const r = await other.from('brief_rights').select('brief_id').eq('brief_id', briefId)
    assert(b.data?.length === 1 && d.data?.length === 1 && r.data?.length === 1, 'a logged-in user cannot read an open brief in full')
    const a = await anon.from('briefs').select('id').eq('id', briefId)
    const ad = await anon.from('brief_deliverables').select('id').eq('brief_id', briefId)
    assert((a.data?.length ?? 0) === 0 && (ad.data?.length ?? 0) === 0, 'a logged-out visitor can read the brief')
  })

  await test('a non-owner cannot edit, close, or delete someone else\'s brief', async () => {
    const edit = await other.from('briefs').update({ title: 'HACKED', status: 'closed' }).eq('id', briefId).select('id')
    assert((edit.data?.length ?? 0) === 0, 'the update went through')
    const del = await other.from('briefs').delete().eq('id', briefId).select('id')
    assert((del.data?.length ?? 0) === 0, 'the delete went through')
    const { data: now } = await admin.from('briefs').select('title, status').eq('id', briefId).single()
    assert(now?.title === 'Ownership test (safe to delete)' && now.status === 'open', `brief was changed: ${JSON.stringify(now)}`)
  })

  await test('a non-owner cannot change its rights or deliverables', async () => {
    const r = await other.from('brief_rights').update({ territory: 'Global', exclusivity: true }).eq('brief_id', briefId).select('brief_id')
    assert((r.data?.length ?? 0) === 0, 'rights update went through')
    const add = await other.from('brief_deliverables').insert({ brief_id: briefId, position: 2, content_type: 'Image', aspect_ratio: '1:1' })
    assert(!!add.error, 'a deliverable was added')
    const upd = await other.from('brief_deliverables').update({ quantity: 50 }).eq('brief_id', briefId).select('id')
    const del = await other.from('brief_deliverables').delete().eq('brief_id', briefId).select('id')
    assert((upd.data?.length ?? 0) === 0 && (del.data?.length ?? 0) === 0, 'a deliverable was changed or deleted')
    const { data: d } = await admin.from('brief_deliverables').select('quantity').eq('brief_id', briefId)
    assert(d?.length === 1 && d[0].quantity === 1, 'deliverables were changed')
  })

  await test('a non-owner cannot create a brief under someone else\'s brand', async () => {
    const res = await other.from('briefs').insert({ title: 'Injected', brand_id: ownBrand!.id })
    assert(!!res.error, 'the insert went through')
  })

  await test('the owner can edit, change deliverables and delete', async () => {
    const edit = await owner.from('briefs').update({ title: 'Ownership test (edited)' }).eq('id', briefId).select('id, updated_at, created_at')
    assert(edit.data?.length === 1, 'the owner could not edit')
    assert(Date.parse(edit.data[0].updated_at) > Date.parse(edit.data[0].created_at), 'updated_at was not refreshed on edit')
    const d = await owner.from('brief_deliverables').delete().eq('brief_id', briefId).select('id')
    assert(d.data?.length === 1, 'the owner could not remove a deliverable')
    const del = await owner.from('briefs').delete().eq('id', briefId).select('id')
    assert(del.data?.length === 1, 'the owner could not delete')
  })
} finally {
  await admin.from('briefs').delete().eq('id', briefId)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
