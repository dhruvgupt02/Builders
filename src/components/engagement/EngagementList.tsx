import { Link } from 'react-router-dom'
import { STATUS_LABELS, type Engagement, type EngagementStatus } from '../../lib/engagements'
import { formatINR } from '../../lib/format'
import { ArrowIcon, Avatar, Badge } from '../ui'

const TONE: Record<EngagementStatus, 'blue' | 'orange' | 'ink' | 'muted'> = {
  shortlisted: 'muted', invited: 'orange', accepted: 'blue', declined: 'muted', in_progress: 'blue',
  delivered: 'orange', revision_requested: 'orange', approved: 'ink', cancelled: 'muted',
}

export function EngagementStatusBadge({ status }: { status: EngagementStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABELS[status]}</Badge>
}

/** What the viewer is expected to do next, if anything. */
export function nextStep(status: EngagementStatus, role: 'brand' | 'creator'): string | null {
  if (role === 'creator')
    return status === 'invited' ? 'Reply to the invitation' : status === 'accepted' || status === 'in_progress' ? 'Upload your work' : status === 'revision_requested' ? 'Upload the requested work' : null
  return status === 'shortlisted' ? 'Send an invitation' : status === 'delivered' ? 'Review the delivery' : null
}

/** Rows linking to engagement pages. Brands see the creator; creators see the brief and brand. */
export default function EngagementList({ engagements, role }: { engagements: Engagement[]; role: 'brand' | 'creator' }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {engagements.map((e) => {
        const todo = nextStep(e.status, role)
        return (
          <li key={e.id}>
            <Link to={`/engagements/${e.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue rounded">
              {role === 'brand' && e.creators && <Avatar src={e.creators.avatar_url} name={e.creators.name} />}
              <div className="min-w-0 flex-1">
                <p className="font-bold leading-tight break-words group-hover:text-brand">{role === 'brand' ? e.creators?.name : e.briefs?.title}</p>
                <p className="text-sm text-ink-soft break-words">
                  {role === 'brand' ? e.briefs?.title : e.briefs?.brand_name}
                  {e.agreed_price ? ` · ${formatINR(e.agreed_price)}` : ''}
                  {e.match_score != null && role === 'brand' ? ` · match ${e.match_score}` : ''}
                </p>
                {todo && <p className="mt-0.5 text-xs font-bold text-brand">Your move: {todo}</p>}
              </div>
              <EngagementStatusBadge status={e.status} />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-cream group-hover:bg-brand"><ArrowIcon /></span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
