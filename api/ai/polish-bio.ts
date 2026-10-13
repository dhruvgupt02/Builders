import { aiRoute, list, text } from '../_lib/ai-route.js'

// POST /api/ai/polish-bio { bio, name?, headline?, specializations?, tools?, skills? } → { text }
export default aiRoute('polish-bio', (body) => {
  const bio = text(body.bio, 1500)
  if (bio.length < 20) return { error: 'Write a couple of sentences about yourself first, then polish them.' }
  return {
    system:
      'You edit bios for AI creators (AI filmmakers, animators, generative artists) on BRIVIO, a marketplace where brands hire them. ' +
      'Rewrite the bio so it is clear, confident and specific, in first person, 2 to 4 sentences, under 90 words. ' +
      'Keep every fact; never invent clients, awards, numbers or tools. No hashtags, emojis or quotation marks. Return only the bio text.',
    prompt: [
      `Name: ${text(body.name, 80) || 'not given'}`,
      `Headline: ${text(body.headline, 160) || 'not given'}`,
      `Specializations: ${list(body.specializations).join(', ') || 'not given'}`,
      `Tools: ${list(body.tools).join(', ') || 'not given'}`,
      `Skills: ${list(body.skills).join(', ') || 'not given'}`,
      '',
      `Current bio:\n${bio}`,
    ].join('\n'),
  }
})
