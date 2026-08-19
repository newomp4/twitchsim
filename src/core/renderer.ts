import type { AnimationStyle, ChatMessage } from './types'
import type { Timeline } from './simulation'
import { AssetCache, frameAt } from './assets'
import { layoutMessage, type Atom, type RenderStyle, type RowLayout, type LineBox, type Block, type TextStyle, avatarFor } from './layout'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface RenderOptions {
  style: RenderStyle
  animation: AnimationStyle
  animationMs: number
  /** px of fade at the top edge (0 = off) */
  fadeTopEdge: number
  /** pick 4x assets */
  hiRes: boolean
  /** override background (e.g. opaque export of a transparent style) */
  forceBg?: string | null
  /** entrance easing curve y(t) (defaults to easeOutCubic) */
  ease?: (t: number) => number
  /** the scroll (room-making) easing curve; defaults to `ease` (coupled) */
  scrollEase?: (t: number) => number
}

interface CacheEntry {
  /** the message object this layout was computed for (ids restart at 1 for every new timeline) */
  msg: ChatMessage
  layout: RowLayout
  key: string
  assetsVersion: number
  hadMissing: boolean
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}
function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

/** Per-row entry transform for the animated message. */
export interface RowAnim {
  /** fraction of the row height already allotted in the stack (older rows move up smoothly) */
  grow: number
  alpha: number
  dx: number
  scale: number
}

/** "start centered → drift down to fill": 1 while centred (hold), easing to 0 (bottom-anchored) over drift. */
/** Room-making (stack) growth on the scroll's own clock — used when the scroll is decoupled from the entrance. */
export function rowStackGrow(style: AnimationStyle, age: number, dur: number, ease?: (t: number) => number): number {
  if (style === 'instant') return age > 0 ? 1 : 0
  if (age <= 0) return 0
  if (age >= dur) return 1
  return (ease ?? easeOutCubic)(age / dur)
}

export function fillLiftK(tSec: number, hold: number, drift: number): number {
  if (drift <= 0 || tSec <= hold) return 1
  if (tSec >= hold + drift) return 0
  const x = (tSec - hold) / drift
  const eio = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 // easeInOutCubic
  return 1 - eio
}

export function rowAnimation(style: AnimationStyle, age: number, animMs: number, width: number, ease: (t: number) => number = easeOutCubic): RowAnim {
  if (style === 'instant' || age >= animMs) return { grow: 1, alpha: 1, dx: 0, scale: 1 }
  const t = Math.max(0, age) / animMs
  const p = Math.max(0, Math.min(1, ease(t))) // clamp: the stack model needs grow in [0,1] (overshoot is the 'pop' scale, not the stack)
  switch (style) {
    case 'slide':
    case 'slide-up':
      return { grow: p, alpha: 1, dx: 0, scale: 1 }
    case 'slide-fade':
      return { grow: p, alpha: p, dx: 0, scale: 1 }
    case 'fade':
      return { grow: Math.min(1, t * 3), alpha: p, dx: 0, scale: 1 }
    case 'slide-left':
      return { grow: p, alpha: Math.min(1, t * 2), dx: -width * (1 - p), scale: 1 }
    case 'slide-right':
      return { grow: p, alpha: Math.min(1, t * 2), dx: width * (1 - p), scale: 1 }
    case 'pop':
      return { grow: p, alpha: Math.min(1, t * 2.5), dx: 0, scale: 0.7 + 0.3 * easeOutBack(t) }
  }
  return { grow: 1, alpha: 1, dx: 0, scale: 1 }
}

const pathCache = new Map<string, Path2D>()
function path(d: string): Path2D {
  let p = pathCache.get(d)
  if (!p) {
    p = new Path2D(d)
    pathCache.set(d, p)
  }
  return p
}

/** Draws a chat timeline onto a 2D context at a given simulation time. All coordinates in CSS px (apply scale via ctx transform). */
export class ChatRenderer {
  private cache = new Map<number, CacheEntry>()
  private lastStyleKey = ''
  assets: AssetCache

  constructor(assets: AssetCache) {
    this.assets = assets
  }

  invalidate(): void {
    this.cache.clear()
  }

