// The brief model: one flat draft object used by the form, the AI builder, the tests and the database mappers.
// Pure TypeScript (no browser or Supabase imports) so the API routes and scripts run the exact same code.
import {
  ASPECT_RATIOS, CONTENT_TYPES, IP_OWNERSHIP, IP_OWNERSHIP_LABELS, MUSIC_SOURCES, MUSIC_SOURCE_LABELS, REAL_PEOPLE_LIKENESS,
  REAL_PEOPLE_LIKENESS_LABELS, RESOLUTIONS, RIGHTS_DURATIONS, TERRITORIES, TOOLS, USAGE_PLATFORMS, type BriefStatus,
} from './taxonomy.js'

export interface DeliverableDraft {
  key: string
  content_type: string
  aspect_ratio: string
  duration_sec: number | null
  quantity: number
  notes: string
}

export interface BriefDraft {
  // 1. basics
  title: string
  brand_name: string
  product: string
  goal: string
  target_audience: string
  key_message: string
  deadline: string // yyyy-mm-dd or ''
  raw_idea: string
  // 2. creative
  content_type: string
  style_tags: string[]
  mood: string
  style_references: string[]
  mandatory_elements: string
  avoid: string
  required_tools: string[]
  excluded_tools: string[]
  // 3. format
  deliverables: DeliverableDraft[]
  resolution: string
  revision_rounds: number | null
  // 4. commercial use
  usage_platforms: string[]
  territory: string
  rights_duration: string
  exclusivity: boolean
  ip_ownership: string
  real_people_likeness: string
  ai_voice_allowed: boolean
  music_source: string
  ai_disclosure_required: boolean
  credit_required: boolean
  requires_tool_commercial_licence: boolean
  rights_notes: string
  // 5. budget
  budget_min: number | null
  budget_max: number | null
  status: BriefStatus
}

export type BriefField = keyof BriefDraft

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

export const newDeliverable = (partial: Partial<DeliverableDraft> = {}): DeliverableDraft => ({
  key: uid(), content_type: '', aspect_ratio: '', duration_sec: null, quantity: 1, notes: '', ...partial,
})

export function emptyBrief(): BriefDraft {
  return {
    title: '', brand_name: '', product: '', goal: '', target_audience: '', key_message: '', deadline: '', raw_idea: '',
    content_type: '', style_tags: [], mood: '', style_references: [], mandatory_elements: '', avoid: '', required_tools: [], excluded_tools: [],
    deliverables: [newDeliverable()], resolution: '', revision_rounds: 2,
    usage_platforms: [], territory: '', rights_duration: '', exclusivity: false, ip_ownership: '', real_people_likeness: '',
    ai_voice_allowed: false, music_source: '', ai_disclosure_required: false, credit_required: false, requires_tool_commercial_licence: true,
    rights_notes: '', budget_min: null, budget_max: null, status: 'draft',
  }
}

// ───────────── steps, validation, completeness ─────────────

export const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'creative', label: 'Creative' },
  { id: 'format', label: 'Format' },
  { id: 'rights', label: 'Commercial use' },
  { id: 'review', label: 'Budget & review' },
] as const
export type StepId = (typeof STEPS)[number]['id']

const TIMED = ['Video', 'Animation', 'Audio/music']
export const needsDuration = (contentType: string) => TIMED.includes(contentType)

