import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Type } from '@google/genai'
import { generateText } from '../_lib/gemini.js'
import { jsonBody, serviceClient, userFromRequest } from '../_lib/server.js'
import { reasonFromBreakdown, type MatchResult, type MatchRow } from '../../src/lib/matching.js'

// POST /api/ai/match-reasons { briefId } → { reasons: { [creatorId]: sentence }, source: 'cache' | 'ai' | 'rules' }
//
// One sentence per creator on why they match, for the top 10. All ten come from a single Gemini call and are
// stored in match_cache; a database trigger clears that cache whenever the brief changes. If Gemini cannot
// answer, the sentences are built from the score breakdown in code, so the page always has something to show.

const TOP = 10

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reasons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { creator_id: { type: Type.STRING }, reason: { type: Type.STRING, description: 'One sentence, under 30 words' } },
        required: ['creator_id', 'reason'],
      },
    },
  },
  required: ['reasons'],
}

function describe(m: MatchRow) {
  const d = m.details
  return [
    `creator_id: ${m.id}`,
    `name: ${m.name}; headline: ${m.headline ?? ''}; specializations: ${m.specializations.join(', ')}`,
    `score: ${m.score}/100 (tools ${m.breakdown.tools}/25, format ${m.breakdown.format}/20, style ${m.breakdown.style}/25, budget ${m.breakdown.budget}/15, commercial ${m.breakdown.commercial}/10, verification ${m.breakdown.verification}/5)`,
    `required tools they use: ${d.tools_matched.join(', ') || 'none'}; required tools they lack: ${d.tools_missing.join(', ') || 'none'}; excluded tools they rely on: ${d.excluded_relied_on.join(', ') || 'none'}`,
    `deliverable formats covered: ${d.deliverables_covered} of ${d.deliverable_count}`,
    `closest portfolio piece: ${m.best_item ? `"${m.best_item.title}" (${m.best_item.content_type}, ${m.best_item.aspect_ratio})` : 'none'}`,
    `price: INR ${d.price_min ?? '?'} to ${d.price_max ?? '?'}; within budget: ${d.within_budget}`,
    `verified tools: ${m.verified_tool_labels.join(', ') || 'none'}; verified workflow: ${m.has_verified_workflow}; client-confirmed past work: ${m.has_verified_past_work}`,
  ].join('\n')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const db = serviceClient()
    const user = await userFromRequest(req)
    if (!db || !user) return res.status(401).json({ error: 'Log in first' })
    const { briefId } = jsonBody(req)
    if (typeof briefId !== 'string') return res.status(400).json({ error: 'Expected { briefId }' })

    const { data: brief } = await db.from('briefs').select('id, title, goal, product, style_tags, mood, required_tools, excluded_tools, budget_min, budget_max, brands!inner(profile_id)').eq('id', briefId).maybeSingle()
    if (!brief || (brief as any).brands.profile_id !== user.id) return res.status(403).json({ error: 'Not your brief' })

    const { data: matched, error } = await db.rpc('brief_matches', { brief_id: briefId, lim: TOP })
    if (error) throw new Error(error.message)
    const rows = (matched as MatchResult).rows
    const reasons: Record<string, string> = {}
    for (const r of rows) if (r.reason) reasons[r.id] = r.reason
    const missing = rows.filter((r) => !r.reason)
    if (!missing.length) return res.status(200).json({ reasons, source: 'cache' })

    let source: 'ai' | 'rules' = 'rules'
    if (process.env.GEMINI_API_KEY) {
      try {
        const { text } = await generateText({
          label: 'match-reasons',
          system:
            'You explain creator matches on BRIVIO, a marketplace where brands hire AI creators. For each creator write ONE sentence (under 30 words) telling the brand why this creator fits the brief, ' +
            'using only the facts given: tools, formats covered, the closest portfolio piece, budget, verification. Mention the single biggest gap if there is one. ' +
            'Be concrete and plain. Do not repeat the score. No emojis, no hype words. Use the creator_id exactly as given.',
          prompt: [
            `Brief: "${brief.title}". Goal: ${brief.goal ?? ''}. Product: ${brief.product ?? ''}. Style: ${(brief.style_tags ?? []).join(', ')}; mood: ${brief.mood ?? ''}.`,
            `Required tools: ${(brief.required_tools ?? []).join(', ') || 'none'}. Excluded tools: ${(brief.excluded_tools ?? []).join(', ') || 'none'}. Budget: INR ${brief.budget_min ?? '?'} to ${brief.budget_max ?? '?'}.`,
            '',
            ...missing.map((m, i) => `Creator ${i + 1}\n${describe(m)}`),
          ].join('\n'),
          hedgeMs: 4000,
          deadlineMs: 22000,
          config: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 },
        })
        const parsed = JSON.parse(text) as { reasons?: { creator_id?: string; reason?: string }[] }
        const fresh = (parsed.reasons ?? [])
          .filter((r) => r.creator_id && r.reason && missing.some((m) => m.id === r.creator_id))
          .map((r) => ({ brief_id: briefId, creator_id: r.creator_id!, reason: r.reason!.trim().slice(0, 300), source: 'ai' }))
        if (fresh.length) {
          await db.from('match_cache').upsert(fresh, { onConflict: 'brief_id,creator_id' })
          for (const f of fresh) reasons[f.creator_id] = f.reason
          source = 'ai'
        }
      } catch (err) {
        console.warn('[match-reasons] AI unavailable, using the breakdown:', (err as Error).message?.slice(0, 140))
      }
    }
    // Anything the AI did not cover gets a sentence built from the numbers (not cached, so AI can fill it in later).
    for (const m of missing) if (!reasons[m.id]) reasons[m.id] = reasonFromBreakdown(m)
    return res.status(200).json({ reasons, source })
  } catch (err) {
    console.error('[match-reasons]', (err as Error).message)
    return res.status(200).json({ reasons: {}, source: 'rules' })
  }
}
