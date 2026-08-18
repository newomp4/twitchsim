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

function sanitize(p: Partial<Config> | null | undefined): Partial<Config> {
  const out: Partial<Config> = {}
  if (!p) return out
  for (const k of Object.keys(DEFAULT_CONFIG) as (keyof Config)[]) {
    if (k in p && typeof p[k] === typeof DEFAULT_CONFIG[k]) (out as Record<string, unknown>)[k] = p[k]
  }
  return out
}

export function useConfig() {
  const [cfg, setCfg] = useState<Config>(() => {
    let base: Config = { ...DEFAULT_CONFIG }
    try {
      const hash = location.hash.startsWith('#c=') ? location.hash.slice(3) : ''
      if (hash) {
        const p = decodeShare(hash)
        if (p) return { ...base, ...sanitize(p) }
      }
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) base = { ...base, ...sanitize(JSON.parse(raw)) }
    } catch {
      /* ignore */
    }
    return base
  })
  const saveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
      } catch {
        /* quota */
      }
    }, 300)
  }, [cfg])
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
  'seed', 'mode', 'script', 'mood', 'streamerName', 'streamerLogin', 'viewerName', 'gameName', 'scriptUsersRandom', 'scriptGapMultiplier', 'streamerChats', 'streamerColor',
  'messagesPerMinute', 'pacing', 'burstiness', 'reactionMoments', 'startDelayMs', 'prefillSec', 'durationSec', 'durationAuto', 'tailSec',
  'subsRate', 'giftsRate', 'raidsRate', 'cheersRate', 'firstTimeRate', 'highlightRate', 'replyRate', 'deleteRate', 'announcementRate', 'actionsRate', 'mentionsRate', 'powerUpsRate', 'rewardRate', 'systemNotices', 'welcomeMessage',
  'chatterPoolSize', 'customColorRatio', 'subRatio', 'primeRatio', 'modCount', 'vipCount', 'bitsBadgeRatio', 'gifterBadgeRatio', 'eventBadgeRatio', 'badgePool', 'botsEnabled', 'customNames', 'customNamesOnly', 'localizedNamesRatio', 'channelSubBadgeStyle', 'customBadges', 'customEmotes', 'useCustomEmotesInFiller',
  'emoteDensity', 'useTwitchEmotes', 'use7tvEmotes', 'useChannelEmotes', 'animatedEmotes',
]
export function simKey(cfg: Config): string {
  return JSON.stringify(SIM_KEYS.map((k) => cfg[k]))
}

/** The config used for simulation: only changes (debounced) when a simulation-relevant field changes. */
export function useSimConfig(cfg: Config): Config {
  const key = simKey(cfg)
  const dkey = useDebounced(key, 150)
  const ref = useRef({ key, cfg })
  if (dkey === key && ref.current.key !== key) ref.current = { key, cfg }
  return ref.current.cfg
}
