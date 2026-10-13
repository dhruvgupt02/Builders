import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGemini } from '../_lib/gemini.js'
import { EMBEDDING_DIMS, EMBEDDING_MODEL, toPgVector } from '../_lib/embed.js'
import { clientIp, jsonBody, rateLimiter, serviceClient, withTimeout } from '../_lib/server.js'

// POST /api/search/semantic { q, filters?, lim?, off? } → { total, rows }
//
// "Describe what you need": embeds the text and ranks creators by cosine similarity (SQL: search_semantic).
// Public, no login. Whenever it cannot answer (no key, Gemini slow or down, rate limit) it replies
// 200 { fallback: true, notice } and the page runs a keyword search instead, so the user always gets results.

const allow = rateLimiter(20, 60_000) // ~20 searches a minute per IP
const EMBED_TIMEOUT_MS = 8000

// The same text is embedded again for "Load more" and for every filter change; remember recent ones.
const cache = new Map<string, number[]>()

async function embedQuery(text: string): Promise<number[]> {
  const key = text.toLowerCase()
  const hit = cache.get(key)
  if (hit) return hit
  const res = await withTimeout(
    getGemini().models.embedContent({ model: EMBEDDING_MODEL, contents: text, config: { outputDimensionality: EMBEDDING_DIMS, taskType: 'RETRIEVAL_QUERY' } }),
    EMBED_TIMEOUT_MS,
    'Embedding',
  )
  const values = res.embeddings?.[0]?.values
  if (!values || values.length !== EMBEDDING_DIMS) throw new Error('unexpected embedding size')
  const norm = Math.sqrt(values.reduce((s, x) => s + x * x, 0)) || 1
  const vector = values.map((x) => x / norm)
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  cache.set(key, vector)
  return vector
}

const fallback = (res: VercelResponse, notice: string, reason: string) => res.status(200).json({ fallback: true, notice, reason })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const body = jsonBody(req)
    const q = typeof body.q === 'string' ? body.q.trim().slice(0, 500) : ''
    if (q.length < 3) return res.status(400).json({ error: 'Describe what you need in a few words.' })

    if (!allow(clientIp(req))) return fallback(res, 'You are searching very quickly. Showing keyword results for now; smart search will be back in a minute.', 'rate_limited')

    const db = serviceClient()
    if (!process.env.GEMINI_API_KEY || !db) return fallback(res, 'Smart search is not set up on this site yet. Showing keyword results instead.', 'not_configured')

    let embedding: number[]
    try {
      embedding = await embedQuery(q)
    } catch (err) {
      console.warn('[semantic] embedding failed:', (err as Error).message)
      return fallback(res, 'Smart search is not responding right now. Showing keyword results instead.', 'embedding_failed')
    }

    const lim = Math.min(Math.max(Number(body.lim) || 12, 1), 48)
    const off = Math.max(Number(body.off) || 0, 0)
    const filters = body.filters && typeof body.filters === 'object' ? body.filters : {}
    const { data, error } = await db.rpc('search_semantic', { query_embedding: toPgVector(embedding), filters, lim, off })
    if (error) {
      console.error('[semantic] search_semantic failed:', error.message)
      return fallback(res, 'Smart search hit a problem. Showing keyword results instead.', 'search_failed')
    }
    return res.status(200).json(data)
  } catch (err) {
    console.error('[semantic]', err)
    return fallback(res, 'Smart search hit a problem. Showing keyword results instead.', 'error')
  }
}