export function deliverableProblem(d: DeliverableDraft): string | null {
  if (!d.content_type) return 'choose a content type'
  if (!d.aspect_ratio) return 'choose an aspect ratio'
  if (needsDuration(d.content_type) && !(Number(d.duration_sec) > 0)) return 'add a duration in seconds'
  if (!(d.quantity >= 1)) return 'quantity must be at least 1'
  return null
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Required-field errors for one step, keyed by field. Empty object = the step is valid. */
export function validateStep(b: BriefDraft, step: StepId): Partial<Record<BriefField, string>> {
  const e: Partial<Record<BriefField, string>> = {}
  if (step === 'basics') {
    if (b.title.trim().length < 4) e.title = 'Give the brief a title (at least 4 characters).'
    if (!b.brand_name.trim()) e.brand_name = 'Enter the brand name.'
    if (b.goal.trim().length < 10) e.goal = 'Say what this campaign should achieve (a sentence is enough).'
    if (!b.deadline) e.deadline = 'Choose a delivery deadline.'
    else if (b.deadline < today()) e.deadline = 'The deadline is in the past.'
  }
  if (step === 'creative') {
    if (!b.content_type) e.content_type = 'Choose the main content type.'
    if (!b.style_tags.length) e.style_tags = 'Add at least one style tag, e.g. cinematic or pastel.'
    const clash = b.required_tools.filter((t) => b.excluded_tools.includes(t))
    if (clash.length) e.excluded_tools = `${clash.join(', ')} cannot be both required and excluded.`
  }
  if (step === 'format') {
    if (!b.deliverables.length) e.deliverables = 'Add at least one deliverable.'
    else {
      const bad = b.deliverables.findIndex((d) => deliverableProblem(d))
      if (bad > -1) e.deliverables = `Deliverable ${bad + 1}: ${deliverableProblem(b.deliverables[bad])}.`
    }
  }
  if (step === 'rights') {
    if (!b.usage_platforms.length) e.usage_platforms = 'Choose at least one place the work will be used.'
    if (!b.territory) e.territory = 'Choose the usage territory.'
    if (!b.rights_duration) e.rights_duration = 'Choose how long you need the rights for.'
    if (!b.ip_ownership) e.ip_ownership = 'Choose who owns the finished work.'
    if (!b.real_people_likeness) e.real_people_likeness = 'Say whether real people may appear.'
    if (!b.music_source) e.music_source = 'Choose where the music comes from.'
  }
  if (step === 'review') {
    if (!(Number(b.budget_min) >= 1000)) e.budget_min = 'Enter a minimum budget of at least ₹1,000.'
    if (!(Number(b.budget_max) > 0)) e.budget_max = 'Enter a maximum budget.'
    else if (Number(b.budget_max) < Number(b.budget_min)) e.budget_max = 'The maximum must be the same as or higher than the minimum.'
  }
  return e
}

/** Every required-field problem in the brief, with the step it belongs to. A brief can be published when this is empty. */
export function publishProblems(b: BriefDraft): { step: StepId; field: BriefField; message: string }[] {
  return STEPS.flatMap((s) => Object.entries(validateStep(b, s.id)).map(([field, message]) => ({ step: s.id, field: field as BriefField, message: message! })))
}

interface CompletenessItem {
  field: BriefField
  step: StepId
  /** what to do when it is missing */
  todo: string
  done: (b: BriefDraft) => boolean
  weight?: number
}

const has = (s: string) => s.trim().length > 0

const COMPLETENESS: CompletenessItem[] = [
  { field: 'title', step: 'basics', todo: 'Add a title', done: (b) => b.title.trim().length >= 4 },
  { field: 'brand_name', step: 'basics', todo: 'Add the brand name', done: (b) => has(b.brand_name) },
  { field: 'product', step: 'basics', todo: 'Say what product or service this is for', done: (b) => has(b.product) },
  { field: 'goal', step: 'basics', todo: 'Describe the campaign goal', done: (b) => b.goal.trim().length >= 10 },
  { field: 'target_audience', step: 'basics', todo: 'Describe the target audience', done: (b) => has(b.target_audience) },
  { field: 'key_message', step: 'basics', todo: 'Add the key message', done: (b) => has(b.key_message) },
  { field: 'deadline', step: 'basics', todo: 'Set a deadline', done: (b) => !!b.deadline && b.deadline >= today() },
  { field: 'content_type', step: 'creative', todo: 'Choose a content type', done: (b) => !!b.content_type },
  { field: 'style_tags', step: 'creative', todo: 'Add style tags', done: (b) => b.style_tags.length > 0 },
  { field: 'mood', step: 'creative', todo: 'Describe the mood', done: (b) => has(b.mood) },
  { field: 'mandatory_elements', step: 'creative', todo: 'List mandatory elements (logo, tagline…)', done: (b) => has(b.mandatory_elements) },
  { field: 'deliverables', step: 'format', todo: 'Complete the deliverables (type, aspect ratio, duration)', weight: 3, done: (b) => b.deliverables.length > 0 && b.deliverables.every((d) => !deliverableProblem(d)) },
  { field: 'resolution', step: 'format', todo: 'Choose a resolution', done: (b) => has(b.resolution) },
  { field: 'revision_rounds', step: 'format', todo: 'Set the number of revision rounds', done: (b) => b.revision_rounds != null },
  { field: 'usage_platforms', step: 'rights', todo: 'Choose usage platforms', weight: 2, done: (b) => b.usage_platforms.length > 0 },
  { field: 'territory', step: 'rights', todo: 'Add usage territory', done: (b) => !!b.territory },
  { field: 'rights_duration', step: 'rights', todo: 'Add rights duration', done: (b) => !!b.rights_duration },
  { field: 'ip_ownership', step: 'rights', todo: 'Say who owns the finished work', done: (b) => !!b.ip_ownership },
  { field: 'real_people_likeness', step: 'rights', todo: 'Say whether real people may appear', done: (b) => !!b.real_people_likeness },
  { field: 'music_source', step: 'rights', todo: 'Choose the music source', done: (b) => !!b.music_source },
  { field: 'budget_max', step: 'review', todo: 'Add a budget range', weight: 2, done: (b) => Number(b.budget_min) >= 1000 && Number(b.budget_max) >= Number(b.budget_min) },
]

export function completeness(b: BriefDraft): { percent: number; missing: { field: BriefField; step: StepId; todo: string }[] } {
  const total = COMPLETENESS.reduce((s, i) => s + (i.weight ?? 1), 0)
  const done = COMPLETENESS.filter((i) => i.done(b)).reduce((s, i) => s + (i.weight ?? 1), 0)
  return {
    percent: Math.round((done / total) * 100),
    missing: COMPLETENESS.filter((i) => !i.done(b)).map(({ field, step, todo }) => ({ field, step, todo })),
  }
}

// ───────────── plain-English summaries ─────────────

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)
const inr = (n: number | null) => (n == null ? '' : `₹${Number(n).toLocaleString('en-IN')}`)

