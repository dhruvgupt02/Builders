import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isRateLimited } from '../_lib/gemini.js'
import { runBriefBuilder } from '../_lib/brief-ai.js'
import { jsonBody, userFromRequest } from '../_lib/server.js'

// POST /api/ai/brief-builder { idea, brandName?, budget?, answers?: [{question, answer}] }
//   → { brief, assumptions: [{field, note}], questions: [{field, question, options}], corrected: [] }
//
// Turns a rough idea into a full structured brief (Gemini JSON mode with a strict schema, then validated
// server-side against the taxonomy). On any failure it answers with { error, code }; the page keeps the idea
// text and opens the manual form.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed', code: 'method' })
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'The AI brief builder is not set up on this site yet. You can fill the brief in yourself.', code: 'not_configured' })
    }
    if (!(await userFromRequest(req))) return res.status(401).json({ error: 'Please log in to use the AI brief builder.', code: 'auth' })

    const body = jsonBody(req)
    const idea = typeof body.idea === 'string' ? body.idea.trim() : ''
    if (idea.length < 10) return res.status(400).json({ error: 'Describe your idea in at least a few words.', code: 'invalid' })

    const result = await runBriefBuilder({
      idea,
      brandName: typeof body.brandName === 'string' ? body.brandName : undefined,
      budget: Number(body.budget) > 0 ? Number(body.budget) : null,
      answers: Array.isArray(body.answers) ? (body.answers as { question: string; answer: string }[]).map((a) => ({ question: String(a?.question ?? '').slice(0, 200), answer: String(a?.answer ?? '').slice(0, 120) })) : [],
    })
    return res.status(200).json(result)
  } catch (err) {
    console.error('[brief-builder]', (err as Error).message)
    if (isRateLimited(err)) return res.status(429).json({ error: 'The AI is busy right now. Your idea is saved below; try again in a minute or fill the brief in yourself.', code: 'rate_limited' })
    return res.status(502).json({ error: 'The AI could not build the brief this time. Your idea is saved below; try again or fill the brief in yourself.', code: 'unavailable' })
  }
}
