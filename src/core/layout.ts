import type { ChatMessage, Config, Fragment, NoticePart, Theme } from './types'
import { TWITCH, readableColor, defaultColorFor, type Palette } from './colors'
import { badgeUrl, fallbackBadgeUrl } from './badges'
import type { AssetCache } from './assets'

// ---------------------------------------------------------------------------
// Style derived from Config (all sizes in CSS px at 1x)
// ---------------------------------------------------------------------------

export interface RenderStyle {
  width: number
  height: number
  padX: number
  padY: number
  paddingBottom: number
  fontSize: number
  lineHeight: number
  noticeLineHeight: number
  fontFamily: string
  theme: Theme
  colors: Palette
  transparent: boolean
  bgColor: string | null
  cornerRadius: number
  timestamps: boolean
  showBadges: boolean
  boldNames: boolean
  readableColors: boolean
  nameColorPalette: readonly string[] | null
  alternateBg: boolean
  textShadow: boolean
  textOutline: number
  modView: boolean
  hypeTrain: boolean
  animatedEmotes: boolean
  /** corner rounding for uploaded badges (fraction of size) */
  badgeRadius: number
  /** uploaded images replacing Twitch badge sets: set -> data url */
  badgeOverrides: Record<string, string>
}

export const FONT_PRESETS: Record<Config['fontSize'], { size: number; line: number }> = {
  small: { size: 12, line: 16.8 },
  default: { size: 14, line: 22 },
  large: { size: 16, line: 22.4 },
  xlarge: { size: 18, line: 27 },
}

export function styleFromConfig(cfg: Config): RenderStyle {
  const preset = FONT_PRESETS[cfg.fontSize] ?? FONT_PRESETS.default
  const fontSize = preset.size * cfg.fontScale
  const lineHeight = preset.line * cfg.fontScale
  const theme: Theme = cfg.chatStyle === 'twitch-light' ? 'light' : cfg.theme
  const colors = TWITCH[theme]
  let bgColor: string | null = colors.chatBg
  let transparent = false
  if (cfg.chatStyle === 'transparent') {
    transparent = true
    bgColor = null
  } else if (cfg.chatStyle === 'custom') {
    if (cfg.bgOpacity <= 0) {
      transparent = true
      bgColor = null
    } else bgColor = hexWithAlpha(cfg.bgColor, cfg.bgOpacity)
  }
  return {
    width: cfg.width,
    height: cfg.height,
    padX: cfg.paddingX,
    padY: 4,
    paddingBottom: cfg.paddingBottom,
    fontSize,
    lineHeight,
    noticeLineHeight: 14 * 1.4 * (fontSize / 14),
    fontFamily: cfg.fontFamily || 'Inter',
    theme,
    colors,
    transparent,
    bgColor,
    cornerRadius: cfg.cornerRadius,
    timestamps: cfg.timestamps,
    showBadges: cfg.showBadges,
    boldNames: cfg.boldNames,
    readableColors: cfg.readableColors,
    nameColorPalette: cfg.nameColorMode === 'custom' ? cfg.nameColorPalette : null,
    alternateBg: cfg.alternateBg,
    textShadow: cfg.textShadow && (cfg.chatStyle === 'transparent' || cfg.chatStyle === 'custom'),
    textOutline: cfg.chatStyle === 'transparent' || cfg.chatStyle === 'custom' ? cfg.textOutline : 0,
    modView: cfg.modView,
    hypeTrain: cfg.hypeTrain,
    animatedEmotes: cfg.animatedEmotes,
    badgeRadius: cfg.badgeRadius,
    badgeOverrides: Object.fromEntries(cfg.customBadges.filter((b) => b.kind === 'replace' && b.set).map((b) => [b.set!, b.src])),
  }
}

function hexWithAlpha(hex: string, a: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ---------------------------------------------------------------------------
// Font metrics
// ---------------------------------------------------------------------------

export interface FontMetrics {
  asc: number
  desc: number
  xHeight: number
}

const metricsCache = new Map<string, FontMetrics>()
const measureCache = new Map<string, number>()
let measureCtx: CanvasRenderingContext2D | null = null

function mctx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')
    measureCtx = (c as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D
  }
  return measureCtx
}

