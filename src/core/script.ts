/**
 * Script DSL parser. One entry per line.
 *
 *   # comment
 *   hello chat                       -> random chatter says this
 *   [mod] nightbot: welcome!         -> named user with role flags [mod] [vip] [sub:12] [prime] [color:#ff0000] [broadcaster] [founder] [bits:1000] [gifter:5] [turbo] [partner]
 *   @12.5 text                       -> at 12.5s (absolute)
 *   +0.5 text                        -> 0.5s after the previous scripted line
 *   !wait 3                          -> pause 3s before the next line
 *   !speed 2                         -> ambient chat rate multiplier from now on
 *   !sub user [prime|t1|t2|t3] [months] [-- message]
 *   !gift gifter recipient [t1|t2|t3]
 *   !gifts gifter count [t1|t2|t3]
 *   !raid raider count
 *   !announce [purple|blue|green|orange] text
 *   !cheer user bits text
 *   !first [user:] text
 *   !highlight [user:] text
 *   !reward RewardName | [user:] text
 *   !reply target: text              -> a random chatter replies to target's last message
 *   !me [user:] text                 -> /me action
 *   !delete [user:] text             -> message that gets deleted by a mod shortly after
 *   !timeout user seconds
 *   !clear | !slow n | !slowoff | !emoteonly | !emoteonlyoff | !followers [minutes] | !subsonly | !system text
 *   !burst count text                -> count random chatters spam this in ~2s
 *   !gigantify [user:] text          -> power-up: last emote gigantified
 *   !effect rainbow-eclipse|simmer|cosmic-abyss [user:] text
 *   !mod user | !vip user | !unmod user | !color user #hex
 */

import { detectImport, importToScript } from './importFormat'

export type ScriptTiming = { kind: 'auto' } | { kind: 'at'; sec: number } | { kind: 'after'; sec: number }

export interface UserFlags {
  mod?: boolean
  vip?: boolean
  broadcaster?: boolean
  founder?: boolean
  subMonths?: number
  prime?: boolean
  turbo?: boolean
  partner?: boolean
  bits?: number
  gifter?: number
  color?: string
}

export type ScriptEntry =
  | { type: 'chat'; timing: ScriptTiming; user?: string; flags: UserFlags; text: string; action?: boolean; first?: boolean; highlight?: boolean; reward?: string; deleteAfter?: number; gigantify?: boolean; effect?: 'rainbow-eclipse' | 'simmer' | 'cosmic-abyss'; cheer?: number }
  | { type: 'wait'; timing: ScriptTiming; sec: number }
  | { type: 'speed'; timing: ScriptTiming; mult: number }
  | { type: 'sub'; timing: ScriptTiming; user?: string; tier: 'prime' | 1 | 2 | 3; months: number; message?: string }
  | { type: 'gift'; timing: ScriptTiming; gifter?: string; recipient?: string; tier: 1 | 2 | 3 }
  | { type: 'gifts'; timing: ScriptTiming; gifter?: string; count: number; tier: 1 | 2 | 3 }
  | { type: 'raid'; timing: ScriptTiming; raider?: string; count: number }
  | { type: 'announce'; timing: ScriptTiming; color: string; text: string }
  | { type: 'reply'; timing: ScriptTiming; target: string; text: string; user?: string }
  | { type: 'user'; timing: ScriptTiming; user: string; flags: UserFlags }
  | { type: 'timeout'; timing: ScriptTiming; user: string; seconds: number }
  | { type: 'system'; timing: ScriptTiming; kind: 'clear' | 'slow' | 'slowoff' | 'emoteonly' | 'emoteonlyoff' | 'followers' | 'subsonly' | 'text'; value?: number; text?: string }
  | { type: 'burst'; timing: ScriptTiming; count: number; text: string }
  | { type: 'setuser'; timing: ScriptTiming; user: string; flags: UserFlags; unmod?: boolean }

const FLAG_RE = /^\[([^\]]+)\]\s*/

function parseFlags(src: string): { flags: UserFlags; rest: string } {
  const flags: UserFlags = {}
  let rest = src
  let m: RegExpMatchArray | null
  while ((m = rest.match(FLAG_RE))) {
    for (const raw of m[1].split(/[,\s]+/)) {
      const [k, v] = raw.split(':')
      const key = k.toLowerCase()
      switch (key) {
        case 'mod': case 'moderator': flags.mod = true; break
        case 'vip': flags.vip = true; break
        case 'broadcaster': case 'streamer': case 'owner': flags.broadcaster = true; break
        case 'founder': flags.founder = true; flags.subMonths ??= 12; break
        case 'sub': case 'subscriber': flags.subMonths = v ? Math.max(1, parseInt(v, 10) || 1) : 1; break
        case 'prime': flags.prime = true; break
        case 'turbo': flags.turbo = true; break
        case 'partner': case 'verified': flags.partner = true; break
        case 'bits': flags.bits = v ? parseInt(v, 10) || 100 : 100; break
        case 'gifter': flags.gifter = v ? parseInt(v, 10) || 1 : 1; break
        case 'color': if (v) flags.color = v.startsWith('#') ? v : '#' + v; break
      }
    }
    rest = rest.slice(m[0].length)
  }
  return { flags, rest }
}

