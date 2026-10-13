import type { ReactNode } from 'react'
import { EmptyState, Spinner } from '../components/ui'
import { useAuth } from './useAuth'

/**
 * For creator-only pages. `gate` is what to render instead of the page (spinner, login prompt, ...)
 * or null when the visitor is a logged-in creator. `needProfile` also requires a creators row.
 */
export function useCreatorGate({ needProfile = true } = {}) {
  const auth = useAuth()
  let gate: ReactNode = null
  if (auth.loading) gate = <Spinner />
  else if (!auth.session)
    gate = <EmptyState title="Log in to continue" body="This page is for creators with a BRIVIO account." action={{ to: '/login', label: 'Log in' }} />
  else if (auth.role !== 'creator')
    gate = <EmptyState title="Creators only" body="You are logged in with a brand account. Creator tools are available to creator accounts." action={{ to: '/creators', label: 'Browse creators' }} />
  else if (needProfile && !auth.creatorId)
    gate = <EmptyState title="Set up your profile first" body="Create your creator profile, then add portfolio pieces." action={{ to: '/onboarding/creator', label: 'Create profile' }} />
  return { ...auth, gate }
}
