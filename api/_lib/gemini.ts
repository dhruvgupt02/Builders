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

// ───────────── text generation: a chain of models, raced when one is slow ─────────────
//
// "Latest" model aliases are sometimes overloaded: they answer 503, hit a quota, or accept the request and never
// reply. So generation never depends on one model. GEMINI_MODEL is tried first; if it has not answered after a
// short wait, the next model in the chain is started alongside it, and so on. The first good answer wins and the
// rest are cancelled. A model that fails is skipped for a few minutes.

const DEFAULT_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']

/** GEMINI_MODEL first, then GEMINI_FALLBACK_MODELS (comma-separated) or the defaults. */
export function modelChain(): string[] {
  const extra = (process.env.GEMINI_FALLBACK_MODELS ?? process.env.GEMINI_FALLBACK_MODEL ?? '').split(',').map((m) => m.trim()).filter(Boolean)
  return [...new Set([chatModel(), ...(extra.length ? extra : DEFAULT_FALLBACKS)])]
}

const COOLDOWN_MS = 3 * 60 * 1000
const coolingUntil = new Map<string, number>()

export interface GenerateOptions {
  prompt: string
  system?: string
  label?: string
  /** How long to wait for a model before starting the next one alongside it (default 2.5s). */
  hedgeMs?: number
  /** Give up entirely after this long (default 20s). Keep it under the serverless function limit. */
  deadlineMs?: number
  /** Extra generation config, e.g. { responseMimeType: 'application/json', responseSchema } for JSON mode. */
  config?: Record<string, unknown>
  /** Extra content parts sent with the prompt, e.g. images for vision checks. */
  parts?: { inlineData: { mimeType: string; data: string } }[]
}

/** Returns the text and the model that actually answered. Throws if every model fails or the deadline passes. */
export function generateText(opts: GenerateOptions): Promise<{ text: string; model: string }> {
  const label = opts.label ?? 'gemini'
  const ai = getGemini() // throws straight away if the key is missing
  const now = Date.now()
  const chain = modelChain()
  const ready = chain.filter((m) => (coolingUntil.get(m) ?? 0) <= now)
  const models = ready.length ? ready : chain // if everything is cooling down, try them all again
  const contents = opts.parts?.length ? [{ role: 'user', parts: [...opts.parts, { text: opts.prompt }] }] : opts.prompt

  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = []
    const errors: unknown[] = []
    const inFlight = new Set<string>()
    let started = 0
    let running = 0
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearInterval(hedge)
      clearTimeout(deadline)
      for (const c of controllers) c.abort()
      fn()
    }
    const fail = () => {
      // A rate-limit error is the most useful one to report: callers show "busy, try again in a minute".
      const err = errors.find(isRateLimited) ?? errors[errors.length - 1] ?? new Error('UNAVAILABLE: no model answered in time')
      finish(() => reject(err))
    }
    const startNext = () => {
      if (settled || started >= models.length) return
      const model = models[started++]
      const controller = new AbortController()
      controllers.push(controller)
      running++
      inFlight.add(model)
      ai.models
        .generateContent({ model, contents, config: { systemInstruction: opts.system, temperature: 0.7, ...opts.config, abortSignal: controller.signal } })
        .then((res) => {
          const text = res.text?.trim()
          if (!text) throw new Error(`UNAVAILABLE: ${model} returned an empty response`)
          coolingUntil.delete(model)
          inFlight.delete(model)
          // Models that were started earlier and still had not answered are resting too: next time go straight to a quick one.
          for (const slow of inFlight) coolingUntil.set(slow, Date.now() + COOLDOWN_MS)
          finish(() => resolve({ text, model }))
        })
        .catch((err) => {
          if (settled) return // cancelled because another model won
          running--
          inFlight.delete(model)
          errors.push(err)
          coolingUntil.set(model, Date.now() + COOLDOWN_MS)
          console.warn(`[${label}] ${model} failed: ${String((err as Error)?.message).slice(0, 140)}`)
          if (started < models.length) startNext()
          else if (running === 0) fail()
        })
    }

    const hedge = setInterval(startNext, opts.hedgeMs ?? 2500)
    const deadline = setTimeout(() => {
      // Whatever is still running has been silent for too long: rest those models for a while.
      for (const m of models.slice(0, started)) if (!coolingUntil.has(m)) coolingUntil.set(m, Date.now() + COOLDOWN_MS)
      errors.push(new Error(`UNAVAILABLE: no model answered within ${(opts.deadlineMs ?? 20000) / 1000}s`))
      fail()
    }, opts.deadlineMs ?? 20000)
    startNext()
  })
}
