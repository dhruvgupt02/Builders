import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chatModel, generateText, isRateLimited } from '../_lib/gemini.js'

// GET /api/ai/health → { ok: true, model } if the Gemini key and model work.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  const configured = chatModel()
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ ok: false, model: configured, error: 'GEMINI_API_KEY is not set' })
  try {
    // `model` is the one that answered; it differs from `configured` when the fallback had to step in.
    const { text, model } = await generateText({ prompt: 'Reply with the single word: pong', label: 'health' })
    return res.status(200).json({ ok: true, model, configured, fallbackUsed: model !== configured, reply: text })
  } catch (err) {
    return res.status(isRateLimited(err) ? 429 : 502).json({ ok: false, model: configured, error: (err as Error).message })
  }
}
