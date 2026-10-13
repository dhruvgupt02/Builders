import type { VercelRequest, VercelResponse } from '@vercel/node'
import { generateText } from '../_lib/gemini.js'
import { jsonBody, serviceClient, userFromRequest } from '../_lib/server.js'

// POST /api/ai/invite-message { briefId, creatorId } → { text, source: 'ai' | 'template' }
//
// Drafts the message a brand sends when inviting a creator to a brief. The brand edits it before sending.
// If Gemini is unavailable a plain template built from the same facts is returned, so the button always works.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const db = serviceClient()
    const user = await userFromRequest(req)
    if (!db || !user) return res.status(401).json({ error: 'Log in first' })
    const { briefId, creatorId } = jsonBody(req)
    if (typeof briefId !== 'string' || typeof creatorId !== 'string') return res.status(400).json({ error: 'Expected { briefId, creatorId }' })

    const [{ data: brief }, { data: creator }, { data: deliverables }] = await Promise.all([
      db.from('briefs').select('title, brand_name, product, goal, style_tags, mood, deadline, budget_min, budget_max, required_tools, brands!inner(profile_id)').eq('id', briefId).maybeSingle(),
      db.from('creators').select('name, headline, specializations, tools').eq('id', creatorId).maybeSingle(),
      db.from('brief_deliverables').select('content_type, aspect_ratio, duration_sec, quantity').eq('brief_id', briefId).order('position'),
    ])
    if (!brief || (brief as any).brands.profile_id !== user.id) return res.status(403).json({ error: 'Not your brief' })
    if (!creator) return res.status(404).json({ error: 'Creator not found' })

    const first = creator.name.split(' ')[0]
    const formats = (deliverables ?? []).map((d) => `${d.quantity} × ${[d.duration_sec ? `${d.duration_sec}s` : null, d.aspect_ratio, d.content_type].filter(Boolean).join(' ')}`).join(', ')
    const shared = (brief.required_tools ?? []).filter((t: string) => (creator.tools ?? []).includes(t))
    const budget = brief.budget_min && brief.budget_max ? `₹${brief.budget_min.toLocaleString('en-IN')} to ₹${brief.budget_max.toLocaleString('en-IN')}` : null
    const template =
      `Hi ${first},\n\nWe are ${brief.brand_name ?? 'a brand on BRIVIO'} and we would like to invite you to "${brief.title}".` +
      `${formats ? ` We need ${formats}.` : ''}${shared.length ? ` Your work with ${shared.join(' and ')} is what we are looking for.` : ''}` +
      `${budget ? ` Our budget is ${budget}` : ''}${brief.deadline ? `${budget ? ', and' : ' We'} need delivery by ${brief.deadline}` : ''}${budget || brief.deadline ? '.' : ''}` +
      `\n\nThe full brief, including usage rights, is attached to this invitation. Let us know if you are interested.\n\n${brief.brand_name ?? ''}`.trimEnd()

    if (!process.env.GEMINI_API_KEY) return res.status(200).json({ text: template, source: 'template' })
    try {
      const { text } = await generateText({
        label: 'invite-message',
        system:
          'You write short invitation messages from a brand to an AI creator on BRIVIO. 60 to 90 words, warm and direct, no hype, no emojis. ' +
          'Say who the brand is, what the project is, one specific reason this creator fits (from their profile), the deliverables, budget and deadline if given, ' +
          'and end by asking if they are interested. Use only the facts provided. Start with "Hi <first name>," and sign off with the brand name. Plain text.',
        prompt: [
          `Brand: ${brief.brand_name ?? 'not given'}`,
          `Brief: ${brief.title}. Product: ${brief.product ?? ''}. Goal: ${brief.goal ?? ''}`,
          `Style: ${(brief.style_tags ?? []).join(', ')}; mood: ${brief.mood ?? ''}`,
          `Deliverables: ${formats || 'not set'}`,
          `Budget: ${budget ?? 'not set'}; deadline: ${brief.deadline ?? 'not set'}`,
          `Creator: ${creator.name}. Headline: ${creator.headline ?? ''}. Specializations: ${(creator.specializations ?? []).join(', ')}. Tools: ${(creator.tools ?? []).join(', ')}`,
          `Required tools they use: ${shared.join(', ') || 'none in particular'}`,
        ].join('\n'),
      })
      return res.status(200).json({ text, source: 'ai' })
    } catch (err) {
      console.warn('[invite-message] AI unavailable, using the template:', (err as Error).message?.slice(0, 120))
      return res.status(200).json({ text: template, source: 'template' })
    }
  } catch (err) {
    console.error('[invite-message]', (err as Error).message)
    return res.status(502).json({ error: 'The message could not be drafted. Write your own below.' })
  }
}
