/**
 * Compiles a TwitchSim timeline into an After Effects "scene": plain data describing comps,
 * layers, keyframes and the image files they need. All the layout / animation math happens
 * here (in the browser side of the panel); the ExtendScript host just executes it.
 *
 * Structure produced (see cep/host/index.jsx for the AE side):
 *   Main comp
 *     ├ TwitchSim Controls (null) ← parent of everything: move / scale / rotate the whole chat; its
 *     │                             Effect Controls (opacity, colours, outline, shadow, background, top
 *     │                             fade) drive the layers below through expressions
 *     ├ Chat area (matte) — clips rows to the chat rect, carries the top fade (Ramp)
 *     ├ msg NNN · user   ← one precomp per message, parented to "Scroll"; hold keys give the settled
 *     │                     position, expressions add the entrance animation (style / duration / distance
 *     │                     / ease / pop from the Controls null, sampled at the row's arrival)
 *     ├ Scroll (null)    ← hold keys = every instant push-up of the stack; an expression adds the smooth
 *     │                     growth of rows still animating in (+ the live row gap)
 *     └ Background (shape; opacity 0 when the look is transparent)
 */
import type { Config } from '../core/types'
import type { Timeline } from '../core/simulation'
import type { AssetCache } from '../core/assets'
import { frameAt } from '../core/assets'
import { styleFromConfig, layoutMessage, fontMetrics, measure, type RowLayout, type Atom, type TextStyle, type LineBox, type RenderStyle } from '../core/layout'
import { computeGeometry } from '../export/exporter'
import { drawEffect } from '../core/renderer'
import { easeSamples } from '../core/easing'

// ---------------------------------------------------------------------------
// Output types (kept JSON-friendly and ES3-friendly for the host script)
// ---------------------------------------------------------------------------

export interface Key {
  /** comp time in seconds */
  t: number
  v: number
  interp?: 'hold' | 'linear' | 'bezier'
  /** hold the value until the next key (used right before a chat clear) */
  holdOut?: boolean
  inSpeed?: number
  outSpeed?: number
  inInf?: number
  outInf?: number
}

export type RGB = [number, number, number]

export type MsgLayer =
  | { type: 'rect'; name: string; x: number; y: number; w: number; h: number; radius: number; color: RGB; opacity: number; state?: 'normal' | 'deleted' }
  | { type: 'text'; name: string; text: string; x: number; y: number; family: string; weight: number; italic: boolean; size: number; color: RGB; opacity: number; underline?: number; /** skip stroke/shadow (pill text) */ noFx?: boolean; /** name / body runs follow the Controls null's colour overrides */ role?: 'name' | 'body'; state?: 'normal' | 'deleted' }
  | { type: 'image'; name: string; asset: string; cx: number; cy: number; w: number; h: number; opacity: number; state?: 'normal' | 'deleted' }

export interface SceneMessage {
  name: string
  label: number
  /** row height at scale */
  h: number
  /** precomp size at scale (integers) */
  compW: number
  compH: number
  /** static local position (top of the row) inside the Scroll null, at scale */
  localY: number
  inT: number
  outT: number
  /** true arrival time (comp seconds; negative for rows that were already there at 0) — the entrance animation counts from here */
  t0: number
  /** height of the "deleted" layout at scale (= h when the message is never deleted) */
  hDel: number
  /** absolute comp time the deleted look starts (1e9 = never) */
  delAt: number
  /** comp time of the /clear this row's epoch started with (-1e9 = none) */
  epochStart: number
  /** how many earlier rows share the epoch (drives the live "row gap") */
  idx: number
  /** hold keys for the local Y (row centre) — jumps when an older row's deleted layout changes height */
  yKeys?: Key[]
  /** if the message gets deleted: precomp-relative time when the "deleted" state starts */
  deletedAtRel?: number
  layers: MsgLayer[]
}

export interface SceneAsset {
  id: string
  /** path relative to the build folder; for sequences the folder */
  file: string
  kind: 'still' | 'sequence'
  w: number
  h: number
  /** sequence only */
  frames?: number
  fps?: number
}

