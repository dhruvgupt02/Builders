// npm run embed — fills missing embeddings for creators and portfolio items.
import { adminClient, requireEnv } from './env.js'
import { embedText, toPgVector } from '../api/_lib/embed.js'

requireEnv('GEMINI_API_KEY')
const db = adminClient()
const DELAY_MS = 700 // keeps us under free-tier requests-per-minute limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const join = (a: string[] | null | undefined) => (a ?? []).join(', ')

async function embedTable(
  table: 'creators' | 'portfolio_items',
  columns: string,
  toText: (row: Record<string, any>) => string,
) {
  const { data, error } = await db.from(table).select(`id, ${columns}`).is('embedding', null)
  if (error) throw error
  const rows = (data ?? []) as unknown as Record<string, any>[]
  console.log(`${table}: ${rows.length} rows need embeddings`)
  let done = 0
  for (const row of rows) {
    try {
      const vec = await embedText(toText(row))
      const { error: upErr } = await db.from(table).update({ embedding: toPgVector(vec) }).eq('id', row.id)
      if (upErr) throw upErr
      done++
      if (done % 10 === 0) console.log(`  ${done}/${rows.length}`)
    } catch (err) {
      console.error(`  failed ${table} ${row.id}: ${(err as Error).message}`)
    }
    await sleep(DELAY_MS)
  }
  console.log(`${table}: embedded ${done}/${rows.length}`)
}

await embedTable('creators', 'name, headline, bio, specializations, tools, skills', (c) =>
  [c.headline, c.bio, `Specializations: ${join(c.specializations)}`, `Tools: ${join(c.tools)}`, `Skills: ${join(c.skills)}`]
    .filter(Boolean)
    .join('\n'),
)

await embedTable('portfolio_items', 'title, description, style_tags, tools', (p) =>
  [p.title, p.description, `Style: ${join(p.style_tags)}`, `Tools: ${join(p.tools)}`].filter(Boolean).join('\n'),
)

console.log('Done.')
