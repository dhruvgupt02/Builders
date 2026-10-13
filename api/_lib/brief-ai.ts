// The AI Brief Builder and "Check my brief", as plain functions so the API routes and the tests share them.
import { Type } from '@google/genai'
import { generateText } from './gemini.js'
import {
  normalizeAiBrief, ruleChecks, rightsSentence, formatDeliverable, type BriefDraft, type BuilderResult, type CheckItem,
} from '../../src/lib/brief.js'
import {
  ASPECT_RATIOS, CONTENT_TYPES, IP_OWNERSHIP, MUSIC_SOURCES, REAL_PEOPLE_LIKENESS, RESOLUTIONS, RIGHTS_DURATIONS, TERRITORIES, TOOLS, USAGE_PLATFORMS,
} from '../../src/lib/taxonomy.js'

const S = (description: string) => ({ type: Type.STRING, description })
const E = (values: readonly string[], description: string) => ({ type: Type.STRING, enum: [...values], description })
const B = (description: string) => ({ type: Type.BOOLEAN, description })
const I = (description: string) => ({ type: Type.INTEGER, description })
const A = (items: object, description: string) => ({ type: Type.ARRAY, items, description })

// Strict schema: Gemini's JSON mode can only return these fields, and fixed lists are enums of the taxonomy.
// Every value is still re-validated in normalizeAiBrief; the schema just makes bad output rare.
const BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: S('Short brief title, e.g. "Diwali candle collection launch reel"'),
    brand_name: S('Brand name if given, else empty'),
    product: S('The product or service being promoted'),
    goal: S('What the campaign should achieve, one sentence'),
    target_audience: S('Who it is for'),
    key_message: S('The single message viewers should take away'),
    content_type: E(CONTENT_TYPES, 'Main content type'),
    style_tags: A({ type: Type.STRING }, '2 to 5 short lower-case style tags, e.g. cinematic, pastel, festive'),
    mood: S('Mood in a few words'),
    mandatory_elements: S('Things that must appear, e.g. logo, tagline, product shot. Empty if unknown'),
    avoid: S('Things to avoid. Empty if unknown'),
    required_tools: A(E(TOOLS, 'tool'), 'Only tools the idea explicitly asks for; usually empty'),
    excluded_tools: A(E(TOOLS, 'tool'), 'Only tools the idea explicitly rules out; usually empty'),
    resolution: E(RESOLUTIONS, 'Output resolution'),
    revision_rounds: I('Revision rounds, 1 to 4'),
    deliverables: A({
      type: Type.OBJECT,
      properties: {
        content_type: E(CONTENT_TYPES, 'Content type of this deliverable'),
        aspect_ratio: E(ASPECT_RATIOS, 'Aspect ratio that suits where it will be used'),
        duration_sec: I('Length in seconds for video, animation or audio; 0 for stills'),
        quantity: I('How many of this deliverable'),
        notes: S('Short note, e.g. "hero film" or "cutdowns for stories"'),
      },
      required: ['content_type', 'aspect_ratio', 'quantity'],
    }, '1 to 4 deliverables'),
    usage_platforms: A(E(USAGE_PLATFORMS, 'platform'), 'Where the work will be used'),
    territory: E(TERRITORIES, 'Where the work may be used'),
    rights_duration: E(RIGHTS_DURATIONS, 'How long the brand may use it'),
    exclusivity: B('True only if the idea asks for exclusive rights'),
    ip_ownership: E(IP_OWNERSHIP, 'Who owns the finished work'),
    real_people_likeness: E(REAL_PEOPLE_LIKENESS, 'Whether real people may appear'),
    ai_voice_allowed: B('Whether AI-generated voice is acceptable'),
    music_source: E(MUSIC_SOURCES, 'Where music comes from'),
    ai_disclosure_required: B('Whether the work must be labelled as AI-made'),
    credit_required: B('Whether the creator must be credited'),
    requires_tool_commercial_licence: B('Whether tools must be on commercial licences; true for any paid or brand use'),
    budget_min: I('Lower budget in INR; 0 if you cannot estimate'),
    budget_max: I('Upper budget in INR; 0 if you cannot estimate'),
    deadline_days: I('Days from today until delivery; 0 if not stated'),
    assumptions: A({
      type: Type.OBJECT,
      properties: { field: S('The field name you guessed, e.g. territory'), note: S('One plain sentence: what you set and why, e.g. "Territory set to India because none was given."') },
      required: ['field', 'note'],
    }, 'One entry for every field you filled in without the idea saying so'),
    questions: A({
      type: Type.OBJECT,
      properties: { field: S('Field the question is about'), question: S('A short question for the brand'), options: A({ type: Type.STRING }, '2 to 4 short quick answers') },
      required: ['field', 'question', 'options'],
    }, 'Up to 3 questions about the most important missing information'),
  },
  required: ['title', 'goal', 'content_type', 'style_tags', 'deliverables', 'usage_platforms', 'territory', 'rights_duration', 'ip_ownership', 'real_people_likeness', 'music_source', 'assumptions', 'questions'],
}

