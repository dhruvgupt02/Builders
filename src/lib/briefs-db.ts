import { supabase } from './supabase'
import { emptyBrief, fromRows, toRows, type BriefDraft } from './brief'

const BRIEF_SELECT = '*, brief_rights(*), brief_deliverables(*), brands(profile_id)'

export interface LoadedBrief {
  id: string
  draft: BriefDraft
  /** true when the signed-in user owns the brand behind this brief (the brands row is only readable by its owner) */
  isOwner: boolean
  created_at: string
  updated_at: string
  completeness: number
}

type Row = Record<string, any>

function toLoaded(row: Row, userId: string | null): LoadedBrief {
  const rights = Array.isArray(row.brief_rights) ? row.brief_rights[0] : row.brief_rights
  return {
    id: row.id,
    draft: fromRows(row, rights, row.brief_deliverables),
    isOwner: !!userId && row.brands?.profile_id === userId,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    completeness: row.completeness ?? 0,
  }
}

export async function loadBrief(id: string, userId: string | null): Promise<LoadedBrief | null> {
  const { data } = await supabase.from('briefs').select(BRIEF_SELECT).eq('id', id).maybeSingle()
  return data ? toLoaded(data, userId) : null
}

/** The signed-in brand's own briefs, newest edit first. */
export async function loadMyBriefs(userId: string): Promise<LoadedBrief[]> {
  const { data } = await supabase.from('briefs').select('*, brief_rights(*), brief_deliverables(*), brands!inner(profile_id)').eq('brands.profile_id', userId).order('updated_at', { ascending: false })
  return (data ?? []).map((r) => toLoaded(r, userId))
}

/** Open briefs from every brand, for the creators' board. */
export async function loadOpenBriefs(userId: string | null): Promise<LoadedBrief[]> {
  const { data } = await supabase.from('briefs').select(BRIEF_SELECT).eq('status', 'open').order('created_at', { ascending: false }).limit(200)
  return (data ?? []).map((r) => toLoaded(r, userId))
}

/** The user's brand row, created on first use. Briefs hang off a brand. */
export async function ensureBrand(userId: string, companyName: string): Promise<string> {
  const { data: existing } = await supabase.from('brands').select('id').eq('profile_id', userId).order('created_at').limit(1).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await supabase.from('brands').insert({ profile_id: userId, company_name: companyName.trim() || 'My brand' }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function myBrandName(userId: string): Promise<string> {
  const { data } = await supabase.from('brands').select('company_name').eq('profile_id', userId).order('created_at').limit(1).maybeSingle()
  return data?.company_name ?? ''
}

/** Inserts or updates a brief with its rights and deliverables. Returns the brief id. */
export async function saveBrief(draft: BriefDraft, id: string | null, userId: string): Promise<string> {
  const rows = toRows(draft)
  let briefId = id
  if (briefId) {
    const { data, error } = await supabase.from('briefs').update(rows.brief).eq('id', briefId).select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) throw new Error('This brief could not be saved. You may not be its owner.')
  } else {
    const brandId = await ensureBrand(userId, draft.brand_name)
    const { data, error } = await supabase.from('briefs').insert({ ...rows.brief, brand_id: brandId }).select('id').single()
    if (error) throw new Error(error.message)
    briefId = data.id as string
  }
  const rights = await supabase.from('brief_rights').upsert({ brief_id: briefId, ...rows.rights }, { onConflict: 'brief_id' })
  if (rights.error) throw new Error(rights.error.message)
  // Deliverables are few and ordered, so replacing them is simpler and safer than diffing.
  const cleared = await supabase.from('brief_deliverables').delete().eq('brief_id', briefId)
  if (cleared.error) throw new Error(cleared.error.message)
  if (rows.deliverables.length) {
    const added = await supabase.from('brief_deliverables').insert(rows.deliverables.map((d) => ({ ...d, brief_id: briefId })))
    if (added.error) throw new Error(added.error.message)
  }
  return briefId!
}

export async function duplicateBrief(source: LoadedBrief, userId: string): Promise<string> {
  const copy: BriefDraft = { ...emptyBrief(), ...source.draft, title: `Copy of ${source.draft.title}`.slice(0, 120), status: 'draft' }
  return saveBrief(copy, null, userId)
}

export async function deleteBrief(id: string): Promise<boolean> {
  const { data } = await supabase.from('briefs').delete().eq('id', id).select('id')
  return (data?.length ?? 0) > 0
}

export async function setBriefStatus(id: string, status: BriefDraft['status']): Promise<boolean> {
  const { data } = await supabase.from('briefs').update({ status }).eq('id', id).select('id')
  return (data?.length ?? 0) > 0
}