export function formatDeliverable(d: DeliverableDraft) {
  return `${d.quantity} × ${[d.duration_sec ? `${d.duration_sec}s` : null, d.aspect_ratio, d.content_type || 'deliverable'].filter(Boolean).join(' ')}`
}

export function deliverableTotal(b: BriefDraft) {
  return b.deliverables.reduce((s, d) => s + (Number(d.quantity) || 0), 0)
}

/** The commercial-use terms as one sentence anyone can read. */
export function rightsSentence(b: BriefDraft): string {
  if (!b.usage_platforms.length && !b.territory && !b.rights_duration) return 'Commercial-use terms have not been set yet.'
  const brand = b.brand_name || 'The brand'
  // Each opening ends ready for "on <platforms> in <territory> for <duration>".
  const lead =
    b.ip_ownership === 'brand_owns' ? `${brand} will own the finished work and may use it`
    : b.ip_ownership === 'licensed_to_brand' ? `The creator keeps ownership and licenses the work to ${brand}, who may use it`
    : b.ip_ownership === 'creator_retains' ? `The creator keeps ownership; ${brand} may use the work`
    : `${brand} may use the work`
  const where = b.usage_platforms.length ? ` on ${list(b.usage_platforms.map((p) => p.toLowerCase().replace('ooh', 'OOH').replace('tv', 'TV').replace('youtube', 'YouTube')))}` : ''
  const territory = b.territory ? (b.territory === 'Global' ? ' worldwide' : ` in ${b.territory}`) : ''
  const duration = b.rights_duration ? (b.rights_duration === 'Perpetual' ? ' forever' : ` for ${b.rights_duration}`) : ''
  const exclusive = b.exclusivity ? ', exclusively' : ', non-exclusively'
  const people =
    b.real_people_likeness === 'none' ? 'No real people may appear'
    : b.real_people_likeness === 'licensed_talent' ? 'Real people may appear only as licensed talent'
    : b.real_people_likeness === 'creator_self' ? 'Only the creator themselves may appear'
    : null
  const extras = [
    people,
    b.ai_voice_allowed ? 'AI voice is allowed' : 'AI voice is not allowed',
    b.music_source ? `music: ${MUSIC_SOURCE_LABELS[b.music_source as keyof typeof MUSIC_SOURCE_LABELS]?.toLowerCase()}` : null,
    b.ai_disclosure_required ? 'the work must be disclosed as AI-made' : null,
    b.credit_required ? 'the creator must be credited' : null,
    b.requires_tool_commercial_licence ? 'tools must be commercially licensed' : null,
  ].filter(Boolean) as string[]
  const first = `${lead}${where}${territory}${duration}${exclusive}.`
  return extras.length ? `${first} ${extras[0].charAt(0).toUpperCase()}${extras.join('; ').slice(1)}.` : first
}

export const ipLabel = (v: string) => IP_OWNERSHIP_LABELS[v as keyof typeof IP_OWNERSHIP_LABELS] ?? v
export const likenessLabel = (v: string) => REAL_PEOPLE_LIKENESS_LABELS[v as keyof typeof REAL_PEOPLE_LIKENESS_LABELS] ?? v
export const musicLabel = (v: string) => MUSIC_SOURCE_LABELS[v as keyof typeof MUSIC_SOURCE_LABELS] ?? v

