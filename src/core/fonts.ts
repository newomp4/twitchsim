import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import { invalidateFontCaches } from './layout'

let loaded: Promise<void> | null = null

/** Makes sure Inter (Twitch's chat font) is available to the canvas before drawing. */
export function ensureFonts(family = 'Inter'): Promise<void> {
  if (loaded && family === 'Inter') return loaded
  const p = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return
    const weights = [400, 500, 600, 700]
    await Promise.all(weights.map((w) => document.fonts.load(`${w} 14px "${family}"`).catch(() => [])))
    await Promise.all(weights.map((w) => document.fonts.load(`italic ${w} 14px "${family}"`).catch(() => [])))
    invalidateFontCaches()
  })()
  if (family === 'Inter') loaded = p
  return p
}
