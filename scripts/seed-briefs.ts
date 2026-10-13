// Sample brands and briefs. Used by `npm run seed` and on its own by `npm run seed -- --briefs-only`,
// which refreshes the briefs without touching creators (so their ids, media and embeddings stay as they are).
import { randomUUID } from 'node:crypto'
import type { adminClient } from './env.js'
import { builderProblems, emptyBrief, newDeliverable, toRows, type BriefDraft } from '../src/lib/brief.js'

type Db = ReturnType<typeof adminClient>

interface BrandSeed {
  company_name: string
  category: string
  website: string
  /** owned by the demo brand account */
  demo?: boolean
  briefs: (Partial<BriefDraft> & { title: string; deadline_days: number })[]
}

const d = newDeliverable

export const SAMPLE_BRANDS: BrandSeed[] = [
  {
    company_name: 'Diya & Wick Candles', category: 'Home fragrance', website: 'https://example.com/diyawick', demo: true,
    briefs: [
      {
        title: 'Diwali collection launch reel', deadline_days: 21, status: 'open',
        product: 'Diwali scented candle collection (6 fragrances, gift box)',
        goal: 'Drive pre-orders for our Diwali scented candle collection in the three weeks before the festival.',
        target_audience: 'Women 25-40 in metro cities who buy festive gifts online',
        key_message: 'Light up Diwali with handmade, long-burning candles.',
        raw_idea: '30-sec Diwali reel for my candle brand, cosy and warm, for Instagram ads',
        content_type: 'Video', style_tags: ['festive', 'warm tones', 'cinematic'], mood: 'Cosy and celebratory',
        mandatory_elements: 'Logo end card, the gift box, tagline "Light up Diwali"', avoid: 'Fireworks, crowded scenes, cold blue lighting',
        required_tools: ['Kling', 'Midjourney'], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 30, quantity: 1, notes: 'Hero reel' }),
          d({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 15, quantity: 2, notes: 'Cutdowns for stories' }),
          d({ content_type: 'Video', aspect_ratio: '1:1', duration_sec: 30, quantity: 1, notes: 'Feed version' }),
        ],
        resolution: '1080p (Full HD)', revision_rounds: 2,
        usage_platforms: ['Organic social', 'Paid social ads'], territory: 'India', rights_duration: '1 year', exclusivity: false,
        ip_ownership: 'licensed_to_brand', real_people_likeness: 'none', ai_voice_allowed: true, music_source: 'ai_generated',
        ai_disclosure_required: false, credit_required: false, requires_tool_commercial_licence: true,
        budget_min: 20000, budget_max: 45000,
      },
      {
        title: 'Product stills for website refresh', deadline_days: 14, status: 'open',
        product: 'Core range of 12 scented candles',
        goal: 'Replace our homepage and product page imagery with a consistent, premium look.',
        target_audience: 'Online shoppers browsing home decor and gifting',
        key_message: 'Small-batch candles made with natural wax.',
        raw_idea: 'Minimal, earthy flat-lays of each candle with natural textures: linen, stone, dried flowers.',
        content_type: 'Image', style_tags: ['minimal', 'earthy'], mood: 'Calm',
        mandatory_elements: 'Label clearly readable on every candle', avoid: 'Busy backgrounds, artificial colours',
        required_tools: ['Flux'], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Image', aspect_ratio: '4:5', quantity: 12, notes: 'One per product' }),
          d({ content_type: 'Image', aspect_ratio: '16:9', quantity: 2, notes: 'Homepage banners' }),
        ],
        resolution: '4K (UHD)', revision_rounds: 1,
        usage_platforms: ['Website', 'Organic social', 'Print'], territory: 'Global', rights_duration: 'Perpetual', exclusivity: true,
        ip_ownership: 'brand_owns', real_people_likeness: 'none', ai_voice_allowed: false, music_source: 'none',
        ai_disclosure_required: false, credit_required: false, requires_tool_commercial_licence: true,
        budget_min: 30000, budget_max: 60000,
      },
      {
        title: 'New Year gifting campaign (draft)', deadline_days: 45, status: 'draft',
        product: 'New Year gift hampers',
        goal: 'Plan a small campaign for corporate gifting in January.',
        content_type: 'Video', style_tags: ['luxury'],
        deliverables: [d({ content_type: 'Video', aspect_ratio: '16:9', duration_sec: 20, quantity: 1 })],
      },
    ],
  },
  {
    company_name: 'Neem & Nectar Skincare', category: 'Beauty', website: 'https://example.com/neemnectar',
    briefs: [
      {
        title: 'Vitamin C serum hero ad', deadline_days: 30, status: 'open',
        product: 'Vitamin C brightening serum',
        goal: 'Launch our new serum with a premium ad for YouTube and Instagram.',
        target_audience: 'Skincare-aware women and men aged 22-35',
        key_message: 'Visible glow in 14 days, with 10% vitamin C.',
        raw_idea: 'Macro shots of serum drops, glowing skin, citrus slices, soft morning light.',
        content_type: 'Video', style_tags: ['luxury', 'pastel', 'minimal'], mood: 'Fresh and radiant',
        mandatory_elements: 'Bottle close-up, "10% Vitamin C" claim, logo', avoid: 'Before/after faces, medical claims',
        required_tools: ['Runway', 'DaVinci Resolve'], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Video', aspect_ratio: '16:9', duration_sec: 20, quantity: 1, notes: 'YouTube pre-roll' }),
          d({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 20, quantity: 1, notes: 'Reels and stories' }),
        ],
        resolution: '4K (UHD)', revision_rounds: 3,
        usage_platforms: ['YouTube ads', 'Paid social ads', 'Website'], territory: 'India', rights_duration: '2 years', exclusivity: true,
        ip_ownership: 'brand_owns', real_people_likeness: 'licensed_talent', ai_voice_allowed: true, music_source: 'licensed_library',
        ai_disclosure_required: true, credit_required: false, requires_tool_commercial_licence: true,
        budget_min: 30000, budget_max: 70000,
      },
    ],
  },
  {
    company_name: 'Third Wave Adda Café', category: 'Food & beverage', website: 'https://example.com/adda',
    briefs: [
      {
        title: 'Monsoon menu social pack', deadline_days: 10, status: 'open',
        product: 'Monsoon specials: masala chai, pakoras, filter coffee',
        goal: 'Promote our monsoon specials across Instagram for a month.',
        target_audience: 'Students and young professionals near our three outlets',
        key_message: 'Rainy days are better at Adda.',
        raw_idea: 'Rain on windows, steaming chai and pakoras, cosy café corners, playful typography.',
        content_type: 'Video', style_tags: ['playful', 'warm tones', 'vibrant'], mood: 'Cosy rainy-day',
        mandatory_elements: 'Café logo, outlet locations in the last frame', avoid: 'Stock-photo look',
        required_tools: [], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Video', aspect_ratio: '9:16', duration_sec: 15, quantity: 4, notes: 'Weekly reels' }),
          d({ content_type: 'Graphic design', aspect_ratio: '4:5', quantity: 4, notes: 'Menu highlight posts' }),
        ],
        resolution: '1080p (Full HD)', revision_rounds: 1,
        usage_platforms: ['Organic social'], territory: 'India', rights_duration: '6 months', exclusivity: false,
        ip_ownership: 'creator_retains', real_people_likeness: 'none', ai_voice_allowed: false, music_source: 'ai_generated',
        ai_disclosure_required: false, credit_required: true, requires_tool_commercial_licence: false,
        budget_min: 12000, budget_max: 28000,
      },
    ],
  },
  {
    company_name: 'GyaanSetu Learning', category: 'Edtech', website: 'https://example.com/gyaansetu',
    briefs: [
      {
        title: 'Course trailer with AI presenter', deadline_days: 25, status: 'open',
        product: 'JEE Maths crash course',
        goal: 'Explain our new JEE maths course in under 90 seconds, in Hindi and English.',
        target_audience: 'Class 11-12 students and their parents',
        key_message: 'Crack JEE maths with daily 30-minute lessons.',
        raw_idea: 'Friendly presenter, animated equations, student success moments, clear call to action.',
        content_type: 'Animation', style_tags: ['playful', 'minimal'], mood: 'Encouraging',
        mandatory_elements: 'Course name, enrolment link, logo', avoid: 'Exam-fear messaging',
        required_tools: ['HeyGen', 'ElevenLabs'], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Animation', aspect_ratio: '16:9', duration_sec: 90, quantity: 2, notes: 'Hindi and English versions' }),
          d({ content_type: 'Animation', aspect_ratio: '9:16', duration_sec: 30, quantity: 2, notes: 'Short teasers' }),
        ],
        resolution: '1080p (Full HD)', revision_rounds: 2,
        usage_platforms: ['YouTube ads', 'Organic social', 'Website'], territory: 'India', rights_duration: '1 year', exclusivity: false,
        ip_ownership: 'licensed_to_brand', real_people_likeness: 'none', ai_voice_allowed: true, music_source: 'licensed_library',
        ai_disclosure_required: true, credit_required: false, requires_tool_commercial_licence: true,
        budget_min: 25000, budget_max: 55000,
      },
    ],
  },
  {
    company_name: 'Kurta Kulture', category: 'Apparel', website: 'https://example.com/kurtakulture',
    briefs: [
      {
        title: 'Festive lookbook and billboard key visual', deadline_days: 28, status: 'open',
        product: 'Festive handloom kurta collection',
        goal: 'Create a festive-season lookbook and one billboard visual for Mumbai and Delhi.',
        target_audience: 'Men and women 24-45 shopping for festive and wedding wear',
        key_message: 'Handloom, made for celebrations.',
        raw_idea: 'Models in handloom kurtas in heritage locations (havelis, ghats), rich jewel tones.',
        content_type: 'Image', style_tags: ['festive', 'luxury', 'cinematic'], mood: 'Regal',
        mandatory_elements: 'Logo, collection name, fabric texture clearly visible', avoid: 'Western styling, cluttered sets',
        required_tools: ['Midjourney'], excluded_tools: [],
        deliverables: [
          d({ content_type: 'Image', aspect_ratio: '4:5', quantity: 8, notes: 'Lookbook' }),
          d({ content_type: 'Graphic design', aspect_ratio: '16:9', quantity: 1, notes: 'Billboard key visual' }),
        ],
        resolution: '4K (UHD)', revision_rounds: 2,
        usage_platforms: ['OOH/billboards', 'Print', 'Organic social', 'Paid social ads'], territory: 'India', rights_duration: '1 year', exclusivity: true,
        ip_ownership: 'brand_owns', real_people_likeness: 'licensed_talent', ai_voice_allowed: false, music_source: 'none',
        ai_disclosure_required: true, credit_required: false, requires_tool_commercial_licence: true,
        budget_min: 35000, budget_max: 80000,
      },
    ],
  },
]

