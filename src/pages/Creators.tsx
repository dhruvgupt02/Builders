import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Creator } from '../lib/types'
import CreatorCard from '../components/CreatorCard'
import { EmptyState, PageContainer, Spinner } from '../components/ui'

export default function Creators() {
  const [creators, setCreators] = useState<Creator[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('creators')
      .select('*, verifications(id,type,label,status)')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setCreators((data as Creator[]) ?? [])
      })
  }, [])

  return (
    <PageContainer>
      <h1 className="text-3xl font-bold text-gray-900">Discover AI creators</h1>
      <p className="mt-2 text-gray-600">AI filmmakers, animators and generative artists ready for brand work.</p>
      <div className="mt-8">
        {creators === null ? (
          <Spinner label="Loading creators…" />
        ) : error ? (
          <EmptyState title="Could not load creators" body={error} />
        ) : creators.length === 0 ? (
          <EmptyState title="No creators yet" body="Check back soon — new AI creators are joining." />
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{creators.length} creators</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {creators.map((c) => <CreatorCard key={c.id} creator={c} />)}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
