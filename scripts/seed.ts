// npm run seed — idempotent sample data for BRIVIO. Uses the service role key (bypasses RLS).
import { randomUUID } from 'node:crypto'
import { adminClient } from './env.js'
import { isExternalMedia, mirrorMedia } from './media.js'
import {
  TOOLS, SPECIALIZATIONS, SKILLS, CONTENT_TYPES, ASPECT_RATIOS, USAGE_PLATFORMS,
  type Tool, type Specialization, type Skill, type ContentType, type AspectRatio, type UsagePlatform,
  type CommercialUseStatus,
} from '../src/lib/taxonomy.js'

// --dry-run: generate everything and print a summary without touching Supabase.
const DRY_RUN = process.argv.includes('--dry-run')

function fakeClient(): any {
  const proxy: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve({ data: { users: [], user: { id: randomUUID() } }, error: null }) : proxy),
    apply: () => proxy,
  })
  return proxy
}

const db: ReturnType<typeof adminClient> = DRY_RUN ? fakeClient() : adminClient()

const DEMO_PASSWORD = 'BrivioDemo123!'
const DEMO_BRAND_EMAIL = 'demo.brand@brivio.app'
const DEMO_CREATOR_EMAIL = 'demo.creator@brivio.app'

// ───────────── deterministic random ─────────────
let seed = 20261013
function rand() {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
function sample<T>(a: readonly T[], n: number): T[] {
  const copy = [...a]
  const out: T[] = []
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  return out
}

// ───────────── creators ─────────────
interface CreatorSeed {
  name: string
  city: string
  headline: string
  bio: string
  specializations: Specialization[]
  tools: Tool[]
  skills: Skill[]
  languages: string[]
  price: [number, number]
}

const CREATORS: CreatorSeed[] = [
  { name: 'Aarav Mehta', city: 'Mumbai', headline: 'AI ad films for D2C brands, from prompt to final cut',
    bio: 'Former agency editor turned AI filmmaker. I build 15–60s ad spots with consistent characters and cinematic lighting, delivered in every aspect ratio your media plan needs.',
    specializations: ['AI ads', 'Social reels'], tools: ['Midjourney', 'Kling', 'ElevenLabs', 'Premiere Pro'], skills: ['Prompt design', 'Image-to-video', 'Character consistency'], languages: ['English', 'Hindi', 'Marathi'], price: [15000, 60000] },
  { name: 'Ananya Iyer', city: 'Chennai', headline: 'Dreamy AI short films with a South Indian soul',
    bio: 'I write and direct AI short films rooted in Tamil folklore and coastal life. Festival-selected work, now available for brand storytelling.',
    specializations: ['AI short films', 'Music videos'], tools: ['Veo', 'Midjourney', 'Udio', 'DaVinci Resolve'], skills: ['Storyboarding', 'Colour grading', 'Prompt design'], languages: ['English', 'Tamil'], price: [25000, 80000] },
  { name: 'Rohan Kapoor', city: 'Delhi', headline: 'Photoreal product visuals that look shot, not generated',
    bio: 'Product photographer for eight years, now generating studio-quality packshots and lifestyle scenes with Flux and ComfyUI. Fast turnarounds for e-commerce catalogues.',
    specializations: ['Product visuals', 'Brand graphics'], tools: ['Flux', 'ComfyUI', 'Stable Diffusion'], skills: ['Upscaling', 'Compositing', 'Prompt design'], languages: ['English', 'Hindi'], price: [5000, 30000] },
  { name: 'Priya Nair', city: 'Bengaluru', headline: 'Explainer videos with AI presenters for SaaS & edtech',
    bio: 'I turn complex products into crisp 60–90s explainers using AI avatars, cloned voices and clean motion graphics. Multilingual versions at no extra setup.',
    specializations: ['Explainer videos', 'Animation'], tools: ['HeyGen', 'ElevenLabs', 'After Effects', 'Premiere Pro'], skills: ['Lip sync', 'Voice cloning', 'Storyboarding'], languages: ['English', 'Malayalam', 'Kannada'], price: [12000, 45000] },
  { name: 'Vikram Reddy', city: 'Hyderabad', headline: '3D + AI hybrid product launches',
    bio: 'Blender artist mixing hand-built 3D with AI texturing and motion. Ideal for gadgets, wearables and anything with a hero reveal.',
    specializations: ['Product visuals', 'AI ads'], tools: ['Blender', 'ComfyUI', 'Runway', 'After Effects'], skills: ['Compositing', 'Image-to-video', 'Upscaling'], languages: ['English', 'Telugu'], price: [20000, 75000] },
  { name: 'Ishita Sharma', city: 'Jaipur', headline: 'Festive and heritage-inspired brand graphics',
    bio: 'I design Diwali, wedding-season and heritage campaigns blending Rajasthani motifs with modern AI art. Posters, carousels and packaging concepts.',
    specializations: ['Brand graphics', 'Product visuals'], tools: ['Midjourney', 'Ideogram', 'Leonardo'], skills: ['Prompt design', 'Upscaling'], languages: ['English', 'Hindi'], price: [3000, 18000] },
  { name: 'Kabir Malhotra', city: 'Delhi', headline: 'Scroll-stopping AI reels for fashion and lifestyle',
    bio: 'Vertical-first creator making 9:16 reels that hook in the first second. 40+ brand reels delivered for fashion, beauty and food labels.',
    specializations: ['Social reels', 'AI ads'], tools: ['Pika', 'Midjourney', 'Suno', 'Premiere Pro'], skills: ['Image-to-video', 'Prompt design'], languages: ['English', 'Hindi', 'Punjabi'], price: [6000, 25000] },
  { name: 'Sneha Kulkarni', city: 'Pune', headline: 'Character animation with consistent AI casts',
    bio: 'Animator focused on recurring brand mascots and characters that stay on-model across every episode. Great for kids, edtech and FMCG.',
    specializations: ['Animation', 'Explainer videos'], tools: ['Leonardo', 'Pika', 'ElevenLabs', 'After Effects'], skills: ['Character consistency', 'Lip sync', 'Storyboarding'], languages: ['English', 'Marathi', 'Hindi'], price: [15000, 55000] },
  { name: 'Arjun Banerjee', city: 'Kolkata', headline: 'Moody, cinematic AI music videos',
    bio: 'Indie musician and director. I build music videos around the track, with AI-generated worlds, rhythmic edits and film-style grading.',
    specializations: ['Music videos', 'AI short films'], tools: ['Runway', 'Midjourney', 'Suno', 'DaVinci Resolve'], skills: ['Colour grading', 'Image-to-video', 'Storyboarding'], languages: ['English', 'Bengali', 'Hindi'], price: [18000, 70000] },
  { name: 'Meera Joshi', city: 'Ahmedabad', headline: 'Textile and fashion lookbooks, generated',
    bio: 'I create AI lookbooks and campaign stills for textile and apparel brands, matching real fabric swatches with careful prompt design.',
    specializations: ['Product visuals', 'Brand graphics'], tools: ['Flux', 'Midjourney', 'Stable Diffusion', 'ComfyUI'], skills: ['Prompt design', 'Upscaling', 'Compositing'], languages: ['English', 'Gujarati', 'Hindi'], price: [4000, 22000] },
  { name: 'Aditya Verma', city: 'Lucknow', headline: 'Nawabi-era storytelling in AI short films',
    bio: 'Writer-director creating period AI shorts set in Awadh. I bring narrative craft to brand films that need emotion, not just visuals.',
    specializations: ['AI short films', 'AI ads'], tools: ['Sora', 'Midjourney', 'ElevenLabs', 'Premiere Pro', 'DaVinci Resolve'], skills: ['Storyboarding', 'Voice cloning', 'Colour grading'], languages: ['Hindi', 'Urdu', 'English'], price: [20000, 65000] },
  { name: 'Kavya Menon', city: 'Bengaluru', headline: 'Motion design meets generative video',
    bio: 'Motion designer for tech launches. I combine Luma camera moves with After Effects typography for punchy product announcements.',
    specializations: ['AI ads', 'Explainer videos'], tools: ['Luma', 'Flux', 'After Effects'], skills: ['Compositing', 'Image-to-video'], languages: ['English', 'Malayalam'], price: [10000, 40000] },
  { name: 'Siddharth Rao', city: 'Hyderabad', headline: 'Workflow nerd building ComfyUI pipelines for brands',
    bio: 'I design repeatable ComfyUI pipelines so your brand gets consistent output at scale — hundreds of on-brand visuals from one approved look.',
    specializations: ['Product visuals', 'Brand graphics'], tools: ['ComfyUI', 'Stable Diffusion', 'Flux', 'Kling'], skills: ['Character consistency', 'Upscaling', 'Prompt design'], languages: ['English', 'Telugu', 'Hindi'], price: [8000, 50000] },
  { name: 'Tanvi Desai', city: 'Mumbai', headline: 'Bollywood-style AI music videos and promos',
    bio: 'Colour, drama and dance. I make high-energy AI music videos and film promos with lip-synced performers and bold grading.',
    specializations: ['Music videos', 'Social reels'], tools: ['Kling', 'Midjourney', 'Udio', 'HeyGen', 'Premiere Pro'], skills: ['Lip sync', 'Image-to-video', 'Colour grading'], languages: ['Hindi', 'English', 'Gujarati'], price: [15000, 60000] },
  { name: 'Nikhil Chatterjee', city: 'Kolkata', headline: 'Hand-drawn feel animation with AI assist',
    bio: 'Illustrator-animator who keeps a hand-drawn texture while using AI for in-betweens and backgrounds. Warm, nostalgic, very human.',
    specializations: ['Animation', 'AI short films'], tools: ['Stable Diffusion', 'Runway', 'After Effects'], skills: ['Storyboarding', 'Character consistency'], languages: ['Bengali', 'English'], price: [12000, 48000] },
  { name: 'Riya Agarwal', city: 'Jaipur', headline: 'Jewellery and luxury product visuals',
    bio: 'Specialist in macro product imagery for jewellery, watches and premium beauty. Every sparkle intentional, every reflection controlled.',
    specializations: ['Product visuals', 'AI ads'], tools: ['Flux', 'Midjourney', 'Runway', 'DaVinci Resolve'], skills: ['Upscaling', 'Compositing', 'Colour grading'], languages: ['English', 'Hindi'], price: [10000, 45000] },
  { name: 'Harsh Patel', city: 'Ahmedabad', headline: 'Fast, affordable AI social content for small businesses',
    bio: 'I help local cafés, clinics and stores show up online with weekly AI reels and graphics. Simple packages, quick delivery.',
    specializations: ['Social reels', 'Brand graphics'], tools: ['Pika', 'Ideogram', 'Leonardo'], skills: ['Prompt design', 'Image-to-video'], languages: ['Gujarati', 'Hindi', 'English'], price: [3000, 12000] },
  { name: 'Diya Krishnan', city: 'Chennai', headline: 'AI voice and sonic branding',
    bio: 'Sound designer creating sonic logos, jingles and voiceovers with Suno and ElevenLabs, plus the edit to go with them.',
    specializations: ['AI ads', 'Explainer videos'], tools: ['Suno', 'ElevenLabs', 'Udio', 'Premiere Pro'], skills: ['Voice cloning', 'Lip sync'], languages: ['Tamil', 'English', 'Telugu'], price: [5000, 28000] },
  { name: 'Yash Tiwari', city: 'Lucknow', headline: 'Sci-fi and fantasy worlds for gaming brands',
    bio: 'Concept artist building epic AI trailers and key art for games and esports. Big scale, strong silhouettes, cinematic camera.',
    specializations: ['AI short films', 'Brand graphics'], tools: ['Midjourney', 'Veo', 'Blender', 'After Effects'], skills: ['Storyboarding', 'Compositing', 'Prompt design'], languages: ['Hindi', 'English'], price: [18000, 70000] },
  { name: 'Pooja Deshmukh', city: 'Pune', headline: 'Edtech explainers that students actually finish',
    bio: 'Ex-teacher making short animated lessons and course trailers with AI presenters, friendly characters and clear visuals.',
    specializations: ['Explainer videos', 'Animation'], tools: ['HeyGen', 'Leonardo', 'ElevenLabs', 'Premiere Pro'], skills: ['Lip sync', 'Storyboarding', 'Voice cloning'], languages: ['Marathi', 'Hindi', 'English'], price: [8000, 35000] },
  { name: 'Aman Gupta', city: 'Delhi', headline: 'Performance-ready AI ad variants at scale',
    bio: 'Growth marketer turned creator. I produce 10–30 ad variants per concept so your team can A/B test hooks, formats and offers.',
    specializations: ['AI ads', 'Social reels'], tools: ['Runway', 'Flux', 'ElevenLabs', 'Premiere Pro', 'After Effects'], skills: ['Prompt design', 'Image-to-video', 'Compositing'], languages: ['Hindi', 'English'], price: [10000, 50000] },
  { name: 'Neha Saxena', city: 'Mumbai', headline: 'Beauty and skincare visuals with a soft, clean look',
    bio: 'I create dewy, minimal skincare and beauty visuals — textures, swatches and model shots — plus short motion loops for social.',
    specializations: ['Product visuals', 'Social reels'], tools: ['Midjourney', 'Flux', 'Luma', 'DaVinci Resolve'], skills: ['Colour grading', 'Upscaling', 'Image-to-video'], languages: ['English', 'Hindi'], price: [8000, 40000] },
  { name: 'Karthik Subramanian', city: 'Bengaluru', headline: 'Text-to-video experiments, production-grade',
    bio: 'I test every new video model the week it ships and bring the best of them to client work. Specialist in Veo and Sora long takes.',
    specializations: ['AI short films', 'AI ads', 'Music videos'], tools: ['Veo', 'Sora', 'Kling', 'Runway', 'DaVinci Resolve', 'ElevenLabs'], skills: ['Prompt design', 'Image-to-video', 'Colour grading', 'Upscaling'], languages: ['Tamil', 'English', 'Kannada'], price: [30000, 80000] },
  { name: 'Zoya Khan', city: 'Hyderabad', headline: 'Food and café content that makes people hungry',
    bio: 'Food stylist turned AI creator. I produce menu visuals, steam-and-sizzle reels and festive specials for restaurants and cloud kitchens.',
    specializations: ['Social reels', 'Product visuals'], tools: ['Flux', 'Kling', 'Suno', 'Premiere Pro'], skills: ['Image-to-video', 'Prompt design'], languages: ['Urdu', 'Hindi', 'English', 'Telugu'], price: [4000, 20000] },
  { name: 'Ritwik Sen', city: 'Kolkata', headline: '2D/3D animated brand worlds',
    bio: 'I build animated brand universes — mascots, environments and episodic social content — mixing Blender layouts with AI-styled frames.',
    specializations: ['Animation', 'Brand graphics'], tools: ['Blender', 'Leonardo', 'Pika', 'After Effects', 'Udio'], skills: ['Character consistency', 'Compositing', 'Storyboarding'], languages: ['Bengali', 'English', 'Hindi'], price: [15000, 60000] },
]

// ───────────── portfolio generation ─────────────
const STAGE: Record<Tool, number> = {
  Midjourney: 1, Flux: 1, 'Stable Diffusion': 1, ComfyUI: 1, Leonardo: 1, Ideogram: 1, Blender: 1,
  Runway: 2, Kling: 2, Veo: 2, Sora: 2, Pika: 2, Luma: 2, HeyGen: 2,
  ElevenLabs: 3, Suno: 3, Udio: 3,
  'After Effects': 4, 'Premiere Pro': 4, 'DaVinci Resolve': 4,
}
const VIDEO_TOOLS = new Set<Tool>(['Runway', 'Kling', 'Veo', 'Sora', 'Pika', 'Luma', 'HeyGen'])
const AUDIO_TOOLS = new Set<Tool>(['ElevenLabs', 'Suno', 'Udio'])

const ACTIONS: Record<Tool, string[]> = {
  Midjourney: ['Generated key frames and style references', 'Explored look-dev and moodboard stills'],
  Flux: ['Rendered photoreal product stills', 'Generated lifestyle scenes around the product'],
  'Stable Diffusion': ['Generated variations with a custom LoRA', 'Inpainted details and backgrounds'],
  ComfyUI: ['Built a node pipeline for consistent characters', 'Batch-generated and upscaled final frames'],
  Leonardo: ['Created character sheets and concept art', 'Designed on-model poses for each scene'],
  Ideogram: ['Designed typography and poster layouts', 'Generated text-accurate packaging mockups'],
  Blender: ['Modelled, lit and rendered the 3D scene', 'Built the 3D layout and camera blocking'],
  Runway: ['Animated shots with Gen video and motion brush', 'Extended and interpolated shots'],
  Kling: ['Turned stills into motion with image-to-video', 'Generated product motion shots from key frames'],
  Veo: ['Generated cinematic shots from text prompts', 'Created establishing shots with native audio'],
  Sora: ['Generated long-take hero shots', 'Produced continuous camera-move sequences'],
  Pika: ['Added stylised motion and effects', 'Animated characters with Pikaffects'],
  Luma: ['Created camera moves with Dream Machine', 'Generated smooth product orbit shots'],
  HeyGen: ['Produced a presenter avatar with lip sync', 'Localised the presenter into three languages'],
  ElevenLabs: ['Recorded voiceover with a cloned brand voice', 'Generated multilingual narration'],
  Suno: ['Composed the soundtrack', 'Generated a custom jingle'],
  Udio: ['Generated the music bed and stingers', 'Produced the song with vocals'],
  'After Effects': ['Composited titles, motion graphics and VFX', 'Added typography and transitions'],
  'Premiere Pro': ['Edited the cut and synced audio', 'Cut versions for each platform'],
  'DaVinci Resolve': ['Colour graded and finished the master', 'Graded for a filmic look and exported deliverables'],
}
const NOTES = ['About 40 prompt iterations to lock the look', 'Exported 4 variants for client review', 'Seed locked for consistency across shots',
  'Matched to brand colour palette', 'Delivered in 4K', 'Two rounds of revisions', null, null]

const SUBJECTS = ['Monsoon chai', 'Diwali gift box', 'Electric scooter', 'Handloom saree', 'Cold-pressed juice', 'Banking app',
  'Spice blend', 'Sneaker drop', 'Ayurvedic serum', 'Coffee roastery', 'Cricket fan fest', 'Street food tour', 'Luxury watch',
  'Indie music single', 'Travel app', 'Kids learning app', 'Organic honey', 'Gaming headset', 'Wedding jewellery', 'Craft soda',
  'Smart home speaker', 'Mango season', 'Yoga studio', 'Dance track', 'Fintech explainer', 'Perfume launch', 'Holi colours',
  'Mumbai local trains', 'Himalayan trek', 'Ceramic homeware']

const FORMATS: Record<ContentType, string[]> = {
  Video: ['30s brand spot', 'launch film', 'product teaser', 'short film'],
  Animation: ['animated explainer', 'animated short', 'character animation'],
  Image: ['key visual series', 'campaign stills', 'lookbook'],
  'Graphic design': ['poster series', 'social carousel', 'packaging concept'],
  '3D': ['3D product render', '3D hero reveal'],
  'Audio/music': ['sonic logo', 'jingle'],
}
const STYLE_TAGS = ['cinematic', 'pastel', 'neon', 'minimal', 'retro', 'documentary', 'anime-inspired', 'surreal', 'warm tones',
  'luxury', 'playful', 'festive', 'moody', 'vibrant', 'earthy', 'futuristic']
const CLIENTS = ['Kesar Tea Co.', 'Urban Loom', 'Neel Skincare', 'ZipRide EV', 'Masala Bay', 'Paisa Pal', 'Kalaa Jewels', 'Brew Theory']

const DIMS: Record<AspectRatio, [number, number]> = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [1080, 1080], '4:5': [1080, 1350] }
const RESOLUTION: Record<AspectRatio, string> = { '16:9': '3840x2160', '9:16': '2160x3840', '1:1': '2048x2048', '4:5': '2048x2560' }

