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
