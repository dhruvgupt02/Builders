import { supabase } from './supabase'
import { ASPECT_RATIOS, type AspectRatio } from './taxonomy'

export const MAX_MEDIA_MB = 20
export const MAX_EVIDENCE_MB = 10

type Kind = 'image' | 'video' | 'pdf'

const kindOf = (file: File): Kind | null =>
  file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'pdf' : null

/** Returns a message for the user if the file cannot be used, otherwise null. */
export function validateFile(file: File, allowed: Kind[], maxMb = MAX_MEDIA_MB): string | null {
  const kind = kindOf(file)
  if (!kind || !allowed.includes(kind)) return `That file type is not supported. Please choose ${allowed.join(' or ')}.`
  if (file.size > maxMb * 1024 * 1024) return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${maxMb} MB.`
  return null
}

/** Uploads into the signed-in user's own folder (the only place Storage policies let them write). */
export async function uploadFile(bucket: 'portfolio-media' | 'verification-evidence', file: Blob, userId: string, ext?: string): Promise<string> {
  const extension = ext ?? (file instanceof File ? file.name.split('.').pop() : undefined) ?? 'bin'
  const path = `${userId}/${crypto.randomUUID()}.${extension.toLowerCase().replace(/[^a-z0-9]/g, '')}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, cacheControl: '31536000' })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

function canvasBlob(source: CanvasImageSource, width: number, height: number, maxWidth: number): Promise<Blob> {
  const scale = Math.min(1, maxWidth / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create thumbnail'))), 'image/jpeg', 0.82))
}

/** Reads an image file: its pixel size and a small JPEG thumbnail made from it. */
export function readImage(file: Blob, thumbWidth = 800): Promise<{ width: number; height: number; thumbnail: Blob }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      try {
        resolve({ width: img.naturalWidth, height: img.naturalHeight, thumbnail: await canvasBlob(img, img.naturalWidth, img.naturalHeight, thumbWidth) })
      } catch (err) {
        reject(err)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That image could not be read.'))
    }
    img.src = url
  })
}

/** Reads a video file: duration, pixel size and a poster frame (null if the browser cannot grab one). */
export function readVideo(file: Blob): Promise<{ width: number; height: number; duration: number; poster: Blob | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    const finish = async (grab: boolean) => {
      const { videoWidth: width, videoHeight: height, duration } = video
      let poster: Blob | null = null
      if (grab && width) poster = await canvasBlob(video, width, height, 800).catch(() => null)
      URL.revokeObjectURL(url)
      resolve({ width, height, duration: Number.isFinite(duration) ? duration : 0, poster })
    }
    const timer = setTimeout(() => finish(false), 8000)
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2)
    }
    video.onseeked = () => {
      clearTimeout(timer)
      finish(true)
    }
    video.onerror = () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      reject(new Error('That video could not be read. Try an MP4 or WebM file.'))
    }
    video.src = url
  })
}

/** The taxonomy aspect ratio closest to a pixel size. */
export function nearestAspect(width: number, height: number): AspectRatio {
  const target = width / height
  let best: AspectRatio = ASPECT_RATIOS[0]
  for (const ratio of ASPECT_RATIOS) {
    const [w, h] = ratio.split(':').map(Number)
    const [bw, bh] = best.split(':').map(Number)
    if (Math.abs(w / h - target) < Math.abs(bw / bh - target)) best = ratio
  }
  return best
}
