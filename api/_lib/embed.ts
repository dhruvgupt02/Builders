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
