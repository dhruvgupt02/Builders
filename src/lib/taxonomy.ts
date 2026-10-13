// Fixed taxonomy used by every form, filter and the seed data. Use these exact strings.

export const TOOLS = [
  'Runway', 'Kling', 'Veo', 'Sora', 'Pika', 'Luma', 'Midjourney', 'Flux', 'Stable Diffusion', 'ComfyUI',
  'Leonardo', 'Ideogram', 'ElevenLabs', 'Suno', 'Udio', 'HeyGen', 'After Effects', 'Premiere Pro',
  'DaVinci Resolve', 'Blender',
] as const

export const SPECIALIZATIONS = [
  'AI short films', 'AI ads', 'Product visuals', 'Music videos', 'Animation', 'Explainer videos',
  'Social reels', 'Brand graphics',
] as const

export const CONTENT_TYPES = ['Video', 'Animation', 'Image', 'Graphic design', '3D', 'Audio/music'] as const

export const SKILLS = [
  'Prompt design', 'Image-to-video', 'Lip sync', 'Voice cloning', 'Upscaling', 'Compositing',
  'Colour grading', 'Storyboarding', 'Character consistency',
] as const

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const

export const USAGE_PLATFORMS = [
  'Organic social', 'Paid social ads', 'YouTube ads', 'TV', 'OOH/billboards', 'Website', 'Print',
] as const

export type Tool = (typeof TOOLS)[number]
export type Specialization = (typeof SPECIALIZATIONS)[number]
export type ContentType = (typeof CONTENT_TYPES)[number]
export type Skill = (typeof SKILLS)[number]
export type AspectRatio = (typeof ASPECT_RATIOS)[number]
export type UsagePlatform = (typeof USAGE_PLATFORMS)[number]

export const COMMERCIAL_USE_STATUSES = ['personal', 'licensed', 'client_delivered'] as const
export type CommercialUseStatus = (typeof COMMERCIAL_USE_STATUSES)[number]

export const COMMERCIAL_USE_LABELS: Record<CommercialUseStatus, string> = {
  personal: 'Personal project',
  licensed: 'Licensed for commercial use',
  client_delivered: 'Delivered to a client',
}

// ───────────── Briefs: commercial-use lists ─────────────

export const TERRITORIES = ['India', 'South Asia', 'Asia-Pacific', 'Global'] as const
export type Territory = (typeof TERRITORIES)[number]

export const RIGHTS_DURATIONS = ['3 months', '6 months', '1 year', '2 years', 'Perpetual'] as const
export type RightsDuration = (typeof RIGHTS_DURATIONS)[number]

export const IP_OWNERSHIP = ['brand_owns', 'licensed_to_brand', 'creator_retains'] as const
export type IpOwnership = (typeof IP_OWNERSHIP)[number]
export const IP_OWNERSHIP_LABELS: Record<IpOwnership, string> = {
  brand_owns: 'Brand owns the work',
  licensed_to_brand: 'Licensed to the brand',
  creator_retains: 'Creator keeps ownership',
}

export const REAL_PEOPLE_LIKENESS = ['none', 'licensed_talent', 'creator_self'] as const
export type RealPeopleLikeness = (typeof REAL_PEOPLE_LIKENESS)[number]
export const REAL_PEOPLE_LIKENESS_LABELS: Record<RealPeopleLikeness, string> = {
  none: 'No real people',
  licensed_talent: 'Licensed talent only',
  creator_self: 'The creator themselves',
}

export const MUSIC_SOURCES = ['licensed_library', 'ai_generated', 'brand_supplied', 'none'] as const
export type MusicSource = (typeof MUSIC_SOURCES)[number]
export const MUSIC_SOURCE_LABELS: Record<MusicSource, string> = {
  licensed_library: 'Licensed music library',
  ai_generated: 'AI-generated music',
  brand_supplied: 'Supplied by the brand',
  none: 'No music',
}

export const BRIEF_STATUSES = ['draft', 'open', 'closed'] as const
export type BriefStatus = (typeof BRIEF_STATUSES)[number]
export const BRIEF_STATUS_LABELS: Record<BriefStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' }

export const RESOLUTIONS = ['1080p (Full HD)', '4K (UHD)', '2K', '720p'] as const