function pickSteps(tools: Tool[]): Tool[] {
  const byStage = new Map<number, Tool[]>()
  for (const t of tools) byStage.set(STAGE[t], [...(byStage.get(STAGE[t]) ?? []), t])
  const stages = [...byStage.keys()].sort()
  for (let tries = 0; tries < 20; tries++) {
    const chosen = stages.filter(() => rand() < 0.8).map((s) => pick(byStage.get(s)!))
    if (chosen.length >= 2 && chosen.length <= 4) return chosen
  }
  // Fallback: first tool from up to 4 stages, or two tools from the same stage.
  const fallback = stages.slice(0, 4).map((s) => byStage.get(s)![0])
  return fallback.length >= 2 ? fallback : tools.slice(0, 2)
}

function contentTypeFor(steps: Tool[], c: CreatorSeed): ContentType {
  if (steps.includes('Blender')) return '3D'
  if (steps.some((t) => VIDEO_TOOLS.has(t))) return c.specializations.includes('Animation') && rand() < 0.7 ? 'Animation' : 'Video'
  if (steps.every((t) => AUDIO_TOOLS.has(t) || STAGE[t] === 4)) return 'Audio/music'
  if (steps.includes('Ideogram') || (c.specializations.includes('Brand graphics') && rand() < 0.5)) return 'Graphic design'
  return 'Image'
}