  private styleKey(o: RenderOptions): string {
    const s = o.style
    const av = s.avatars
    return [s.width, s.fontSize, s.lineHeight, s.fontFamily, s.theme, s.timestamps, s.showBadges, s.boldNames, s.readableColors, s.nameColorPalette ? s.nameColorPalette.join(',') : '~', s.letterSpacing, s.slideDistance, s.alternateBg, s.padX, s.modView, s.hypeTrain, o.hiRes, s.transparent, s.badgeRadius, Object.keys(s.badgeOverrides).join(','), av.mode, av.shape, Object.keys(av.byLogin).join(','), av.pool.length].join('|')
  }

  layoutFor(msg: ChatMessage, o: RenderOptions, tNow: number, index: number): RowLayout {
    const sk = this.styleKey(o)
    if (sk !== this.lastStyleKey) {
      this.cache.clear()
      this.lastStyleKey = sk
    }
    const deleted = msg.deletedAt !== undefined && tNow >= msg.deletedAt
    const key = `${deleted ? 'd' : 'n'}|${o.style.alternateBg ? index % 2 : 0}`
    const e = this.cache.get(msg.id)
    if (e && e.msg === msg && e.key === key && (!e.hadMissing || e.assetsVersion === this.assets.version)) return e.layout
    const layout = layoutMessage(msg, { style: o.style, assets: this.assets, hiRes: o.hiRes }, tNow, index)
    // did any emote image lack a loaded bitmap? then re-layout once assets change
    let hadMissing = false
    for (const f of msg.fragments) {
      if (f.kind === 'emote' && !this.assets.get(o.hiRes ? f.url4x : f.url) && !this.assets.get(f.url)) {
        hadMissing = true
        this.assets.request(o.hiRes ? f.url4x : f.url)
      }
    }
    this.cache.set(msg.id, { msg, layout, key, assetsVersion: this.assets.version, hadMissing })
    return layout
  }

  /** Total content height currently visible (useful for auto-sizing). */
  render(ctx: Ctx2D, tl: Timeline, tMs: number, o: RenderOptions): void {
    const s = o.style
    const W = s.width
    const H = s.height
    ctx.save()
    // background + clip
    const bg = o.forceBg !== undefined ? o.forceBg : s.bgColor
    const r = s.cornerRadius
    if (r > 0) {
      ctx.beginPath()
      ctx.roundRect(0, 0, W, H, r)
      ctx.clip()
    } else {
      ctx.beginPath()
      ctx.rect(0, 0, W, H)
      ctx.clip()
    }
    // (the panel colour is painted *under* the rows at the end — see the top fade — so a fade never
    // thins the panel itself; a canvas that already has content beneath the chat is not touched either)
    const fadeH = o.fadeTopEdge > 0 ? Math.min(H, o.fadeTopEdge) : 0
    if (bg && fadeH <= 0) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
    }

    // visible window
    const msgs = tl.messages
    const lead = Math.max(0, s.scrollLead ?? 0)
    // the list opens room `lead` ms before a message slides in: include soon-to-arrive rows (drawn invisibly)
    let hi = upperBound(msgs, tMs + lead + 1e-6)
    let clearT = -Infinity
    for (const c of tl.clears) if (c <= tMs + 1e-6) clearT = c
    let yBottom = H - s.paddingBottom
    // "start centered, drift down to fill": lift the whole stack so the newest message sits on the vertical
    // centre line early on, then ease it down to the bottom so the column fills the frame top-to-bottom
    if (s.fillDown) {
      const lift0 = Math.max(0, H / 2 - s.paddingBottom - s.lineHeight / 2)
      yBottom -= lift0 * fillLiftK(tMs / 1000, s.fillHold, s.fillDrift)
    }
    const animMs = Math.max(1, o.animationMs)
    // draw newest first (bottom) going up
    const toDraw: { layout: RowLayout; y: number; anim: RowAnim }[] = []
    let idx = hi - 1
    while (idx >= 0 && yBottom > -50) {
      const m = msgs[idx]
      idx--
      if (m.t < clearT) continue // everything before the latest /clear is gone (the clear notice itself sits at clearT)
      const layout = this.layoutFor(m, o, tMs, idx + 1)
      const anim = rowAnimation(o.animation, tMs - m.t, animMs, W * (s.slideDistance ?? 1), o.ease)
      // a message included only to pre-open its room (arrives up to `lead` ms from now) stays invisible
      // until its own entrance begins — otherwise a no-fade style (slide-up) would paint it fully opaque early
      if (m.t > tMs) anim.alpha = 0
      // the stack (room-making) grows on its own clock: the scroll ease/duration, shifted earlier by the lead.
      // Decoupled from the message's horizontal entrance so the room can lead the slide-in.
      const scrollDur = (s.scrollDurationMs ?? 0) > 0 ? s.scrollDurationMs : animMs
      const scrollEase = o.scrollEase ?? o.ease ?? undefined
      const stackGrow = lead > 0 || (s.scrollDurationMs ?? 0) > 0 || o.scrollEase ? Math.max(0, Math.min(1, rowStackGrow(o.animation, tMs - m.t + lead, scrollDur, scrollEase))) : anim.grow
      const allotted = layout.height * stackGrow
      const yTop = yBottom - allotted
      toDraw.push({ layout, y: yTop, anim })
      yBottom = yTop
    }
    // draw oldest first so newer rows paint over overlapping emote overflow naturally
    for (let i = toDraw.length - 1; i >= 0; i--) {
      const d = toDraw[i]
      const a = d.anim
      if (a.dx !== 0 || a.scale !== 1) {
        ctx.save()
        const cy = d.y + d.layout.height / 2
        ctx.translate(a.dx, cy)
        ctx.scale(a.scale, a.scale)
        ctx.translate(0, -cy)
        this.drawRow(ctx, d.layout, 0, d.y, W, a.alpha, tMs, o)
        ctx.restore()
      } else this.drawRow(ctx, d.layout, 0, d.y, W, a.alpha, tMs, o)
    }

