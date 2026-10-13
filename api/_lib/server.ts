// Small server-side helpers shared by the API routes.
import type { VercelRequest } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let admin: SupabaseClient | null = null

/** Service-role Supabase client (server only), or null if the env vars are missing. */
export function serviceClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return admin
}

/** The logged-in user behind a request's Bearer token, or null. */
export async function userFromRequest(req: VercelRequest) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const db = serviceClient()
  if (!token || !db) return null
  const { data, error } = await db.auth.getUser(token)
  return error ? null : data.user
}

export function jsonBody(req: VercelRequest): Record<string, unknown> {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function clientIp(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown'
}

/**
 * In-memory sliding-window rate limit. Good enough to stop one visitor hammering a route; each serverless
 * instance keeps its own counts, so it is a brake, not a hard guarantee.
 */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return (key: string) => {
    const now = Date.now()
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k)
    return true
  }
}

/** Rejects if the promise takes longer than ms. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms)
  })
  promise.catch(() => {})
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}
