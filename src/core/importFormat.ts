/**
 * JSON import format (what you can ask an AI to generate) and its conversion to the script DSL.
 *
 * {
 *   "streamer": "MyStreamer", "game": "Valorant",
 *   "users": [ { "name": "coolguy_92", "color": "#ff69b4", "badges": ["mod", "sub:12", "prime"] }, ... ],
 *   "messages": [
 *     "plain text = random chatter",
 *     { "user": "coolguy_92", "text": "LETS GOOO {e:hype}", "delay": 0.4 },
 *     { "type": "sub", "user": "coolguy_92", "tier": "prime", "months": 12, "text": "resub hype" },
 *     { "type": "gift", "user": "a", "to": "b" }, { "type": "gifts", "user": "a", "count": 10 },
 *     { "type": "raid", "user": "raider", "count": 120 },
 *     { "type": "announce", "text": "Drops enabled", "color": "green" },
 *     { "type": "cheer", "user": "x", "bits": 500, "text": "GG" },
 *     { "type": "highlight" | "first" | "me" | "delete" | "gigantify", "user": "x", "text": "..." },
 *     { "type": "reply", "user": "x", "target": "coolguy_92", "text": "..." },
 *     { "type": "reward", "reward": "TTS", "user": "x", "text": "..." },
 *     { "type": "effect", "effect": "rainbow-eclipse", "user": "x", "text": "..." },
 *     { "type": "burst", "count": 20, "text": "KEKW" },
 *     { "type": "wait", "seconds": 3 },
 *     { "type": "system", "text": "This room is now in slow mode." }
 *   ]
 * }
 * "at" (absolute seconds) or "delay" (seconds after the previous line) are optional on every message.
 */

import { normalizeHex } from './script'

export interface ImportUser {
  name: string
  login?: string
  color?: string
  badges?: string[]
}

export interface ImportMessage {
  type?: string
  user?: string
  text?: string
  at?: number
  delay?: number
  tier?: string | number
  months?: number
  to?: string
  count?: number
  bits?: number
  color?: string
  seconds?: number
  reward?: string
  effect?: string
  target?: string
}

export interface ImportDoc {
  streamer?: string
  game?: string
  users?: ImportUser[]
  messages: (ImportMessage | string)[]
}

/** Returns the parsed document if `text` is JSON in the import format, else null. */
export function detectImport(text: string): ImportDoc | null {
  // AI output often comes wrapped in ```json fences
  const t = text.trim().replace(/^`{3,}\s*json?\s*\n?/i, '').replace(/\n?`{3,}\s*$/, '').trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try {
    const j = JSON.parse(t) as unknown
    if (Array.isArray(j)) return { messages: j as (ImportMessage | string)[] }
    if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>
      const messages = (o.messages ?? o.chat ?? o.lines ?? []) as (ImportMessage | string)[]
      if (!Array.isArray(messages)) return null
      return {
        streamer: typeof o.streamer === 'string' ? o.streamer : undefined,
        game: typeof o.game === 'string' ? o.game : undefined,
        users: Array.isArray(o.users) ? (o.users as unknown[]).map(normalizeUser).filter((u): u is ImportUser => !!u) : undefined,
        messages,
      }
    }
  } catch {
    return null
  }
  return null
}

function normalizeUser(u: unknown): ImportUser | null {
  if (typeof u === 'string') return { name: u }
  if (!u || typeof u !== 'object') return null
  const o = u as Record<string, unknown>
  const name = (o.name ?? o.username ?? o.displayName ?? o.login) as string | undefined
  if (!name) return null
  const badges: string[] = []
  const rawBadges: unknown = o.badges ?? o.roles ?? o.flags
  if (Array.isArray(rawBadges)) {
    for (const b of rawBadges) if (typeof b === 'string') badges.push(b)
  } else if (typeof rawBadges === 'string') badges.push(...rawBadges.split(/[,\s]+/).filter(Boolean))
  if (o.mod === true || o.moderator === true) badges.push('mod')
  if (o.vip === true) badges.push('vip')
  if (o.prime === true) badges.push('prime')
  if (typeof o.subMonths === 'number') badges.push(`sub:${o.subMonths}`)
  else if (o.sub === true || o.subscriber === true) badges.push('sub:1')
  else if (typeof o.sub === 'number') badges.push(`sub:${o.sub}`)
  if (typeof o.bits === 'number') badges.push(`bits:${o.bits}`)
  return { name: String(name), login: typeof o.login === 'string' ? o.login : undefined, color: typeof o.color === 'string' ? o.color : undefined, badges }
}

