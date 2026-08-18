/**
 * Image asset cache: loads badges/emotes/cheermotes with CORS so they can be drawn on an
 * exportable canvas, and decodes animated GIF/WebP into frames (via WebCodecs ImageDecoder)
 * so animation is deterministic per simulation time (needed for frame-accurate export).
 */
export interface AnimFrame {
  bitmap: ImageBitmap
  durationMs: number
}
export interface LoadedImage {
  w: number
  h: number
  /** static bitmap (also the first frame of an animation) */
  bitmap: CanvasImageSource
  frames?: AnimFrame[]
  totalMs?: number
}

const MAX_FRAMES = 150

export class AssetCache {
  private cache = new Map<string, LoadedImage>()
  private failed = new Set<string>()
  private pending = new Map<string, Promise<LoadedImage | null>>()
  /** bumped whenever something new finished loading (renderers watch this) */
  version = 0
  onChange: (() => void) | null = null
  animated = true

  get(url: string): LoadedImage | undefined {
    return this.cache.get(url)
  }
  hasFailed(url: string): boolean {
    return this.failed.has(url)
  }
  /** Returns the image if loaded; otherwise starts loading and returns undefined. */
  request(url: string): LoadedImage | undefined {
    const c = this.cache.get(url)
    if (c) return c
    if (!this.failed.has(url) && !this.pending.has(url)) void this.load(url)
    return undefined
  }

  load(url: string): Promise<LoadedImage | null> {
    const c = this.cache.get(url)
    if (c) return Promise.resolve(c)
    if (this.failed.has(url)) return Promise.resolve(null)
    let p = this.pending.get(url)
    if (p) return p
    p = this.doLoad(url)
      .then((img) => {
        if (img) this.cache.set(url, img)
        else this.failed.add(url)
        this.pending.delete(url)
        this.version++
        this.onChange?.()
        return img
      })
      .catch(() => {
        this.failed.add(url)
        this.pending.delete(url)
        this.version++
        this.onChange?.()
        return null
      })
    this.pending.set(url, p)
    return p
  }

  async loadAll(urls: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> {
    const list = [...new Set(urls)]
    let done = 0
    const workers: Promise<void>[] = []
    const queue = list.slice()
    const run = async () => {
      while (queue.length) {
        const u = queue.shift()!
        await this.load(u)
        done++
        onProgress?.(done, list.length)
      }
    }
    for (let i = 0; i < 8; i++) workers.push(run())
    await Promise.all(workers)
  }

  private async doLoad(url: string): Promise<LoadedImage | null> {
    if (url.startsWith('data:image/svg')) return loadViaImageElement(url)
    let blob: Blob
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!res.ok) return null
      blob = await res.blob()
    } catch {
      // some CDNs may not like fetch; try <img crossorigin>
      return loadViaImageElement(url)
    }
    const type = blob.type || guessType(url)
    const canAnimate = this.animated && typeof (globalThis as unknown as { ImageDecoder?: unknown }).ImageDecoder !== 'undefined' && (type === 'image/gif' || type === 'image/webp' || type === 'image/png' || type === 'image/apng')
    if (canAnimate) {
      try {
        const decoded = await decodeAnimated(blob, type)
        if (decoded) return decoded
      } catch {
        /* fall through to static */
      }
    }
    try {
      const bmp = await createImageBitmap(blob)
      return { w: bmp.width, h: bmp.height, bitmap: bmp }
    } catch {
      return loadViaImageElement(URL.createObjectURL(blob))
    }
  }

  clear(): void {
    for (const img of this.cache.values()) {
      if (img.frames) for (const f of img.frames) f.bitmap.close?.()
      else if ('close' in img.bitmap && typeof (img.bitmap as ImageBitmap).close === 'function') (img.bitmap as ImageBitmap).close()
    }
    this.cache.clear()
    this.failed.clear()
    this.version++
  }
}

function guessType(url: string): string {
  const u = url.toLowerCase()
  if (u.endsWith('.gif')) return 'image/gif'
  if (u.endsWith('.webp')) return 'image/webp'
  if (u.endsWith('.png')) return 'image/png'
  return 'image/png'
}

function loadViaImageElement(url: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve({ w: img.naturalWidth || 72, h: img.naturalHeight || 72, bitmap: img })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number; animated: boolean } | null }
  completed: Promise<void>
  decode(opts: { frameIndex: number; completeFramesOnly?: boolean }): Promise<{ image: VideoFrame }>
  close(): void
}

async function decodeAnimated(blob: Blob, type: string): Promise<LoadedImage | null> {
  const buf = await blob.arrayBuffer()
  const Ctor = (globalThis as unknown as { ImageDecoder: new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike }).ImageDecoder
  const dec = new Ctor({ data: buf, type })
  await dec.tracks.ready
  const track = dec.tracks.selectedTrack
  if (!track || !track.animated || track.frameCount <= 1) {
    dec.close()
    return null
  }
  // frameCount may grow while decoding; wait for completion to know the real count
  try {
    await dec.completed
  } catch {
    /* ignore */
  }
  const count = dec.tracks.selectedTrack?.frameCount ?? track.frameCount
  const step = Math.max(1, Math.ceil(count / MAX_FRAMES))
  const frames: AnimFrame[] = []
  let total = 0
  let w = 0
  let h = 0
  for (let i = 0; i < count; i += step) {
    const { image } = await dec.decode({ frameIndex: i })
    let dur = image.duration != null ? image.duration / 1000 : 100
    if (dur < 20) dur = 100 // browsers clamp very short GIF delays to 100ms
    // when skipping frames, accumulate the skipped durations
    dur *= step
    w = image.displayWidth
    h = image.displayHeight
    const bmp = await createImageBitmap(image)
    image.close()
    frames.push({ bitmap: bmp, durationMs: dur })
    total += dur
  }
  dec.close()
  if (!frames.length) return null
  return { w, h, bitmap: frames[0].bitmap, frames, totalMs: total }
}

/** Frame to draw at simulation time t (ms). */
export function frameAt(img: LoadedImage, t: number): CanvasImageSource {
  if (!img.frames || !img.totalMs) return img.bitmap
  let m = t % img.totalMs
  if (m < 0) m += img.totalMs
  for (const f of img.frames) {
    if (m < f.durationMs) return f.bitmap
    m -= f.durationMs
  }
  return img.frames[img.frames.length - 1].bitmap
}