const BUILDER_SYSTEM = `You are the brief builder for BRIVIO, a marketplace where brands hire AI creators (AI filmmakers, animators, generative artists), mostly in India.
Turn a brand's rough idea into a complete, structured creative brief.

Rules:
- Use what the idea says. Never contradict it. Keep the brand's own words for product, goal and message where you can.
- Where the idea is silent, choose a sensible default AND add an entry to "assumptions" saying what you set and why. Do not list things the idea stated. One entry per topic (a single entry for the whole budget). Write notes in everyday words for a brand manager: say "the brand owns the work", never internal values like brand_owns or ai_generated.
- Deliverables: infer formats from the platforms. Instagram/Reels/Stories/Shorts/TikTok mean 9:16; feed posts 4:5 or 1:1; YouTube, TV and websites 16:9; billboards and print need Image or Graphic design. A "30-sec reel" is one 9:16 Video of 30 seconds. Add cutdowns only if the idea suggests several placements.
- Stills (Image, Graphic design) have duration_sec 0.
- Usage platforms: "Instagram ads" means Paid social ads; "Instagram" or "social" alone means Organic social.
- Budgets are in Indian rupees. If none is given, estimate a realistic range for Indian AI creators (roughly 5,000 to 15,000 per short video, 2,000 to 6,000 per still) and list it as an assumption.
- required_tools and excluded_tools stay empty unless the idea names tools.
- Questions: at most 3, only about important things you had to guess (budget, territory, exclusivity, real people, deadline). Each needs 2 to 4 short answer options. Ask nothing if the idea already covers it.
- Plain, concrete language. No marketing fluff, no emojis.`

export interface BuilderInput {
  idea: string
  brandName?: string
  budget?: number | null
  /** Answers to earlier clarifying questions; the brief is rebuilt taking them as facts. */
  answers?: { question: string; answer: string }[]
}

/** Builds a structured brief from a rough idea. Throws if Gemini cannot be reached or returns unusable JSON. */
export async function runBriefBuilder(input: BuilderInput): Promise<BuilderResult & { model: string }> {
  const answers = (input.answers ?? []).filter((a) => a.question && a.answer).slice(0, 6)
  const prompt = [
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
    `Rough idea:\n"""${input.idea.trim().slice(0, 2000)}"""`,
    input.brandName ? `Brand name: ${input.brandName.trim().slice(0, 80)}` : 'Brand name: not given',
    input.budget ? `Budget given by the brand: INR ${input.budget} (use it; do not ask about budget)` : 'Budget: not given',
    answers.length
      ? `The brand has answered these questions. Treat the answers as facts, do not list them as assumptions and do not ask them again:\n${answers.map((a) => `- ${a.question} → ${a.answer}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')

  const { text, model } = await generateText({
    label: 'brief-builder',
    system: BUILDER_SYSTEM,
    prompt,
    attemptMs: 9000,
    fallbackAttemptMs: 16000,
    config: { responseMimeType: 'application/json', responseSchema: BRIEF_SCHEMA, temperature: 0.4 },
  })
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('UNAVAILABLE: the model did not return valid JSON')
  }
  return { ...normalizeAiBrief(raw, input), model }
}