// ───────────── rule-based checks ("Check my brief") ─────────────

export interface CheckItem {
  kind: 'gap' | 'conflict' | 'suggestion'
  title: string
  detail: string
  step?: StepId
}

const VERTICAL_OR_SQUARE = ['9:16', '1:1', '4:5']
const STILL = ['Image', 'Graphic design']

/** Checks that need no AI. They always run, so "Check my brief" works even when Gemini is down. */
export function ruleChecks(b: BriefDraft): CheckItem[] {
  const out: CheckItem[] = []
  const ratios = new Set(b.deliverables.map((d) => d.aspect_ratio).filter(Boolean))
  const types = new Set(b.deliverables.map((d) => d.content_type).filter(Boolean))
  const uses = (p: string) => b.usage_platforms.includes(p)
  const count = deliverableTotal(b)

  for (const m of completeness(b).missing) out.push({ kind: 'gap', title: m.todo, detail: 'This is still empty.', step: m.step })

  if ((uses('TV') || uses('YouTube ads')) && ratios.size > 0 && !ratios.has('16:9'))
    out.push({ kind: 'conflict', step: 'format', title: `${[...ratios].join(', ')} ${ratios.size === 1 ? 'deliverable' : 'deliverables'} but usage includes ${uses('TV') ? 'TV' : 'YouTube ads'}`, detail: 'TV and YouTube ads are widescreen. Add a 16:9 deliverable or remove that platform.' })
  if ((uses('Organic social') || uses('Paid social ads')) && ratios.size > 0 && !VERTICAL_OR_SQUARE.some((r) => ratios.has(r)))
    out.push({ kind: 'suggestion', step: 'format', title: 'Social usage but only 16:9 deliverables', detail: 'Feeds and reels work best in 9:16, 4:5 or 1:1. Consider adding a vertical cutdown.' })
  if ((uses('Print') || uses('OOH/billboards')) && types.size > 0 && !STILL.some((t) => types.has(t)))
    out.push({ kind: 'conflict', step: 'format', title: `${uses('Print') ? 'Print' : 'Billboard'} usage but no still deliverable`, detail: 'Print and most billboards need an Image or Graphic design deliverable.' })
  const clash = b.required_tools.filter((t) => b.excluded_tools.includes(t))
  if (clash.length) out.push({ kind: 'conflict', step: 'creative', title: `${clash.join(', ')} is both required and excluded`, detail: 'Remove it from one of the two lists.' })

  if (b.budget_max && count > 0 && b.budget_max / count < 4000)
    out.push({ kind: 'suggestion', step: 'review', title: `Budget seems low for ${count} ${count === 1 ? 'deliverable' : 'deliverables'}`, detail: `${inr(b.budget_max)} works out to about ${inr(Math.round(b.budget_max / count))} each. Most creators start around ₹3,000 to ₹8,000 per piece.` })
  if (b.exclusivity && b.rights_duration === 'Perpetual' && b.budget_max && b.budget_max < 50000)
    out.push({ kind: 'suggestion', step: 'rights', title: 'Exclusive, perpetual rights on a small budget', detail: 'Creators usually charge more for exclusive rights forever. Consider a fixed term or a higher budget.' })
  if (b.deadline) {
    const days = Math.round((Date.parse(b.deadline) - Date.parse(today())) / 86400000)
    if (days >= 0 && days < 5) out.push({ kind: 'suggestion', step: 'basics', title: `Deadline is in ${days} ${days === 1 ? 'day' : 'days'}`, detail: 'Very short turnarounds limit who can take the job. A week or more gets you more creators.' })
    if (days >= 0 && b.revision_rounds && days < b.revision_rounds * 3) out.push({ kind: 'suggestion', step: 'format', title: `${b.revision_rounds} revision rounds in ${days} days is tight`, detail: 'Allow roughly three days per revision round, or reduce the rounds.' })
  }
  if (b.real_people_likeness && b.real_people_likeness !== 'none' && !b.ai_disclosure_required)
    out.push({ kind: 'suggestion', step: 'rights', title: 'Real people appear but AI disclosure is off', detail: 'When AI is used with real people, labelling the work as AI-made is safer and often required by platforms.' })
  if (b.music_source === 'none' && [...types].some((t) => t === 'Video' || t === 'Animation'))
    out.push({ kind: 'suggestion', step: 'rights', title: 'Video with no music', detail: 'Check this is intended. Most ads and reels need a music bed or sound design.' })
  if (!b.requires_tool_commercial_licence && (uses('Paid social ads') || uses('YouTube ads') || uses('TV')))
    out.push({ kind: 'suggestion', step: 'rights', title: 'Paid advertising without a tool-licence requirement', detail: 'For paid media, require creators to use commercially licensed tool plans.' })
  if (b.required_tools.length > 4)
    out.push({ kind: 'suggestion', step: 'creative', title: `${b.required_tools.length} required tools`, detail: 'Each required tool narrows who can apply. Keep only the ones that really matter.' })
  return out
}

