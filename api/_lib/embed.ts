// Embedding helper (not a route). Shared by api/* routes and scripts/embed.ts.
import { getGemini, withRetry } from './gemini.js'

// Embedding model: gemini-embedding-001 is Gemini's GA text-embedding model and supports
// outputDimensionality (Matryoshka), so we request 768 dims to match the vector(768) columns.
// text-embedding-004 (native 768) is deprecated. Verify what your key can see with `npm run models`.
export const EMBEDDING_MODEL = 'gemini-embedding-001'
export const EMBEDDING_DIMS = 768

export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'

// Truncated (non-3072) gemini-embedding-001 vectors are not unit length; normalise for cosine search.
function normalise(v: number[]) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

export async function embedText(text: string, taskType: EmbedTask = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
  const ai = getGemini()
  const res = await withRetry(
    () =>
      ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMS, taskType },
      }),
    'embed',
  )
  const values = res.embeddings?.[0]?.values
  if (!values || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Unexpected embedding length: ${values?.length ?? 0}`)
  }
  return normalise(values)
}

/** pgvector accepts the JSON-style array literal "[0.1,0.2,...]". */
export function toPgVector(v: number[]) {
  return `[${v.join(',')}]`
}

// ───────────── what gets embedded ─────────────
// Shared by scripts/embed.ts (bulk) and /api/ai/embed-row (on save), so both produce identical vectors.

const joined = (a: string[] | null | undefined) => (a ?? []).join(', ')

export const CREATOR_EMBED_COLUMNS = 'headline, bio, specializations, tools, skills'
export function creatorEmbedText(c: { headline?: string | null; bio?: string | null; specializations?: string[] | null; tools?: string[] | null; skills?: string[] | null }) {
  return [c.headline, c.bio, `Specializations: ${joined(c.specializations)}`, `Tools: ${joined(c.tools)}`, `Skills: ${joined(c.skills)}`].filter(Boolean).join('\n')
}

export const ITEM_EMBED_COLUMNS = 'title, description, style_tags, tools'
export function itemEmbedText(p: { title?: string | null; description?: string | null; style_tags?: string[] | null; tools?: string[] | null }) {
  return [p.title, p.description, `Style: ${joined(p.style_tags)}`, `Tools: ${joined(p.tools)}`].filter(Boolean).join('\n')
}

export const BRIEF_EMBED_COLUMNS = 'title, goal, product, target_audience, key_message, style_tags, mood, required_tools, brief_deliverables(content_type, aspect_ratio, duration_sec, quantity, position)'
interface BriefEmbedRow {
  title?: string | null
  goal?: string | null
  product?: string | null
  target_audience?: string | null
  key_message?: string | null
  style_tags?: string[] | null
  mood?: string | null
  required_tools?: string[] | null
  brief_deliverables?: { content_type: string | null; aspect_ratio: string | null; duration_sec: number | null; quantity: number | null; position: number | null }[] | null
}
export function briefEmbedText(b: BriefEmbedRow) {
  const deliverables = [...(b.brief_deliverables ?? [])]
    .sort((x, y) => (x.position ?? 0) - (y.position ?? 0))
    .map((d) => [`${d.quantity ?? 1} x`, d.duration_sec ? `${d.duration_sec}s` : null, d.aspect_ratio, d.content_type].filter(Boolean).join(' '))
  return [
    b.title, b.goal,
    b.product && `Product: ${b.product}`,
    b.target_audience && `Audience: ${b.target_audience}`,
    b.key_message && `Key message: ${b.key_message}`,
    `Style: ${joined(b.style_tags)}`,
    b.mood && `Mood: ${b.mood}`,
    deliverables.length ? `Deliverables: ${deliverables.join('; ')}` : null,
    `Tools: ${joined(b.required_tools)}`,
  ].filter(Boolean).join('\n')
}
