/** User-uploaded badge / emote images, normalized so they drop into Twitch's boxes cleanly. */

export type BadgeFit = 'cover' | 'contain'

export interface CustomBadge {
  id: string
  /** sub = subscriber tier (months), replace = swap a Twitch badge set, extra = an additional badge some chatters wear */
  kind: 'sub' | 'replace' | 'extra'
  name: string
  /** square, fitted image (data URL, 144×144 PNG) */
  src: string
  /** original (downscaled ≤ 320px) so it can be re-fitted later */
  orig: string
  /** kind=sub: months threshold */
  months?: number
  /** kind=replace: which Twitch badge set to replace (moderator, vip, broadcaster, premium, turbo, founder, partner, staff, bits, sub-gifter, hype-train …) */
  set?: string
  /** kind=extra: share of chatters that get it (0..1) */
  ratio?: number
}

export interface CustomEmote {
  id: string
  name: string
  /** data URL (original file for GIF/WebP so animation survives; PNG otherwise) */
  src: string
  animated: boolean
}

export interface CustomAvatar {
  id: string
  name: string
  /** square, center-cropped image (data URL) shown before the badges/name */
  src: string
  /** assign to this exact login (lowercase); empty = part of the random pool */
  login: string
}

export const BADGE_SIZE = 144
const ORIG_MAX = 320

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

/** Downscale so the longest side is ≤ max (keeps aspect). Returns PNG data URL. */
export async function downscale(src: string, max: number): Promise<string> {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (w <= max && h <= max && src.startsWith('data:image/png')) return src
  const s = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

/**
 * Fits any image into a square badge canvas.
 * cover   = center-crop to a square (fills the whole badge, like Twitch's own badges)
 * contain = fit inside with transparent padding (nothing cropped)
 * Corners are NOT baked in — they are rounded at draw time so the radius stays adjustable.
 */
export async function fitSquare(src: string, mode: BadgeFit, size = BADGE_SIZE): Promise<string> {
  const img = await loadImage(src)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  if (mode === 'cover') {
    const s = Math.max(size / w, size / h)
    const dw = w * s
    const dh = h * s
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
  } else {
    const s = Math.min(size / w, size / h)
    const dw = w * s
    const dh = h * s
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
  }
  return c.toDataURL('image/png')
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export async function prepareBadge(file: File, fit: BadgeFit, kind: CustomBadge['kind'], extra: Partial<CustomBadge> = {}): Promise<CustomBadge> {
  const raw = await fileToDataUrl(file)
  const orig = await downscale(raw, ORIG_MAX)
  const src = await fitSquare(orig, fit)
  const base = file.name.replace(/\.[^.]+$/, '')
  return { id: newId(), kind, name: extra.name ?? base, src, orig, months: extra.months, set: extra.set, ratio: extra.ratio }
}

export async function refitBadge(b: CustomBadge, fit: BadgeFit): Promise<CustomBadge> {
  return { ...b, src: await fitSquare(b.orig, fit) }
}

const AVATAR_SIZE = 192
export async function prepareAvatar(file: File, login = ''): Promise<CustomAvatar> {
  const raw = await fileToDataUrl(file)
  const orig = await downscale(raw, AVATAR_SIZE)
  const src = await fitSquare(orig, 'cover', AVATAR_SIZE)
  const base = file.name.replace(/\.[^.]+$/, '')
  return { id: newId(), name: base, src, login: login.trim().toLowerCase() }
}

export async function prepareEmote(file: File): Promise<CustomEmote> {
  const raw = await fileToDataUrl(file)
  const animated = file.type === 'image/gif' || file.type === 'image/webp' || file.type === 'image/apng'
  // keep animated files untouched (so frames survive); downscale static ones to a sane size
  const src = animated ? raw : await downscale(raw, 256)
  const name = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_:()<>-]/g, '')
  return { id: newId(), name: name || 'emote', src, animated }
}

/** Twitch badge sets you can replace with your own image. */
export const REPLACEABLE_SETS: { value: string; label: string }[] = [
  { value: 'moderator', label: 'Moderator (sword)' },
  { value: 'vip', label: 'VIP (diamond)' },
  { value: 'broadcaster', label: 'Broadcaster' },
  { value: 'premium', label: 'Prime Gaming' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'founder', label: 'Founder' },
  { value: 'partner', label: 'Verified' },
  { value: 'staff', label: 'Staff' },
  { value: 'bits', label: 'Bits (all tiers)' },
  { value: 'sub-gifter', label: 'Sub gifter (all tiers)' },
  { value: 'hype-train', label: 'Hype train' },
  { value: 'predictions', label: 'Predictions' },
  { value: 'bot-badge', label: 'Chat bot' },
]
