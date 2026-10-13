// Shared by seed.ts and mirror-media.ts: copies external placeholder images (picsum, dicebear)
// into the portfolio-media bucket so the app never depends on those hosts at runtime.
import { createHash } from 'node:crypto'
import type { adminClient } from './env.js'

type Db = ReturnType<typeof adminClient>

export const MEDIA_BUCKET = 'portfolio-media'
const FOLDER = 'seed'

export const isExternalMedia = (url: string | null | undefined): url is string =>
  !!url && /picsum\.photos|dicebear\.com/.test(url)

// Avatars are fetched as PNG on a warm background that suits the paper theme.
function downloadUrl(src: string) {
  if (!src.includes('dicebear.com')) return src
  const u = new URL(src.replace('/svg', '/png'))
  u.searchParams.set('backgroundColor', 'f6e3cf')
  u.searchParams.set('size', '256')
  return u.toString()
}

/** Deterministic object path for a source URL, so re-runs never upload the same image twice. */
export function storagePathFor(src: string) {
  const hash = createHash('sha1').update(src).digest('hex').slice(0, 20)
  return `${FOLDER}/${hash}.${src.includes('dicebear.com') ? 'png' : 'jpg'}`
}

export function publicUrlFor(db: Db, src: string) {
  return db.storage.from(MEDIA_BUCKET).getPublicUrl(storagePathFor(src)).data.publicUrl
}

async function existingObjects(db: Db) {
  const names = new Set<string>()
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).list(FOLDER, { limit: 1000, offset })
    if (error) throw new Error(`Cannot list bucket "${MEDIA_BUCKET}": ${error.message} (did you run supabase/storage.sql?)`)
    for (const o of data ?? []) names.add(`${FOLDER}/${o.name}`)
    if (!data || data.length < 1000) return names
  }
}

async function download(url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const type = res.headers.get('content-type') ?? 'image/jpeg'
      if (!type.startsWith('image/')) throw new Error(`not an image (${type})`)
      return { body: Buffer.from(await res.arrayBuffer()), type }
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
  throw lastError
}

/**
 * Makes sure every source image exists in Storage. Returns a map of source URL -> public Storage URL
 * for the ones that are there, and the list of sources that could not be downloaded.
 */
export async function mirrorMedia(db: Db, sources: string[], concurrency = 6) {
  const unique = [...new Set(sources.filter(isExternalMedia))]
  const have = await existingObjects(db)
  const mirrored = new Map<string, string>()
  const failed: string[] = []
  const queue = unique.filter((src) => {
    if (!have.has(storagePathFor(src))) return true
    mirrored.set(src, publicUrlFor(db, src))
    return false
  })
  console.log(`Media: ${unique.length} images, ${mirrored.size} already in Storage, ${queue.length} to copy`)

  let done = 0
  async function worker() {
    for (let src = queue.shift(); src; src = queue.shift()) {
      try {
        const { body, type } = await download(downloadUrl(src))
        const { error } = await db.storage.from(MEDIA_BUCKET).upload(storagePathFor(src), body, { contentType: type, upsert: true, cacheControl: '31536000' })
        if (error) throw new Error(error.message)
        mirrored.set(src, publicUrlFor(db, src))
      } catch (err) {
        failed.push(src)
        console.warn(`  could not copy ${src}: ${(err as Error).message}`)
      }
      if (++done % 25 === 0) console.log(`  copied ${done}`)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { mirrored, failed }
}
