import type { CommercialUseStatus } from './taxonomy'

export type VerificationType = 'tool' | 'workflow' | 'past_work'

export interface Verification {
  id: string
  type: VerificationType
  label: string | null
  status: 'pending' | 'verified' | 'rejected'
  portfolio_item_id?: string | null
  evidence_url?: string | null
  reason?: string | null
  created_at?: string
}

export interface Creator {
  id: string
  profile_id?: string | null
  name: string
  headline: string | null
  bio: string | null
  city: string | null
  avatar_url: string | null
  specializations: string[]
  skills: string[]
  tools: string[]
  languages: string[]
  price_min: number | null
  price_max: number | null
  availability: string | null
  verifications?: Verification[]
}

export interface WorkflowStep {
  id: string
  step_order: number
  tool: string
  action: string
  note: string | null
  step_media_url: string | null
}

export interface PortfolioItem {
  id: string
  creator_id: string
  title: string
  description: string | null
  media_type: 'video' | 'image'
  media_url: string | null
  thumbnail_url: string | null
  content_type: string | null
  aspect_ratio: string | null
  duration_sec: number | null
  resolution: string | null
  style_tags: string[]
  tools: string[]
  client_name: string | null
  commercial_use_status: CommercialUseStatus | null
  workflow_steps?: WorkflowStep[]
  creators?: (Pick<Creator, 'id' | 'name' | 'avatar_url' | 'city'> & Partial<Pick<Creator, 'headline' | 'profile_id' | 'verifications'>>) | null
}

/** The verification fields every public page selects. */
export const VERIFICATION_COLUMNS = 'id,type,label,status,portfolio_item_id'
