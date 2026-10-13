import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chatModel, getGemini, withRetry } from '../_lib/gemini.js'

// GET /api/ai/health → { ok: true, model } if the Gemini key and model work.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  const model = chatModel()
  try {
    const result = await withRetry(
      () => getGemini().models.generateContent({ model, contents: 'Reply with the single word: pong' }),
      'health',
    )
    return res.status(200).json({ ok: true, model, reply: result.text?.trim() ?? '' })
  } catch (err) {
    return res.status(500).json({ ok: false, model, error: (err as Error).message })
  }
}