function aspectFor(ct: ContentType, c: CreatorSeed): AspectRatio {
  if (c.specializations.includes('Social reels') && rand() < 0.6) return '9:16'
  if (ct === 'Image' || ct === 'Graphic design') return pick(['1:1', '4:5', '16:9'] as const)
  return pick(ASPECT_RATIOS)
}

// ───────────── briefs ─────────────
interface BriefSeed {
  title: string; goal: string; raw_idea: string; content_type: ContentType; style_tags: string[]; mood: string
  aspect_ratios: AspectRatio[]; duration_sec: number | null; deliverables_count: number; budget: [number, number]
  deadline_days: number; revision_rounds: number; required_tools: Tool[]
  rights: { usage_platforms: UsagePlatform[]; territory: string; rights_duration: string; exclusivity: boolean
    ai_likeness_allowed: boolean; ai_voice_allowed: boolean; requires_tool_commercial_licence: boolean; credit_required: boolean }
}
interface BrandSeed { company_name: string; category: string; website: string; demo?: boolean; briefs: BriefSeed[] }

const BRANDS: BrandSeed[] = [
  { company_name: 'Diya & Wick Candles', category: 'Home fragrance', website: 'https://example.com/diyawick', demo: true, briefs: [
    { title: 'Diwali collection launch reel', goal: 'Drive pre-orders for our Diwali scented candle collection.',
      raw_idea: 'Warm, glowing candles in a dark room, marigolds, slow camera push-ins, ends on the gift box.',
      content_type: 'Video', style_tags: ['festive', 'warm tones', 'cinematic'], mood: 'Cosy and celebratory',
      aspect_ratios: ['9:16', '1:1'], duration_sec: 30, deliverables_count: 3, budget: [20000, 45000], deadline_days: 21, revision_rounds: 2,
      required_tools: ['Kling', 'Midjourney'],
      rights: { usage_platforms: ['Organic social', 'Paid social ads'], territory: 'India', rights_duration: '12 months', exclusivity: false,
        ai_likeness_allowed: false, ai_voice_allowed: true, requires_tool_commercial_licence: true, credit_required: false } },
    { title: 'Product stills for website refresh', goal: 'Replace our homepage and product page imagery.',
      raw_idea: 'Minimal, earthy flat-lays of each candle with natural textures — linen, stone, dried flowers.',
      content_type: 'Image', style_tags: ['minimal', 'earthy'], mood: 'Calm', aspect_ratios: ['4:5', '16:9'], duration_sec: null,
      deliverables_count: 12, budget: [8000, 20000], deadline_days: 14, revision_rounds: 1, required_tools: ['Flux'],
      rights: { usage_platforms: ['Website', 'Organic social', 'Print'], territory: 'Worldwide', rights_duration: 'Perpetual', exclusivity: true,
        ai_likeness_allowed: false, ai_voice_allowed: false, requires_tool_commercial_licence: true, credit_required: false } },
  ] },
  { company_name: 'Neem & Nectar Skincare', category: 'Beauty', website: 'https://example.com/neemnectar', briefs: [
    { title: 'Vitamin C serum hero ad', goal: 'Launch our new serum with a premium 20s ad for YouTube and Instagram.',
      raw_idea: 'Macro shots of serum drops, glowing skin, citrus slices, soft morning light.',
      content_type: 'Video', style_tags: ['luxury', 'pastel', 'minimal'], mood: 'Fresh and radiant', aspect_ratios: ['16:9', '9:16'],
      duration_sec: 20, deliverables_count: 2, budget: [30000, 70000], deadline_days: 30, revision_rounds: 3, required_tools: ['Runway', 'DaVinci Resolve'],
      rights: { usage_platforms: ['YouTube ads', 'Paid social ads', 'Website'], territory: 'India', rights_duration: '24 months', exclusivity: true,
        ai_likeness_allowed: true, ai_voice_allowed: true, requires_tool_commercial_licence: true, credit_required: false } },
  ] },
  { company_name: 'Third Wave Adda Café', category: 'Food & beverage', website: 'https://example.com/adda', briefs: [
    { title: 'Monsoon menu social pack', goal: 'Promote our monsoon specials across Instagram for a month.',
      raw_idea: 'Rain on windows, steaming chai and pakoras, cosy café corners, playful typography.',
      content_type: 'Video', style_tags: ['playful', 'warm tones', 'vibrant'], mood: 'Cosy rainy-day', aspect_ratios: ['9:16'],
      duration_sec: 15, deliverables_count: 6, budget: [6000, 15000], deadline_days: 10, revision_rounds: 1, required_tools: [],
      rights: { usage_platforms: ['Organic social'], territory: 'India', rights_duration: '6 months', exclusivity: false,
        ai_likeness_allowed: false, ai_voice_allowed: false, requires_tool_commercial_licence: false, credit_required: true } },
  ] },
  { company_name: 'GyaanSetu Learning', category: 'Edtech', website: 'https://example.com/gyaansetu', briefs: [
    { title: 'Course trailer with AI presenter', goal: 'Explain our new JEE maths course in under 90 seconds, in Hindi and English.',
      raw_idea: 'Friendly presenter, animated equations, student success moments, clear call to action.',
      content_type: 'Animation', style_tags: ['playful', 'minimal'], mood: 'Encouraging', aspect_ratios: ['16:9', '9:16'],
      duration_sec: 90, deliverables_count: 2, budget: [15000, 40000], deadline_days: 25, revision_rounds: 2, required_tools: ['HeyGen', 'ElevenLabs'],
      rights: { usage_platforms: ['YouTube ads', 'Organic social', 'Website'], territory: 'India', rights_duration: '12 months', exclusivity: false,
        ai_likeness_allowed: true, ai_voice_allowed: true, requires_tool_commercial_licence: true, credit_required: false } },
  ] },
  { company_name: 'Kurta Kulture', category: 'Apparel', website: 'https://example.com/kurtakulture', briefs: [
    { title: 'Festive lookbook and billboard key visual', goal: 'Create a festive-season lookbook and one billboard visual for Mumbai and Delhi.',
      raw_idea: 'Models in handloom kurtas in heritage locations — havelis, ghats — rich jewel tones.',
      content_type: 'Image', style_tags: ['festive', 'luxury', 'cinematic'], mood: 'Regal', aspect_ratios: ['4:5', '16:9'],
      duration_sec: null, deliverables_count: 10, budget: [25000, 60000], deadline_days: 28, revision_rounds: 2, required_tools: ['Midjourney'],
      rights: { usage_platforms: ['OOH/billboards', 'Print', 'Organic social', 'Paid social ads'], territory: 'India', rights_duration: '12 months',
        exclusivity: true, ai_likeness_allowed: true, ai_voice_allowed: false, requires_tool_commercial_licence: true, credit_required: false } },
  ] },
]

