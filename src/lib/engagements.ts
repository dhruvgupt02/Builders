import { supabase } from './supabase'

export const ENGAGEMENT_STATUSES = ['shortlisted', 'invited', 'accepted', 'declined', 'in_progress', 'delivered', 'revision_requested', 'approved', 'cancelled'] as const
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number]

export const STATUS_LABELS: Record<EngagementStatus, string> = {
  shortlisted: 'Shortlisted',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
  in_progress: 'In progress',
  delivered: 'Delivered',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  cancelled: 'Cancelled',
}

/** The happy path, in order, for the timeline. Declined and cancelled end it early. */
export const TIMELINE: EngagementStatus[] = ['shortlisted', 'invited', 'accepted', 'in_progress', 'delivered', 'approved']

export interface Engagement {
  id: string
  brief_id: string
  creator_id: string
  status: EngagementStatus
  agreed_price: number | null
  match_score: number | null
  created_at: string
  updated_at: string
  creators?: { id: string; name: string; avatar_url: string | null; city: string | null; headline: string | null; profile_id?: string | null } | null
  briefs?: { id: string; title: string; brand_name: string | null; deadline: string | null; budget_min: number | null; budget_max: number | null; revision_rounds: number | null } | null
}

export interface EngagementMessage {
  id: string
  engagement_id: string
  sender_id: string | null
  sender_role: 'brand' | 'creator' | 'system'
  kind: 'message' | 'status' | 'invite' | 'revision'
  body: string
  created_at: string
}

export interface Submission {
  id: string
  engagement_id: string
  deliverable_id: string | null
  version: number
  media_url: string
  media_type: 'image' | 'video'
  notes: string | null
  status: 'submitted' | 'approved' | 'revision_requested'
  review_comment: string | null
  reviewed_at: string | null
  created_at: string
}

const SELECT = '*, creators(id,name,avatar_url,city,headline,profile_id), briefs(id,title,brand_name,deadline,budget_min,budget_max,revision_rounds)'

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

/** All engagements on one brief (brand view). */
export async function loadBriefEngagements(briefId: string): Promise<Engagement[]> {
  const { data } = await supabase.from('engagements').select(SELECT).eq('brief_id', briefId).order('updated_at', { ascending: false })
  return (data ?? []) as Engagement[]
}

/** Everything the signed-in user is party to: as a brand (their briefs) or as a creator (their invitations). */
export async function loadMyEngagements(): Promise<Engagement[]> {
  const { data } = await supabase.from('engagements').select(SELECT).order('updated_at', { ascending: false }).limit(200)
  return (data ?? []) as Engagement[]
}

export async function loadEngagement(id: string) {
  const [e, m, s] = await Promise.all([
    supabase.from('engagements').select(SELECT).eq('id', id).maybeSingle(),
    supabase.from('engagement_messages').select('*').eq('engagement_id', id).order('created_at'),
    supabase.from('submissions').select('*').eq('engagement_id', id).order('version'),
  ])
  if (!e.data) return null
  return { engagement: e.data as Engagement, messages: (m.data ?? []) as EngagementMessage[], submissions: (s.data ?? []) as Submission[] }
}

async function log(engagementId: string, role: 'brand' | 'creator', kind: EngagementMessage['kind'], body: string) {
  const { data } = await supabase.auth.getUser()
  fail((await supabase.from('engagement_messages').insert({ engagement_id: engagementId, sender_id: data.user?.id, sender_role: role, kind, body })).error)
}

/** Brand: add a creator to the private shortlist for a brief. Returns the engagement (existing or new). */
export async function shortlist(briefId: string, creatorId: string, score: number | null): Promise<Engagement> {
  const existing = await supabase.from('engagements').select(SELECT).eq('brief_id', briefId).eq('creator_id', creatorId).maybeSingle()
  if (existing.data) return existing.data as Engagement
  const { data, error } = await supabase.from('engagements').insert({ brief_id: briefId, creator_id: creatorId, status: 'shortlisted', match_score: score }).select(SELECT).single()
  fail(error)
  return data as Engagement
}

export async function removeFromShortlist(engagementId: string) {
  const { data } = await supabase.from('engagements').delete().eq('id', engagementId).select('id')
  return (data?.length ?? 0) > 0
}

/** Brand: invite a shortlisted creator, with a message and optionally an offered price. */
export async function invite(engagement: Engagement, message: string, price: number | null): Promise<void> {
  const { error } = await supabase.from('engagements').update({ status: 'invited', agreed_price: price }).eq('id', engagement.id).select('id').single()
  fail(error)
  await log(engagement.id, 'brand', 'invite', message.trim())
}

/** Either side: move the engagement on. The database rejects moves that are not yours to make. */
export async function moveTo(engagementId: string, status: EngagementStatus, role: 'brand' | 'creator', note?: string): Promise<void> {
  const { error } = await supabase.from('engagements').update({ status }).eq('id', engagementId).select('id').single()
  fail(error)
  await log(engagementId, role, 'status', note?.trim() || `${role === 'brand' ? 'The brand' : 'The creator'} marked this ${STATUS_LABELS[status].toLowerCase()}.`)
}

export async function postMessage(engagementId: string, role: 'brand' | 'creator', body: string): Promise<void> {
  await log(engagementId, role, 'message', body.trim())
}

/** Creator: add the next version of a deliverable. The database assigns the version number. */
export async function submitVersion(engagementId: string, deliverableId: string | null, mediaUrl: string, mediaType: 'image' | 'video', notes: string): Promise<Submission> {
  const { data, error } = await supabase.from('submissions').insert({ engagement_id: engagementId, deliverable_id: deliverableId, version: 1, media_url: mediaUrl, media_type: mediaType, notes: notes.trim() || null }).select('*').single()
  fail(error)
  return data as Submission
}

/** Brand: approve a version, or ask for a revision with a comment. */
export async function reviewSubmission(submission: Submission, verdict: 'approved' | 'revision_requested', comment: string): Promise<void> {
  const { error } = await supabase.from('submissions').update({ status: verdict, review_comment: comment.trim() || null, reviewed_at: new Date().toISOString() }).eq('id', submission.id).select('id').single()
  fail(error)
  if (verdict === 'revision_requested') await log(submission.engagement_id, 'brand', 'revision', `Revision requested on v${submission.version}: ${comment.trim()}`)
  else await log(submission.engagement_id, 'brand', 'status', `Approved v${submission.version}.${comment.trim() ? ` ${comment.trim()}` : ''}`)
}
