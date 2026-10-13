// npm run models — lists the Gemini models your key can use, highlighting embedding models.
import { requireEnv } from './env.js'
import { getGemini } from '../api/_lib/gemini.js'
import { EMBEDDING_MODEL } from '../api/_lib/embed.js'

requireEnv('GEMINI_API_KEY')
const pager = await getGemini().models.list({ config: { pageSize: 100 } })
const embedders: string[] = []
for await (const m of pager) {
  const actions = m.supportedActions ?? []
  if (actions.includes('embedContent')) embedders.push(m.name ?? '')
}
console.log('Embedding models available to this key:')
for (const name of embedders) console.log(' -', name)
const ok = embedders.some((n) => n.endsWith(EMBEDDING_MODEL))
console.log(ok ? `\n✓ ${EMBEDDING_MODEL} is available.` : `\n✗ ${EMBEDDING_MODEL} not found — update EMBEDDING_MODEL in api/_lib/embed.ts`)
