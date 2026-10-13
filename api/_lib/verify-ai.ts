// AI checks behind the verification badges. Plain functions so the API route and the tests share them.
import { Type } from '@google/genai'
import { generateText } from './gemini.js'

export interface EvidenceImage {
  /** base64 */
  data: string
  mimeType: string
}

export interface Verdict {
  status: 'verified' | 'needs_review'
  confidence: number
  reason: string
}

/** Verified only at or above this confidence. Anything less goes to manual review. */
export const VERIFY_THRESHOLD = 0.8
const SUPPORTED = ['image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Downloads an image for checking. Only files in this project's own Storage are fetched, so the route
 * cannot be pointed at arbitrary addresses.
 */
export async function fetchStorageImage(url: string): Promise<EvidenceImage | { error: string }> {
  const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/`
  if (!process.env.SUPABASE_URL || !url.startsWith(base)) return { error: 'The file is not in BRIVIO storage.' }
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) return { error: 'The file could not be opened.' }
  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0]
  if (!SUPPORTED.includes(mimeType)) return { error: mimeType === 'application/pdf' ? 'PDF evidence is reviewed by a person, not automatically.' : 'Only PNG, JPG or WebP images can be checked automatically.' }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_BYTES) return { error: 'The image is too large to check automatically (over 5 MB).' }
  return { data: bytes.toString('base64'), mimeType }
}

const clamp = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0))

const TOOL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    is_software_screenshot: { type: Type.BOOLEAN, description: 'True only if the image is a screenshot of a software interface (app or website), not a photo, artwork or generated image.' },
    tool_name_visible: { type: Type.BOOLEAN, description: 'True only if the claimed tool’s name or unmistakable branding is readable in the image.' },
    shows_account_or_work: { type: Type.BOOLEAN, description: 'True if it shows the uploader’s own account, plan, workspace, project or generation history in that tool, rather than a public marketing page.' },
    confidence: { type: Type.NUMBER, description: '0 to 1: how sure you are that this is evidence the uploader uses the claimed tool.' },
    reason: { type: Type.STRING, description: 'One plain sentence saying what the image shows and why it does or does not support the claim.' },
  },
  required: ['is_software_screenshot', 'tool_name_visible', 'shows_account_or_work', 'confidence', 'reason'],
}

/**
 * Does this screenshot show that the uploader uses the claimed tool? Verified only when the image is a
 * software screenshot, the tool is clearly named in it, it shows an account or their own work, and the
 * model is highly confident. Everything else is "needs review", with the reason kept.
 */
export async function checkToolEvidence(image: EvidenceImage, tool: string): Promise<Verdict> {
  const { text } = await generateText({
    label: 'verify-tool',
    system:
      'You check evidence for BRIVIO, a marketplace of AI creators. A creator claims to use a specific AI or editing tool and has uploaded an image as proof. ' +
      'Judge only what is visible. Be strict: a photo, an artwork, a generated image, a screenshot of a different product, or anything where the claimed tool is not clearly named is NOT evidence. ' +
      'A screenshot of the tool’s account page, plan or billing page, workspace, project list or generation history IS evidence. Do not give the benefit of the doubt.',
    prompt: `Claimed tool: ${tool}\n\nDoes the attached image show that the uploader uses ${tool}?`,
    parts: [{ inlineData: image }],
    hedgeMs: 5000,
    deadlineMs: 24000,
    config: { responseMimeType: 'application/json', responseSchema: TOOL_SCHEMA, temperature: 0 },
  })
  const r = JSON.parse(text) as { is_software_screenshot?: boolean; tool_name_visible?: boolean; shows_account_or_work?: boolean; confidence?: number; reason?: string }
  const confidence = clamp(r.confidence)
  const clear = !!r.is_software_screenshot && !!r.tool_name_visible && !!r.shows_account_or_work
  const reason = (r.reason ?? '').trim().slice(0, 300) || 'No reason was given.'
  // If the model is "confident" but the image fails a basic test, its confidence is not confidence in the claim.
  return { status: clear && confidence >= VERIFY_THRESHOLD ? 'verified' : 'needs_review', confidence: clear ? confidence : Math.min(confidence, 0.3), reason }
}

const WORKFLOW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    plausible_progression: { type: Type.BOOLEAN, description: 'True if the step images look like stages of making the final piece (references, stills, drafts, edits) in a sensible order.' },
    related_to_final: { type: Type.BOOLEAN, description: 'True if the step images are visibly related to the final piece (same subject, style or assets).' },
    confidence: { type: Type.NUMBER, description: '0 to 1' },
    reason: { type: Type.STRING, description: 'One plain sentence.' },
  },
  required: ['plausible_progression', 'related_to_final', 'confidence', 'reason'],
}

/** Do the step images show a believable path to the final piece? The last image passed is the final piece. */
export async function checkWorkflowEvidence(steps: { tool: string; action: string; image: EvidenceImage }[], final: EvidenceImage, title: string): Promise<Verdict> {
  const { text } = await generateText({
    label: 'verify-workflow',
    system:
      'You check documented workflows for BRIVIO, a marketplace of AI creators. A creator shows the steps they took to make a piece, one image per step, then the finished piece. ' +
      'Decide whether the step images plausibly show work in progress towards that finished piece. Unrelated stock images, the same image repeated, or images with nothing in common with the final piece are not a workflow. Be strict.',
    prompt: `Piece: "${title}".\nSteps, in order:\n${steps.map((s, i) => `${i + 1}. ${s.tool}: ${s.action} (image ${i + 1})`).join('\n')}\nThe last image (image ${steps.length + 1}) is the finished piece.`,
    parts: [...steps.map((s) => ({ inlineData: s.image })), { inlineData: final }],
    hedgeMs: 6000,
    deadlineMs: 26000,
    config: { responseMimeType: 'application/json', responseSchema: WORKFLOW_SCHEMA, temperature: 0 },
  })
  const r = JSON.parse(text) as { plausible_progression?: boolean; related_to_final?: boolean; confidence?: number; reason?: string }
  const confidence = clamp(r.confidence)
  const clear = !!r.plausible_progression && !!r.related_to_final
  return { status: clear && confidence >= VERIFY_THRESHOLD ? 'verified' : 'needs_review', confidence: clear ? confidence : Math.min(confidence, 0.3), reason: (r.reason ?? '').trim().slice(0, 300) || 'No reason was given.' }
}