// ───────────── taxonomy guard ─────────────
function assertIn(list: readonly string[], values: string[], what: string) {
  for (const v of values) if (!list.includes(v)) throw new Error(`Invalid ${what}: ${v}`)
}
for (const c of CREATORS) {
  assertIn(TOOLS, c.tools, 'tool'); assertIn(SPECIALIZATIONS, c.specializations, 'specialization'); assertIn(SKILLS, c.skills, 'skill')
  if (c.tools.length < 3 || c.tools.length > 6) throw new Error(`${c.name}: needs 3-6 tools`)
  if (c.skills.length < 2 || c.skills.length > 4) throw new Error(`${c.name}: needs 2-4 skills`)
}
for (const b of BRANDS) for (const br of b.briefs) {
  assertIn(CONTENT_TYPES, [br.content_type], 'content type'); assertIn(ASPECT_RATIOS, br.aspect_ratios, 'aspect ratio')
  assertIn(TOOLS, br.required_tools, 'tool'); assertIn(USAGE_PLATFORMS, br.rights.usage_platforms, 'usage platform')
}

// ───────────── helpers ─────────────
function check(res: { error: { message: string } | null }, what: string) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
}

async function ensureUser(email: string, role: 'brand' | 'creator', name: string): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  const existing = data.users.find((u) => u.email?.toLowerCase() === email)
  let id: string
  if (existing) {
    id = existing.id
    check(await db.auth.admin.updateUserById(id, { password: DEMO_PASSWORD, email_confirm: true, user_metadata: { role, name } }), `update ${email}`)
  } else {
    const created = await db.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { role, name } })
    check(created, `create ${email}`)
    id = created.data.user!.id
  }
  // The signup trigger creates the profile; upsert in case the user predates the trigger.
  check(await db.from('profiles').upsert({ id, role, name, email }), `profile ${email}`)
  return id
}

