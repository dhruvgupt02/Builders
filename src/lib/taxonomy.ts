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