/** Deletes the sample brands (and, through them, their briefs) and inserts them again. Returns the number of briefs. */
export async function seedBriefs(db: Db, brandUserId: string, dryRun = false): Promise<number> {
  const ok = (res: { error: { message: string } | null }, what: string) => {
    if (res.error) throw new Error(`${what}: ${res.error.message}`)
  }
  if (!dryRun) {
    ok(await db.from('brands').delete().in('company_name', SAMPLE_BRANDS.map((b) => b.company_name)), 'delete sample brands')
    ok(await db.from('brands').delete().eq('profile_id', brandUserId), 'delete demo brand data')
  }
  let count = 0
  for (const brand of SAMPLE_BRANDS) {
    const brandId = randomUUID()
    if (!dryRun) ok(await db.from('brands').insert({ id: brandId, profile_id: brand.demo ? brandUserId : null, company_name: brand.company_name, category: brand.category, website: brand.website }), 'insert brand')
    for (const { deadline_days, ...partial } of brand.briefs) {
      const draft: BriefDraft = { ...emptyBrief(), ...partial, brand_name: brand.company_name, deadline: new Date(Date.now() + deadline_days * 86400000).toISOString().slice(0, 10) }
      // Sample briefs must obey the same rules as real ones: taxonomy values only, and complete unless a draft.
      const problems = builderProblems({ brief: draft, assumptions: [], questions: [], corrected: [] })
      if (draft.status !== 'draft' && problems.length) throw new Error(`Sample brief "${draft.title}" is invalid: ${problems.join('; ')}`)
      const rows = toRows(draft)
      const briefId = randomUUID()
      if (!dryRun) {
        ok(await db.from('briefs').insert({ id: briefId, brand_id: brandId, ...rows.brief }), 'insert brief')
        ok(await db.from('brief_rights').insert({ brief_id: briefId, ...rows.rights }), 'insert brief rights')
        ok(await db.from('brief_deliverables').insert(rows.deliverables.map((x) => ({ ...x, brief_id: briefId }))), 'insert brief deliverables')
      }
      count++
    }
  }
  return count
}
