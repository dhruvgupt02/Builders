// Shared wrapper for the text-generation routes under /api/ai. It makes sure a route can never crash
// the UI: every outcome is a JSON body of { text } or { error, code } with a message meant for users.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { generateText, isRateLimited } from './gemini.js'

export interface AiPrompt {
  system: string
  prompt: string
}

type Build = (body: Record<string, unknown>) => AiPrompt | { error: string }

/** Trims and caps free text coming from the client before it goes into a prompt. */
export function text(value: unknown, max = 600) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function list(value: unknown, maxItems = 20) {
  return Array.isArray(value) ? value.map((v) => text(v, 80)).filter(Boolean).slice(0, maxItems) : []
}

async function isLoggedIn(req: VercelRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!token || !url || !key) return false
  const { data, error } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.getUser(token)
  return !error && !!data.user
}

export function aiRoute(label: string, build: Build) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    try {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        return res.status(405).json({ error: 'Method not allowed', code: 'method' })
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: 'AI help is not set up on this site yet. You can still write this yourself.', code: 'not_configured' })
      }
      // Only signed-in users may spend the Gemini quota.
      if (!(await isLoggedIn(req))) {
        return res.status(401).json({ error: 'Please log in to use AI help.', code: 'auth' })
      }
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const built = build(body as Record<string, unknown>)
      if ('error' in built) return res.status(400).json({ error: built.error, code: 'invalid' })

      const result = await generateText({ system: built.system, prompt: built.prompt, label })
      const out = result.text.replace(/^["“]|["”]$/g, '')
      return res.status(200).json({ text: out })
    } catch (err) {
      console.error(`[${label}]`, err)
      if (isRateLimited(err)) {
        return res.status(429).json({ error: 'The AI is busy right now. Please wait a minute and try again.', code: 'rate_limited' })
      }
      return res.status(502).json({ error: 'AI help is unavailable at the moment. Please try again shortly.', code: 'unavailable' })
    }
  }
}
