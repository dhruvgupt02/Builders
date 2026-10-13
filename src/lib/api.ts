import { supabase } from './supabase'

/** POST to one of the app's own API routes as the signed-in user. Never throws: `json` is null if the call failed. */
export async function authedPost<T = Record<string, any>>(path: string, body: unknown, timeoutMs = 40000): Promise<{ ok: boolean; status: number; json: T | null }> {
  try {
    const { data } = await supabase.auth.getSession()
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { ok: res.ok, status: res.status, json: (await res.json().catch(() => null)) as T | null }
  } catch {
    return { ok: false, status: 0, json: null }
  }
}
