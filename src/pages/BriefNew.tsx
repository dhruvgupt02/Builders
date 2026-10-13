import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { formatINR } from '../lib/format'
import { ArrowIcon, Badge, Button, Card, PageContainer, PageHeader, Spinner } from '../components/ui'

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
      <PageHeader
        eyebrow="For brands"
        title="Create a brief"
        subtitle="Describe your idea, format, style and commercial-use rights, and BRIVIO matches you with the right AI creators. The brief builder is launching shortly."
      />

      {loading ? (
        <Spinner />
      ) : !session ? (
        <div className="mt-8 flex flex-wrap gap-3">
          <Button to="/login" icon={<ArrowIcon />}>Log in as a brand</Button>
          <Button to="/creators" variant="outline">Browse creators meanwhile</Button>
        </div>
      ) : (
        <div className="mt-10">
          <h2 className="display text-xl">Your briefs</h2>
          {briefs === null ? (
            <Spinner />
          ) : briefs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">You have no briefs yet.</p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {briefs.map((b) => (
                <li key={b.id}>
                  <Card to={`/briefs/${b.id}`} className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-lg leading-snug">{b.title}</p>
                      <Badge tone="orange">{b.status}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft">
                      {b.content_type} · {formatINR(b.budget_min)} – {formatINR(b.budget_max)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </PageContainer>
  )
}
