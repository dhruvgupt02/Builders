// npm run test:flow — tests for verification and the engagement flow.
//
//   Part 1  AI evidence check: accepts a relevant tool screenshot, rejects an irrelevant image and a screenshot
//           of a different tool.
//   Part 2  Client confirmation links: single use, expiry, and who can create or read them.
//   Part 3  Engagements: only the brand and the invited creator can see or change one; each side can only make
//           its own moves; versions are numbered by the database.
//
// Parts 2 and 3 go through the public API as real signed-in users (and a logged-out visitor), so they exercise
// the database rules exactly as the app does. Everything created here is deleted at the end.
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { adminClient, requireEnv } from './env.js'
import { checkToolEvidence } from '../api/_lib/verify-ai.js'

const admin = adminClient()
const TAG = 'ZZ flow test'

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
const rowsOf = (res: { data: unknown }) => (Array.isArray(res.data) ? res.data.length : 0)

// ───────────── Part 1: AI evidence check ─────────────

/** A mock-up of a tool's account page, drawn here because the test needs a known "relevant screenshot". */
async function mockScreenshot(tool: string): Promise<Buffer> {
  const row = (y: number, name: string, kind: string, when: string) =>
    `<rect x="300" y="${y}" width="900" height="56" rx="8" fill="#1c1c22"/><rect x="316" y="${y + 10}" width="64" height="36" rx="4" fill="#3a3a46"/>
     <text x="400" y="${y + 34}" font-size="17" fill="#ffffff">${name}</text><text x="760" y="${y + 34}" font-size="15" fill="#9a9aa6">${kind}</text><text x="1060" y="${y + 34}" font-size="15" fill="#9a9aa6">${when}</text>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" font-family="Arial, Helvetica, sans-serif">
    <rect width="1280" height="800" fill="#0e0e12"/>
    <rect width="250" height="800" fill="#16161b"/>
    <text x="28" y="52" font-size="28" font-weight="700" fill="#ffffff">${tool}</text>
    <text x="28" y="120" font-size="16" fill="#9a9aa6">Home</text><text x="28" y="160" font-size="16" fill="#9a9aa6">Assets</text>
    <text x="28" y="200" font-size="16" fill="#ffffff">Generations</text><text x="28" y="240" font-size="16" fill="#9a9aa6">Account settings</text>
    <text x="28" y="760" font-size="14" fill="#9a9aa6">aarav.mehta@example.com</text>
    <text x="300" y="60" font-size="26" font-weight="700" fill="#ffffff">${tool} — Account</text>
    <rect x="300" y="90" width="900" height="110" rx="10" fill="#1c1c22"/>
    <text x="324" y="128" font-size="15" fill="#9a9aa6">Current plan</text><text x="324" y="160" font-size="22" font-weight="700" fill="#ffffff">Standard plan · billed monthly</text>
    <text x="324" y="186" font-size="15" fill="#9a9aa6">625 of 2,250 credits remaining · renews 28 Oct 2026</text>
    <rect x="1040" y="124" width="136" height="40" rx="8" fill="#5b5bff"/><text x="1062" y="150" font-size="15" fill="#ffffff">Manage plan</text>
    <text x="300" y="250" font-size="20" font-weight="700" fill="#ffffff">Generation history</text>
    ${row(270, 'candle_reel_shot_03', 'Image to Video · 10s', '2 days ago')}
    ${row(336, 'diwali_diya_closeup', 'Image to Video · 5s', '2 days ago')}
    ${row(402, 'gift_box_reveal_v2', 'Text to Video · 10s', '5 days ago')}
    ${row(468, 'marigold_macro_loop', 'Image to Video · 5s', '1 week ago')}
    ${row(534, 'logo_end_card', 'Text to Video · 5s', '1 week ago')}
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

console.log('Part 1: AI check of tool evidence\n')
requireEnv('GEMINI_API_KEY')
const png = (b: Buffer) => ({ data: b.toString('base64'), mimeType: 'image/png' })

/** The verdicts are what is under test, not Gemini's uptime: a call that could not be answered is tried once more. */
async function verdict(image: { data: string; mimeType: string }, tool: string) {
  try {
    return await checkToolEvidence(image, tool)
  } catch (err) {
    if (!/UNAVAILABLE|429|quota|RESOURCE_EXHAUSTED|503/i.test((err as Error).message)) throw err
    await new Promise((r) => setTimeout(r, 8000))
    try {
      return await checkToolEvidence(image, tool)
    } catch (again) {
      throw new Error(`Gemini could not be reached twice, so this verdict was not tested: ${(again as Error).message.slice(0, 120)}`)
    }
  }
}

await test('a relevant screenshot of the claimed tool is verified', async () => {
  const v = await verdict(png(await mockScreenshot('Runway')), 'Runway')
  assert(v.status === 'verified' && v.confidence >= 0.8, `status ${v.status}, confidence ${v.confidence}: ${v.reason}`)
  return `confidence ${v.confidence}: ${v.reason}`
})

await test('an irrelevant image (a portfolio photo) is rejected', async () => {
  const { data: item } = await admin.from('portfolio_items').select('media_url').like('media_url', '%/seed/%').limit(1).single()
  const res = await fetch(item!.media_url)
  const photo = { data: Buffer.from(await res.arrayBuffer()).toString('base64'), mimeType: (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0] }
  const v = await verdict(photo, 'Runway')
  assert(v.status === 'needs_review', `an unrelated photo was verified (confidence ${v.confidence}): ${v.reason}`)
  assert(v.confidence < 0.8, `confidence ${v.confidence} is too high for an unrelated photo`)
  return `confidence ${v.confidence}: ${v.reason}`
})

await test('a screenshot of a different tool is rejected for the claimed one', async () => {
  const v = await verdict(png(await mockScreenshot('Runway')), 'Kling')
  assert(v.status === 'needs_review', `a Runway screenshot verified a Kling claim (confidence ${v.confidence}): ${v.reason}`)
  return `confidence ${v.confidence}: ${v.reason}`
})

// ───────────── fixtures for parts 2 and 3 ─────────────

const client = () => createClient(requireEnv('SUPABASE_URL'), requireEnv('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
async function signedIn(email: string, password = 'BrivioDemo123!'): Promise<SupabaseClient> {
  const c = client()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`${email}: ${error.message}`)
  return c
}

// A third account that is party to nothing: a logged-in stranger with their own creator profile.
const strangerEmail = `zz.flow.test.${Date.now()}@brivio.app`
const strangerPassword = `T-${randomUUID()}`
const created = await admin.auth.admin.createUser({ email: strangerEmail, password: strangerPassword, email_confirm: true, user_metadata: { role: 'creator', name: TAG } })
if (created.error) throw new Error(`could not create the test account: ${created.error.message}`)
const strangerId = created.data.user!.id
await admin.from('profiles').upsert({ id: strangerId, role: 'creator', name: TAG, email: strangerEmail })
const strangerCreatorId = randomUUID()
await admin.from('creators').insert({ id: strangerCreatorId, profile_id: strangerId, name: `${TAG} stranger`, is_sample: false, tools: [], skills: [], specializations: [] })

const brand = await signedIn('demo.brand@brivio.app')
const creator = await signedIn('demo.creator@brivio.app')
const stranger = await signedIn(strangerEmail, strangerPassword)
const anon = client()

const { data: brandRow } = await brand.from('brands').select('id').limit(1).single()
const { data: creatorUser } = await creator.auth.getUser()
const { data: creatorRow } = await admin.from('creators').select('id').eq('profile_id', creatorUser.user!.id).single()
const { data: ownItem } = await admin.from('portfolio_items').select('id, title').eq('creator_id', creatorRow!.id).limit(1).single()
const { data: otherItem } = await admin.from('portfolio_items').select('id, creator_id').neq('creator_id', creatorRow!.id).limit(1).single()

const briefId = randomUUID()
const deliverableId = randomUUID()
await admin.from('briefs').insert({ id: briefId, brand_id: brandRow!.id, title: `${TAG} brief`, brand_name: TAG, status: 'draft', revision_rounds: 1 })
await admin.from('brief_deliverables').insert({ id: deliverableId, brief_id: briefId, position: 1, content_type: 'Video', aspect_ratio: '9:16', duration_sec: 15, quantity: 1 })

async function cleanup() {
  await admin.from('briefs').delete().eq('id', briefId) // cascades to engagements, messages, submissions
  await admin.from('client_confirmations').delete().eq('client_name', TAG)
  await admin.from('verifications').delete().like('reason', `%${TAG}%`)
  await admin.from('creators').delete().eq('id', strangerCreatorId)
  await admin.auth.admin.deleteUser(strangerId)
}

try {
  // ───────────── Part 2: client confirmation links ─────────────
  console.log('\nPart 2: client confirmation links\n')

  let token = ''
  await test('a creator can make a link for their own piece, and not for someone else\'s', async () => {
    const mine = await creator.from('client_confirmations').insert({ creator_id: creatorRow!.id, portfolio_item_id: ownItem!.id, client_name: TAG }).select('token, expires_at').single()
    assert(!mine.error && mine.data, `own piece: ${mine.error?.message}`)
    token = mine.data.token
    const days = (Date.parse(mine.data.expires_at) - Date.now()) / 86400000
    assert(token.length >= 40 && days > 13.9 && days < 14.1, `token length ${token.length}, expires in ${days.toFixed(2)} days`)
    const theirs = await creator.from('client_confirmations').insert({ creator_id: creatorRow!.id, portfolio_item_id: otherItem!.id, client_name: TAG })
    assert(!!theirs.error, 'a link was created for another creator\'s piece')
    const forOther = await creator.from('client_confirmations').insert({ creator_id: otherItem!.creator_id, portfolio_item_id: otherItem!.id, client_name: TAG })
    assert(!!forOther.error, 'a link was created in another creator\'s name')
    const long = await creator.from('client_confirmations').insert({ creator_id: creatorRow!.id, portfolio_item_id: ownItem!.id, client_name: TAG, expires_at: new Date(Date.now() + 400 * 86400000).toISOString() })
    assert(!!long.error, 'a link could be created with a 400-day expiry')
    return `expires in ${days.toFixed(1)} days`
  })

  await test('links are private: other users and visitors cannot list them', async () => {
    assert(rowsOf(await stranger.from('client_confirmations').select('token')) === 0, 'a stranger can list confirmation links')
    assert(rowsOf(await anon.from('client_confirmations').select('token')) === 0, 'a logged-out visitor can list confirmation links')
    assert(rowsOf(await creator.from('client_confirmations').select('token').eq('token', token)) === 1, 'the creator cannot see their own link')
  })

  await test('the client can open a valid link logged out and sees the piece', async () => {
    const { data } = await anon.rpc('get_client_confirmation', { token })
    assert(data.status === 'valid' && data.item.id === ownItem!.id && data.creator.id === creatorRow!.id, JSON.stringify(data).slice(0, 200))
    const { data: missing } = await anon.rpc('get_client_confirmation', { token: 'not-a-real-token' })
    assert(missing.status === 'not_found', `unknown token: ${missing.status}`)
  })

  await test('confirming needs a name and company, then marks past work verified by the client', async () => {
    const empty = await anon.rpc('confirm_client_work', { token, name: '', company: '' })
    assert(empty.data.ok === false, 'an empty confirmation was accepted')
    assert((await anon.rpc('get_client_confirmation', { token })).data.status === 'valid', 'a failed attempt used up the link')
    const ok = await anon.rpc('confirm_client_work', { token, name: 'Test Person', company: `${TAG} Co` })
    assert(ok.data.ok === true, `confirmation failed: ${ok.data.error}`)
    const { data: v } = await admin.from('verifications').select('status, verified_by, type, portfolio_item_id, label').eq('creator_id', creatorRow!.id).like('reason', `%${TAG}%`)
    assert(v?.length === 1 && v[0].status === 'verified' && v[0].verified_by === 'client' && v[0].type === 'past_work' && v[0].portfolio_item_id === ownItem!.id, JSON.stringify(v))
    return `verification recorded for "${ownItem!.title}", verified_by client`
  })

  await test('a link works only once', async () => {
    const again = await anon.rpc('confirm_client_work', { token, name: 'Someone Else', company: 'Another Co' })
    assert(again.data.ok === false && /already been used/.test(again.data.error), JSON.stringify(again.data))
    assert((await anon.rpc('get_client_confirmation', { token })).data.status === 'used', 'status should be "used"')
    const { data: v } = await admin.from('verifications').select('id').eq('creator_id', creatorRow!.id).like('reason', `%${TAG}%`)
    assert(v?.length === 1, `${v?.length} verifications after a second attempt`)
  })

  await test('an expired link is rejected', async () => {
    const made = await creator.from('client_confirmations').insert({ creator_id: creatorRow!.id, portfolio_item_id: ownItem!.id, client_name: TAG }).select('id, token').single()
    await admin.from('client_confirmations').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', made.data!.id)
    assert((await anon.rpc('get_client_confirmation', { token: made.data!.token })).data.status === 'expired', 'status should be "expired"')
    const res = await anon.rpc('confirm_client_work', { token: made.data!.token, name: 'Test Person', company: `${TAG} Co` })
    assert(res.data.ok === false && /expired/.test(res.data.error), JSON.stringify(res.data))
    const { data: v } = await admin.from('verifications').select('id').eq('creator_id', creatorRow!.id).like('reason', `%${TAG}%`)
    assert(v?.length === 1, 'an expired link created a verification')
  })

  await test('nobody can mark a link used, or a verification verified, by editing the table directly', async () => {
    const made = await creator.from('client_confirmations').insert({ creator_id: creatorRow!.id, portfolio_item_id: ownItem!.id, client_name: TAG }).select('id').single()
    const upd = await creator.from('client_confirmations').update({ used_at: new Date().toISOString(), confirmed_name: 'Me' }).eq('id', made.data!.id).select('id')
    assert(rowsOf(upd) === 0, 'the creator edited their own link')
    const selfVerify = await creator.from('verifications').insert({ creator_id: creatorRow!.id, type: 'past_work', label: TAG, status: 'verified', verified_by: 'client', reason: TAG })
    assert(!!selfVerify.error, 'the creator inserted a verified verification directly')
  })

  // ───────────── Part 3: engagements ─────────────
  console.log('\nPart 3: engagements\n')

  let engagementId = ''
  await test('only the brand that owns the brief can start an engagement', async () => {
    assert(!!(await stranger.from('engagements').insert({ brief_id: briefId, creator_id: strangerCreatorId, status: 'invited' })).error, 'a stranger created an engagement')
    assert(!!(await creator.from('engagements').insert({ brief_id: briefId, creator_id: creatorRow!.id, status: 'invited' })).error, 'a creator invited themselves')
    assert(!!(await brand.from('engagements').insert({ brief_id: briefId, creator_id: creatorRow!.id, status: 'approved' })).error, 'an engagement was created already approved')
    const made = await brand.from('engagements').insert({ brief_id: briefId, creator_id: creatorRow!.id, status: 'shortlisted' }).select('id').single()
    assert(!made.error, `the brand could not shortlist: ${made.error?.message}`)
    engagementId = made.data!.id
  })

  await test('a shortlist entry is private to the brand', async () => {
    assert(rowsOf(await creator.from('engagements').select('id').eq('id', engagementId)) === 0, 'the creator can see they were shortlisted')
    assert(rowsOf(await stranger.from('engagements').select('id').eq('id', engagementId)) === 0, 'a stranger can see the shortlist')
    assert(rowsOf(await creator.from('briefs').select('id').eq('id', briefId)) === 0, 'the creator can read the draft brief before being invited')
  })

  await test('after the invitation the creator sees it and can read the (draft) brief; strangers see nothing', async () => {
    const inv = await brand.from('engagements').update({ status: 'invited', agreed_price: 30000 }).eq('id', engagementId).select('id')
    assert(rowsOf(inv) === 1, `invite failed: ${inv.error?.message}`)
    await brand.from('engagement_messages').insert({ engagement_id: engagementId, sender_id: (await brand.auth.getUser()).data.user!.id, sender_role: 'brand', kind: 'invite', body: 'Hello' })
    assert(rowsOf(await creator.from('engagements').select('id').eq('id', engagementId)) === 1, 'the invited creator cannot see the invitation')
    assert(rowsOf(await creator.from('briefs').select('id').eq('id', briefId)) === 1, 'the invited creator cannot read the brief')
    assert(rowsOf(await creator.from('brief_deliverables').select('id').eq('brief_id', briefId)) === 1, 'the invited creator cannot read the deliverables')
    assert(rowsOf(await creator.from('engagement_messages').select('id').eq('engagement_id', engagementId)) === 1, 'the invited creator cannot read the invitation message')
    for (const [who, c] of [['a stranger', stranger], ['a logged-out visitor', anon]] as const) {
      assert(rowsOf(await c.from('engagements').select('id').eq('id', engagementId)) === 0, `${who} can read the engagement`)
      assert(rowsOf(await c.from('engagement_messages').select('id').eq('engagement_id', engagementId)) === 0, `${who} can read the messages`)
      assert(rowsOf(await c.from('briefs').select('id').eq('id', briefId)) === 0, `${who} can read the draft brief`)
    }
  })

  await test('a stranger cannot change, message, submit to, or delete the engagement', async () => {
    assert(rowsOf(await stranger.from('engagements').update({ status: 'cancelled' }).eq('id', engagementId).select('id')) === 0, 'a stranger changed the status')
    assert(rowsOf(await stranger.from('engagements').delete().eq('id', engagementId).select('id')) === 0, 'a stranger deleted the engagement')
    assert(!!(await stranger.from('engagement_messages').insert({ engagement_id: engagementId, sender_id: strangerId, sender_role: 'creator', kind: 'message', body: 'hi' })).error, 'a stranger posted a message')
    assert(!!(await stranger.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 1, media_url: 'https://example.com/x.png' })).error, 'a stranger submitted work')
    const { data } = await admin.from('engagements').select('status').eq('id', engagementId).single()
    assert(data?.status === 'invited', `status is now ${data?.status}`)
  })

  await test('each side can only make its own moves', async () => {
    assert(!!(await brand.from('engagements').update({ status: 'accepted' }).eq('id', engagementId).select('id')).error, 'the brand accepted on the creator\'s behalf')
    assert(!!(await creator.from('engagements').update({ status: 'approved' }).eq('id', engagementId).select('id')).error, 'the creator approved their own work')
    assert(!!(await creator.from('engagements').update({ agreed_price: 999999 }).eq('id', engagementId).select('id')).error, 'the creator changed the agreed price')
    assert(!!(await creator.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 1, media_url: 'https://example.com/x.png' })).error, 'work was submitted before the invitation was accepted')
    assert(!!(await creator.from('engagement_messages').insert({ engagement_id: engagementId, sender_id: creatorUser.user!.id, sender_role: 'brand', kind: 'message', body: 'x' })).error, 'the creator posted as the brand')
    assert(rowsOf(await creator.from('engagements').update({ status: 'accepted' }).eq('id', engagementId).select('id')) === 1, 'the creator could not accept')
    assert(rowsOf(await creator.from('engagements').update({ status: 'in_progress' }).eq('id', engagementId).select('id')) === 1, 'the creator could not start work')
  })

  await test('versions are numbered by the database; only the creator submits and only the brand reviews', async () => {
    const v1 = await creator.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 99, media_url: 'https://example.com/v1.png', notes: 'first' }).select('id, version').single()
    assert(!v1.error && v1.data!.version === 1, `first version is ${v1.data?.version}: ${v1.error?.message}`)
    assert(!!(await brand.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 1, media_url: 'https://example.com/b.png' })).error, 'the brand submitted work')
    assert(rowsOf(await creator.from('submissions').update({ status: 'approved' }).eq('id', v1.data!.id).select('id')) === 0, 'the creator approved their own submission')
    assert(!!(await brand.from('submissions').update({ media_url: 'https://example.com/swapped.png' }).eq('id', v1.data!.id).select('id')).error, 'the brand replaced the submitted file')
    const review = await brand.from('submissions').update({ status: 'revision_requested', review_comment: 'Warmer light please' }).eq('id', v1.data!.id).select('id')
    assert(rowsOf(review) === 1, `the brand could not request a revision: ${review.error?.message}`)
    const v2 = await creator.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 1, media_url: 'https://example.com/v2.png' }).select('version').single()
    assert(v2.data?.version === 2, `second version is ${v2.data?.version}`)
    assert(!!(await creator.from('submissions').insert({ engagement_id: engagementId, deliverable_id: randomUUID(), version: 1, media_url: 'https://example.com/x.png' })).error, 'work was submitted for a deliverable from another brief')
    assert(rowsOf(await stranger.from('submissions').select('id').eq('engagement_id', engagementId)) === 0, 'a stranger can read the submissions')
    assert(rowsOf(await brand.from('submissions').select('id').eq('engagement_id', engagementId)) === 2, 'the brand cannot read the submissions')
    return 'v1 then v2'
  })

  await test('delivery and approval follow the order: creator delivers, brand approves, then it is final', async () => {
    assert(!!(await brand.from('engagements').update({ status: 'approved' }).eq('id', engagementId).select('id')).error, 'the brand approved before delivery')
    assert(rowsOf(await creator.from('engagements').update({ status: 'delivered' }).eq('id', engagementId).select('id')) === 1, 'the creator could not deliver')
    assert(rowsOf(await brand.from('engagements').update({ status: 'approved' }).eq('id', engagementId).select('id')) === 1, 'the brand could not approve')
    assert(!!(await brand.from('engagements').update({ status: 'cancelled' }).eq('id', engagementId).select('id')).error, 'an approved engagement was cancelled')
    assert(rowsOf(await brand.from('engagements').delete().eq('id', engagementId).select('id')) === 0, 'an approved engagement was deleted')
  })
} finally {
  await cleanup()
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