// ───────────── database rows ─────────────

export function toRows(b: BriefDraft) {
  const ratios = [...new Set(b.deliverables.map((d) => d.aspect_ratio).filter(Boolean))]
  return {
    brief: {
      title: b.title.trim() || 'Untitled brief', brand_name: b.brand_name.trim() || null, product: b.product.trim() || null, goal: b.goal.trim() || null,
      raw_idea: b.raw_idea.trim() || null, target_audience: b.target_audience.trim() || null, key_message: b.key_message.trim() || null,
      deadline: b.deadline || null, content_type: b.content_type || null, style_tags: b.style_tags, mood: b.mood.trim() || null,
      style_references: b.style_references, mandatory_elements: b.mandatory_elements.trim() || null, avoid: b.avoid.trim() || null,
      required_tools: b.required_tools, excluded_tools: b.excluded_tools, resolution: b.resolution || null, revision_rounds: b.revision_rounds,
      budget_min: b.budget_min, budget_max: b.budget_max, aspect_ratios: ratios,
      duration_sec: b.deliverables.find((d) => d.duration_sec)?.duration_sec ?? null, deliverables_count: deliverableTotal(b),
      completeness: completeness(b).percent, status: b.status,
    },
    rights: {
      usage_platforms: b.usage_platforms, territory: b.territory || null, rights_duration: b.rights_duration || null, exclusivity: b.exclusivity,
      ip_ownership: b.ip_ownership || null, real_people_likeness: b.real_people_likeness || null,
      ai_likeness_allowed: !!b.real_people_likeness && b.real_people_likeness !== 'none', ai_voice_allowed: b.ai_voice_allowed,
      music_source: b.music_source || null, ai_disclosure_required: b.ai_disclosure_required, credit_required: b.credit_required,
      requires_tool_commercial_licence: b.requires_tool_commercial_licence, notes: b.rights_notes.trim() || null,
    },
    deliverables: b.deliverables.map((d, i) => ({
      position: i + 1, content_type: d.content_type || null, aspect_ratio: d.aspect_ratio || null,
      duration_sec: d.duration_sec ? Math.round(Number(d.duration_sec)) : null, quantity: Math.max(1, Math.round(Number(d.quantity) || 1)), notes: d.notes.trim() || null,
    })),
  }
}

type Row = Record<string, any>

export function fromRows(brief: Row, rights: Row | null | undefined, deliverables: Row[] | null | undefined): BriefDraft {
  const e = emptyBrief()
  const rows = [...(deliverables ?? [])].sort((a, b) => a.position - b.position)
  return {
    ...e,
    title: brief.title ?? '', brand_name: brief.brand_name ?? '', product: brief.product ?? '', goal: brief.goal ?? '',
    target_audience: brief.target_audience ?? '', key_message: brief.key_message ?? '', deadline: brief.deadline ?? '', raw_idea: brief.raw_idea ?? '',
    content_type: brief.content_type ?? '', style_tags: brief.style_tags ?? [], mood: brief.mood ?? '',
    style_references: brief.style_references?.length ? brief.style_references : (brief.reference_links ?? []),
    mandatory_elements: brief.mandatory_elements ?? '', avoid: brief.avoid ?? '', required_tools: brief.required_tools ?? [], excluded_tools: brief.excluded_tools ?? [],
    deliverables: rows.length
      ? rows.map((d) => newDeliverable({ key: d.id ?? uid(), content_type: d.content_type ?? '', aspect_ratio: d.aspect_ratio ?? '', duration_sec: d.duration_sec ?? null, quantity: d.quantity ?? 1, notes: d.notes ?? '' }))
      // Briefs written before deliverables existed: rebuild one row per aspect ratio.
      : (brief.aspect_ratios ?? []).map((r: string) => newDeliverable({ content_type: brief.content_type ?? '', aspect_ratio: r, duration_sec: brief.duration_sec ?? null })),
    resolution: brief.resolution ?? '', revision_rounds: brief.revision_rounds ?? null,
    usage_platforms: rights?.usage_platforms ?? [], territory: rights?.territory ?? '', rights_duration: rights?.rights_duration ?? '',
    exclusivity: !!rights?.exclusivity, ip_ownership: rights?.ip_ownership ?? '', real_people_likeness: rights?.real_people_likeness ?? '',
    ai_voice_allowed: !!rights?.ai_voice_allowed, music_source: rights?.music_source ?? '', ai_disclosure_required: !!rights?.ai_disclosure_required,
    credit_required: !!rights?.credit_required, requires_tool_commercial_licence: rights?.requires_tool_commercial_licence ?? true, rights_notes: rights?.notes ?? '',
    budget_min: brief.budget_min ?? null, budget_max: brief.budget_max ?? null, status: (brief.status as BriefStatus) ?? 'draft',
  }
}

