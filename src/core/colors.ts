import type { Theme } from './types'

/** Twitch's 15 default username colors (assigned to users who never set a color). */
export const DEFAULT_NAME_COLORS = [
  '#FF0000', // Red
  '#0000FF', // Blue
  '#008000', // Green
  '#B22222', // FireBrick
  '#FF7F50', // Coral
  '#9ACD32', // YellowGreen
  '#FF4500', // OrangeRed
  '#2E8B57', // SeaGreen
  '#DAA520', // GoldenRod
  '#D2691E', // Chocolate
  '#5F9EA0', // CadetBlue
  '#1E90FF', // DodgerBlue
  '#FF69B4', // HotPink
  '#8A2BE2', // BlueViolet
  '#00FF7F', // SpringGreen
] as const

/**
 * Twitch picks a default color deterministically from the login:
 * (first char code + last char code) % 15
 */
export function defaultColorFor(login: string): string {
  const n = login.charCodeAt(0) + login.charCodeAt(login.length - 1)
  return DEFAULT_NAME_COLORS[n % DEFAULT_NAME_COLORS.length]
}

/** Colors people commonly pick when they set a custom color (Prime/Turbo can pick any hex). */
export const POPULAR_CUSTOM_COLORS = [
  '#FF69B4', '#FF1493', '#FF00FF', '#DA70D6', '#BA55D3', '#9370DB', '#8A2BE2', '#9146FF', '#7B68EE',
  '#00FFFF', '#00CED1', '#40E0D0', '#1E90FF', '#00BFFF', '#87CEEB', '#4169E1', '#6495ED',
  '#00FF00', '#7FFF00', '#ADFF2F', '#00FF7F', '#32CD32', '#98FB98', '#3CB371',
  '#FFD700', '#FFA500', '#FF8C00', '#FF4500', '#FF6347', '#FFFF00', '#F0E68C',
  '#FF0000', '#DC143C', '#B22222', '#CD5C5C', '#FA8072',
  '#FFFFFF', '#F5F5F5', '#E6E6FA', '#FFC0CB', '#FFB6C1', '#FF69B4',
  '#C71585', '#DB7093', '#EE82EE', '#DDA0DD', '#D8BFD8',
  '#00FA9A', '#5F9EA0', '#48D1CC', '#20B2AA', '#66CDAA',
  '#FF7F50', '#F08080', '#E9967A', '#DAA520', '#BDB76B',
  '#A52A2A', '#800080', '#4B0082', '#000080', '#008080',
]

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim()
  if (h.length === 4) h = h.slice(0, 3) // #rgba → drop alpha
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6) // #rrggbbaa → drop alpha
  if (!/^[0-9a-f]{6}$/i.test(h)) return [128, 128, 128] // not a colour: neutral gray instead of black
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function chan(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

// ---- CIELAB helpers (Twitch adjusts unreadable name colors in Lab space) ----
function srgbToLin(c: number): number {
  c /= 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}
export function rgbToLab([r, g, b]: [number, number, number]): [number, number, number] {
  const R = srgbToLin(r)
  const G = srgbToLin(g)
  const B = srgbToLin(b)
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  X = f(X)
  Y = f(Y)
  Z = f(Z)
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]
}
export function labToRgb([L, a, b]: [number, number, number]): [number, number, number] {
  let Y = (L + 16) / 116
  let X = a / 500 + Y
  let Z = Y - b / 200
  const g = (t: number) => {
    const t3 = t * t * t
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787
  }
  X = 0.95047 * g(X)
  Y = g(Y)
  Z = 1.08883 * g(Z)
  const R = X * 3.2406 + Y * -1.5372 + Z * -0.4986
  const G = X * -0.9689 + Y * 1.8758 + Z * 0.0415
  const B = X * 0.0557 + Y * -0.204 + Z * 1.057
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(linToSrgb(Math.max(0, Math.min(1, v))) * 255)))
  return [clamp(R), clamp(G), clamp(B)]
}

const readableCache = new Map<string, string>()

/**
 * Twitch "Readable Colors" (default ON): name colors too dark for the dark theme are
 * brightened in CIELAB (hue/chroma preserved) in ~4.5 L* steps until their relative
 * luminance clears ~0.195. Reverse-engineered from live samples:
 *   #0000FF -> ~#8b58ff, #B22222 -> ~#db4a3f, #008000 -> ~#319a24, #8A2BE2 -> ~#b454ff.
 * Bright colors (Red, Coral, DodgerBlue, SeaGreen, ...) are left untouched.
 * On the light theme, overly bright colors are darkened instead.
 */
