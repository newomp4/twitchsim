import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import { invalidateFontCaches } from './layout'

let loaded: Promise<void> | null = null

/**
 * Makes sure Inter (Twitch's chat font) is available to the canvas before drawing.
 * `text`: the characters that will be drawn — the bundled Inter comes in unicode-range subsets (latin,
 * latin-ext, cyrillic, greek, vietnamese…) and `document.fonts.load()` only fetches the ones the sample
 * text needs; without it Cyrillic names would be measured with a stand-in font and re-drawn in Inter
 * once the subset arrives mid-export.
 */
export function ensureFonts(family = 'Inter', text?: string): Promise<void> {
  const sample = text ? distinctChars(text) : ''
  if (loaded && family === 'Inter' && !sample) return loaded
  const p = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return
    const weights = [400, 500, 600, 700]
    const specs = weights.flatMap((w) => [`${w} 14px "${family}"`, `italic ${w} 14px "${family}"`])
    const loadAll = async () => (await Promise.all(specs.map((s) => document.fonts.load(s, sample || undefined).catch(() => [] as FontFace[])))).reduce((n, faces) => n + faces.length, 0)
    let n = await loadAll()
    // Cold start: the stylesheet that declares the bundled Inter faces may not be applied yet when the
    // script runs (the panel loads it after the script; a first visit fetches it) — load() then finds no
    // face and resolves at once, and every width measured meanwhile would come from a fallback font.
    // Give the stylesheet a moment and try again (bounded, so a missing font never blocks the app).
    const t0 = performance.now()
    while (n === 0 && family === 'Inter' && performance.now() - t0 < 4000) {
      await new Promise((r) => setTimeout(r, 100))
      await document.fonts.ready
      n = await loadAll()
    }
    invalidateFontCaches()
  })()
  if (family === 'Inter' && !sample) loaded = p
  return p
}

/** the distinct characters of a text (capped — the sample only has to touch every unicode subset) */
function distinctChars(text: string): string {
  const seen = new Set<string>()
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) continue // latin is always loaded
    seen.add(ch)
    if (seen.size > 400) break
  }
  return ' ' + [...seen].join('')
}

/** every character a timeline can draw: names, message text, notice text */
export function timelineText(tl: { messages: { text?: string; user?: { displayName: string } | undefined; notice?: { parts: { text: string }[] } | undefined; reply?: { displayName: string; text: string } }[] }): string {
  const out: string[] = []
  for (const m of tl.messages) {
    if (m.user) out.push(m.user.displayName)
    if (m.text) out.push(m.text)
    if (m.notice) for (const p of m.notice.parts) out.push(p.text)
    if (m.reply) out.push(m.reply.displayName, m.reply.text)
  }
  return out.join('')
}

/**
 * Whenever any font finishes loading later (a weight/subset that was not needed yet, a font the CSS pulled
 * in after start-up), forget the widths measured with the stand-in and let the caller redraw.
 */
export function onFontsChanged(cb: () => void): () => void {
  if (typeof document === 'undefined' || !document.fonts) return () => {}
  const h = () => {
    invalidateFontCaches()
    cb()
  }
  document.fonts.addEventListener('loadingdone', h)
  return () => document.fonts.removeEventListener('loadingdone', h)
}