// ───────────── Check my brief ─────────────

const CHECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: A({
      type: Type.OBJECT,
      properties: {
        kind: E(['gap', 'conflict', 'suggestion'], 'gap = important information missing; conflict = two parts of the brief disagree; suggestion = would make the brief better'),
        title: S('The issue in under 12 words, e.g. "9:16 deliverable but usage platform is TV"'),
        detail: S('One sentence on what to change'),
      },
      required: ['kind', 'title', 'detail'],
    }, 'Up to 5 issues, most important first. Empty if the brief is solid.'),
  },
  required: ['items'],
}

function briefAsText(b: BriefDraft) {
  return [
    `Title: ${b.title}`, `Brand: ${b.brand_name}`, `Product: ${b.product}`, `Goal: ${b.goal}`, `Audience: ${b.target_audience}`, `Key message: ${b.key_message}`,
    `Deadline: ${b.deadline}`, `Main content type: ${b.content_type}`, `Style: ${b.style_tags.join(', ')}`, `Mood: ${b.mood}`,
    `Must include: ${b.mandatory_elements}`, `Avoid: ${b.avoid}`, `Required tools: ${b.required_tools.join(', ') || 'none'}`, `Excluded tools: ${b.excluded_tools.join(', ') || 'none'}`,
    `Deliverables: ${b.deliverables.map(formatDeliverable).join('; ')}`, `Resolution: ${b.resolution}`, `Revision rounds: ${b.revision_rounds}`,
    `Usage platforms: ${b.usage_platforms.join(', ')}`, `Commercial use: ${rightsSentence(b)}`,
    `Budget: INR ${b.budget_min} to ${b.budget_max}`,
  ].join('\n')
}

/**
 * Rule-based checks always run. Gemini adds up to five more observations; if it fails, the rule-based list is
 * returned on its own with aiAvailable = false, so the button never dead-ends.
 */
export async function runBriefCheck(brief: BriefDraft): Promise<{ items: CheckItem[]; aiAvailable: boolean }> {
  const rules = ruleChecks(brief)
  try {
    const { text } = await generateText({
      label: 'brief-check',
      system:
        'You review creative briefs on BRIVIO, a marketplace where brands hire AI creators in India. Find real problems a creator would hit: ' +
        'formats that do not fit the usage platforms, rights that do not fit the budget, vague or contradictory creative direction, unrealistic timelines. ' +
        'Be specific to this brief. Do not repeat the issues already found. Do not invent problems; return an empty list if the brief is solid. Plain language, no emojis.',
      prompt: `Today is ${new Date().toISOString().slice(0, 10)}.\n\nBrief:\n${briefAsText(brief)}\n\nAlready found:\n${rules.map((r) => `- ${r.title}`).join('\n') || '- nothing'}`,
      attemptMs: 12000,
      config: { responseMimeType: 'application/json', responseSchema: CHECK_SCHEMA, temperature: 0.3 },
    })
    const parsed = JSON.parse(text) as { items?: { kind?: string; title?: string; detail?: string }[] }
    const seen = new Set(rules.map((r) => r.title.toLowerCase()))
    const extra: CheckItem[] = (parsed.items ?? [])
      .filter((i) => i.title && i.detail && ['gap', 'conflict', 'suggestion'].includes(i.kind ?? '') && !seen.has(i.title.toLowerCase()))
      .slice(0, 5)
      .map((i) => ({ kind: i.kind as CheckItem['kind'], title: i.title!.slice(0, 140), detail: i.detail!.slice(0, 300) }))
    return { items: [...rules, ...extra], aiAvailable: true }
  } catch (err) {
    console.warn('[brief-check] AI review unavailable:', (err as Error).message?.slice(0, 160))
    return { items: rules, aiAvailable: false }
  }
}
