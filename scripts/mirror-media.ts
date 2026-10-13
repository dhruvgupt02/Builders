// npm run mirror-media — copies every picsum/dicebear image referenced in the database into
// Supabase Storage (portfolio-media bucket) and rewrites the rows to the Storage public URLs.
// Safe to re-run: images already copied are skipped, and only rows still pointing outside are touched.
import { adminClient } from './env.js'
import { isExternalMedia, mirrorMedia } from './media.js'

const db = adminClient()

const COLUMNS: [table: string, column: string][] = [
  ['creators', 'avatar_url'],
  ['portfolio_items', 'media_url'],
  ['portfolio_items', 'thumbnail_url'],
  ['workflow_steps', 'step_media_url'],
  ['verifications', 'evidence_url'],
]

async function externalRows(table: string, column: string) {
  const { data, error } = await db.from(table).select(`id, ${column}`).or(`${column}.ilike.%picsum.photos%,${column}.ilike.%dicebear.com%`)
  if (error) throw new Error(`${table}.${column}: ${error.message}`)
  return (data ?? []) as unknown as Record<string, string>[]
}

// Sample portfolio items were first seeded without step images; give the first step of each one.
async function backfillStepImages() {
  const { data, error } = await db
    .from('workflow_steps')
    .select('id, portfolio_item_id, portfolio_items!inner(creators!inner(is_sample))')
    .eq('step_order', 1)
    .is('step_media_url', null)
    .eq('portfolio_items.creators.is_sample', true)
  if (error) throw new Error(`step image backfill: ${error.message}`)
  for (const s of data ?? []) {
    const src = `https://picsum.photos/seed/brivio-step-${s.portfolio_item_id}/800/450`
    await db.from('workflow_steps').update({ step_media_url: src }).eq('id', s.id)
  }
  if (data?.length) console.log(`Added step images to ${data.length} sample workflow steps`)
}

await backfillStepImages()

const pending: { table: string; column: string; rows: Record<string, string>[] }[] = []
for (const [table, column] of COLUMNS) pending.push({ table, column, rows: await externalRows(table, column) })

const sources = pending.flatMap((p) => p.rows.map((r) => r[p.column])).filter(isExternalMedia)
const { mirrored, failed } = await mirrorMedia(db, sources)

let updated = 0
for (const { table, column, rows } of pending) {
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map(async (row) => {
        const url = mirrored.get(row[column])
        if (!url) return
        const { error } = await db.from(table).update({ [column]: url }).eq('id', row.id)
        if (error) console.warn(`  ${table} ${row.id}: ${error.message}`)
        else updated++
      }),
    )
  }
}
console.log(`Updated ${updated} rows to Storage URLs`)

console.log('\nRows still pointing at picsum.photos or dicebear.com:')
let remaining = 0
for (const [table, column] of COLUMNS) {
  const left = (await externalRows(table, column)).length
  remaining += left
  console.log(`  ${table}.${column}: ${left}`)
}
if (failed.length) console.log(`${failed.length} images could not be downloaded — run "npm run mirror-media" again to retry.`)
process.exit(remaining === 0 ? 0 : 1)
