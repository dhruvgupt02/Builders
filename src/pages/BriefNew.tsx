import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { formatINR } from '../lib/format'
import { PageContainer, Spinner } from '../components/ui'

interface BriefRow {
  id: string
  title: string
  content_type: string | null
  budget_min: number | null
  budget_max: number | null
  status: string
}

// Placeholder: the brief builder form comes next. For now, logged-in brands see their existing briefs.
export default function BriefNew() {
  const { session, loading } = useSession()
  const [briefs, setBriefs] = useState<BriefRow[] | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('briefs')
      .select('id,title,content_type,budget_min,budget_max,status, brands!inner(profile_id)')
      .eq('brands.profile_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setBriefs((data as unknown as BriefRow[]) ?? []))
  }, [session])

  return (
    <PageContainer>
      <h1 className="text-3xl font-bold text-gray-900">Create a creative brief</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Describe your idea, format, style and commercial-use rights, and BRIVIO matches you with the right AI creators.
        The brief builder is launching shortly.
      </p>

      {loading ? (
        <Spinner />
      ) : !session ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login" className="px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark">
            Log in as a brand
          </Link>
          <Link to="/creators" className="px-5 py-2.5 rounded-lg border border-gray-300 font-medium hover:border-brand hover:text-brand">
            Browse creators meanwhile
          </Link>
        </div>
      ) : (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Your briefs</h2>
          {briefs === null ? (
            <Spinner />
          ) : briefs.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">You have no briefs yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-gray-100 border border-gray-200 rounded-xl">
              {briefs.map((b) => (
                <li key={b.id}>
                  <Link to={`/briefs/${b.id}`} className="flex items-center justify-between p-4 hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">{b.title}</p>
                      <p className="text-sm text-gray-500">
                        {b.content_type} · {formatINR(b.budget_min)} – {formatINR(b.budget_max)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase text-brand">{b.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageContainer>
  )
}