export function fontString(weight: number, size: number, family: string, italic = false): string {
  // generic families (system-ui, sans-serif…) must not be quoted or they become unknown font names
  const fam = /^(system-ui|ui-[a-z-]+|sans-serif|serif|monospace|cursive|fantasy)$/i.test(family) ? family : `"${family}"`
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${fam}, Inter, "Helvetica Neue", Helvetica, Arial, sans-serif`
}

export function fontMetrics(size: number, family: string): FontMetrics {
  const key = `${size}|${family}`
  let m = metricsCache.get(key)
  if (m) return m
  const c = mctx()
  c.font = fontString(400, size, family)
  const tm = c.measureText('Hxg')
  const asc = tm.fontBoundingBoxAscent || size * 0.96875
  const desc = tm.fontBoundingBoxDescent || size * 0.2421875
  const xm = c.measureText('x')
  const xHeight = xm.actualBoundingBoxAscent || size * 0.545
  m = { asc, desc, xHeight }
  metricsCache.set(key, m)
  return m
}

export function measure(text: string, font: string): number {
  const key = font + '' + text
  let w = measureCache.get(key)
  if (w === undefined) {
    const c = mctx()
    c.font = font
    w = c.measureText(text).width
    if (measureCache.size > 50000) measureCache.clear()
    measureCache.set(key, w)
  }
  return w
}

export function invalidateFontCaches(): void {
  metricsCache.clear()
  measureCache.clear()
}

// ---------------------------------------------------------------------------
// Atoms & lines
// ---------------------------------------------------------------------------

export interface TextStyle {
  font: string
  color: string
  italic?: boolean
  underline?: boolean
  /** background pill */
  bg?: { color: string; padX: number; padY: number; radius: number }
  /** opacity multiplier */
  alpha?: number
  /** what the run is (the AE build hangs its live colour overrides on this) */
  role?: 'name' | 'body'
}

export type Atom =
  | { kind: 'text'; text: string; w: number; style: TextStyle; above: number; below: number; body?: boolean }
  | { kind: 'space'; w: number; style: TextStyle; above: number; below: number; body?: boolean }
  | { kind: 'gap'; w: number; body?: boolean }
  | { kind: 'image'; url: string; urlHi: string; w: number; h: number; boxW: number; above: number; below: number; role: 'emote' | 'badge' | 'cheer' | 'icon'; name: string; fallback?: string; iconColor?: string; iconPath?: string; alpha?: number; body?: boolean; round?: number }
  | { kind: 'group'; atoms: Atom[]; w: number; above: number; below: number }
  | { kind: 'br' }

export interface Placed {
  atom: Atom
  x: number
}
export interface LineBox {
  y: number // top, relative to block top
  height: number
  baseline: number // relative to line top
  placed: Placed[]
}
export interface Block {
  y: number
  height: number
  lines: LineBox[]
  /** paint a body pill (highlighted message) around body atoms */
  bodyPill?: { color: string; asc: number; desc: number }
  x: number
}
export interface RowLayout {
  height: number
  marginTop: number
  marginBottom: number
  bg: string | null
  borderLeft: string | null
  borderWidth: number
  effect?: ChatMessage['effect']
  blocks: Block[]
  /** the message this layout was built for */
  msgId: number
}

/** Greedy inline flow with word wrapping (long words break anywhere), CSS-like line boxes. */
export function flow(atoms: Atom[], maxWidth: number, minAbove: number, minBelow: number): LineBox[] {
  const lines: LineBox[] = []
  let cur: Placed[] = []
  let x = 0
  const flushLine = () => {
    // drop trailing spaces
    while (cur.length && (cur[cur.length - 1].atom.kind === 'space' || cur[cur.length - 1].atom.kind === 'gap')) cur.pop()
    let above = minAbove
    let below = minBelow
    for (const p of cur) {
      const a = p.atom
      if ('above' in a) {
        above = Math.max(above, a.above)
        below = Math.max(below, a.below)
      }
    }
    lines.push({ y: 0, height: above + below, baseline: above, placed: cur })
    cur = []
    x = 0
  }
  const place = (atom: Atom) => {
    cur.push({ atom, x })
    x += atomWidth(atom)
  }
  for (const atom of atoms) {
    if (atom.kind === 'br') {
      flushLine()
      continue
    }
    const w = atomWidth(atom)
    if (atom.kind === 'space' || atom.kind === 'gap') {
      if (x === 0 && atom.kind === 'space') continue // collapse leading spaces
      if (x + w > maxWidth) {
        flushLine()
        continue
      }
      place(atom)
      continue
    }
    if (x + w <= maxWidth || (x === 0 && w <= maxWidth)) {
      place(atom)
      continue
    }
    if (x > 0) flushLine()
    if (w <= maxWidth) {
      place(atom)
      continue
    }
    // too wide for a whole line: break text anywhere; images/groups just overflow
    if (atom.kind === 'text') {
      let rest = atom.text
      while (rest.length) {
        // largest prefix that fits, measured at grapheme boundaries (never split an emoji / flag / ZWJ family)
        const avail = maxWidth - x
        const bounds = graphemeBoundaries(rest)
        let lo = 1
        let hi = bounds.length - 1
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1
          if (measure(rest.slice(0, bounds[mid]), atom.style.font) <= avail) lo = mid
          else hi = mid - 1
        }
        const n = bounds[Math.max(1, lo)]
        const piece = rest.slice(0, n)
        place({ ...atom, text: piece, w: measure(piece, atom.style.font) })
        rest = rest.slice(n)
        if (rest.length) flushLine()
      }
    } else if (atom.kind === 'group') {
      // a group wider than the line: flow its atoms individually
      for (const a of atom.atoms) {
        const aw = atomWidth(a)
        if (x + aw > maxWidth && x > 0) flushLine()
        place(a)
      }
    } else place(atom)
  }
  if (cur.length) flushLine()
  let y = 0
  for (const l of lines) {
    l.y = y
    y += l.height
  }
  return lines
}

const segmenter: { segment(s: string): Iterable<{ index: number; segment: string }> } | null =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new (Intl as unknown as { Segmenter: new (l: undefined, o: { granularity: string }) => { segment(s: string): Iterable<{ index: number; segment: string }> } }).Segmenter(undefined, { granularity: 'grapheme' }) : null

/** Character offsets where the string may be cut: [0, …, length] at grapheme cluster boundaries. */
function graphemeBoundaries(s: string): number[] {
  const out = [0]
  if (segmenter) {
    for (const seg of segmenter.segment(s)) if (seg.index > 0) out.push(seg.index)
  } else {
    for (let i = 1; i < s.length; i++) if (!/[\uDC00-\uDFFF]/.test(s[i])) out.push(i) // at least keep surrogate pairs whole
  }
  out.push(s.length)
  return out
}

export function atomWidth(a: Atom): number {
  switch (a.kind) {
    case 'text':
    case 'space':
    case 'gap':
    case 'group':
      return a.w
    case 'image':
      return a.boxW
    case 'br':
      return 0
  }
}

// ---------------------------------------------------------------------------
// Message layout
// ---------------------------------------------------------------------------

export interface LayoutEnv {
  style: RenderStyle
  assets: AssetCache
  /** true when rendering for a high-DPI / export scale (pick 4x assets) */
  hiRes: boolean
}

export const ICONS = {
  crown: 'M2 17V6l5 4 5-5 5 5 5-4v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z',
  star: 'M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L10 14.9l-5.3 2.8 1.1-5.9L1.5 7.7l5.9-.8z',
  gift: 'M2.5 8h15v3.2h-15zM3.5 11.2h13V18h-13zM9 8h2v10H9zM10 8C7.6 8 5.6 6.9 5.6 5.4c0-1.1.9-1.9 2-1.9 1.3 0 2 1.4 2.4 2.3.4-.9 1.1-2.3 2.4-2.3 1.1 0 2 .8 2 1.9C14.4 6.9 12.4 8 10 8zM7.6 5c-.4 0-.5.2-.5.4 0 .4.9.9 2.1 1.1C8.9 5.8 8.3 5 7.6 5zm4.8 0c-.7 0-1.3.8-1.6 1.5 1.2-.2 2.1-.7 2.1-1.1 0-.2-.1-.4-.5-.4z',
  megaphone: 'M3 8v4h2l6 4V4L5 8zm10 .5v3a1.5 1.5 0 0 0 0-3zm2-2.5v8a4 4 0 0 0 0-8z',
  reply: 'M4 3h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 3v-3H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm5 6h2v2H9V9zm-4 0h2v2H5V9zm8 0h2v2h-2V9z',
  sparkle: 'M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8zM16 14l.8 2.2L19 17l-2.2.8L16 20l-.8-2.2L13 17l2.2-.8z',
  wave: 'M6.5 2.5l1.2 5.5-1.1.6L4.5 4zm3.5-.8l.8 6.6-1.1.7-1.4-6.4zm3.6 1.6l-.4 6.2-1.2.4.1-6.6zM4 9.5c.6 4.2 2.7 8 6.2 8 3.2 0 5.3-2.6 6.3-7.2l-2-.6-1 3.4-.6-.4.2-3.7-2 .6-.5 3.5-1-.7L9 8.5l-2 .6.8 4.4-1.1.3z',
  points: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  runner: 'M12 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM9.5 6.5l3-1 3 3-1.5 1.5-1.5-1.5L11 11l2.5 2v5h-2v-4l-2.5-2-1 3.5-3.5-.5.5-2 2.5.5 1-4-1.5 1L4.5 12 3 10.5l4-3z',
}

function nameColor(login: string, custom: string | null, style: RenderStyle): string {
  const base = custom || defaultColorFor(login, style.nameColorPalette)
  return style.readableColors ? readableColor(base, style.theme) : base
}

function isSystemKind(kind?: string): boolean {
  return kind === 'system' || kind === 'welcome' || kind === 'clear' || kind === 'slow' || kind === 'emoteonly' || kind === 'followers' || kind === 'subsonly'
}

export function layoutMessage(msg: ChatMessage, env: LayoutEnv, tNow: number, index: number): RowLayout {
  const { style } = env
  const fs = style.fontSize
  const fm = fontMetrics(fs, style.fontFamily)
  const c = style.colors
  const contentW = style.width - style.padX * 2

  const isNotice = !!msg.notice
  const kind = msg.notice?.kind

  // ---- plain system status line ("Welcome to the chat room!") ----
  if (isNotice && isSystemKind(kind)) {
    const st: TextStyle = { font: fontString(400, fs, style.fontFamily), color: c.textAlt2 }
    const atoms = wordsToAtoms(msg.notice!.parts.map((p) => p.text).join(''), st, fs, style.lineHeight, fm)
    const lines = flow(atoms, contentW, textAbove(style.lineHeight, fm), textBelow(style.lineHeight, fm))
    const h = lines.reduce((s, l) => s + l.height, 0)
    return { height: h + style.padY * 2, marginTop: 0, marginBottom: 0, bg: null, borderLeft: null, borderWidth: 0, msgId: msg.id, blocks: [{ y: style.padY, height: h, lines, x: style.padX }] }
  }

  // ---- user notice (sub / gift / raid / announcement) ----
  if (isNotice) {
    const n = msg.notice!
    const barColor = kind === 'announcement' ? (n.color ?? c.accent) : style.hypeTrain ? c.hypeTrainGold : c.accentBorder
    const lh = style.noticeLineHeight
    const iconAtom = noticeIcon(kind!, fs, lh, fm, c)
    const atoms: Atom[] = [iconAtom, { kind: 'gap', w: 4 }]
    atoms.push(...noticePartsToAtoms(n.parts, fs, lh, fm, style, c))
    const innerW = contentW - 4 // 4px bar
    // the text sits in its own column right of the icon: flow it at that width, then indent the wrapped lines
    const iconIndent = atomWidth(iconAtom) + 4
    const headerLines = flow(atoms, innerW, textAbove(lh, fm), textBelow(lh, fm))
    if (headerLines.length > 1) {
      // re-flow the text part alone at the narrower column width, then put the icon back on line 0
      const textLines = flow(atoms.slice(2), innerW - iconIndent, textAbove(lh, fm), textBelow(lh, fm))
      for (const l of textLines) for (const p of l.placed) p.x += iconIndent
      textLines[0].placed.unshift({ atom: iconAtom, x: 0 })
      const iconAbove = 'above' in iconAtom ? iconAtom.above : 0
      const iconBelow = 'below' in iconAtom ? iconAtom.below : 0
      if (iconAbove > textLines[0].baseline || iconBelow > textLines[0].height - textLines[0].baseline) {
        const above = Math.max(textLines[0].baseline, iconAbove)
        const below = Math.max(textLines[0].height - textLines[0].baseline, iconBelow)
        textLines[0].baseline = above
        textLines[0].height = above + below
        let y = 0
        for (const l of textLines) {
          l.y = y
          y += l.height
        }
      }
      headerLines.length = 0
      headerLines.push(...textLines)
    }
    const headerH = headerLines.reduce((s, l) => s + l.height, 0)
    // block y is relative to the row's *content* top (the 4px margin is added by the renderer)
    const blocks: Block[] = [{ y: style.padY, height: headerH, lines: headerLines, x: 4 + style.padX }]
    let y = style.padY + headerH
    if (msg.user && (msg.fragments.length > 0 || kind === 'announcement')) {
      const bodyAtoms = chatLineAtoms(msg, env, fm, false)
      const lines = flow(bodyAtoms, innerW, textAbove(style.lineHeight, fm), textBelow(style.lineHeight, fm))
      const bh = lines.reduce((s, l) => s + l.height, 0)
      y += 4
      blocks.push({ y, height: bh, lines, x: 4 + style.padX })
      y += bh
    }
    const contentH = y + style.padY
    return { height: contentH + 8, marginTop: 4, marginBottom: 4, bg: c.noticeBg, borderLeft: barColor, borderWidth: 4, msgId: msg.id, blocks }
  }

  // ---- regular chat line ----
  const blocks: Block[] = []
  let y = style.padY
  let bg: string | null = null
  let borderLeft: string | null = null
  if (style.alternateBg && index % 2 === 1) bg = c.chatBgAlt
  const deleted = msg.deletedAt !== undefined && tNow >= msg.deletedAt
  if (msg.highlighted && !deleted) bg = c.highlightBg
  const specialHeader = (msg.firstTime || msg.special) && style.modView && !deleted
  if (specialHeader) {
    bg = c.noticeBg
    borderLeft = c.special
  }
  const bodyX = borderLeft ? style.padX + 4 : style.padX
  const innerW = borderLeft ? contentW - 4 : contentW

  // headers
  const headerLH = style.noticeLineHeight
  const hdrStyle: TextStyle = { font: fontString(400, fs, style.fontFamily), color: c.textAlt2 }
  const scale = fs / 14
  if (msg.reply) {
    const sz = 17 * scale
    const icon: Atom = { kind: 'image', url: '', urlHi: '', w: sz, h: sz, boxW: sz, above: fm.xHeight / 2 + sz / 2, below: sz / 2 - fm.xHeight / 2, role: 'icon', name: 'reply', iconPath: ICONS.reply, iconColor: c.textAlt2 }
    const full = `Replying to @${msg.reply.displayName}: ${msg.reply.text}`
    const avail = innerW - atomWidth(icon) - 4
    const text = ellipsize(full, hdrStyle.font, avail)
    const atoms: Atom[] = [icon, { kind: 'gap', w: 4 }, { kind: 'text', text, w: measure(text, hdrStyle.font), style: hdrStyle, above: textAbove(headerLH, fm), below: textBelow(headerLH, fm) }]
    const lines = flow(atoms, innerW + 1000, textAbove(headerLH, fm), textBelow(headerLH, fm))
    const h = lines.reduce((s, l) => s + l.height, 0)
    blocks.push({ y, height: h, lines, x: bodyX })
    y += h
  }
  if (specialHeader) {
    const label = msg.firstTime ? 'First Time Chat' : msg.special!.label
    const iconPath = msg.firstTime ? ICONS.wave : msg.special?.icon === 'raider' ? ICONS.runner : ICONS.sparkle
    const sz = 16 * scale
    const icon: Atom = { kind: 'image', url: '', urlHi: '', w: sz, h: sz, boxW: sz, above: fm.xHeight / 2 + sz / 2, below: sz / 2 - fm.xHeight / 2, role: 'icon', name: 'special', iconPath, iconColor: c.textAlt2 }
    const st: TextStyle = { font: fontString(600, fs * 0.86, style.fontFamily), color: c.textAlt2 }
    const atoms: Atom[] = [icon, { kind: 'gap', w: 4 }, { kind: 'text', text: label, w: measure(label, st.font), style: st, above: textAbove(headerLH, fm), below: textBelow(headerLH, fm) }]
    const lines = flow(atoms, innerW, textAbove(headerLH, fm), textBelow(headerLH, fm))
    const h = lines.reduce((s, l) => s + l.height, 0)
    blocks.push({ y, height: h, lines, x: bodyX })
    y += h
  }
  if (msg.rewardName && !deleted) {
    const sz = 16 * scale
    const icon: Atom = { kind: 'image', url: '', urlHi: '', w: sz, h: sz, boxW: sz, above: fm.xHeight / 2 + sz / 2, below: sz / 2 - fm.xHeight / 2, role: 'icon', name: 'points', iconPath: ICONS.points, iconColor: c.textAlt2 }
    const st: TextStyle = { font: fontString(400, fs * 0.93, style.fontFamily), color: c.textAlt2 }
    const label = ellipsize(`Redeemed ${msg.rewardName}`, st.font, innerW - sz - 4)
    const atoms: Atom[] = [icon, { kind: 'gap', w: 4 }, { kind: 'text', text: label, w: measure(label, st.font), style: st, above: textAbove(headerLH, fm), below: textBelow(headerLH, fm) }]
    const lines = flow(atoms, innerW + 1000, textAbove(headerLH, fm), textBelow(headerLH, fm))
    const h = lines.reduce((s, l) => s + l.height, 0)
    blocks.push({ y, height: h, lines, x: bodyX })
    y += h
  }

  const bodyAtoms = chatLineAtoms(msg, env, fm, deleted)
  const lines = flow(bodyAtoms, innerW, textAbove(style.lineHeight, fm), textBelow(style.lineHeight, fm))
  const bh = lines.reduce((s, l) => s + l.height, 0)
  const block: Block = { y, height: bh, lines, x: bodyX }
  if (msg.highlighted && !deleted) block.bodyPill = { color: c.highlightBodyBg, asc: fm.asc, desc: fm.desc }
  blocks.push(block)
  y += bh
  return { height: y + style.padY, marginTop: 0, marginBottom: 0, bg, borderLeft, borderWidth: borderLeft ? 4 : 0, effect: deleted ? undefined : msg.effect, msgId: msg.id, blocks }
}

function textAbove(lh: number, fm: FontMetrics): number {
  const half = (lh - (fm.asc + fm.desc)) / 2
  return fm.asc + half
}
function textBelow(lh: number, fm: FontMetrics): number {
  const half = (lh - (fm.asc + fm.desc)) / 2
  return fm.desc + half
}

function ellipsize(text: string, font: string, maxW: number): string {
  if (measure(text, font) <= maxW) return text
  const bounds = graphemeBoundaries(text)
  let lo = 0
  let hi = bounds.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measure(text.slice(0, bounds[mid]) + '…', font) <= maxW) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, bounds[lo]) + '…'
}

/** Splits text into word / space atoms. */
function wordsToAtoms(text: string, st: TextStyle, fs: number, lh: number, fm: FontMetrics): Atom[] {
  const out: Atom[] = []
  const above = textAbove(lh, fm)
  const below = textBelow(lh, fm)
  const parts = text.split(/(\s+)/)
  for (const p of parts) {
    if (!p) continue
    if (/^\s+$/.test(p)) {
      // consecutive spaces collapse in HTML
      out.push({ kind: 'space', w: measure(' ', st.font), style: st, above, below })
    } else out.push({ kind: 'text', text: p, w: measure(p, st.font), style: st, above, below })
  }
  void fs
  return out
}

function noticePartsToAtoms(parts: NoticePart[], fs: number, lh: number, fm: FontMetrics, style: RenderStyle, c: Palette): Atom[] {
  const out: Atom[] = []
  const above = textAbove(lh, fm)
  const below = textBelow(lh, fm)
  for (const p of parts) {
    const color = p.color === 'name' ? c.noticeName : p.color === 'link' ? c.link : (p.color ?? c.text)
    const st: TextStyle = { font: fontString(p.bold || p.color === 'name' ? 600 : 400, fs, style.fontFamily), color, underline: p.color === 'link' }
    const segs = p.text.split(/(\s+)/)
    for (const s of segs) {
      if (!s) continue
      if (/^\s+$/.test(s)) out.push({ kind: 'space', w: measure(' ', st.font), style: st, above, below })
      else out.push({ kind: 'text', text: s, w: measure(s, st.font), style: st, above, below })
    }
  }
  return out
}

function noticeIcon(kind: string, fs: number, lh: number, fm: FontMetrics, c: Palette): Atom {
  const sz = 20 * (fs / 14)
  let path = ICONS.crown
  if (kind === 'gift' || kind === 'communitygift') path = ICONS.gift
  else if (kind === 'raid') path = ICONS.runner
  else if (kind === 'announcement') path = ICONS.megaphone
  const above = textAbove(lh, fm)
  const below = textBelow(lh, fm)
  const mid = (above - below) / 2
  return { kind: 'image', url: '', urlHi: '', w: sz, h: sz, boxW: sz, above: mid + sz / 2, below: sz / 2 - mid, role: 'icon', name: kind, iconPath: path, iconColor: c.noticeIcon }
}

/** timestamp / badges / name / colon / fragments as atoms */
function chatLineAtoms(msg: ChatMessage, env: LayoutEnv, fm: FontMetrics, deleted: boolean): Atom[] {
  const { style } = env
  const fs = style.fontSize
  const lh = style.lineHeight
  const c = style.colors
  const above = textAbove(lh, fm)
  const below = textBelow(lh, fm)
  const atoms: Atom[] = []
  const user = msg.user!
  const color = nameColor(user.login, msg.color !== undefined ? msg.color : user.color, style)
  const userBadges = msg.badges ?? user.badges
  const scale = fs / 14

  if (style.timestamps) {
    const st: TextStyle = { font: fontString(400, fs, style.fontFamily), color: c.timestamp }
    const text = formatTimestamp(msg.t)
    atoms.push({ kind: 'text', text, w: measure(text, st.font), style: st, above, below })
    atoms.push({ kind: 'gap', w: 4 })
  }
  // badges + name group (inline-block => unbreakable)
  const group: Atom[] = []
  if (style.showBadges) {
    const bsz = 18 * scale
    for (const b of userBadges) {
      const override = style.badgeOverrides[b.set]
      const url = override ?? badgeUrl(b, 1) ?? fallbackBadgeUrl(b.set)
      const urlHi = override ?? badgeUrl(b, 4) ?? fallbackBadgeUrl(b.set)
      group.push({
        kind: 'image',
        url,
        urlHi,
        w: bsz,
        h: bsz,
        boxW: bsz,
        // vertical-align: middle with margin-bottom 1.5px (box 19.5 tall)
        above: fm.xHeight / 2 + (bsz + 1.5 * scale) / 2,
        below: (bsz + 1.5 * scale) / 2 - fm.xHeight / 2,
        role: 'badge',
        name: b.title,
        fallback: fallbackBadgeUrl(b.set),
        round: override || b.roundable ? style.badgeRadius : undefined,
      })
      group.push({ kind: 'gap', w: 3 * scale })
    }
  }
  const nameStyle: TextStyle = { font: fontString(style.boldNames ? 700 : 400, fs, style.fontFamily), color, role: 'name' }
  group.push({ kind: 'text', text: user.displayName, w: measure(user.displayName, nameStyle.font), style: nameStyle, above, below })
  if (user.displayName.toLowerCase() !== user.login && !/^[a-z0-9_]+$/i.test(user.displayName)) {
    const intl: TextStyle = { font: fontString(400, fs, style.fontFamily), color, alpha: 0.6, role: 'name' }
    const t = ` (${user.login})`
    group.push({ kind: 'text', text: t, w: measure(t, intl.font), style: intl, above, below })
  }
  const gw = group.reduce((s, a) => s + atomWidth(a), 0)
  atoms.push({ kind: 'group', atoms: group, w: gw, above: Math.max(...group.map((a) => ('above' in a ? a.above : 0))), below: Math.max(...group.map((a) => ('below' in a ? a.below : 0))) })

  const bodyColor = deleted ? c.deleted : msg.action ? color : msg.highlighted ? '#ffffff' : c.text
  // the AE "custom text colour" override recolours plain body text — not a deleted notice or a /me line (name-coloured)
  const bodyStyle: TextStyle = { font: fontString(400, fs, style.fontFamily), color: bodyColor, italic: deleted, role: deleted || msg.action ? undefined : 'body' }
  if (!msg.action) {
    atoms.push({ kind: 'text', text: ':', w: measure(':', bodyStyle.font), style: { font: bodyStyle.font, color: msg.highlighted ? '#ffffff' : c.text, role: 'body' }, above, below })
  }
  atoms.push({ kind: 'space', w: measure(' ', bodyStyle.font), style: bodyStyle, above, below })

  const bodyStart = atoms.length
  if (deleted) {
    atoms.push(...wordsToAtoms('message deleted by a moderator.', bodyStyle, fs, lh, fm))
    return atoms
  }
  // body fragments
  const emoteBox = 28 * scale
  const frags = msg.fragments
  let lastEmoteIdx = -1
  if (msg.gigantified) for (let i = 0; i < frags.length; i++) if (frags[i].kind === 'emote') lastEmoteIdx = i
  for (let i = 0; i < frags.length; i++) {
    const f = frags[i]
    switch (f.kind) {
      case 'text': {
        // whitespace between two emotes is dropped (Twitch renders adjacent emote boxes)
        const prev = frags[i - 1]
        const next = frags[i + 1]
        if (/^\s+$/.test(f.text) && prev?.kind === 'emote' && next?.kind === 'emote') break
        atoms.push(...wordsToAtoms(f.text, bodyStyle, fs, lh, fm))
        break
      }
      case 'emote': {
        const big = i === lastEmoteIdx
        const box = big ? 112 * scale : emoteBox
        const img = env.assets.get(env.hiRes || big ? f.url4x : f.url) ?? env.assets.get(f.url)
        let w = box
        let h = box
        if (img && img.w > 0 && img.h > 0) {
          const aspect = img.w / img.h
          if (f.provider === 'twitch') {
            // native emotes: fit into the square box
            if (aspect >= 1) {
              w = box
              h = box / aspect
            } else {
              h = box
              w = box * aspect
            }
          } else {
            h = box
            w = box * aspect
          }
        }
        const boxW = Math.max(box, w)
        atoms.push({
          kind: 'image',
          url: big ? f.url4x : f.url, // a giant emote always uses the 4× file
          urlHi: f.url4x,
          w,
          h,
          boxW,
          above: fm.xHeight / 2 + box / 2,
          below: box / 2 - fm.xHeight / 2,
          role: 'emote',
          name: f.name,
        })
        break
      }
      case 'mention': {
        const self = f.self
        const st: TextStyle = self
          ? { font: fontString(400, fs, style.fontFamily), color: c.mentionSelfText, bg: { color: c.mentionSelfBg, padX: 4 * scale, padY: 2 * scale, radius: 2 * scale } }
          : { ...bodyStyle }
        atoms.push({ kind: 'text', text: f.text, w: measure(f.text, st.font) + (self ? 8 * scale : 0), style: st, above, below })
        break
      }
      case 'link': {
        const st: TextStyle = { font: fontString(400, fs, style.fontFamily), color: c.link }
        atoms.push({ kind: 'text', text: f.text, w: measure(f.text, st.font), style: st, above, below })
        break
      }
      case 'cheer': {
        const box = emoteBox
        atoms.push({ kind: 'image', url: f.url, urlHi: f.url4x, w: box, h: box, boxW: box, above: fm.xHeight / 2 + box / 2, below: box / 2 - fm.xHeight / 2, role: 'cheer', name: f.prefix })
        const st: TextStyle = { font: fontString(700, fs, style.fontFamily), color: f.color }
        const t = String(f.amount)
        atoms.push({ kind: 'text', text: t, w: measure(t, st.font), style: st, above, below })
        break
      }
    }
  }
  for (let i = bodyStart; i < atoms.length; i++) {
    const a = atoms[i]
    if (a.kind !== 'group' && a.kind !== 'br') a.body = true
  }
  return atoms
}

export function formatTimestamp(t: number): string {
  // Twitch shows wall-clock h:mm (12h, no leading zero); we base it on a fixed fake start
  const base = 21 * 60 + 14 // 9:14 pm
  const mins = base + Math.floor(t / 60000)
  let h = Math.floor(mins / 60) % 24
  const m = mins % 60
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')}`
}

export function fragmentsText(frags: Fragment[]): string {
  return frags.map((f) => (f.kind === 'text' ? f.text : f.kind === 'emote' ? f.name : f.kind === 'cheer' ? f.prefix + f.amount : f.text)).join('')
}
