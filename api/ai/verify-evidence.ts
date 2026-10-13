import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkToolEvidence, checkWorkflowEvidence, fetchStorageImage, type EvidenceImage, type Verdict } from '../_lib/verify-ai.js'
import { jsonBody, serviceClient, userFromRequest } from '../_lib/server.js'

// POST /api/ai/verify-evidence { verificationId } → { status: 'verified' | 'needs_review', confidence, reason }
//
// Checks a creator's pending verification request with Gemini vision and stores the outcome.
//   tool      the uploaded screenshot must clearly show the claimed tool's account, plan or generation history
//   workflow  the piece needs at least 3 workflow steps that each have an image ("workflow documented");
//             the images must then show a plausible progression towards the finished piece
// "Verified" needs high confidence. Anything else stays pending for a person to review, with the reason kept.
// Past work is not checked here: it is confirmed by the client through a one-time link.

const WORKFLOW_MIN_STEPS = 3
const WORKFLOW_MAX_IMAGES = 5

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const db = serviceClient()
    const user = await userFromRequest(req)
    if (!db || !user) return res.status(401).json({ error: 'Log in first' })
    const { verificationId } = jsonBody(req)
    if (typeof verificationId !== 'string') return res.status(400).json({ error: 'Expected { verificationId }' })

    const { data: v } = await db.from('verifications').select('*, creators!inner(profile_id)').eq('id', verificationId).maybeSingle()
    if (!v || (v as any).creators.profile_id !== user.id) return res.status(403).json({ error: 'Not your verification request' })
    if (v.status === 'verified') return res.status(200).json({ status: 'verified', confidence: v.confidence ?? 1, reason: v.reason })

    const save = async (verdict: Verdict) => {
      await db.from('verifications').update({
        status: verdict.status === 'verified' ? 'verified' : 'pending',
        verified_by: verdict.status === 'verified' ? 'ai' : null,
        reason: verdict.reason, confidence: verdict.confidence, checked_at: new Date().toISOString(),
      }).eq('id', verificationId)
      return res.status(200).json(verdict)
    }
    const review = (reason: string) => save({ status: 'needs_review', confidence: 0, reason })

    if (v.type === 'past_work') return review('Past work is confirmed by the client. Generate a confirmation link for this piece and send it to them.')
    if (!process.env.GEMINI_API_KEY) return review('Automatic checking is not set up. This request is waiting for a manual review.')

    try {
      if (v.type === 'tool') {
        if (!v.evidence_url) return review('No screenshot was attached.')
        const image = await fetchStorageImage(v.evidence_url)
        if ('error' in image) return review(image.error)
        return save(await checkToolEvidence(image, v.label ?? 'the tool'))
      }

      // workflow
      if (!v.portfolio_item_id) return review('Choose the portfolio piece whose workflow should be verified.')
      const { data: item } = await db.from('portfolio_items').select('title, thumbnail_url, media_url, media_type, workflow_steps(step_order, tool, action, step_media_url)').eq('id', v.portfolio_item_id).maybeSingle()
      const steps = [...((item?.workflow_steps as any[]) ?? [])].sort((a, b) => a.step_order - b.step_order)
      const withImage = steps.filter((s) => s.step_media_url)
      if (steps.length < WORKFLOW_MIN_STEPS || withImage.length < steps.length) {
        return review(`Not documented yet: a workflow needs at least ${WORKFLOW_MIN_STEPS} steps and an image on every step. This piece has ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, ${withImage.length} with an image.`)
      }
      const finalUrl = item!.media_type === 'image' ? (item!.media_url ?? item!.thumbnail_url) : item!.thumbnail_url
      const final = finalUrl ? await fetchStorageImage(finalUrl) : { error: 'The finished piece has no image to compare with.' }
      if ('error' in final) return review(final.error)
      const chosen = steps.slice(0, WORKFLOW_MAX_IMAGES)
      const images: { tool: string; action: string; image: EvidenceImage }[] = []
      for (const s of chosen) {
        const image = await fetchStorageImage(s.step_media_url)
        if ('error' in image) return review(`Step ${s.step_order}: ${image.error}`)
        images.push({ tool: s.tool, action: s.action, image })
      }
      return save(await checkWorkflowEvidence(images, final, item!.title))
    } catch (err) {
      console.warn('[verify-evidence] AI check failed:', (err as Error).message?.slice(0, 160))
      return review('The automatic check is not available right now. This request is waiting for a manual review; you can also try again later.')
    }
  } catch (err) {
    console.error('[verify-evidence]', (err as Error).message)
    return res.status(502).json({ error: 'The check could not be run. Your request is saved and will be reviewed.' })
  }
}