/** "name: text" -> {user, text}; otherwise {text} */
function splitUser(src: string): { user?: string; text: string } {
  const m = src.match(/^([A-Za-z0-9_][A-Za-z0-9_\-. ()À-￿]{0,40}?):\s+(.*)$/s)
  if (m && !m[1].includes(' ') && !/^https?$/i.test(m[1])) return { user: m[1], text: m[2] }
  return { text: src }
}

function parseTier(s?: string): 'prime' | 1 | 2 | 3 | undefined {
  if (!s) return undefined
  const t = s.toLowerCase()
  if (t === 'prime') return 'prime'
  if (t === 't1' || t === '1' || t === 'tier1') return 1
  if (t === 't2' || t === '2' || t === 'tier2') return 2
  if (t === 't3' || t === '3' || t === 'tier3') return 3
  return undefined
}

export function parseScript(srcRaw: string): ScriptEntry[] {
  const out: ScriptEntry[] = []
  // JSON import format pasted straight into the script box
  const doc = detectImport(srcRaw)
  const src = doc ? importToScript(doc) : srcRaw
  for (const rawLine of src.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    let timing: ScriptTiming = { kind: 'auto' }
    let m = line.match(/^@(\d+(?:\.\d+)?)\s+/)
    if (m) {
      timing = { kind: 'at', sec: parseFloat(m[1]) }
      line = line.slice(m[0].length)
    } else if ((m = line.match(/^\+(\d+(?:\.\d+)?)\s+/))) {
      timing = { kind: 'after', sec: parseFloat(m[1]) }
      line = line.slice(m[0].length)
    }
    if (line.startsWith('!')) {
      const sp = line.indexOf(' ')
      const cmd = (sp === -1 ? line : line.slice(0, sp)).slice(1).toLowerCase()
      const arg = sp === -1 ? '' : line.slice(sp + 1).trim()
      const args = arg.split(/\s+/).filter(Boolean)
      switch (cmd) {
        case 'wait': {
          const sec = parseFloat(args[0])
          out.push({ type: 'wait', timing, sec: Number.isFinite(sec) ? Math.max(0, Math.min(3600, sec)) : 1 })
          break
        }
        case 'speed': {
          // clamped: 0 / negative would stall the metronome, huge values explode the message count
          const mult = parseFloat(args[0])
          out.push({ type: 'speed', timing, mult: Number.isFinite(mult) ? Math.max(0.05, Math.min(20, mult)) : 1 })
          break
        }
        case 'sub': case 'resub': {
          const [msgless, message] = arg.split(/\s+--\s+/)
          const a = msgless.split(/\s+/).filter(Boolean)
          const user = a[0]
          // "!sub user 12" (no tier) and "!sub user t2 12" both work
          const tierGiven = parseTier(a[1]) !== undefined
          const tier = parseTier(a[1]) ?? 1
          const monthsArg = tierGiven ? a[2] : a[1]
          const months = parseInt(monthsArg ?? (cmd === 'resub' ? '6' : '1'), 10) || 1
          out.push({ type: 'sub', timing, user: user === '*' ? undefined : user, tier, months, message })
          break
        }
        case 'gift': out.push({ type: 'gift', timing, gifter: args[0] === '*' ? undefined : args[0], recipient: args[1] === '*' ? undefined : args[1], tier: (parseTier(args[2]) as 1 | 2 | 3) || 1 }); break
        case 'gifts': case 'communitygift': case 'massgift': out.push({ type: 'gifts', timing, gifter: args[0] === '*' ? undefined : args[0], count: parseInt(args[1], 10) || 5, tier: (parseTier(args[2]) as 1 | 2 | 3) || 1 }); break
        case 'raid': out.push({ type: 'raid', timing, raider: args[0] === '*' ? undefined : args[0], count: parseInt(args[1], 10) || 10 }); break
        case 'announce': case 'announcement': {
          const colors: Record<string, string> = { purple: '#9147ff', primary: '#9147ff', blue: '#1f69ff', green: '#00f593', orange: '#ffa500', red: '#e91916' }
          if (args[0] && colors[args[0].toLowerCase()]) out.push({ type: 'announce', timing, color: colors[args[0].toLowerCase()], text: args.slice(1).join(' ') })
          else out.push({ type: 'announce', timing, color: colors.purple, text: arg })
          break
        }
        case 'cheer': case 'bits': {
          const { flags, rest } = parseFlags(arg)
          const a = rest.split(/\s+/)
          const user = a[0]
          const bits = parseInt(a[1], 10) || 100
          const text = a.slice(2).join(' ')
          out.push({ type: 'chat', timing, user: user === '*' ? undefined : user, flags, text, cheer: bits })
          break
        }
        case 'first': case 'firsttime': {
          const { flags, rest } = parseFlags(arg)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, first: true })
          break
        }
        case 'highlight': case 'hl': {
          const { flags, rest } = parseFlags(arg)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, highlight: true })
          break
        }
        case 'reward': case 'redeem': {
          const [name, body = ''] = arg.split(/\s*\|\s*/)
          const { flags, rest } = parseFlags(body)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, reward: name })
          break
        }
        case 'reply': {
          // "!reply target: text"  or  "!reply target | replier: text"
          const m2 = arg.match(/^(\S+)\s*\|\s*(.+)$/)
          if (m2) {
            const su = splitUser(m2[2])
            out.push({ type: 'reply', timing, target: m2[1], text: su.text, user: su.user })
            break
          }
          const su = splitUser(arg)
          if (su.user) out.push({ type: 'reply', timing, target: su.user, text: su.text })
          break
        }
        case 'user': case 'chatter': case 'define': {
          // "!user name [mod sub:12 color:#hex]"  or  "!user Display (login) mod vip"
          const m2 = arg.match(/^(.+?\(\S+\)|\S+)\s*(.*)$/)
          if (!m2) break
          const name = m2[1]
          const rest = m2[2].trim()
          const { flags } = parseFlags(rest.startsWith('[') ? rest : rest ? `[${rest}]` : '')
          out.push({ type: 'user', timing, user: name, flags })
          break
        }
        case 'me': case 'action': {
          const { flags, rest } = parseFlags(arg)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, action: true })
          break
        }
        case 'delete': case 'del': {
          const { flags, rest } = parseFlags(arg)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, deleteAfter: 1.8 })
          break
        }
        case 'timeout': case 'ban': out.push({ type: 'timeout', timing, user: args[0] ?? '', seconds: parseInt(args[1], 10) || 600 }); break
        case 'clear': out.push({ type: 'system', timing, kind: 'clear' }); break
        case 'slow': out.push({ type: 'system', timing, kind: 'slow', value: parseInt(args[0], 10) || 3 }); break
        case 'slowoff': out.push({ type: 'system', timing, kind: 'slowoff' }); break
        case 'emoteonly': out.push({ type: 'system', timing, kind: 'emoteonly' }); break
        case 'emoteonlyoff': out.push({ type: 'system', timing, kind: 'emoteonlyoff' }); break
        case 'followers': out.push({ type: 'system', timing, kind: 'followers', value: parseInt(args[0], 10) || 0 }); break
        case 'subsonly': case 'subs': out.push({ type: 'system', timing, kind: 'subsonly' }); break
        case 'system': case 'notice': out.push({ type: 'system', timing, kind: 'text', text: arg }); break
        case 'burst': case 'spam': out.push({ type: 'burst', timing, count: parseInt(args[0], 10) || 10, text: args.slice(1).join(' ') || 'KEKW' }); break
        case 'gigantify': case 'giga': {
          const { flags, rest } = parseFlags(arg)
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, gigantify: true })
          break
        }
        case 'effect': {
          const eff = (args[0] ?? '').toLowerCase() as 'rainbow-eclipse' | 'simmer' | 'cosmic-abyss'
          const { flags, rest } = parseFlags(args.slice(1).join(' '))
          const su = splitUser(rest)
          out.push({ type: 'chat', timing, user: su.user, flags, text: su.text, effect: ['rainbow-eclipse', 'simmer', 'cosmic-abyss'].includes(eff) ? eff : 'rainbow-eclipse' })
          break
        }
        case 'mod': out.push({ type: 'setuser', timing, user: args[0] ?? '', flags: { mod: true } }); break
        case 'unmod': out.push({ type: 'setuser', timing, user: args[0] ?? '', flags: {}, unmod: true }); break
        case 'vip': out.push({ type: 'setuser', timing, user: args[0] ?? '', flags: { vip: true } }); break
        case 'color': out.push({ type: 'setuser', timing, user: args[0] ?? '', flags: { color: (args[1] ?? '#ff0000').startsWith('#') ? args[1] : '#' + args[1] } }); break
        default:
          // unknown command: treat as plain text so nothing is silently lost
          out.push({ type: 'chat', timing, flags: {}, text: line })
      }
      continue
    }
    const { flags, rest } = parseFlags(line)
    const su = splitUser(rest)
    out.push({ type: 'chat', timing, user: su.user, flags, text: su.text })
  }
  return out
}
