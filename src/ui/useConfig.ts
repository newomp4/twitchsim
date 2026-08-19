import { useCallback, useEffect, useRef, useState } from 'react'
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'
import type { Config } from '../core/types'
import { DEFAULT_CONFIG } from '../core/defaults'

const STORAGE_KEY = 'twitchsim.config.v1'

function b64url(u8: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const u = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i)
  return u
}

export function encodeShare(cfg: Config): string {
  const diff: Partial<Config> = {}
  for (const k of Object.keys(cfg) as (keyof Config)[]) {
    if (k === 'customBadges' || k === 'customEmotes') continue // images don't fit in a URL
    if (cfg[k] !== DEFAULT_CONFIG[k]) (diff as Record<string, unknown>)[k] = cfg[k]
  }
  return b64url(deflateSync(strToU8(JSON.stringify(diff)), { level: 9 }))
}
export function decodeShare(s: string): Partial<Config> | null {
  try {
    return JSON.parse(strFromU8(inflateSync(unb64url(s)))) as Partial<Config>
  } catch {
    return null
  }
}

/** string fields that must be one of a fixed set — a preset / share link with an unknown value is ignored for that key */
const ENUMS: Partial<Record<keyof Config, readonly string[]>> = {
  mode: ['script', 'ambient', 'mixed', 'hype'],
  mood: ['general', 'hype', 'chill', 'funny', 'gaming', 'wholesome', 'toxic', 'reactions', 'clutch', 'music', 'irl'],
  pacing: ['natural', 'even'],
  chatStyle: ['twitch-dark', 'twitch-light', 'transparent', 'custom'],
  fontSize: ['small', 'default', 'large', 'xlarge'],
  animation: ['instant', 'slide-up', 'slide-left', 'slide-right', 'fade', 'pop', 'slide-fade', 'slide'],
  exportFormat: ['png-seq', 'webm-alpha', 'mov-prores', 'mp4', 'webm'],
  framePreset: ['chat', '1080p', '1440p', '4k', 'vertical', 'custom'],
  anchor: ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'],
  easePreset: ['smooth', 'ease-out', 'gentle', 'linear', 'snappy', 'custom'],
  nameColorMode: ['twitch', 'custom'],
}

export function sanitize(p: Partial<Config> | null | undefined): Partial<Config> {
  const out: Partial<Config> = {}
  if (!p) return out
  for (const k of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
    if (!(k in p)) continue
    const d = DEFAULT_CONFIG[k]
    const v = p[k]
    let ok = Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d && v !== null && (typeof d !== 'number' || Number.isFinite(v as number))
    if (ok && ENUMS[k] && !ENUMS[k]!.includes(v as string)) ok = false
    if (ok) (out as Record<string, unknown>)[k] = v
  }
  return out
}

// Uploaded images (data URLs, easily several MB) live in IndexedDB; everything else in localStorage.
const IDB_NAME = 'twitchsim'
const IDB_STORE = 'kv'

function idbOpen(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idbOpen()
  if (!db) return undefined
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => resolve(undefined)
  })
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idbOpen()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

function withoutImages(cfg: Config): Omit<Config, 'customBadges' | 'customEmotes'> {
  const { customBadges: _b, customEmotes: _e, ...rest } = cfg
  void _b
  void _e
  return rest
}