// ───────────── AI output → trusted draft ─────────────

export interface Assumption {
  field: string
  note: string
}

export interface Question {
  field: string
  question: string
  options: string[]
}

export interface BuilderResult {
  brief: BriefDraft
  assumptions: Assumption[]
  questions: Question[]
  /** values the model returned that were not allowed and were removed or replaced */
  corrected: string[]
}

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v: unknown, min: number, max: number): number | null => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/**
 * Turns whatever the model returned into a valid draft. Nothing from the model is trusted:
 * every fixed-list value is checked against the taxonomy (invalid ones are dropped and reported in `corrected`),
 * numbers are range-checked, text is trimmed, and any required field the model left empty gets a sensible
 * default that is recorded as an assumption.
 */
export function normalizeAiBrief(raw: unknown, input: { idea: string; brandName?: string; budget?: number | null }): BuilderResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Row
  const corrected: string[] = []
  const assumptions: Assumption[] = []
  const assumed = new Set<string>()
  // Notes are shown to brand managers, so internal values are swapped for their labels, and the two budget
  // fields count as one topic.
  const plain = (note: string) =>
    note.replace(/(brand_owns|licensed_to_brand|creator_retains|licensed_talent|creator_self|licensed_library|ai_generated|brand_supplied)/g, (v) =>
      ({ ...IP_OWNERSHIP_LABELS, ...REAL_PEOPLE_LIKENESS_LABELS, ...MUSIC_SOURCE_LABELS } as Record<string, string>)[v]?.toLowerCase() ?? v)
  const topic = (field: string) => (/budget/i.test(field) ? 'budget' : field.toLowerCase().replace(/^rights\./, ''))
  const assume = (field: string, note: string) => {
    const key = topic(field)
    if (!assumed.has(key)) assumptions.push({ field: key, note: plain(note) })
    assumed.add(key)
  }
  for (const a of Array.isArray(r.assumptions) ? r.assumptions.slice(0, 14) : []) {
    const field = str(a?.field, 40)
    const note = str(a?.note, 240)
    if (field && note) assume(field, note)
  }

  const one = (label: string, value: unknown, allowed: readonly string[]): string => {
    const v = str(value, 80)
    if (!v) return ''
    const hit = allowed.find((a) => a.toLowerCase() === v.toLowerCase())
    if (!hit) corrected.push(`${label}: "${v}" is not an allowed value and was removed`)
    return hit ?? ''
  }
  const many = (label: string, value: unknown, allowed: readonly string[]): string[] => {
    const out: string[] = []
    for (const item of Array.isArray(value) ? value : []) {
      const hit = one(label, item, allowed)
      if (hit && !out.includes(hit)) out.push(hit)
    }
    return out
  }

  const b = emptyBrief()
  b.raw_idea = input.idea.trim().slice(0, 2000)
  b.title = str(r.title, 120)
  b.brand_name = str(input.brandName, 80) || str(r.brand_name, 80)
  b.product = str(r.product, 160)
  b.goal = str(r.goal, 400)
  b.target_audience = str(r.target_audience, 300)
  b.key_message = str(r.key_message, 300)
  b.mood = str(r.mood, 120)
  b.mandatory_elements = str(r.mandatory_elements, 300)
  b.avoid = str(r.avoid, 300)
  b.content_type = one('content type', r.content_type, CONTENT_TYPES)
  b.style_tags = [...new Set((Array.isArray(r.style_tags) ? r.style_tags : []).map((t: unknown) => str(t, 30).toLowerCase()).filter(Boolean))].slice(0, 8) as string[]
  b.required_tools = many('required tool', r.required_tools, TOOLS)
  b.excluded_tools = many('excluded tool', r.excluded_tools, TOOLS).filter((t) => !b.required_tools.includes(t))
  b.resolution = one('resolution', r.resolution, RESOLUTIONS)
  b.revision_rounds = int(r.revision_rounds, 0, 10)

  b.deliverables = (Array.isArray(r.deliverables) ? r.deliverables.slice(0, 8) : [])
    .map((d: Row, i: number) => newDeliverable({
      content_type: one(`deliverable ${i + 1} content type`, d?.content_type, CONTENT_TYPES),
      aspect_ratio: one(`deliverable ${i + 1} aspect ratio`, d?.aspect_ratio, ASPECT_RATIOS),
      duration_sec: int(d?.duration_sec, 1, 3600),
      quantity: int(d?.quantity, 1, 50) ?? 1,
      notes: str(d?.notes, 200),
    }))
    .filter((d: DeliverableDraft) => d.content_type || d.aspect_ratio)

  b.usage_platforms = many('usage platform', r.usage_platforms, USAGE_PLATFORMS)
  b.territory = one('territory', r.territory, TERRITORIES)
  b.rights_duration = one('rights duration', r.rights_duration, RIGHTS_DURATIONS)
  b.ip_ownership = one('IP ownership', r.ip_ownership, IP_OWNERSHIP)
  b.real_people_likeness = one('real people likeness', r.real_people_likeness, REAL_PEOPLE_LIKENESS)
  b.music_source = one('music source', r.music_source, MUSIC_SOURCES)
  b.exclusivity = bool(r.exclusivity, false)
  b.ai_voice_allowed = bool(r.ai_voice_allowed, true)
  b.ai_disclosure_required = bool(r.ai_disclosure_required, false)
  b.credit_required = bool(r.credit_required, false)
  b.requires_tool_commercial_licence = bool(r.requires_tool_commercial_licence, true)
  b.rights_notes = str(r.rights_notes, 300)

  // ── defaults for anything required that is still empty; each one is an assumption the user can see ──
  if (!b.title) b.title = (b.raw_idea.split(/[.!?\n]/)[0] || 'New brief').slice(0, 80)
  // A brand name cannot be guessed. It is the one required field that may come back empty, and it is always flagged.
  if (!b.brand_name && !assumed.has('brand_name')) {
    assumed.add('brand_name')
    assumptions.unshift({ field: 'brand_name', note: 'Brand name left blank because the idea does not name the brand. Add it under Basics.' })
  }
  if (!b.goal) {
    b.goal = `Deliver ${b.raw_idea.slice(0, 200)}`
    assume('goal', 'Campaign goal taken straight from your idea; refine it if needed.')
  }
  if (!b.content_type) {
    b.content_type = b.deliverables.find((d) => d.content_type)?.content_type || 'Video'
    assume('content_type', `Content type set to ${b.content_type} because the idea did not say.`)
  }
  if (!b.style_tags.length) {
    b.style_tags = ['cinematic']
    assume('style_tags', 'Style set to "cinematic" as a starting point; no style was described.')
  }
  if (!b.deliverables.length) {
    b.deliverables = [newDeliverable({ content_type: b.content_type, aspect_ratio: needsDuration(b.content_type) ? '9:16' : '1:1', duration_sec: needsDuration(b.content_type) ? 30 : null })]
    assume('deliverables', `One ${b.deliverables[0].aspect_ratio} ${b.content_type.toLowerCase()} deliverable assumed; no formats were given.`)
  }
  for (const [i, d] of b.deliverables.entries()) {
    if (!d.content_type) d.content_type = b.content_type
    if (!d.aspect_ratio) {
      d.aspect_ratio = '16:9'
      assume('deliverables', `Deliverable ${i + 1} set to 16:9 because no aspect ratio was given.`)
    }
    if (needsDuration(d.content_type) && !d.duration_sec) {
      d.duration_sec = 30
      assume('deliverables', `Deliverable ${i + 1} set to 30 seconds because no length was given.`)
    }
    if (!needsDuration(d.content_type)) d.duration_sec = null
  }
  if (b.revision_rounds == null) b.revision_rounds = 2
  if (!b.resolution) b.resolution = RESOLUTIONS[0]
  if (!b.usage_platforms.length) {
    b.usage_platforms = ['Organic social']
    assume('usage_platforms', 'Usage set to organic social because no platform was given.')
  }
  if (!b.territory) {
    b.territory = 'India'
    assume('territory', 'Territory set to India because none was given.')
  }
  if (!b.rights_duration) {
    b.rights_duration = '1 year'
    assume('rights_duration', 'Rights duration set to 1 year because none was given.')
  }
  if (!b.ip_ownership) {
    b.ip_ownership = 'licensed_to_brand'
    assume('ip_ownership', 'Ownership set to "licensed to the brand", the most common arrangement.')
  }
  if (!b.real_people_likeness) {
    b.real_people_likeness = 'none'
    assume('real_people_likeness', 'Assumed no real people appear, which is the safest default.')
  }
  if (!b.music_source) {
    b.music_source = [...b.deliverables].some((d) => needsDuration(d.content_type)) ? 'ai_generated' : 'none'
    assume('music_source', `Music source set to "${MUSIC_SOURCE_LABELS[b.music_source as keyof typeof MUSIC_SOURCE_LABELS]}" because none was given.`)
  }

  // Deadline: the model gives days from today; we turn it into a date.
  const days = int(r.deadline_days, 1, 365)
  b.deadline = new Date(Date.now() + (days ?? 21) * 86400000).toISOString().slice(0, 10)
  if (!days) assume('deadline', 'Deadline set to three weeks from today because none was given.')

  // Budget: what the user typed wins; otherwise the model's estimate; otherwise a per-deliverable estimate.
  const given = int(input.budget, 500, 100000000)
  const count = Math.max(1, deliverableTotal(b))
  if (given) {
    b.budget_max = given
    b.budget_min = Math.max(1000, Math.round((given * 0.6) / 500) * 500)
  } else {
    const min = int(r.budget_min, 500, 100000000)
    const max = int(r.budget_max, 500, 100000000)
    if (min && max && max >= min) {
      b.budget_min = Math.max(1000, min)
      b.budget_max = Math.max(b.budget_min, max)
      assume('budget', `Budget of ${inr(b.budget_min)} to ${inr(b.budget_max)} is an estimate; none was given.`)
    } else {
      b.budget_min = Math.max(3000, count * 5000)
      b.budget_max = Math.max(8000, count * 12000)
      assume('budget', `Budget estimated at ${inr(b.budget_min)} to ${inr(b.budget_max)} for ${count} ${count === 1 ? 'deliverable' : 'deliverables'}; none was given.`)
    }
  }

  const questions: Question[] = (Array.isArray(r.questions) ? r.questions : [])
    .map((q: Row) => ({
      field: str(q?.field, 40),
      question: str(q?.question, 200),
      options: (Array.isArray(q?.options) ? q.options : []).map((o: unknown) => str(o, 60)).filter(Boolean).slice(0, 5),
    }))
    .filter((q: Question) => q.question && q.options.length >= 2)
    .slice(0, 3)

  return { brief: b, assumptions: assumptions.slice(0, 16), questions, corrected }
}