    // top fade: the rows were drawn onto a clean layer, so erasing them with destination-out fades exactly
    // the content; the panel colour then goes underneath (destination-over) at its full, unchanged alpha
    if (fadeH > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      const cut = ctx.createLinearGradient(0, 0, 0, fadeH)
      cut.addColorStop(0, 'rgba(0,0,0,1)')
      cut.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = cut
      ctx.fillRect(0, 0, W, fadeH)
      ctx.restore()
      if (bg) {
        ctx.save()
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  private drawRow(ctx: Ctx2D, L: RowLayout, x0: number, y0: number, W: number, alpha: number, tMs: number, o: RenderOptions): void {
    const s = o.style
    const contentY = y0 + L.marginTop
    const contentH = L.height - L.marginTop - L.marginBottom
    if (contentY > s.height || contentY + contentH < 0) return
    ctx.save()
    ctx.globalAlpha = alpha
    if (L.effect) drawEffect(ctx, L.effect, x0, contentY, W, contentH, tMs)
    if (L.bg) {
      ctx.fillStyle = L.bg
      ctx.fillRect(x0, contentY, W, contentH)
    }
    if (L.borderLeft) {
      ctx.fillStyle = L.borderLeft
      ctx.fillRect(x0, contentY, L.borderWidth, contentH)
    }
    for (const b of L.blocks) this.drawBlock(ctx, b, x0, contentY, tMs, o)
    ctx.restore()
  }

  private drawBlock(ctx: Ctx2D, b: Block, x0: number, y0: number, tMs: number, o: RenderOptions): void {
    for (const line of b.lines) {
      const ly = y0 + b.y + line.y
      const baseline = ly + line.baseline
      if (b.bodyPill) this.drawBodyPill(ctx, line, x0 + b.x, baseline, b.bodyPill)
      for (const p of line.placed) this.drawAtom(ctx, p.atom, x0 + b.x + p.x, baseline, tMs, o)
    }
  }

  private drawBodyPill(ctx: Ctx2D, line: LineBox, x0: number, baseline: number, pill: NonNullable<Block['bodyPill']>): void {
    let minX = Infinity
    let maxX = -Infinity
    for (const p of line.placed) {
      const a = p.atom
      if (a.kind === 'group' || a.kind === 'br') continue
      if (!a.body) continue
      const w = a.kind === 'image' ? a.boxW : a.w
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x + w)
    }
    if (minX === Infinity) return
    // trailing spaces don't count
    ctx.fillStyle = pill.color
    const top = baseline - pill.asc - 4
    const bottom = baseline + pill.desc + 4
    ctx.beginPath()
    ctx.roundRect(x0 + minX - 4, top, maxX - minX + 8, bottom - top, 2)
    ctx.fill()
  }

  private drawAtom(ctx: Ctx2D, a: Atom, x: number, baseline: number, tMs: number, o: RenderOptions): void {
    switch (a.kind) {
      case 'text':
        this.drawText(ctx, a.text, a.style, x, baseline, a.w, o)
        break
      case 'group':
        for (const inner of a.atoms) {
          this.drawAtom(ctx, inner, x, baseline, tMs, o)
          x += inner.kind === 'image' ? inner.boxW : inner.kind === 'br' ? 0 : inner.w
        }
        break
      case 'image':
        this.drawImage(ctx, a, x, baseline, tMs, o)
        break
      case 'space':
      case 'gap':
      case 'br':
        break
    }
  }

  private drawText(ctx: Ctx2D, text: string, st: TextStyle, x: number, baseline: number, w: number, o: RenderOptions): void {
    const s = o.style
    ctx.font = st.italic ? st.font.replace(/^(?!italic)/, 'italic ') : st.font
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const lc = ctx as Ctx2D & { letterSpacing?: string }
    if ('letterSpacing' in lc) lc.letterSpacing = s.letterSpacing ? `${s.letterSpacing}px` : '0px'
    let tx = x
    if (st.bg) {
      // pill behind the text (inline padding)
      const m = ctx.measureText(text)
      const asc = m.fontBoundingBoxAscent || 13
      const desc = m.fontBoundingBoxDescent || 3
      ctx.fillStyle = st.bg.color
      ctx.beginPath()
      ctx.roundRect(x, baseline - asc - st.bg.padY, w, asc + desc + st.bg.padY * 2, st.bg.radius)
      ctx.fill()
      tx = x + st.bg.padX
    }
    const prevAlpha = ctx.globalAlpha
    if (st.alpha !== undefined) ctx.globalAlpha = prevAlpha * st.alpha
    if (s.textOutline > 0 && !st.bg) {
      ctx.save()
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.lineWidth = s.textOutline * 2
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'
      ctx.strokeText(text, tx, baseline)
      ctx.restore()
    }
    if (s.textShadow && !st.bg) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 3
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 1
      ctx.fillStyle = st.color
      ctx.fillText(text, tx, baseline)
      ctx.restore()
    }
    ctx.fillStyle = st.color
    ctx.fillText(text, tx, baseline)
    if (st.underline) {
      ctx.fillRect(tx, baseline + 1.5, w - (st.bg ? st.bg.padX * 2 : 0), 1)
    }
    ctx.globalAlpha = prevAlpha
  }

