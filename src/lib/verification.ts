import type { Verification, VerificationType } from './types'

export const VERIFICATION_INFO: Record<VerificationType, { label: string; short: string; explain: string }> = {
  tool: {
    label: 'Verified tool',
    short: 'Tool',
    explain: 'BRIVIO checked evidence, such as account or project screenshots, that this creator really works with the tool.',
  },
  workflow: {
    label: 'Workflow verified',
    short: 'Workflow',
    explain: 'The step-by-step workflow shown on a portfolio piece was checked against the files behind it.',
  },
  past_work: {
    label: 'Past work verified',
    short: 'Past work',
    explain: 'A client project or published piece was confirmed as delivered by this creator.',
  },
}

/** How something was verified, in a few words, for tooltips. */
export function verificationMethod(type: VerificationType, by: Verification['verified_by']): string | null {
  if (by === 'client') return 'client-confirmed through a one-time link'
  if (by === 'ai') return type === 'workflow' ? 'documented workflow, checked by AI' : 'AI-checked screenshot'
  if (by === 'manual') return 'reviewed by BRIVIO'
  return null
}

export interface VerificationSummary {
  verifiedTools: Set<string>
  workflowItems: Set<string>
  pastWorkItems: Set<string>
  counts: Record<VerificationType, number>
  /** distinct ways each type was verified, e.g. { tool: ['AI-checked screenshot'] } */
  methods: Record<VerificationType, string[]>
  any: boolean
  /** e.g. "3 tools verified · workflow verified · past work verified" */
  text: string
}

export function summarizeVerifications(verifications: Verification[] | null | undefined): VerificationSummary {
  const verified = (verifications ?? []).filter((v) => v.status === 'verified')
  const of = (t: VerificationType) => verified.filter((v) => v.type === t)
  const ids = (t: VerificationType) => new Set(of(t).map((v) => v.portfolio_item_id).filter((id): id is string => !!id))
  const counts = { tool: of('tool').length, workflow: of('workflow').length, past_work: of('past_work').length }
  const parts = [
    counts.tool && `${counts.tool} ${counts.tool === 1 ? 'tool' : 'tools'} verified`,
    counts.workflow && 'workflow verified',
    counts.past_work && 'past work verified',
  ].filter(Boolean)
  const methods = (t: VerificationType) => [...new Set(of(t).map((v) => verificationMethod(t, v.verified_by)).filter((m): m is string => !!m))]
  return {
    methods: { tool: methods('tool'), workflow: methods('workflow'), past_work: methods('past_work') },
    verifiedTools: new Set(of('tool').map((v) => v.label).filter((l): l is string => !!l)),
    workflowItems: ids('workflow'),
    pastWorkItems: ids('past_work'),
    counts,
    any: verified.length > 0,
    text: parts.length ? parts.join(' · ') : 'Not verified yet',
  }
}