/** Checks a builder result the way the tests and the API do. Returns problems; empty = valid. */
export function builderProblems(result: BuilderResult): string[] {
  const b = result.brief
  const problems: string[] = []
  const inList = (label: string, v: string, allowed: readonly string[]) => v && !allowed.includes(v) && problems.push(`${label} "${v}" is not in the taxonomy`)
  inList('content type', b.content_type, CONTENT_TYPES)
  inList('territory', b.territory, TERRITORIES)
  inList('rights duration', b.rights_duration, RIGHTS_DURATIONS)
  inList('IP ownership', b.ip_ownership, IP_OWNERSHIP)
  inList('likeness', b.real_people_likeness, REAL_PEOPLE_LIKENESS)
  inList('music source', b.music_source, MUSIC_SOURCES)
  inList('resolution', b.resolution, RESOLUTIONS)
  for (const p of b.usage_platforms) inList('usage platform', p, USAGE_PLATFORMS)
  for (const t of [...b.required_tools, ...b.excluded_tools]) inList('tool', t, TOOLS)
  for (const [i, d] of b.deliverables.entries()) {
    inList(`deliverable ${i + 1} content type`, d.content_type, CONTENT_TYPES)
    inList(`deliverable ${i + 1} aspect ratio`, d.aspect_ratio, ASPECT_RATIOS)
    const problem = deliverableProblem(d)
    if (problem) problems.push(`deliverable ${i + 1}: ${problem}`)
  }
  // Required fields must be present, except a blank brand name that the builder has flagged for the user.
  const flagged = (field: string) => field === 'brand_name' && result.assumptions.some((a) => a.field === 'brand_name')
  for (const p of publishProblems(b)) if (!flagged(p.field)) problems.push(`${p.field}: ${p.message}`)
  return problems
}