  private drawImage(ctx: Ctx2D, a: Extract<Atom, { kind: 'image' }>, x: number, baseline: number, tMs: number, o: RenderOptions): void {
    const boxTop = baseline - a.above
    const boxH = a.above + a.below
    if (a.role === 'icon') {
      if (!a.iconPath) return
      ctx.save()
      ctx.translate(x, boxTop + (boxH - a.h) / 2)
      ctx.scale(a.w / 20, a.h / 20)
      ctx.fillStyle = a.iconColor ?? '#fff'
      ctx.fill(path(a.iconPath))
      ctx.restore()
      return
    }
    const wantHi = o.hiRes
    let img = this.assets.request(wantHi ? a.urlHi : a.url)
    if (!img) img = this.assets.get(wantHi ? a.url : a.urlHi)
    // the SVG stand-in only when the real file failed (not while it is still loading)
    if (!img && a.fallback && this.assets.hasFailed(wantHi ? a.urlHi : a.url)) img = this.assets.request(a.fallback)
    if (!img && a.role !== 'badge' && this.assets.hasFailed(wantHi ? a.urlHi : a.url) && !this.assets.hasFailed(a.url)) img = this.assets.request(a.url)
    if (!img) return
    let dw = a.w
    let dh = a.h
    if (a.role === 'emote' || a.role === 'cheer') {
      // recompute from real aspect in case layout used a placeholder size
      const aspect = img.w / img.h
      const box = Math.max(a.w, a.h) // emote box size
      if (a.role === 'emote' && a.w === a.h) {
        // square placeholder or twitch emote: fit
        if (aspect >= 1) {
          dw = Math.min(a.boxW, box * aspect)
          dh = dw / aspect
        } else {
          dh = box
          dw = box * aspect
        }
      }
    }
    const dx = x + (a.boxW - dw) / 2
    const dy = boxTop + (boxH - dh) / 2 - (a.role === 'badge' ? 0.75 * (a.h / 18) : 0)
    const src = o.style.animatedEmotes ? frameAt(img, tMs) : img.bitmap
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    const prevAlpha = ctx.globalAlpha
    if (a.alpha !== undefined) ctx.globalAlpha = prevAlpha * a.alpha
    try {
      if (a.round && a.round > 0) {
        // uploaded badge: round the corners at draw time
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(dx, dy, dw, dh, Math.min(dw, dh) * Math.min(0.5, a.round))
        ctx.clip()
        ctx.drawImage(src, dx, dy, dw, dh)
        ctx.restore()
      } else ctx.drawImage(src, dx, dy, dw, dh)
    } catch {
      /* image may not be decodable yet */
    }
    ctx.globalAlpha = prevAlpha
  }
}