export function useConfig() {
  const [cfg, setCfg] = useState<Config>(() => {
    let base: Config = { ...DEFAULT_CONFIG }
    try {
      const hash = location.hash.startsWith('#c=') ? location.hash.slice(3) : ''
      if (hash) {
        const p = decodeShare(hash)
        // the link has been applied (or declined); drop it so later edits (saved to localStorage) win on reload
        history.replaceState(null, '', location.pathname + location.search)
        if (p) {
          const existing = localStorage.getItem(STORAGE_KEY)
          const apply = !existing || confirm('Open the shared TwitchSim settings? Your current settings will be replaced (Save preset first if you want to keep them).')
          if (apply) {
            return { ...base, ...sanitize(p) }
          }
        }
      }
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) base = { ...base, ...sanitize(JSON.parse(raw)) }
    } catch {
      /* ignore */
    }
    return base
  })
  // uploaded images come back asynchronously from IndexedDB; until then nothing is written back
  const imagesRestored = useRef(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const imgs = await idbGet<Partial<Pick<Config, 'customBadges' | 'customEmotes'>>>('images')
      if (cancelled) return
      const p = sanitize(imgs ?? {})
      // don't clobber uploads the user made in the meantime
      if (Object.keys(p).length) setCfg((c) => ({ ...c, ...Object.fromEntries(Object.entries(p).filter(([k]) => (c[k as keyof Config] as unknown[]).length === 0)) }))
      imagesRestored.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const saveTimer = useRef<number | null>(null)
  const lastBadges = useRef<Config['customBadges'] | null>(null)
  const lastEmotes = useRef<Config['customEmotes'] | null>(null)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const flush = useCallback(() => {
    const c = cfgRef.current
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutImages(c)))
    } catch (e) {
      console.warn('TwitchSim: could not save settings', e)
    }
    // images: written when the arrays change identity (every edit replaces them), once the restore is done
    if (imagesRestored.current && (c.customBadges !== lastBadges.current || c.customEmotes !== lastEmotes.current)) {
      lastBadges.current = c.customBadges
      lastEmotes.current = c.customEmotes
      void idbSet('images', { customBadges: c.customBadges, customEmotes: c.customEmotes })
    }
  }, [])
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flush, 300)
  }, [cfg, flush])
  // don't lose the last edit when the tab closes inside the debounce window
  useEffect(() => {
    const onHide = () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      flush()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flush])
  const patch = useCallback((p: Partial<Config>) => setCfg((c) => ({ ...c, ...p })), [])
  const set = useCallback(<K extends keyof Config>(k: K, v: Config[K]) => setCfg((c) => (c[k] === v ? c : { ...c, [k]: v })), [])
  const reset = useCallback(() => setCfg({ ...DEFAULT_CONFIG }), [])
  return { cfg, patch, set, reset, setCfg }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

/** Config fields that change the simulation (vs. only the rendering). */
const SIM_KEYS: (keyof Config)[] = [
  'seed', 'mode', 'script', 'mood', 'streamerName', 'streamerLogin', 'viewerName', 'gameName', 'scriptUsersRandom', 'scriptGapMultiplier', 'fillerFromScript', 'streamerChats', 'streamerColor',
  'messagesPerMinute', 'pacing', 'burstiness', 'reactionMoments', 'startDelayMs', 'prefillSec', 'durationSec', 'durationAuto', 'tailSec',
  'subsRate', 'giftsRate', 'raidsRate', 'cheersRate', 'firstTimeRate', 'highlightRate', 'replyRate', 'deleteRate', 'announcementRate', 'actionsRate', 'mentionsRate', 'powerUpsRate', 'rewardRate', 'systemNotices', 'welcomeMessage',
  'chatterPoolSize', 'customColorRatio', 'subRatio', 'primeRatio', 'modCount', 'vipCount', 'bitsBadgeRatio', 'gifterBadgeRatio', 'eventBadgeRatio', 'badgePool', 'botsEnabled', 'customNames', 'customNamesOnly', 'localizedNamesRatio', 'channelSubBadgeStyle', 'customBadges', 'customEmotes', 'badgeFit', 'useCustomEmotesInFiller',
  'emoteDensity', 'useTwitchEmotes', 'use7tvEmotes', 'useChannelEmotes', 'animatedEmotes',
]
export function simKey(cfg: Config): string {
  // images are multi-MB data URLs: identify them by id/name instead of stringifying the pixels
  return JSON.stringify(
    SIM_KEYS.map((k) => {
      if (k === 'customBadges') return cfg.customBadges.map((b) => [b.id, b.kind, b.name, b.months, b.set, b.ratio])
      if (k === 'customEmotes') return cfg.customEmotes.map((e) => [e.id, e.name, e.animated])
      return cfg[k]
    }),
  )
}

/** The config used for simulation: only changes (debounced) when a simulation-relevant field changes. */
export function useSimConfig(cfg: Config): Config {
  const key = simKey(cfg)
  const dkey = useDebounced(key, 150)
  const ref = useRef({ key, cfg })
  if (dkey === key && ref.current.key !== key) ref.current = { key, cfg }
  return ref.current.cfg
}
