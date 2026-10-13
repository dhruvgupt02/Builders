import { aiRoute, list, text } from '../_lib/ai-route.js'

interface Step {
  tool?: unknown
  action?: unknown
  note?: unknown
}

// POST /api/ai/describe-item { title, contentType?, tools?, styleTags?, workflow?: [{tool, action, note}] } → { text }
export default aiRoute('describe-item', (body) => {
  const title = text(body.title, 160)
  if (!title) return { error: 'Add a title first so the AI knows what the piece is.' }
  const steps = (Array.isArray(body.workflow) ? (body.workflow as Step[]) : [])
    .slice(0, 10)
    .map((s, i) => `${i + 1}. ${text(s.tool, 40)}: ${text(s.action, 200)}${text(s.note, 200) ? ` (${text(s.note, 200)})` : ''}`)
  return {
    system:
      'You write portfolio descriptions for AI-generated creative work on BRIVIO, a marketplace where brands hire AI creators. ' +
      'Write 2 to 3 sentences, under 70 words, that tell a brand what the piece is, its look and feel, and how it was made. ' +
      'Use only the details given; never invent clients, results or tools. Plain text, no hashtags, emojis or quotation marks. Return only the description.',
    prompt: [
      `Title: ${title}`,
      `Content type: ${text(body.contentType, 40) || 'not given'}`,
      `Style tags: ${list(body.styleTags).join(', ') || 'not given'}`,
      `Tools: ${list(body.tools).join(', ') || 'not given'}`,
      `Workflow:\n${steps.join('\n') || 'not given'}`,
    ].join('\n'),
  }
})
