import { supabase } from './supabase'

export type AiResult = { ok: true; text: string } | { ok: false; error: string }

const FALLBACK = 'AI help is unavailable right now. You can carry on and write this yourself.'

/** Calls one of the /api/ai text routes. Never throws: failures come back as a message to show the user. */
export async function callAi(route: 'polish-bio' | 'describe-item', body: unknown): Promise<AiResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const res = await fetch(`/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    })
    // A missing route or a platform error page is not JSON; treat it as "unavailable".
    const json = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
    if (res.ok && json?.text) return { ok: true, text: json.text }
    if (res.status === 429) return { ok: false, error: json?.error ?? 'The AI is busy right now. Please wait a minute and try again.' }
    return { ok: false, error: json?.error ?? FALLBACK }
  } catch {
    return { ok: false, error: FALLBACK }
  }
}

/**
 * Asks the server to (re)compute the search embedding of a row the user just saved, so it is searchable
 * straight away. Fire and forget: if it fails the save still stands and `npm run embed` fills it in later.
 */
export async function embedRow(table: 'creators' | 'portfolio_items', id: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const res = await fetch('/api/ai/embed-row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ table, id }),
      keepalive: true,
    })
    if (!res.ok) console.warn(`[embed] ${table} ${id} was not embedded (${res.status}); it stays searchable by keyword.`)
  } catch (err) {
    console.warn(`[embed] ${table} ${id} was not embedded:`, (err as Error).message)
  }
}
