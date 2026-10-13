import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useSession } from './useSession'

export type Role = 'creator' | 'brand'

/** Session plus what the app needs to route a user: their role and, for creators, their creator row id. */
export function useAuth() {
  const { session, loading: sessionLoading } = useSession()
  const userId = session?.user.id ?? null
  const [state, setState] = useState<{ forUser: string | null; role: Role | null; creatorId: string | null } | null>(null)

  const load = useCallback(async () => {
    if (!userId) return setState({ forUser: null, role: null, creatorId: null })
    const [profile, creator] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.from('creators').select('id').eq('profile_id', userId).order('created_at').limit(1).maybeSingle(),
    ])
    const metaRole = session?.user.user_metadata?.role as Role | undefined
    setState({ forUser: userId, role: (profile.data?.role as Role | undefined) ?? metaRole ?? null, creatorId: creator.data?.id ?? null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!sessionLoading) load()
  }, [sessionLoading, load])

  const ready = !sessionLoading && state !== null && state.forUser === userId
  return {
    session,
    userId,
    loading: !ready,
    role: ready ? state.role : null,
    creatorId: ready ? state.creatorId : null,
    /** Re-read role and creator row, e.g. after onboarding creates the creator. */
    refresh: load,
  }
}
