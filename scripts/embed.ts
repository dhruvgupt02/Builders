// npm run embed — fills missing embeddings for creators and portfolio items.
import { adminClient, requireEnv } from './env.js'
import { CREATOR_EMBED_COLUMNS, ITEM_EMBED_COLUMNS, creatorEmbedText, embedText, itemEmbedText, toPgVector } from '../api/_lib/embed.js'

requireEnv('GEMINI_API_KEY')
const db = adminClient()
const DELAY_MS = 700 // keeps us under free-tier requests-per-minute limits
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function embedTable(table: 'creators' | 'portfolio_items', columns: string, toText: (row: Record<string, any>) => string) {
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

await embedTable('creators', CREATOR_EMBED_COLUMNS, creatorEmbedText)
await embedTable('portfolio_items', ITEM_EMBED_COLUMNS, itemEmbedText)

console.log('Done.')