export interface SceneData {
  version: 1
  buildKey: string
  compName: string
  fps: number
  durationSec: number
  scale: number
  frame: { w: number; h: number }
  /** ax/ay: where the chat is pinned in the frame (0..1) — the Controls null scales/rotates about it */
  chat: { x: number; y: number; w: number; h: number; ax: number; ay: number }
  /** always present (opacity 0 for transparent looks) so the Controls null can switch a panel on later */
  background: { color: RGB; opacity: number; radius: number }
  /** px at scale; 0 = off */
  fadeTop: number
  text: { shadow: boolean; strokeWidth: number; tracking: number }
  /** entrance animation defaults for the Controls null (style index = the dropdown order in the host) */
  anim: { style: number; ms: number; slidePx: number }
  /** entrance easing sampled 0..1 (65 points), or null = the host's built-in easeOutCubic */
  ease: number[] | null
  /** /clear times (comp seconds) — the Scroll expression counts rows per epoch */
  clears: number[]
  /** hold keys: the stack's instant push-ups (arrivals, deletions, clears); the growth transient is an expression */
  scroll: Key[]
  assets: SceneAsset[]
  messages: SceneMessage[]
  stats: { layers: number; keys: number; assets: number }
}

export interface SceneFile {
  /** relative path in the build folder */
  path: string
  base64: string
}

export interface Scene {
  data: SceneData
  files: SceneFile[]
}

export interface SceneOptions {
  compName: string
  buildKey: string
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function r3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function parseColor(c: string): { rgb: RGB; a: number } {
  c = c.trim()
  if (c.startsWith('#')) {
    let h = c.slice(1)
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('')
    const n = parseInt(h.slice(0, 6), 16)
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    return { rgb: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], a }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x))
    return { rgb: [p[0] / 255, p[1] / 255, p[2] / 255], a: p.length > 3 ? p[3] : 1 }
  }
  if (c === 'white') return { rgb: [1, 1, 1], a: 1 }
  return { rgb: [0, 0, 0], a: 1 }
}

interface FontSpec {
  family: string
  weight: number
  italic: boolean
  size: number
}

function parseFont(font: string): FontSpec {
  // `fontString()` quotes real family names and leaves generic ones (system-ui, sans-serif…) bare
  const m = font.match(/^(italic\s+)?(\d+)\s+([\d.]+)px\s+(?:"([^"]+)"|([^,]+))/)
  if (!m) return { family: 'Inter', weight: 400, italic: false, size: 14 }
  return { family: (m[4] ?? m[5]).trim(), weight: parseInt(m[2], 10), italic: !!m[1], size: parseFloat(m[3]) }
}

function hashStr(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 40) || 'x'
}

// ---------------------------------------------------------------------------
// asset rasterization
// ---------------------------------------------------------------------------

class AssetWriter {
  private byKey = new Map<string, string>()
  private cache: AssetCache
  private fps: number
  private animated: boolean
  assets: SceneAsset[] = []
  files: SceneFile[] = []
  constructor(cache: AssetCache, fps: number, animated: boolean) {
    this.cache = cache
    this.fps = fps
    this.animated = animated
  }

  private canvas(w: number, h: number): { c: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return { c, ctx: c.getContext('2d')! }
  }

  private toBase64(c: HTMLCanvasElement | OffscreenCanvas): string {
    return (c as HTMLCanvasElement).toDataURL('image/png').split(',')[1]
  }

  /** badge / emote / cheer image → PNG (or PNG sequence when animated) */
  image(url: string, urlHi: string, fallback: string | undefined, role: string, name: string, round: number | undefined): { id: string; w: number; h: number } | null {
    let img = this.cache.get(urlHi) ?? this.cache.get(url)
    if (!img && fallback) img = this.cache.get(fallback)
    if (!img) return null
    const animated = this.animated && !!img.frames && img.frames.length > 1 && !!img.totalMs
    const key = `${role}|${urlHi || url}|${round ?? 0}|${animated ? 'a' : 's'}`
    const known = this.byKey.get(key)
    if (known) {
      const a = this.assets.find((x) => x.id === known)!
      return { id: a.id, w: a.w, h: a.h }
    }
    const id = `${role}-${safeName(name)}-${hashStr(key)}`
    const w = Math.max(1, Math.round(img.w))
    const h = Math.max(1, Math.round(img.h))
    if (animated) {
      // one loop of the animation, resampled to the comp frame rate (long loops capped at 150 frames)
      const total = img.totalMs!
      const n = Math.min(150, Math.max(2, Math.round((total / 1000) * this.fps)))
      const seqFps = n / (total / 1000)
      const folder = `seq/${id}-${n}f` // frame count in the name: a rebuild at another fps must not pick up stale files
      for (let j = 0; j < n; j++) {
        const src = frameAt(img, (j / seqFps) * 1000 + 0.01)
        const { c, ctx } = this.canvas(w, h)
        if (round && round > 0) {
          ctx.beginPath()
          ctx.roundRect(0, 0, w, h, Math.min(w, h) * Math.min(0.5, round))
          ctx.clip()
        }
        ctx.drawImage(src, 0, 0, w, h)
        this.files.push({ path: `${folder}/f_${String(j).padStart(5, '0')}.png`, base64: this.toBase64(c) })
      }
      this.assets.push({ id, file: folder, kind: 'sequence', w, h, frames: n, fps: r3(seqFps) })
    } else {
      const { c, ctx } = this.canvas(w, h)
      if (round && round > 0) {
        ctx.beginPath()
        ctx.roundRect(0, 0, w, h, Math.min(w, h) * Math.min(0.5, round))
        ctx.clip()
      }
      ctx.drawImage(img.bitmap, 0, 0, w, h)
      this.files.push({ path: `img/${id}.png`, base64: this.toBase64(c) })
      this.assets.push({ id, file: `img/${id}.png`, kind: 'still', w, h })
    }
    this.byKey.set(key, id)
    return { id, w, h }
  }

