import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BRIEF_EMBED_COLUMNS, CREATOR_EMBED_COLUMNS, ITEM_EMBED_COLUMNS, briefEmbedText, creatorEmbedText, embedText, itemEmbedText, toPgVector } from '../_lib/embed.js'
import { jsonBody, serviceClient, userFromRequest, withTimeout } from '../_lib/server.js'

// POST /api/ai/embed-row { table: 'creators' | 'portfolio_items' | 'briefs', id } → { ok: true }
//
// Called by the app right after a creator saves their profile or a portfolio piece, so the new text is
// searchable by "Describe what you need" immediately. Only the owner of the row may trigger it.
// Failures are reported as JSON and never block the save; `npm run embed` picks up anything left without a vector.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }
    const db = serviceClient()
    if (!process.env.GEMINI_API_KEY || !db) return res.status(503).json({ ok: false, error: 'Embeddings are not configured' })

    const user = await userFromRequest(req)
    if (!user) return res.status(401).json({ ok: false, error: 'Log in first' })

    const { table, id } = jsonBody(req)
    if ((table !== 'creators' && table !== 'portfolio_items' && table !== 'briefs') || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Expected { table: "creators" | "portfolio_items" | "briefs", id }' })
    }

    let text: string
    if (table === 'creators') {
      const { data } = await db.from('creators').select(`id, profile_id, ${CREATOR_EMBED_COLUMNS}`).eq('id', id).maybeSingle()
      const row = data as Record<string, any> | null
      if (!row || row.profile_id !== user.id) return res.status(403).json({ ok: false, error: 'Not your profile' })
      text = creatorEmbedText(row)
    } else if (table === 'briefs') {
      // Brief embeddings drive the style part of creator matching.
      const { data } = await db.from('briefs').select(`id, ${BRIEF_EMBED_COLUMNS}, brands!inner(profile_id)`).eq('id', id).maybeSingle()
      const row = data as Record<string, any> | null
      if (!row || row.brands.profile_id !== user.id) return res.status(403).json({ ok: false, error: 'Not your brief' })
      text = briefEmbedText(row)
    } else {
      const { data } = await db.from('portfolio_items').select(`id, ${ITEM_EMBED_COLUMNS}, creators!inner(profile_id)`).eq('id', id).maybeSingle()
      const row = data as Record<string, any> | null
      if (!row || row.creators.profile_id !== user.id) return res.status(403).json({ ok: false, error: 'Not your portfolio piece' })
      text = itemEmbedText(row)
    }

    const vector = await withTimeout(embedText(text), 20000, 'Embedding')
    const { error } = await db.from(table).update({ embedding: toPgVector(vector) }).eq('id', id)
    if (error) throw new Error(error.message)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.warn('[embed-row]', (err as Error).message)
    return res.status(502).json({ ok: false, error: 'Embedding failed; it will be filled in later.' })
  }
}
