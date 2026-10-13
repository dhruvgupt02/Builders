import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/useSession'
import { formatDuration, formatINR } from '../lib/format'
import { ChipList, EmptyState, PageContainer, Spinner } from '../components/ui'

interface Brief {
  id: string
  title: string
  goal: string | null
  raw_idea: string | null
  content_type: string | null
  style_tags: string[]
  mood: string | null
  aspect_ratios: string[]
  duration_sec: number | null
  deliverables_count: number | null
  budget_min: number | null
  budget_max: number | null
  deadline: string | null
  revision_rounds: number | null
  required_tools: string[]
  status: string
  brands: { company_name: string } | null
  brief_rights: {
    usage_platforms: string[]
    territory: string | null
    rights_duration: string | null
    exclusivity: boolean
    ai_likeness_allowed: boolean
    ai_voice_allowed: boolean
    requires_tool_commercial_licence: boolean
    credit_required: boolean
  } | null
}

const yesNo = (b: boolean | undefined) => (b ? 'Yes' : 'No')

export default function BriefView() {
  const { id } = useParams()
  const { session, loading } = useSession()
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined)

  useEffect(() => {
    if (!id || !session) return
    supabase
      .from('briefs')
      .select('*, brands(company_name), brief_rights(*)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setBrief((data as Brief) ?? null))
  }, [id, session])

  if (loading) return <Spinner />
  if (!session)
    return <EmptyState title="Log in to view this brief" body="Briefs are visible to logged-in BRIVIO members." action={{ to: '/login', label: 'Log in' }} />
  if (brief === undefined) return <Spinner label="Loading brief…" />
  if (brief === null) return <EmptyState title="Brief not found" action={{ to: '/briefs/new', label: 'Back to briefs' }} />

  const r = brief.brief_rights
  const facts: [string, string | null][] = [
    ['Content type', brief.content_type],
    ['Mood', brief.mood],
    ['Duration', formatDuration(brief.duration_sec)],
    ['Deliverables', brief.deliverables_count?.toString() ?? null],
    ['Budget', `${formatINR(brief.budget_min)} – ${formatINR(brief.budget_max)}`],
    ['Deadline', brief.deadline],
    ['Revision rounds', brief.revision_rounds?.toString() ?? null],
  ]

  return (
    <PageContainer>
      <Link to="/briefs/new" className="text-sm text-ink-soft hover:text-brand font-semibold">← Briefs</Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-brand">{brief.brands?.company_name}</p>
      <h1 className="display mt-2 text-3xl sm:text-5xl">{brief.title}</h1>
      <p className="mt-3 text-ink max-w-3xl">{brief.goal}</p>
      {brief.raw_idea && <p className="mt-3 text-ink-soft max-w-3xl italic">“{brief.raw_idea}”</p>}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-10">
        <div>
          <dl className="grid grid-cols-2 gap-4">
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-ink-soft">{k}</dt>
                <dd className="text-sm font-medium ">{v}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 text-xs font-bold uppercase tracking-wider mb-2">Aspect ratios</h3><ChipList items={brief.aspect_ratios} />
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider mb-2">Style</h3><ChipList items={brief.style_tags} />
          <h3 className="mt-4 text-xs font-bold uppercase tracking-wider mb-2">Required tools</h3><ChipList items={brief.required_tools} tone="orange" />
        </div>
        {r && (
          <div className="rounded-card bg-ink text-cream p-6 [&_dt]:text-cream/60">
            <h2 className="display text-xl">Commercial-use rights</h2>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wider mb-2">Usage platforms</h3><ChipList items={r.usage_platforms} tone="white" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {([
                ['Territory', r.territory],
                ['Duration', r.rights_duration],
                ['Exclusive', yesNo(r.exclusivity)],
                ['AI likeness allowed', yesNo(r.ai_likeness_allowed)],
                ['AI voice allowed', yesNo(r.ai_voice_allowed)],
                ['Tool commercial licence', yesNo(r.requires_tool_commercial_licence)],
                ['Credit required', yesNo(r.credit_required)],
              ] as [string, string | null][]).map(([k, v]) => (
                <div key={k}><dt className="text-ink-soft">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
