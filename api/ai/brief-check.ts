import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runBriefCheck } from '../_lib/brief-ai.js'
import { jsonBody, userFromRequest } from '../_lib/server.js'
import { emptyBrief, ruleChecks, type BriefDraft } from '../../src/lib/brief.js'

// POST /api/ai/brief-check { brief } → { items: [{kind: 'gap'|'conflict'|'suggestion', title, detail, step?}], aiAvailable }
//
// Rule-based checks (formats vs platforms, budget vs deliverables, deadline, rights) always come back.
// Gemini adds more when it is available; when it is not, aiAvailable is false and the rules still answer.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const body = jsonBody(req)
  const brief = { ...emptyBrief(), ...(body.brief && typeof body.brief === 'object' ? (body.brief as Partial<BriefDraft>) : {}) }
  if (!Array.isArray(brief.deliverables)) brief.deliverables = []
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!process.env.GEMINI_API_KEY || !(await userFromRequest(req))) return res.status(200).json({ items: ruleChecks(brief), aiAvailable: false })
    return res.status(200).json(await runBriefCheck(brief))
  } catch (err) {
    console.error('[brief-check]', (err as Error).message)
    try {
      return res.status(200).json({ items: ruleChecks(brief), aiAvailable: false })
    } catch {
      return res.status(200).json({ items: [], aiAvailable: false })
    }
  }
}
