import type { EmoteDef } from './types'

/** Data pulled from a real Twitch channel through public, CORS-enabled community APIs (IVR, 7TV, FFZ). */
export interface ChannelData {
  login: string
  displayName: string
  id: string
  chatColor: string | null
  logo: string | null
  /** subscriber badge versions (month thresholds) */
  subBadges: { version: string; url: string; url4x: string; title: string }[]
  bitsBadges: { version: string; url: string; url4x: string; title: string }[]
  emotes: EmoteDef[]
  sources: string[]
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { mode: 'cors' })
  if (!r.ok) throw new Error(`${url} -> ${r.status}`)
  return (await r.json()) as T
}

export async function loadChannel(loginRaw: string): Promise<ChannelData> {
  const login = loginRaw.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').replace(/[^a-z0-9_]/g, '')
  if (!login) throw new Error('Enter a channel name')
  const users = await getJson<{ id: string; login: string; displayName: string; chatColor: string | null; logo: string | null; banned?: boolean }[]>(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(login)}`)
  if (!users.length) throw new Error(`Channel "${login}" not found`)
  const u = users[0]
  const out: ChannelData = { login: u.login, displayName: u.displayName, id: u.id, chatColor: u.chatColor, logo: u.logo, subBadges: [], bitsBadges: [], emotes: [], sources: [] }

  const tasks: Promise<void>[] = []
  // channel badges (subs, bits)
  tasks.push(
    getJson<{ set_id: string; versions: { id: string; image_url_1x: string; image_url_4x: string; title: string }[] }[]>(`https://api.ivr.fi/v2/twitch/badges/channel?login=${encodeURIComponent(login)}`)
      .then((sets) => {
        for (const s of sets) {
          const list = s.versions.map((v) => ({ version: v.id, url: v.image_url_1x, url4x: v.image_url_4x, title: v.title }))
          if (s.set_id === 'subscriber') out.subBadges = list
          if (s.set_id === 'bits') out.bitsBadges = list
        }
        if (out.subBadges.length) out.sources.push(`${out.subBadges.length} sub badges`)
      })
      .catch(() => {}),
  )
  // Twitch channel emotes (sub emotes)
  tasks.push(
    getJson<{ subProducts?: { emotes: { id: string; code: string; assetType: string }[] }[]; bitsTier?: { emotes: { id: string; code: string; assetType: string }[] }[]; follower?: { emotes: { id: string; code: string; assetType: string }[] }[] }>(`https://api.ivr.fi/v2/twitch/emotes/channel/${encodeURIComponent(login)}`)
      .then((j) => {
        const groups = [...(j.subProducts ?? []), ...(j.bitsTier ?? []), ...(j.follower ?? [])]
        let n = 0
        for (const g of groups)
          for (const e of g.emotes ?? []) {
            out.emotes.push({ name: e.code, id: e.id, provider: 'twitch', animated: e.assetType === 'ANIMATED', weight: 6 })
            n++
          }
        if (n) out.sources.push(`${n} Twitch emotes`)
      })
      .catch(() => {}),
  )
  // 7TV
  tasks.push(
    getJson<{ emote_set?: { emotes?: { id: string; name: string; data?: { animated?: boolean } }[] } }>(`https://7tv.io/v3/users/twitch/${u.id}`)
      .then((j) => {
        const list = j.emote_set?.emotes ?? []
        for (const e of list) out.emotes.push({ name: e.name, id: e.id, provider: '7tv', animated: !!e.data?.animated, weight: 5 })
        if (list.length) out.sources.push(`${list.length} 7TV emotes`)
      })
      .catch(() => {}),
  )
  // FFZ
  tasks.push(
    getJson<{ sets?: Record<string, { emoticons?: { id: number; name: string; animated?: unknown; urls: Record<string, string> }[] }> }>(`https://api.frankerfacez.com/v1/room/${encodeURIComponent(login)}`)
      .then((j) => {
        let n = 0
        for (const set of Object.values(j.sets ?? {}))
          for (const e of set.emoticons ?? []) {
            out.emotes.push({ name: e.name, id: String(e.id), provider: 'ffz', animated: !!e.animated, weight: 4 })
            n++
          }
        if (n) out.sources.push(`${n} FFZ emotes`)
      })
      .catch(() => {}),
  )
  await Promise.all(tasks)
  return out
}