  /** power-up message effect background (rainbow eclipse / simmer / cosmic abyss) → one still PNG at build scale */
  effect(kind: NonNullable<RowLayout['effect']>, w: number, h: number, s: number, tMs: number, msgId: number): { id: string; w: number; h: number } {
    const id = `effect-${kind}-${msgId}`
    const pw = Math.max(1, Math.round(w * s))
    const ph = Math.max(1, Math.round(h * s))
    const { c, ctx } = this.canvas(pw, ph)
    ctx.scale(s, s)
    drawEffect(ctx, kind, 0, 0, w, h, tMs)
    this.files.push({ path: `img/${id}.png`, base64: this.toBase64(c) })
    this.assets.push({ id, file: `img/${id}.png`, kind: 'still', w: pw, h: ph })
    return { id, w: pw, h: ph }
  }

  /** SVG-path icon (reply arrow, gift, crown…) → PNG at 4x */
  icon(pathD: string, color: string, name: string): { id: string; w: number; h: number } {
    const key = `icon|${pathD}|${color}`
    const known = this.byKey.get(key)
    if (known) return { id: known, w: 80, h: 80 }
    const id = `icon-${safeName(name)}-${hashStr(key)}`
    const { c, ctx } = this.canvas(80, 80)
    ctx.scale(4, 4)
    ctx.fillStyle = color
    ctx.fill(new Path2D(pathD))
    this.files.push({ path: `img/${id}.png`, base64: this.toBase64(c) })
    this.assets.push({ id, file: `img/${id}.png`, kind: 'still', w: 80, h: 80 })
    this.byKey.set(key, id)
    return { id, w: 80, h: 80 }
  }
}

// ---------------------------------------------------------------------------
// row → layers
// ---------------------------------------------------------------------------

interface RowCtx {
  style: RenderStyle
  s: number
  writer: AssetWriter
  W: number
}

interface Run {
  text: string
  x: number
  w: number
  style: TextStyle
}

function styleKey(st: TextStyle): string {
  return `${st.font}|${st.color}|${st.italic ? 1 : 0}|${st.underline ? 1 : 0}|${st.alpha ?? 1}|${st.bg ? 'bg' : ''}|${st.role ?? ''}`
}

/** Flattens a line into positioned atoms (groups expanded). */
function flatten(line: LineBox): { atom: Atom; x: number }[] {
  const out: { atom: Atom; x: number }[] = []
  const walk = (a: Atom, x: number) => {
    if (a.kind === 'group') {
      let cx = x
      for (const inner of a.atoms) {
        walk(inner, cx)
        cx += inner.kind === 'image' ? inner.boxW : inner.kind === 'br' ? 0 : inner.w
      }
    } else out.push({ atom: a, x })
  }
  for (const p of line.placed) walk(p.atom, p.x)
  return out
}

