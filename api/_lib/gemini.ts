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

export function isRateLimited(err: unknown) {
  const e = err as { status?: number; code?: number; message?: string }
  return (e?.status ?? e?.code) === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(e?.message ?? '')
}

function isRetryable(err: unknown) {
  const e = err as { status?: number; code?: number; message?: string }
  return isRateLimited(err) || (e?.status ?? e?.code) === 503 || /UNAVAILABLE|overloaded/i.test(e?.message ?? '')
}

/**
 * Runs fn, retrying up to 3 times on 429/503 with exponential backoff (baseMs, then 2x, 4x).
 * Scripts use the default 2s base; interactive API routes pass a shorter one.
 */
export async function withRetry<T>(fn: () => Promise<T>, label = 'gemini', baseMs = 2000): Promise<T> {
  const maxRetries = 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) throw err
      const wait = baseMs * 2 ** attempt
      console.warn(`[${label}] rate limited / unavailable, retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s`)
      await sleep(wait)
    }
  }
}

// ───────────── text generation with a time limit and a fallback model ─────────────

/** Used when GEMINI_MODEL is overloaded or does not answer in time. Override with GEMINI_FALLBACK_MODEL. */
export function fallbackModel() {
  return process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest'
}

const ATTEMPT_MS = 8000
// After the main model fails, skip it for a while so later requests answer quickly from the fallback.
const SKIP_PRIMARY_MS = 3 * 60 * 1000
let skipPrimaryUntil = 0

function isUnavailable(err: unknown) {
  return isRetryable(err) || /abort|timed? ?out/i.test((err as Error)?.message ?? '')
}

function callModel(model: string, system: string | undefined, prompt: string) {
  // An overloaded model can leave the request hanging with no response at all, so every attempt is capped.
  const signal = AbortSignal.timeout(ATTEMPT_MS)
  const call = getGemini().models.generateContent({ model, contents: prompt, config: { systemInstruction: system, temperature: 0.7, abortSignal: signal } })
  call.catch(() => {})
  const limit = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(new Error(`UNAVAILABLE: ${model} did not answer within ${ATTEMPT_MS / 1000}s`))),
  )
  return Promise.race([call, limit])
}

/**
 * Generates text with GEMINI_MODEL, falling back to the lite model if the first one is overloaded,
 * rate limited or silent. Returns the text and the model that actually answered.
 */
export async function generateText(opts: { prompt: string; system?: string; label?: string }): Promise<{ text: string; model: string }> {
  const label = opts.label ?? 'gemini'
  let lastError: unknown
  const models = [...new Set([chatModel(), fallbackModel()])]
  if (models.length > 1 && Date.now() < skipPrimaryUntil) models.shift()
  for (const model of models) {
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const text = (await callModel(model, opts.system, opts.prompt)).text?.trim()
          if (!text) throw new Error(`UNAVAILABLE: ${model} returned an empty response`)
          return { text, model }
        } catch (err) {
          // One quick retry for a rate limit; anything else moves on to the fallback model.
          if (attempt === 0 && isRateLimited(err)) await sleep(1500)
          else throw err
        }
      }
    } catch (err) {
      lastError = err
      console.warn(`[${label}] ${model} failed: ${String((err as Error)?.message).slice(0, 160)}`)
      if (!isUnavailable(err)) throw err // bad key, bad request: a second model will not help
      if (model === chatModel()) skipPrimaryUntil = Date.now() + SKIP_PRIMARY_MS
    }
  }
  throw lastError
}