async function insertChunked(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += 200) check(await db.from(table).insert(rows.slice(i, i + 200)), `insert ${table}`)
}

// ───────────── main ─────────────
async function main() {
  console.log('Ensuring demo users…')
  const brandUserId = await ensureUser(DEMO_BRAND_EMAIL, 'brand', 'Demo Brand')
  const creatorUserId = await ensureUser(DEMO_CREATOR_EMAIL, 'creator', CREATORS[0].name)

  console.log('Removing previous sample data…')
  check(await db.from('brands').delete().in('company_name', BRANDS.map((b) => b.company_name)), 'delete sample brands')
  check(await db.from('brands').delete().eq('profile_id', brandUserId), 'delete demo brand data')
  check(await db.from('creators').delete().eq('profile_id', creatorUserId), 'delete demo creator data')
  check(await db.from('creators').delete().eq('is_sample', true), 'delete sample creators')

  console.log('Inserting creators…')
  const creatorRows: object[] = []
  const itemRows: object[] = []
  const stepRows: object[] = []
  const verificationRows: object[] = []
  const baseTime = Date.now() - CREATORS.length * 86400000

  CREATORS.forEach((c, idx) => {
    const creatorId = randomUUID()
    const nameSlug = c.name.toLowerCase().replace(/[^a-z]+/g, '-')
    creatorRows.push({
      id: creatorId,
      profile_id: idx === 0 ? creatorUserId : null,
      name: c.name, headline: c.headline, bio: c.bio, city: c.city,
      avatar_url: `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${encodeURIComponent(c.name)}`,
      specializations: c.specializations, skills: c.skills, tools: c.tools, languages: c.languages,
      price_min: c.price[0], price_max: c.price[1],
      availability: pick(['Available now', 'Available now', 'Booking 2 weeks out', 'Limited availability']),
      is_sample: true,
      created_at: new Date(baseTime + idx * 86400000).toISOString(),
    })

    const subjects = sample(SUBJECTS, int(3, 5))
    const items: { id: string; tools: Tool[]; client: string | null }[] = []
    subjects.forEach((subject, j) => {
      const steps = pickSteps(c.tools)
      const ct = contentTypeFor(steps, c)
      const ar = aspectFor(ct, c)
      const [w, h] = DIMS[ar]
      const client = rand() < 0.4 ? pick(CLIENTS) : null
      const status: CommercialUseStatus = client ? 'client_delivered' : pick(['personal', 'licensed'] as const)
      const format = pick(FORMATS[ct])
      const styles = sample(STYLE_TAGS, int(2, 4))
      const isMotion = ct === 'Video' || ct === 'Animation' || ct === '3D' || ct === 'Audio/music'
      const itemId = randomUUID()
      const slug = `${nameSlug}-${j}`
      items.push({ id: itemId, tools: steps, client })
      itemRows.push({
        id: itemId, creator_id: creatorId,
        title: `${subject} — ${format}`,
        description: `${/^[aeiou]/.test(styles[0]) ? "An" : "A"} ${styles.slice(0, 2).join(', ')} ${format} for ${client ?? 'a ' + subject.toLowerCase() + ' concept'}, made with ${steps.join(', ')}.`,
        media_type: 'image',
        media_url: `https://picsum.photos/seed/brivio-${slug}/${w}/${h}`,
        thumbnail_url: `https://picsum.photos/seed/brivio-${slug}/${Math.round(w / 2)}/${Math.round(h / 2)}`,
        content_type: ct, aspect_ratio: ar,
        duration_sec: isMotion ? (format.startsWith('30s') ? 30 : pick([10, 15, 20, 30, 45, 60, 90])) : null,
        resolution: RESOLUTION[ar], style_tags: styles, tools: steps,
        client_name: client, commercial_use_status: status,
        created_at: new Date(baseTime + idx * 86400000 + j * 60000).toISOString(),
      })
      steps.forEach((tool, k) => stepRows.push({
        id: randomUUID(), portfolio_item_id: itemId, step_order: k + 1, tool, action: pick(ACTIONS[tool]), note: pick(NOTES),
        step_media_url: k === 0 ? `https://picsum.photos/seed/brivio-step-${slug}/800/450` : null,
      }))
    })

    // ~40% fully verified, ~40% partly, ~20% none
    const tier = idx % 5 < 2 ? 'full' : idx % 5 < 4 ? 'partial' : 'none'
    if (tier === 'none') return
    const clientItem = items.find((i) => i.client) ?? items[0]
    const by = pick(['ai', 'manual'] as const)
    const v = (type: 'tool' | 'workflow' | 'past_work', label: string, itemId: string | null, status: 'verified' | 'pending' | 'rejected') => ({
      id: randomUUID(), creator_id: creatorId, portfolio_item_id: itemId, type, label,
      evidence_url: `https://picsum.photos/seed/evidence-${nameSlug}-${type}/800/600`,
      status, verified_by: status === 'pending' ? null : by,
      reason: status === 'verified' ? 'Evidence matches the claimed work' : status === 'rejected' ? 'Evidence was unclear' : null,
    })
    if (tier === 'full') {
      verificationRows.push(
        v('tool', c.tools[0], null, 'verified'),
        v('workflow', items[0].tools.join(' → '), items[0].id, 'verified'),
        v('past_work', clientItem.client ?? 'Portfolio piece', clientItem.id, 'verified'),
      )
    } else {
      verificationRows.push(
        v('tool', c.tools[0], null, 'verified'),
        v('workflow', items[0].tools.join(' → '), items[0].id, rand() < 0.5 ? 'pending' : 'rejected'),
      )
    }
  })

  // Copy placeholder images into Supabase Storage and store those URLs, so the app does not depend on
  // picsum/dicebear at runtime. Anything that fails to copy keeps its source URL; `npm run mirror-media` retries it.
  if (!DRY_RUN) {
    const rows = [creatorRows, itemRows, stepRows, verificationRows].flat() as Record<string, unknown>[]
    const fields = ['avatar_url', 'media_url', 'thumbnail_url', 'step_media_url', 'evidence_url']
    try {
      const sources = rows.flatMap((r) => fields.map((f) => r[f] as string | null | undefined)).filter(isExternalMedia)
      const { mirrored, failed } = await mirrorMedia(db, sources)
      for (const r of rows) for (const f of fields) r[f] = mirrored.get(r[f] as string) ?? r[f]
      if (failed.length) console.warn(`${failed.length} images were not copied; run "npm run mirror-media" to retry.`)
    } catch (err) {
      console.warn(`Media was not copied to Storage (${(err as Error).message}); run "npm run mirror-media" afterwards.`)
    }
  }

  await insertChunked('creators', creatorRows)
  await insertChunked('portfolio_items', itemRows)
  await insertChunked('workflow_steps', stepRows)
  await insertChunked('verifications', verificationRows)

  console.log('Inserting brands and briefs…')
  let briefCount = 0
  for (const b of BRANDS) {
    const brandId = randomUUID()
    check(await db.from('brands').insert({
      id: brandId, profile_id: b.demo ? brandUserId : null, company_name: b.company_name, category: b.category, website: b.website,
    }), 'insert brand')
    for (const br of b.briefs) {
      const briefId = randomUUID()
      const deadline = new Date(Date.now() + br.deadline_days * 86400000).toISOString().slice(0, 10)
      check(await db.from('briefs').insert({
        id: briefId, brand_id: brandId, title: br.title, goal: br.goal, raw_idea: br.raw_idea, content_type: br.content_type,
        style_tags: br.style_tags, mood: br.mood, reference_links: [], aspect_ratios: br.aspect_ratios, duration_sec: br.duration_sec,
        deliverables_count: br.deliverables_count, budget_min: br.budget[0], budget_max: br.budget[1], deadline,
        revision_rounds: br.revision_rounds, required_tools: br.required_tools, status: 'open',
      }), 'insert brief')
      check(await db.from('brief_rights').insert({ brief_id: briefId, ...br.rights }), 'insert brief rights')
      briefCount++
    }
  }

  console.log(`\nSeeded ${creatorRows.length} creators, ${itemRows.length} portfolio items, ${stepRows.length} workflow steps,`)
  console.log(`${verificationRows.length} verifications, ${BRANDS.length} brands, ${briefCount} briefs.`)
  if (DRY_RUN) {
    console.log('[dry run] sample portfolio item:', JSON.stringify(itemRows[0], null, 2))
    console.log('[dry run] its steps:', stepRows.filter((r: any) => r.portfolio_item_id === (itemRows[0] as any).id))
    const ct: Record<string, number> = {}
    const ar: Record<string, number> = {}
    for (const r of itemRows as any[]) { ct[r.content_type] = (ct[r.content_type] ?? 0) + 1; ar[r.aspect_ratio] = (ar[r.aspect_ratio] ?? 0) + 1 }
    console.log('[dry run] content types:', ct, 'aspect ratios:', ar)
    const verifiedCreators = new Set((verificationRows as any[]).filter((v) => v.status === 'verified').map((v) => v.creator_id))
    console.log('[dry run] creators with a verified badge:', verifiedCreators.size)
    return
  }
  console.log(`Demo logins: ${DEMO_BRAND_EMAIL} / ${DEMO_CREATOR_EMAIL} (password in scripts/seed.ts)`)
  console.log('Next: npm run embed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