function emitRow(L: RowLayout, ctx: RowCtx, state?: 'normal' | 'deleted', effectT = 0): MsgLayer[] {
  const { s, writer, W } = ctx
  const out: MsgLayer[] = []
  const contentY = L.marginTop
  const contentH = L.height - L.marginTop - L.marginBottom
  const push = (l: MsgLayer) => {
    if (state) l.state = state
    out.push(l)
  }
  if (L.effect) {
    // power-up effect: a still of the canvas' animated background at the message's arrival time
    const a = writer.effect(L.effect, W, contentH, s, effectT, L.msgId)
    push({ type: 'image', name: `effect ${L.effect}`, asset: a.id, cx: r3((W / 2) * s), cy: r3((contentY + contentH / 2) * s), w: r3(W * s), h: r3(contentH * s), opacity: 100 })
  }
  if (L.bg) {
    const c = parseColor(L.bg)
    push({ type: 'rect', name: 'row background', x: 0, y: r3(contentY * s), w: r3(W * s), h: r3(contentH * s), radius: 0, color: c.rgb, opacity: r3(c.a * 100) })
  }
  if (L.borderLeft) {
    const c = parseColor(L.borderLeft)
    push({ type: 'rect', name: 'accent bar', x: 0, y: r3(contentY * s), w: r3(L.borderWidth * s), h: r3(contentH * s), radius: 0, color: c.rgb, opacity: r3(c.a * 100) })
  }
  for (const b of L.blocks) {
    for (const line of b.lines) {
      const baseline = contentY + b.y + line.y + line.baseline
      const items = flatten(line)
      const x0 = b.x
      // highlighted-message pill behind the body
      if (b.bodyPill) {
        let minX = Infinity
        let maxX = -Infinity
        for (const it of items) {
          const a = it.atom
          if (a.kind === 'br' || a.kind === 'group' || !a.body) continue
          const w = a.kind === 'image' ? a.boxW : a.w
          minX = Math.min(minX, it.x)
          maxX = Math.max(maxX, it.x + w)
        }
        if (minX !== Infinity) {
          const c = parseColor(b.bodyPill.color)
          const top = baseline - b.bodyPill.asc - 4
          const bottom = baseline + b.bodyPill.desc + 4
          push({ type: 'rect', name: 'highlight pill', x: r3((x0 + minX - 4) * s), y: r3(top * s), w: r3((maxX - minX + 8) * s), h: r3((bottom - top) * s), radius: r3(2 * s), color: c.rgb, opacity: r3(c.a * 100) })
        }
      }
      // merge consecutive text/space atoms with the same style into runs
      const runs: Run[] = []
      let cur: Run | null = null
      const flushRun = () => {
        if (cur && cur.text.trim().length) runs.push(cur)
        cur = null
      }
      const emitRun = (r: Run) => {
        const f = parseFont(r.style.font)
        const c = parseColor(r.style.color)
        // AE point text swallows leading spaces: drop them and move the layer right by their width instead
        const lead = r.text.match(/^\s+/)?.[0] ?? ''
        if (lead) {
          r = { ...r, text: r.text.slice(lead.length), x: r.x + measure(lead, r.style.font), w: r.w - measure(lead, r.style.font) }
          if (!r.text) return
        }
        let tx = r.x
        if (r.style.bg) {
          const fm = fontMetrics(f.size, f.family)
          const bg = parseColor(r.style.bg.color)
          push({ type: 'rect', name: 'mention pill', x: r3((x0 + r.x) * s), y: r3((baseline - fm.asc - r.style.bg.padY) * s), w: r3(r.w * s), h: r3((fm.asc + fm.desc + r.style.bg.padY * 2) * s), radius: r3(r.style.bg.radius * s), color: bg.rgb, opacity: r3(bg.a * 100) })
          tx = r.x + r.style.bg.padX
        }
        const layer: MsgLayer = { type: 'text', name: r.text.length > 28 ? r.text.slice(0, 27) + '…' : r.text, text: r.text, x: r3((x0 + tx) * s), y: r3(baseline * s), family: f.family, weight: f.weight, italic: !!f.italic || !!r.style.italic, size: r3(f.size * s), color: c.rgb, opacity: r3(c.a * 100 * (r.style.alpha ?? 1)) }
        if (r.style.bg) layer.noFx = true // the canvas draws no outline/shadow on pill text
        if (r.style.role) layer.role = r.style.role
        if (r.style.underline) layer.underline = r3((r.w - (r.style.bg ? r.style.bg.padX * 2 : 0)) * s)
        push(layer)
      }
      for (const it of items) {
        const a = it.atom
        if (a.kind === 'text' || a.kind === 'space') {
          const t = a.kind === 'text' ? a.text : ' '
          const contiguous = cur && Math.abs(cur.x + cur.w - it.x) < 0.05 && styleKey(cur.style) === styleKey(a.style) && !a.style.bg
          if (contiguous && cur) {
            cur.text += t
            cur.w = it.x + a.w - cur.x
          } else {
            flushRun()
            cur = { text: t, x: it.x, w: a.w, style: a.style }
          }
          continue
        }
        flushRun()
        if (a.kind === 'image') {
          const boxTop = baseline - a.above
          const boxH = a.above + a.below
          if (a.role === 'icon') {
            if (!a.iconPath) continue
            const asset = writer.icon(a.iconPath, a.iconColor ?? '#fff', a.name)
            const dx = it.x
            const dy = boxTop + (boxH - a.h) / 2
            push({ type: 'image', name: `icon ${a.name}`, asset: asset.id, cx: r3((x0 + dx + a.w / 2) * s), cy: r3((dy + a.h / 2) * s), w: r3(a.w * s), h: r3(a.h * s), opacity: r3((a.alpha ?? 1) * 100) })
            continue
          }
          const asset = writer.image(a.url, a.urlHi, a.fallback, a.role, a.name, a.round)
          if (!asset) continue
          let dw = a.w
          let dh = a.h
          if (a.role === 'emote' && a.w === a.h) {
            const aspect = asset.w / asset.h
            const box = Math.max(a.w, a.h)
            if (aspect >= 1) {
              dw = Math.min(a.boxW, box * aspect)
              dh = dw / aspect
            } else {
              dh = box
              dw = box * aspect
            }
          }
          const dx = it.x + (a.boxW - dw) / 2
          const dy = boxTop + (boxH - dh) / 2 - (a.role === 'badge' ? 0.75 * (a.h / 18) : 0)
          push({ type: 'image', name: `${a.role} ${a.name}`, asset: asset.id, cx: r3((x0 + dx + dw / 2) * s), cy: r3((dy + dh / 2) * s), w: r3(dw * s), h: r3(dh * s), opacity: r3((a.alpha ?? 1) * 100) })
        }
      }
      flushRun()
      for (const r of runs) emitRun(r)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// scene compiler
// ---------------------------------------------------------------------------

/** order of the "Animation · Style" dropdown on the Controls null (see the host script) */
const ANIM_STYLE_INDEX: Record<string, number> = { instant: 1, slide: 2, 'slide-up': 2, 'slide-fade': 3, fade: 4, 'slide-left': 5, 'slide-right': 6, pop: 7 }

export function compileScene(cfg: Config, tl: Timeline, assets: AssetCache, opts: SceneOptions): Scene {
  const style = styleFromConfig(cfg)
  const geo = computeGeometry(cfg)
  const s = geo.scale
  const W = style.width
  const H = style.height
  const pb = style.paddingBottom
  const fps = cfg.exportFps
  const durationSec = tl.durationMs / 1000
  const frameDur = 1 / fps
  const writer = new AssetWriter(assets, fps, cfg.animatedEmotes)
  const env = { style, assets, hiRes: true }
  const rowCtx: RowCtx = { style, s, writer, W }
  const msgs = tl.messages
  const N = msgs.length
  // times stay exact (seconds): every comparison below pairs numbers derived from the same source, and the
  // expressions in AE compare the same values again — rounding would only introduce disagreements
  const rt = (x: number) => x
  const clears = [...tl.clears].sort((a, b) => a - b).map((c) => rt(c / 1000))

  // ---- per-message timing / geometry ----
  const t = msgs.map((m) => rt(m.t / 1000))
  const layouts: RowLayout[] = msgs.map((m, i) => layoutMessage(m, env, m.t, i))
  const h = layouts.map((L) => L.height)
  // moderator deletions re-flow the row ("message deleted…"), which changes its height at that
  // moment — modelled as an instant height change (like Twitch: the older rows above jump)
  const del: number[] = msgs.map(() => Infinity)
  const layoutsDel: (RowLayout | null)[] = msgs.map(() => null)
  msgs.forEach((m, i) => {
    if (m.deletedAt === undefined) return
    const dAt = rt(m.deletedAt / 1000)
    const Ld = layoutMessage(m, env, m.deletedAt, i)
    if (dAt <= Math.max(0, t[i])) {
      // deleted before it is ever visible: only the deleted look exists
      layouts[i] = Ld
      h[i] = Ld.height
    } else {
      del[i] = dAt
      layoutsDel[i] = Ld
    }
  })
  /** row height as of time tau */
  const hAt = (k: number, tau: number) => (tau >= del[k] && layoutsDel[k] ? layoutsDel[k]!.height : h[k])
  const hiddenAt = t.map((ti) => {
    const c = clears.find((x) => x > ti)
    return c === undefined ? Infinity : c
  })
  const epoch = t.map((ti) => {
    let e = -Infinity
    for (const c of clears) if (c <= ti) e = c
    return e
  })
  // local offset inside the scroll null: heights (as of this row's arrival) of all earlier rows of the same epoch
  const C: number[] = new Array(N).fill(0)
  const idxInEpoch: number[] = new Array(N).fill(0)
  for (let i = 0; i < N; i++) {
    let sum = 0
    let n = 0
    for (let k = 0; k < i; k++) {
      if (epoch[k] !== epoch[i]) continue
      sum += hAt(k, t[i])
      n++
    }
    C[i] = sum
    idxInEpoch[i] = n
  }
  const visibleAt = (k: number, tau: number) => t[k] <= tau && tau < hiddenAt[k]
  /** settled stack height (every row at its full height — the entrance growth is an expression in AE) */
  const S = (tau: number) => {
    let sum = 0
    for (let k = 0; k < N; k++) if (visibleAt(k, tau)) sum += hAt(k, tau)
    return sum
  }

  // ---- scroll keys (hold: the stack jumps at every event, the expression smooths the arrivals) ----
  const times = new Set<number>([0])
  for (let k = 0; k < N; k++) if (t[k] >= 0 && t[k] <= durationSec) times.add(rt(t[k]))
  for (const c of [...clears, ...del.filter((d) => d !== Infinity)]) if (c > 0 && c <= durationSec) times.add(rt(c))
  const keyTimes = [...times].sort((a, b) => a - b)
  const scroll: Key[] = keyTimes.map((tau) => ({ t: rt(tau), v: r3((H - pb - S(tau)) * s), interp: 'hold' as const }))
  // S evaluated at key times, for out-point lookups
  const Skeys = keyTimes.map((tau) => S(tau))

  // ---- messages ----
  const messages: SceneMessage[] = []
  let layerCount = 0
  let keyCount = scroll.length
  const dur = Math.max(1, cfg.animationMs) / 1000
  for (let i = 0; i < N; i++) {
    const m = msgs[i]
    const L = layouts[i]
    const inT = Math.max(0, t[i])
    if (inT >= durationSec) continue // generated past the end of the comp: never visible
    if (hiddenAt[i] <= inT) continue // wiped by a /clear before it could ever show
    if (hiddenAt[i] - inT < frameDur * 0.999) continue // no frame in which it would be seen (AE layers span whole frames)
    const hMax = Math.max(h[i], layoutsDel[i]?.height ?? 0)
    // out point: the row's *last* exit above the top edge (the stack can shrink again when a newer row's
    // "deleted" layout is shorter — the canvas slides everything back down), or the clear that hides it.
    // The entrance growth (an expression, duration adjustable in AE) delays every push-up, so keep the
    // layer alive a while longer than the settled model says — the matte hides it anyway.
    let outT = Math.min(durationSec, hiddenAt[i])
    {
      const jumpsAbove: { at: number; d: number }[] = []
      for (let k = 0; k < i; k++) if (epoch[k] === epoch[i] && del[k] !== Infinity && layoutsDel[k] && del[k] > t[i]) jumpsAbove.push({ at: del[k], d: layoutsDel[k]!.height - h[k] })
      let above: number | null = null
      for (let j = 0; j < keyTimes.length; j++) {
        if (keyTimes[j] < inT) continue
        if (keyTimes[j] >= hiddenAt[i]) break
        let localTop = C[i]
        for (const jp of jumpsAbove) if (keyTimes[j] >= jp.at) localTop += jp.d
        const threshold = H - pb + localTop + hMax
        if (Skeys[j] >= threshold - 1e-6) {
          if (above === null) above = keyTimes[j]
        } else above = null
      }
      // 6 s: the live Duration control is clamped to that in the expressions, so the growth can delay an exit
      // by at most that much
      if (above !== null) outT = Math.min(outT, above + Math.max(6, 4 * dur))
    }
    if (outT <= inT) outT = Math.min(durationSec, inT + frameDur)
    const layerStart = inT
    // layers: normal state (+ deleted state if the message gets deleted later)
    let layers: MsgLayer[]
    let deletedAtRel: number | undefined
    if (layoutsDel[i]) {
      deletedAtRel = del[i] - layerStart
      layers = [...emitRow(L, rowCtx, 'normal', m.t), ...emitRow(layoutsDel[i]!, rowCtx, 'deleted', m.t)]
    } else layers = emitRow(L, rowCtx, undefined, m.t)
    // Local Y (row centre) inside the scroll null: C[i], jumping when an older row is deleted while this
    // one is on screen (its layout changes height). The entrance transient of older rows still growing
    // in is added live by the position expression.
    let yKeys: Key[] | undefined
    {
      const jumps: { at: number; d: number }[] = []
      for (let k = 0; k < i; k++) {
        if (epoch[k] !== epoch[i] || del[k] === Infinity || !layoutsDel[k]) continue
        if (del[k] > t[i] && del[k] < hiddenAt[i] && del[k] <= durationSec) jumps.push({ at: del[k], d: layoutsDel[k]!.height - h[k] })
      }
      if (jumps.length) {
        jumps.sort((a, b) => a.at - b.at)
        yKeys = [{ t: rt(inT), v: r3((C[i] + h[i] / 2) * s), interp: 'hold' }]
        let acc = C[i]
        for (const j of jumps) {
          acc += j.d
          yKeys.push({ t: rt(j.at), v: r3((acc + h[i] / 2) * s), interp: 'hold' })
        }
      }
    }
    keyCount += yKeys?.length ?? 0
    layerCount += layers.length + 1
    const who = m.user?.displayName ?? (m.notice ? m.notice.kind : 'system')
    const label = m.notice ? 10 : m.highlighted ? 4 : m.deletedAt !== undefined ? 1 : m.firstTime ? 3 : 8
    messages.push({
      name: `msg ${String(i + 1).padStart(3, '0')} · ${who}`,
      label,
      h: r3(h[i] * s),
      compW: Math.max(4, Math.ceil(W * s)),
      compH: Math.max(4, Math.ceil(hMax * s + 0.5)),
      localY: r3(C[i] * s),
      inT,
      outT,
      // times the expressions compare with each other and with `clears` keep the same (0.1 ms) quantization
      t0: t[i],
      hDel: r3((layoutsDel[i]?.height ?? h[i]) * s),
      delAt: del[i] === Infinity ? 1e9 : del[i],
      epochStart: epoch[i] === -Infinity ? -1e9 : epoch[i],
      idx: idxInEpoch[i],
      yKeys,
      deletedAtRel,
      layers,
    })
  }

  // ---- background ----
  let background: SceneData['background'] = { color: [0.09, 0.09, 0.1], opacity: 0, radius: r3(style.cornerRadius * s) }
  if (style.bgColor) {
    const c = parseColor(style.bgColor)
    if (c.a > 0) background = { color: c.rgb, opacity: r3(c.a * 100), radius: r3(style.cornerRadius * s) }
  }
  const ax = cfg.anchor.includes('l') ? 0 : cfg.anchor.includes('r') ? 1 : 0.5
  const ay = cfg.anchor.startsWith('t') ? 0 : cfg.anchor.startsWith('b') ? 1 : 0.5

  const data: SceneData = {
    version: 1,
    buildKey: opts.buildKey,
    compName: opts.compName,
    fps,
    durationSec: r3(durationSec),
    scale: s,
    frame: { w: geo.outW, h: geo.outH },
    chat: { x: geo.chatX, y: geo.chatY, w: geo.chatW, h: geo.chatH, ax, ay },
    background,
    fadeTop: r3(cfg.fadeTopEdge * s),
    text: { shadow: style.textShadow, strokeWidth: r3(style.textOutline * 2 * s), tracking: r3((style.letterSpacing / Math.max(1, style.fontSize)) * 1000) },
    anim: { style: ANIM_STYLE_INDEX[cfg.animation] ?? 2, ms: Math.max(1, cfg.animationMs), slidePx: r3(W * s) },
    ease: easeSamples(cfg)?.map((v) => r3(v)) ?? null,
    clears: clears.filter((c) => c > 0 && c <= durationSec),
    scroll,
    assets: writer.assets,
    messages,
    stats: { layers: layerCount + 4, keys: keyCount, assets: writer.assets.length },
  }
  return { data, files: writer.files }
}
