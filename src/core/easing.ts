/**
 * Easing for the message entrance. The curve is shared by the web preview / exports (a JS function) and
 * the After Effects build (a baked sample array embedded in the layer expressions), so both look identical.
 * Sources, in order of precedence: pasted "Adobe After Effects 9.0 Keyframe Data" → a preset / custom
 * cubic-bézier → the default (easeOutCubic, matching Twitch-like motion).
 */
export type EasePreset = 'smooth' | 'ease-out' | 'gentle' | 'linear' | 'snappy' | 'custom'

/** cubic-bézier control points [x1, y1, x2, y2] (P0 = 0,0 and P3 = 1,1 are implied) */
export type Bezier = [number, number, number, number]

export const EASE_PRESETS: Record<Exclude<EasePreset, 'smooth' | 'custom'>, Bezier> = {
  'ease-out': [0, 0, 0.58, 1],
  gentle: [0.37, 0, 0.63, 1],
  linear: [0, 0, 1, 1],
  snappy: [0.6, 0, 0.15, 1],
}

export const EASE_PRESET_LABELS: { value: EasePreset; label: string }[] = [
  { value: 'smooth', label: 'Smooth (default)' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'linear', label: 'Linear' },
  { value: 'snappy', label: 'Snappy' },
  { value: 'custom', label: 'Custom curve' },
]

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

/** A cubic-bézier timing function y(x) for x in [0,1] (Newton–Raphson to invert x, like CSS). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  // clamp the x control points to [0,1] so the curve is a function of x (y may overshoot)
  x1 = Math.max(0, Math.min(1, x1))
  x2 = Math.max(0, Math.min(1, x2))
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x
      if (Math.abs(dx) < 1e-6) break
      const d = slopeX(t)
      if (Math.abs(d) < 1e-6) break
      t -= dx / d
    }
    // fall back to bisection if Newton wandered out of range
    if (t < 0 || t > 1) {
      let lo = 0
      let hi = 1
      t = x
      for (let i = 0; i < 20; i++) {
        const xv = sampleX(t)
        if (Math.abs(xv - x) < 1e-6) break
        if (xv < x) lo = t
        else hi = t
        t = (lo + hi) / 2
      }
    }
    return sampleY(t)
  }
}

/**
 * Parses a pasted "Adobe After Effects 9.0 Keyframe Data" block for a single animated property into a
 * normalized easing curve: the frame/value pairs, with frame → x in [0,1] and value → y in [0,1]
 * (min→0, max→1). Returns null when there aren't at least two distinct keyframes.
 */
export function parseKeyframeData(text: string): number[] | null {
  if (!text || !/Keyframe Data/i.test(text)) return null
  const pts: { x: number; y: number }[] = []
  for (const raw of text.split(/\r?\n/)) {
    // a keyframe row is "<frame>\t<value>" (value may be the first of several dimensions — use dim 0)
    const m = raw.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/)
    if (!m) continue
    const x = parseFloat(m[1])
    const y = parseFloat(m[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pts.push({ x, y })
  }
  if (pts.length < 2) return null
  pts.sort((a, b) => a.x - b.x)
  const x0 = pts[0].x
  const x1 = pts[pts.length - 1].x
  let ymin = Infinity
  let ymax = -Infinity
  for (const p of pts) {
    ymin = Math.min(ymin, p.y)
    ymax = Math.max(ymax, p.y)
  }
  if (x1 - x0 < 1e-6 || ymax - ymin < 1e-6) return null
  // resample onto a fixed grid so the AE side can embed a compact lookup
  const N = 65
  const out: number[] = new Array(N)
  let j = 0
  for (let i = 0; i < N; i++) {
    const x = x0 + ((x1 - x0) * i) / (N - 1)
    while (j < pts.length - 2 && pts[j + 1].x < x) j++
    const a = pts[j]
    const b = pts[j + 1]
    const f = b.x - a.x < 1e-9 ? 0 : (x - a.x) / (b.x - a.x)
    const y = a.y + (b.y - a.y) * f
    out[i] = (y - ymin) / (ymax - ymin)
  }
  out[0] = 0
  out[N - 1] = 1
  return out
}

/** Samples a normalized curve array at t in [0,1] (linear between samples). */
export function sampleCurve(curve: number[], t: number): number {
  if (t <= 0) return curve[0]
  if (t >= 1) return curve[curve.length - 1]
  const x = t * (curve.length - 1)
  const i = Math.floor(x)
  const f = x - i
  return curve[i] + (curve[i + 1] - curve[i]) * f
}

interface EaseConfig {
  easePreset: EasePreset
  easeCurve: Bezier
  easeKeyframes: string
}

/** The entrance easing as a JS function y(t), t in [0,1]. */
export function easeFunction(cfg: EaseConfig): (t: number) => number {
  const kf = cfg.easeKeyframes ? parseKeyframeData(cfg.easeKeyframes) : null
  if (kf) return (t) => sampleCurve(kf, t)
  if (cfg.easePreset === 'smooth') return easeOutCubic
  const c = cfg.easePreset === 'custom' ? cfg.easeCurve : EASE_PRESETS[cfg.easePreset]
  // an unknown preset (e.g. an old saved config) or a malformed curve falls back to the default
  if (!Array.isArray(c) || c.length < 4 || c.some((v) => !Number.isFinite(v))) return easeOutCubic
  return cubicBezier(c[0], c[1], c[2], c[3])
}

/**
 * The entrance easing as a sample array for the AE build, or null when it is the default easeOutCubic
 * (the host has that built in, so there is nothing to embed).
 */
export function easeSamples(cfg: EaseConfig): number[] | null {
  const kf = cfg.easeKeyframes ? parseKeyframeData(cfg.easeKeyframes) : null
  if (kf) return kf
  if (cfg.easePreset === 'smooth' || (cfg.easePreset !== 'custom' && !EASE_PRESETS[cfg.easePreset])) return null
  const f = easeFunction(cfg)
  const N = 65
  const out: number[] = new Array(N)
  for (let i = 0; i < N; i++) out[i] = f(i / (N - 1))
  return out
}