export function readableColor(hex: string, theme: Theme): string {
  const key = theme + hex
  const cached = readableCache.get(key)
  if (cached) return cached
  let rgb = hexToRgb(hex)
  let out = hex
  if (theme === 'dark') {
    if (luminance(hex) < 0.195) {
      const lab = rgbToLab(rgb)
      for (let i = 0; i < 40; i++) {
        lab[0] += 4.5
        rgb = labToRgb(lab)
        if (0.2126 * srgbToLin(rgb[0]) + 0.7152 * srgbToLin(rgb[1]) + 0.0722 * srgbToLin(rgb[2]) >= 0.195) break
      }
      out = rgbToHex(rgb[0], rgb[1], rgb[2])
    }
  } else {
    if (luminance(hex) > 0.3) {
      const lab = rgbToLab(rgb)
      for (let i = 0; i < 40; i++) {
        lab[0] -= 4.5
        rgb = labToRgb(lab)
        if (0.2126 * srgbToLin(rgb[0]) + 0.7152 * srgbToLin(rgb[1]) + 0.0722 * srgbToLin(rgb[2]) <= 0.3) break
      }
      out = rgbToHex(rgb[0], rgb[1], rgb[2])
    }
  }
  readableCache.set(key, out)
  return out
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Twitch UI palette (dark + light). */
export interface Palette {
  chatBg: string; chatBgAlt: string; text: string; textAlt: string; textAlt2: string; link: string; accent: string; accentBorder: string
  highlightBg: string; highlightBodyBg: string; mentionBg: string; mentionSelfBg: string; mentionSelfText: string; noticeBg: string; firstTimeBg: string
  hoverBg: string; deleted: string; timestamp: string; special: string; alert: string; hypeTrainGold: string; noticeName: string; noticeIcon: string
  firstTimeAccent: string; firstTimeIcon: string; subAccent: string; raidAccent: string; giftAccent: string; line: string
}
export const TWITCH: { dark: Palette; light: Palette } = {
  dark: {
    chatBg: '#18181b',
    chatBgAlt: '#1f1f23',
    text: '#efeff1',
    textAlt: '#efeff1',
    textAlt2: '#d3d3d9',
    link: '#bf94ff',
    accent: '#9147ff',
    accentBorder: '#a970ff',
    highlightBg: '#23094e',
    highlightBodyBg: '#755ebc',
    mentionBg: 'rgba(255,255,255,0.16)',
    mentionSelfBg: '#f7f7f8',
    mentionSelfText: '#18181b',
    noticeBg: '#26262c',
    firstTimeBg: '#26262c',
    hoverBg: 'rgba(255,255,255,0.16)',
    deleted: '#d3d3d9',
    timestamp: '#d3d3d9',
    special: '#5c16c5',
    alert: '#e91916',
    hypeTrainGold: '#ffbf00',
    noticeName: '#bf94ff',
    noticeIcon: '#a970ff',
    firstTimeAccent: '#ff75e6',
    firstTimeIcon: '#ff75e6',
    subAccent: '#9147ff',
    raidAccent: '#9147ff',
    giftAccent: '#9147ff',
    line: 'rgba(255,255,255,0.1)',
  },
  light: {
    chatBg: '#ffffff',
    chatBgAlt: '#f7f7f8',
    text: '#0e0e10',
    textAlt: '#0e0e10',
    textAlt2: '#53535f',
    link: '#5c16c5',
    accent: '#9147ff',
    accentBorder: '#9147ff',
    highlightBg: '#f3ebff',
    highlightBodyBg: '#a970ff',
    mentionBg: 'rgba(0,0,0,0.1)',
    mentionSelfBg: '#18181b',
    mentionSelfText: '#f7f7f8',
    noticeBg: '#f7f7f8',
    firstTimeBg: '#f7f7f8',
    hoverBg: 'rgba(0,0,0,0.05)',
    deleted: '#53535f',
    timestamp: '#53535f',
    special: '#5c16c5',
    alert: '#e91916',
    hypeTrainGold: '#e5a800',
    noticeName: '#5c16c5',
    noticeIcon: '#9147ff',
    firstTimeAccent: '#ff2ec7',
    firstTimeIcon: '#ff2ec7',
    subAccent: '#9147ff',
    raidAccent: '#9147ff',
    giftAccent: '#9147ff',
    line: 'rgba(0,0,0,0.1)',
  },
}

/** Bits / cheer tier colors used for the cheer amount text. */
export const CHEER_TIERS: { min: number; color: string; name: string }[] = [
  { min: 10000, color: '#f43021', name: 'red' },
  { min: 5000, color: '#0099fe', name: 'blue' },
  { min: 1000, color: '#1db2a5', name: 'green' },
  { min: 100, color: '#9c3ee8', name: 'purple' },
  { min: 1, color: '#979797', name: 'gray' },
]

export function cheerTier(amount: number): { min: number; color: string; name: string } {
  for (const t of CHEER_TIERS) if (amount >= t.min) return t
  return CHEER_TIERS[CHEER_TIERS.length - 1]
}
