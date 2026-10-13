// Server-only Gemini helpers. Files under api/_lib are NOT deployed as Vercel routes (underscore prefix).
// Never import this from src/ — it reads GEMINI_API_KEY.
import { GoogleGenAI } from '@google/genai'

let client: GoogleGenAI | null = null

export function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  client ??= new GoogleGenAI({ apiKey })
  return client
}

export function chatModel() {
  return process.env.GEMINI_MODEL || 'gemini-flash-latest'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function isRetryable(err: unknown) {
  const e = err as { status?: number; code?: number; message?: string }
  const status = e?.status ?? e?.code
  if (status === 429 || status === 503) return true
  return /429|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(e?.message ?? '')
}

/** Runs fn, retrying up to 3 times on 429/503 with exponential backoff (2s, 4s, 8s). */
export async function withRetry<T>(fn: () => Promise<T>, label = 'gemini'): Promise<T> {
  const maxRetries = 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) throw err
      const wait = 2000 * 2 ** attempt
      console.warn(`[${label}] rate limited / unavailable, retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s`)
      await sleep(wait)
    }
  }
}