const FLAG_MAP: Record<string, string> = { moderator: 'mod', subscriber: 'sub', verified: 'partner', streamer: 'broadcaster', owner: 'broadcaster' }
function normalizeFlag(f: string): string {
  const [k, v] = f.toLowerCase().split(':')
  const key = FLAG_MAP[k] ?? k
  return v ? `${key}:${v}` : key
}

function tierArg(t: string | number | undefined): string {
  if (t === undefined) return 't1'
  const s = String(t).toLowerCase()
  if (s === 'prime') return 'prime'
  const n = s.replace(/[^0-9]/g, '')
  return n === '2' || n === '3' ? `t${n}` : 't1'
}

function clean(s: unknown): string {
  return String(s ?? '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}

function userToken(u?: string): string {
  if (!u || u === '*' || u.toLowerCase() === 'random') return '*'
  return clean(u).replace(/\s+/g, '_')
}

/** Converts an import document into script DSL text. */
export function importToScript(doc: ImportDoc): string {
  const out: string[] = []
  // messages reference users by display name; the cast is keyed by login
  const loginOf = new Map<string, string>()
  for (const u of doc.users ?? []) if (u && u.name) loginOf.set(clean(u.name).toLowerCase(), u.login ? clean(u.login) : clean(u.name).replace(/\s+/g, '_'))
  const who = (name?: string) => (name && loginOf.get(clean(name).toLowerCase())) || name
  for (const u of doc.users ?? []) {
    if (!u || !u.name) continue
    const flags = [...(u.badges ?? []).map(normalizeFlag)]
    const hex = u.color && normalizeHex(u.color)
    if (hex) flags.push(`color:${hex}`)
    const name = u.login && u.login.toLowerCase() !== u.name.toLowerCase() ? `${u.name} (${u.login})` : u.name
    out.push(`!user ${name.replace(/\s+/g, '_').replace('_(', ' (')}${flags.length ? ' [' + flags.join(' ') + ']' : ''}`)
  }
  for (const m of doc.messages) {
    if (typeof m === 'string') {
      out.push(clean(m))
      continue
    }
    if (!m || typeof m !== 'object') continue
    const timing = typeof m.at === 'number' ? `@${m.at} ` : typeof m.delay === 'number' ? `+${m.delay} ` : ''
    const type = (m.type ?? 'chat').toLowerCase()
    const user = userToken(who(m.user))
    const text = clean(m.text)
    const withUser = (t: string) => (user === '*' ? t : `${user}: ${t}`)
    // a chat line without text would render as "name:" — skip it (events like subs/raids don't need text)
    if ((type === 'chat' || type === 'message' || type === 'msg') && !text) continue
    switch (type) {
      case 'chat':
      case 'message':
      case 'msg':
      case 'text':
        out.push(timing + withUser(text))
        break
      case 'sub':
      case 'resub':
      case 'subscribe':
        out.push(`${timing}!sub ${user} ${tierArg(m.tier)} ${m.months ?? 1}${text ? ' -- ' + text : ''}`)
        break
      case 'gift':
        out.push(`${timing}!gift ${user} ${userToken(m.to ?? m.target)} ${tierArg(m.tier)}`)
        break
      case 'gifts':
      case 'giftbomb':
      case 'communitygift':
        out.push(`${timing}!gifts ${user} ${m.count ?? 5} ${tierArg(m.tier)}`)
        break
      case 'raid':
        out.push(`${timing}!raid ${user} ${m.count ?? 50}`)
        break
      case 'announce':
      case 'announcement':
        out.push(`${timing}!announce ${m.color ?? 'purple'} ${text}`)
        break
      case 'cheer':
      case 'bits':
        out.push(`${timing}!cheer ${user} ${m.bits ?? m.count ?? 100} ${text}`)
        break
      case 'highlight':
      case 'first':
      case 'me':
      case 'delete':
      case 'gigantify':
        out.push(`${timing}!${type} ${withUser(text)}`)
        break
      case 'reply': {
        const target = userToken(who(m.target ?? m.to))
        if (target === '*') out.push(`${timing}${withUser(text)}`) // nobody to reply to: plain line
        else out.push(`${timing}!reply ${target}${user !== '*' ? ' | ' + user : ''}: ${text}`)
        break
      }
      case 'reward':
      case 'redeem':
        out.push(`${timing}!reward ${clean(m.reward ?? 'Reward')} | ${withUser(text)}`)
        break
      case 'effect':
        out.push(`${timing}!effect ${m.effect ?? 'rainbow-eclipse'} ${withUser(text)}`)
        break
      case 'burst':
      case 'spam':
        out.push(`${timing}!burst ${m.count ?? 10} ${text || 'KEKW'}`)
        break
      case 'wait':
      case 'pause':
        out.push(`!wait ${m.seconds ?? m.delay ?? 1}`)
        break
      case 'system':
      case 'notice':
        out.push(`${timing}!system ${text}`)
        break
      case 'timeout':
        out.push(`${timing}!timeout ${user} ${m.seconds ?? 600}`)
        break
      case 'clear':
      case 'slow':
      case 'slowoff':
      case 'emoteonly':
      case 'emoteonlyoff':
      case 'followers':
      case 'subsonly':
        out.push(`${timing}!${type}${m.seconds ? ' ' + m.seconds : ''}`)
        break
      default:
        out.push(timing + withUser(text))
    }
  }
  return out.join('\n')
}

/** Names of the imported users, for the chatter pool ("Display (login)" syntax). */
export function importedNames(doc: ImportDoc): string[] {
  return (doc.users ?? []).map((u) => (u.login && u.login.toLowerCase() !== u.name.toLowerCase() ? `${u.name} (${u.login})` : u.name))
}

/** The prompt you paste into ChatGPT / Claude / Gemini. Simple by design: one "username: message" per line. */
export const AI_PROMPT = `Write a fake Twitch chat log for a video overlay.

Output ONLY the chat lines, one per line, in exactly this format (no numbering, no quotes, no commentary):
username: message

Rules:
- Usernames must look like real Twitch logins: 4-25 characters, letters/numbers/underscores only, mixed styles (xX_shadow_Xx, jake_99, PogChamper2011, lil_toaster, ttv_niko, KaiFan42, sleepysock54, notarealuser). Invent about <NUMBER OF USERS, e.g. 25> different users and reuse them so a few "regulars" chat a lot.
- You may put [mod], [vip] or [sub] in front of a username to give that user a badge, e.g. "[mod] nightbot: welcome!" or "[sub] jake_99: LETS GO". Only 1-3 mods and a few vips; roughly a third subs.
- Make it feel like real Twitch chat: mostly short lowercase messages, slang (W, L, ratio, cooked, cracked, skill issue, clip it, no way), typos and stretched words sometimes (LETS GOOOO), a few longer sentences, some ALL CAPS hype, questions, backseating, and reactions to what is happening on stream. When something hype happens, have several users spam the same short thing in a row (W W W, KEKW, CLIP IT).
- Emotes: write emote codes as plain words, e.g. KEKW, OMEGALUL, LUL, PogChamp, POGGERS, monkaS, Sadge, catJAM, PepeLaugh, Clap, EZ, ICANT, Bedge, HUH, xdd, Prayge, Madge, PauseChamp, Pepega, widepeepoHappy, peepoClap, Clueless, LETSGO, D:, FeelsBadMan, FeelsGoodMan, HeyGuys, Kappa, BibleThump, NotLikeThis, DansGame, ResidentSleeper, Kreygasm, 4Head, TriHard, VoHiYo, SeemsGood.
- Length: <NUMBER OF MESSAGES, e.g. 80> lines.
- Scenario / what is happening on stream: <DESCRIBE THE MOMENT, e.g. "streamer just hit a 1v4 clutch in Valorant ranked, chat goes crazy">.
- Tone: <e.g. hype / funny / wholesome / toxic-but-PG13 / chill>.`