function upperBound(msgs: ChatMessage[], t: number): number {
  let lo = 0
  let hi = msgs.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (msgs[mid].t <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}


/** Power-up "message effects" backgrounds (approximations of Twitch's animated effects). */
export function drawEffect(ctx: Ctx2D, effect: NonNullable<ChatMessage['effect']>, x: number, y: number, w: number, h: number, tMs: number): void {
  ctx.save()
  const t = tMs / 1000
  if (effect === 'rainbow-eclipse') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    const shift = (t * 0.15) % 1
    const stops = ['#ff004c', '#ff8a00', '#ffe600', '#00e676', '#00b0ff', '#7c4dff', '#ff004c']
    for (let i = 0; i < stops.length; i++) g.addColorStop(((i / (stops.length - 1)) + shift) % 1, stops[i])
    ctx.globalAlpha *= 0.22
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha /= 0.22
    ctx.globalAlpha *= 0.9
    ctx.strokeStyle = g
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
  } else if (effect === 'simmer') {
    const g = ctx.createLinearGradient(x, y + h, x, y)
    g.addColorStop(0, 'rgba(255,90,0,0.55)')
    g.addColorStop(0.6, 'rgba(255,140,0,0.18)')
    g.addColorStop(1, 'rgba(255,60,0,0.05)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    // flickering embers
    for (let i = 0; i < 6; i++) {
      const px = x + ((i * 97 + Math.sin(t * 2 + i) * 40 + 200) % w)
      const py = y + h - ((t * 25 + i * 17) % h)
      ctx.fillStyle = `rgba(255,${160 + i * 10},60,${0.35 + 0.3 * Math.sin(t * 5 + i)})`
      ctx.fillRect(px, py, 2, 2)
    }
  } else if (effect === 'cosmic-abyss') {
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, 'rgba(60,20,120,0.55)')
    g.addColorStop(0.5, 'rgba(20,40,140,0.4)')
    g.addColorStop(1, 'rgba(90,10,120,0.5)')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
    for (let i = 0; i < 14; i++) {
      const px = x + ((i * 61 + 13) % w)
      const py = y + ((i * 37 + 7) % h)
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i * 1.7))
      ctx.fillStyle = `rgba(255,255,255,${tw})`
      ctx.fillRect(px, py, 1.5, 1.5)
    }
  }
  ctx.restore()
}

/** Collects every image URL a timeline needs (for pre-loading before export). */
export function collectAssetUrls(tl: Timeline, hiRes: boolean, style: RenderStyle): string[] {
  const urls = new Set<string>()
  for (const m of tl.messages) {
    if (m.user) {
      const av = avatarFor(m.user.login, style)
      if (av) urls.add(av)
    }
    if (m.user && style.showBadges) {
      for (const b of m.badges ?? m.user.badges) {
        const ov = style.badgeOverrides[b.set]
        if (ov) {
          urls.add(ov)
          continue
        }
        const u = hiRes ? (b.url4x ?? b.url) : b.url
        if (u) urls.add(u)
        else {
          // global badge: computed by layout via badgeUrl; also preload the SVG fallback the renderer uses if the CDN fails
          const { badgeUrl, fallbackBadgeUrl } = badgeApi
          urls.add(badgeUrl(b, hiRes ? 4 : 1) ?? fallbackBadgeUrl(b.set))
          urls.add(fallbackBadgeUrl(b.set))
        }
      }
    }
    for (const f of m.fragments) {
      if (f.kind === 'emote' || f.kind === 'cheer') {
        urls.add(hiRes ? f.url4x : f.url)
        if (hiRes) urls.add(f.url) // the 1× fallback the renderer switches to if the 4× file is missing
        if (m.gigantified && f.kind === 'emote') urls.add(f.url4x) // a giant emote always draws the 4× file
      }
    }
  }
  return [...urls]
}

// late import to avoid a circular type-only cycle warning
import * as badgeApi from './badges'
export { AssetCache }
