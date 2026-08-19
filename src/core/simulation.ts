import { Rng, hashString } from './rng'
import type { Badge, ChatMessage, Chatter, Config, Fragment, NoticePart } from './types'
import { generateName, parseCustomNames, BOT_NAMES, loginFor } from './names'
import { POPULAR_CUSTOM_COLORS } from './colors'
import { assignBadges, makeBadge, sortBadges, subBadgeFor, bitsBadgeVersion, gifterBadgeVersion, type BadgeAssignOptions, type GeneratedSubBadgeSet } from './badges'
import { EmoteRegistry, REACTION_EMOTES, parseMessage } from './emotes'
import { GENERIC, MOODS, BOT_LINES, SUB_MESSAGES, MOMENTS, SPAM_WORDS, FIRST_TIME_LINES, COUNTRIES, HIGHLIGHT_LINES, type PhrasePool } from '../data/phrases'
import { parseScript, type ScriptEntry, type UserFlags } from './script'
import { detectImport, importedNames } from './importFormat'

export interface Timeline {
  messages: ChatMessage[]
  durationMs: number
  chatters: Chatter[]
  /** timestamps (ms) at which the chat was cleared by a moderator */
  clears: number[]
}

export interface SimInputs {
  config: Config
  registry: EmoteRegistry
  subBadgeSet: GeneratedSubBadgeSet | null
  channelBadges: BadgeAssignOptions['channelBadges']
}

interface Ctx {
  rng: Rng
  cfg: Config
  registry: EmoteRegistry
  chatters: Chatter[]
  weights: number[]
  byLogin: Map<string, Chatter>
  recent: ChatMessage[]
  nextId: number
  badgeOpts: BadgeAssignOptions
  streamerDisplay: string
  streamerLogin: string
  game: string
  bots: Chatter[]
  broadcaster: Chatter | null
  extraChatterSeed: number
  raidWindows?: { t0: number; t1: number; users: Chatter[] }[]
  lastScriptUser?: Chatter
  /** user lines re-used as filler (when cfg.fillerFromScript) */
  fillerPool?: { user?: string; text: string }[]
  /** simulation time (ms) of the script entry / event currently being applied — stamps badge changes */
  now: number
  /** timeouts / bans from the script, applied to the finished timeline (also to filler chat) */
  bans: { user: Chatter; t: number; untilMs: number }[]
}

/** A chatter's badge/color state as of a moment; ambient messages are generated later and look this up. */
interface BadgeState {
  t: number
  /** next message id at the time of the change (script order) */
  seq: number
  badges: Badge[]
  color: string | null
}
const badgeHistory = new WeakMap<Chatter, BadgeState[]>()
function recordBadgeState(ctx: Ctx, c: Chatter, before: { badges: Badge[]; color: string | null } | null): void {
  let h = badgeHistory.get(c)
  if (!h) {
    h = [{ t: -Infinity, seq: 0, badges: before ? before.badges : c.badges, color: before ? before.color : c.color }]
    badgeHistory.set(c, h)
  }
  h.push({ t: ctx.now, seq: ctx.nextId, badges: c.badges, color: c.color })
}
/** state of chatter c for a message created with id at time t */
function badgeStateFor(c: Chatter, id: number, t: number): BadgeState | null {
  const h = badgeHistory.get(c)
  if (!h) return null
  let best: BadgeState | null = null
  for (const e of h) if (e.t <= t && e.seq <= id) best = e
  return best ?? h[0]
}

const PERSONAS = ['normal', 'emoter', 'yapper', 'questioner', 'backseater', 'hater', 'wholesome', 'spammer', 'lurker']
const PERSONA_WEIGHTS: Record<string, number[]> = {
  //          normal emoter yapper question backseat hater whole spam lurker
  general: [40, 12, 8, 8, 2, 4, 8, 10, 8],
  hype: [30, 30, 5, 5, 4, 3, 5, 12, 6],
  chill: [40, 15, 12, 10, 2, 2, 12, 2, 5],
  funny: [30, 30, 8, 5, 3, 4, 5, 10, 5],
  gaming: [30, 15, 6, 8, 25, 6, 3, 4, 3],
  wholesome: [30, 15, 12, 8, 2, 1, 25, 2, 5],
  toxic: [25, 15, 8, 6, 8, 30, 1, 5, 2],
  reactions: [10, 60, 2, 3, 3, 3, 4, 12, 3],
  clutch: [25, 30, 3, 4, 12, 3, 4, 15, 4],
  music: [30, 25, 8, 10, 1, 2, 12, 6, 6],
  irl: [35, 15, 12, 15, 2, 4, 10, 2, 5],
}

function fmtBig(n: number): string {
  return n.toLocaleString('en-US')
}

export function buildTimeline(inputs: SimInputs): Timeline {
  let { config: cfg } = inputs
  const { registry } = inputs
  const rng = new Rng(cfg.seed || 'twitchsim')
  const imported = cfg.mode === 'ambient' || cfg.mode === 'hype' ? null : detectImport(cfg.script)
  if (imported) {
    // imported docs can carry streamer/game and a cast of users
    cfg = { ...cfg }
    if (imported.streamer && (!cfg.streamerName.trim() || cfg.streamerName === 'Streamer')) cfg.streamerName = imported.streamer
    if (imported.game && (!cfg.gameName.trim() || cfg.gameName === 'the game')) cfg.gameName = imported.game
    const names = importedNames(imported)
    if (names.length) cfg.customNames = [names.join(', '), cfg.customNames].filter(Boolean).join(', ')
  }
  const streamerDisplay = cfg.streamerName.trim() || 'Streamer'
  const streamerLogin = loginFor(cfg.streamerLogin.trim() || streamerDisplay)
  const badgeOpts: BadgeAssignOptions = {
    pool: cfg.badgePool,
    subRatio: cfg.subRatio,
    primeRatio: cfg.primeRatio,
    bitsBadgeRatio: cfg.bitsBadgeRatio,
    gifterBadgeRatio: cfg.gifterBadgeRatio,
    eventBadgeRatio: cfg.eventBadgeRatio,
    subBadgeSet: cfg.channelSubBadgeStyle === 'generated' || cfg.channelSubBadgeStyle === 'custom' ? inputs.subBadgeSet : null,
    channelBadges: cfg.channelSubBadgeStyle === 'channel' ? inputs.channelBadges : null,
    extraBadges: cfg.customBadges.filter((b) => b.kind === 'extra').map((b) => ({ id: b.id, name: b.name, url: b.src, ratio: b.ratio ?? 0.2 })),
  }
  const ctx: Ctx = {
    rng,
    cfg,
    registry,
    chatters: [],
    weights: [],
    byLogin: new Map(),
    recent: [],
    nextId: 1,
    now: -Infinity,
    bans: [],
    badgeOpts,
    streamerDisplay,
    streamerLogin,
    game: cfg.gameName.trim() || 'the game',
    bots: [],
    broadcaster: null,
    extraChatterSeed: 0,
  }
  buildChatters(ctx)

  const messages: ChatMessage[] = []
  const clears: number[] = []
  const speedChanges: { t: number; mult: number }[] = []
  const entries = cfg.mode === 'ambient' || cfg.mode === 'hype' ? [] : parseScript(cfg.script)
  const prefillMs = Math.max(0, cfg.prefillSec) * 1000
  if (cfg.fillerFromScript) {
    // filler re-uses the plain chat lines of the script (any mode)
    const all = cfg.mode === 'ambient' || cfg.mode === 'hype' ? parseScript(cfg.script) : entries
    ctx.fillerPool = all
      .filter((e): e is Extract<ScriptEntry, { type: 'chat' }> => e.type === 'chat' && !e.first && !e.highlight && !e.reward && !e.deleteAfter && !e.cheer && !!e.text.trim())
      .map((e) => ({ user: e.user, text: e.text }))
    if (!ctx.fillerPool.length) ctx.fillerPool = undefined
  }

  if (cfg.welcomeMessage) {
    messages.push(systemMessage(ctx, -prefillMs - 1, 'welcome', [{ text: 'Welcome to the chat room!' }]))
  }

  // ---- 1) scripted entries -------------------------------------------------
  let scriptEnd = 0
  const useScript = entries.length > 0
  const baseGapMs = 60000 / Math.max(1, cfg.messagesPerMinute)
  if (useScript) {
    let cursor = cfg.startDelayMs
    let prev = cfg.startDelayMs
    let first = true
    let waitMs = 0
    for (const e of entries) {
      if (e.type === 'user' || e.type === 'setuser') {
        // cast definitions / role changes don't take a slot; "@N !mod bob" applies at that moment though.
        // Definitions before the first line are "up-front": they hold from the very start (pre-fill included)
        const at = e.timing.kind === 'at' ? e.timing.sec * 1000 : e.timing.kind === 'after' ? prev + e.timing.sec * 1000 : first ? -Infinity : prev
        applyScriptEntry(ctx, e, at, messages, clears)
        continue
      }
      if (e.type === 'wait') {
        // "!wait N": the next line comes exactly N seconds after the previous one (waits add up)
        waitMs += e.sec * 1000
        first = false
        continue
      }
      if (e.type === 'speed' && e.timing.kind === 'auto') {
        // a rate change takes no time of its own: it applies from the previous line on (a pending !wait stays pending)
        speedChanges.push({ t: prev + waitMs, mult: e.mult })
        continue
      }
      // "!speed" also stretches / squeezes the natural gaps between scripted lines
      const speedNow = speedAt(speedChanges, prev)
      const autoGap =
        (cfg.pacing === 'even'
          ? baseGapMs * (cfg.mode === 'script' ? 1 : Math.max(1, cfg.scriptGapMultiplier + 1))
          : cfg.mode === 'script'
            ? rng.exp(baseGapMs) * 0.85 + baseGapMs * 0.15
            : baseGapMs * Math.max(1, cfg.scriptGapMultiplier)) / speedNow
      let t: number
      let explicitGap = 0 // a deliberate pause the metronome must keep
      if (e.timing.kind === 'at') t = e.timing.sec * 1000
      else if (e.timing.kind === 'after') {
        t = prev + e.timing.sec * 1000
        explicitGap = e.timing.sec * 1000
      } else if (waitMs > 0) {
        t = prev + waitMs
        explicitGap = waitMs
      } else if (first) t = cursor
      else t = prev + autoGap
      waitMs = 0
      t = Math.max(0, t)
      first = false
      if (e.type === 'speed') {
        speedChanges.push({ t, mult: e.mult })
        prev = t
        continue
      }
      const produced = applyScriptEntry(ctx, e, t, messages, clears)
      if (explicitGap > 0) for (const m of produced) if (m.t === t) m.minGapBefore = explicitGap
      // "@N" / "+N" / after a "!wait" is a deliberate moment: the metronome keeps it where it is
      if (e.timing.kind !== 'auto' || explicitGap > 0) for (const m of produced) if (m.t === t) m.pinned = true
      prev = t
      // multi-message events (bursts, gift bombs, raids) occupy the following moments: the next line waits for them
      if (produced.length > 1) prev = Math.max(t, ...produced.map((m) => m.t))
      scriptEnd = Math.max(scriptEnd, t, ...produced.map((m) => m.t))
    }
    if (waitMs > 0) scriptEnd = Math.max(scriptEnd, prev + waitMs) // a trailing "!wait" is meant as a pause before the end
  }

  // ---- 2) duration -----------------------------------------------------------
  let durationMs = cfg.durationSec * 1000
  const producing = entries.some((e) => e.type !== 'user' && e.type !== 'setuser' && e.type !== 'speed' && e.type !== 'wait')
  if (cfg.durationAuto && useScript && producing) durationMs = Math.max(3000, scriptEnd + cfg.tailSec * 1000)

  // ---- 3) ambient stream --------------------------------------------------------
  const ambient = cfg.mode === 'ambient' || cfg.mode === 'hype' || cfg.mode === 'mixed' || (cfg.mode === 'script' && !useScript)
  if (ambient) generateAmbient(ctx, durationMs, speedChanges, messages, -prefillMs)

  // ---- 4) script state applied to filler chat -------------------------------------
  // filler messages were generated with each chatter's *final* badges/color; give every message the state
  // that was current when it was said (mods promoted later, resubs, !user definitions, ...)
  for (const m of messages) {
    if (!m.user) continue
    const st = badgeStateFor(m.user, m.id, m.t)
    if (st) {
      m.badges = st.badges
      m.color = st.color
    }
  }
  // timeouts / bans: earlier lines get deleted, nothing from that user while it lasts
  if (ctx.bans.length) {
    const drop = new Set<ChatMessage>()
    for (const b of ctx.bans) {
      for (const m of messages) {
        if (m.user !== b.user || m.notice) continue
        if (m.t <= b.t && !m.deletedAt) m.deletedAt = b.t
        else if (m.t > b.t && m.t < b.untilMs) drop.add(m)
      }
    }
    if (drop.size) {
      for (let i = messages.length - 1; i >= 0; i--) if (drop.has(messages[i])) messages.splice(i, 1)
    }
  }

  // ---- 5) order, ids, deletions/clears -------------------------------------
  messages.sort((a, b) => a.t - b.t || a.id - b.id)
  if (cfg.pacing === 'even') {
    evenOut(messages, baseGapMs, speedChanges)
    // the clear notices moved with the messages: re-derive the clear times from them
    clears.length = 0
    for (const m of messages) if (m.notice?.kind === 'clear') clears.push(m.t)
  }
  if (cfg.pacing === 'even' && cfg.durationAuto && useScript && messages.length) {
    durationMs = Math.max(3000, messages[messages.length - 1].t + cfg.tailSec * 1000)
  }
  return { messages, durationMs, chatters: ctx.chatters, clears: clears.sort((a, b) => a - b) }
}

// ---------------------------------------------------------------------------
// chatters
// ---------------------------------------------------------------------------

function buildChatters(ctx: Ctx): void {
  const { rng, cfg } = ctx
  const custom = parseCustomNames(cfg.customNames)
  // "only my usernames" = exactly those names, no invented ones; otherwise the pool is at least big enough for all of them
  const n = custom.length && cfg.customNamesOnly ? custom.length : Math.max(3, Math.min(5000, Math.max(cfg.chatterPoolSize, custom.length)))
  const persWeights = PERSONA_WEIGHTS[cfg.mood] ?? PERSONA_WEIGHTS.chill
  const usedLogins = new Set<string>()
  const list: Chatter[] = []
  for (let i = 0; i < n; i++) {
    let name = custom.length && i < custom.length ? custom[i] : generateName(rng, cfg.localizedNamesRatio)
    let guard = 0
    while (usedLogins.has(name.login) && guard++ < 20) {
      if (custom.length && i < custom.length) break // duplicate in the user's own list: skip it below
      name = generateName(rng, cfg.localizedNamesRatio)
    }
    if (usedLogins.has(name.login)) continue
    usedLogins.add(name.login)
    const c = newChatter(ctx, list.length, name.login, name.displayName, rng.weighted(PERSONAS, persWeights))
    // Zipf-ish weight: a few users chat a lot, most rarely.
    c.weight = 1 / Math.pow(i + 1, 0.6) + 0.04
    list.push(c)
  }
  // roles: mods & vips are usually among the more active users
  rng.shuffle(list)
  const modCount = Math.min(cfg.modCount, list.length)
  const vipCount = Math.min(cfg.vipCount, Math.max(0, list.length - modCount))
  for (let i = 0; i < modCount; i++) list[i].isMod = true
  for (let i = modCount; i < modCount + vipCount; i++) list[i].isVip = true
  for (const c of list) assignBadges(rng, c, ctx.badgeOpts)
  // broadcaster
  const bc = newChatter(ctx, list.length, ctx.streamerLogin, ctx.streamerDisplay, 'normal')
  bc.isBroadcaster = true
  bc.color = cfg.streamerColor || bc.color
  bc.weight = cfg.streamerChats ? 0.15 : 0
  assignBadges(rng, bc, ctx.badgeOpts)
  ctx.broadcaster = bc
  list.push(bc)
  // bots
  if (cfg.botsEnabled && !(cfg.customNamesOnly && cfg.customNames.trim())) {
    const botDefs = [BOT_NAMES[0], BOT_NAMES[1]]
    for (const b of botDefs) {
      const bot = newChatter(ctx, list.length, b.login, b.displayName, 'normal')
      bot.isBot = true
      bot.isMod = true
      bot.color = b.login === 'nightbot' ? '#5f5fff' : '#4b8fd6'
      bot.weight = 0
      assignBadges(rng, bot, ctx.badgeOpts)
      ctx.bots.push(bot)
      list.push(bot)
    }
  }
  ctx.chatters = list
  ctx.weights = list.map((c) => c.weight)
  for (const c of list) ctx.byLogin.set(c.login, c)
}

function newChatter(ctx: Ctx, id: number, login: string, displayName: string, persona: string): Chatter {
  const { rng, cfg } = ctx
  let color: string | null = null
  // custom palette: leave colour null so the palette (hashed from the login) decides every name; the
  // default (Twitch) mode keeps the usual mix of hashed defaults + a share of self-picked custom colours
  if (cfg.nameColorMode !== 'custom' && rng.chance(cfg.customColorRatio)) {
    color = rng.chance(0.8) ? rng.pick(POPULAR_CUSTOM_COLORS) : randomHex(rng)
  }
  return {
    id,
    login,
    displayName,
    color,
    badges: [],
    weight: 1,
    isMod: false,
    isVip: false,
    isBroadcaster: false,
    subMonths: 0,
    subTier: 0,
    isPrime: false,
    isBot: false,
    persona,
  }
}

function randomHex(rng: Rng): string {
  // bias to saturated, readable-ish colors
  const h = rng.next()
  const s = 0.6 + rng.next() * 0.4
  const l = 0.45 + rng.next() * 0.3
  const [r, g, b] = hslToRgb(h, s, l)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)]
}

/** Gets or creates a chatter for a script-provided name; applies flags. */
function resolveUser(ctx: Ctx, name: string | undefined, flags?: UserFlags): Chatter {
  const { rng, cfg } = ctx
  if (!name) return pickChatter(ctx)
  const login = loginFor(name)
  let c = ctx.byLogin.get(login)
  if (!c) {
    if (login === ctx.streamerLogin && ctx.broadcaster) c = ctx.broadcaster
    else {
      const sub = rng.fork('user:' + login)
      const saved = ctx.rng
      ctx.rng = sub
      c = newChatter(ctx, ctx.chatters.length, login, name, 'normal')
      c.weight = 0
      ctx.rng = saved
      assignBadges(sub, c, ctx.badgeOpts)
      ctx.chatters.push(c)
      ctx.weights.push(0)
      ctx.byLogin.set(login, c)
    }
  }
  if (flags && Object.keys(flags).length) applyFlags(ctx, c, flags)
  void cfg
  return c
}

function applyFlags(ctx: Ctx, c: Chatter, f: UserFlags): void {
  const before = { badges: c.badges, color: c.color }
  if (f.mod) c.isMod = true
  if (f.vip) c.isVip = true
  if (f.broadcaster) c.isBroadcaster = true
  if (f.subMonths !== undefined) {
    // a bare [sub] (=1) must not demote a 12-month sub; a sub notice sets the count it announces
    c.subMonths = f.exactSubMonths ? f.subMonths : Math.max(c.subMonths, f.subMonths)
    c.subTier = c.subTier || 1
  }
  if (f.prime) c.isPrime = true
  if (f.color) c.color = f.color
  // Rebuild only from what the chatter *already wore* plus what this flag set adds explicitly — the random
  // badge pool may have withheld e.g. the Prime/sub badge even though the chatter "is" a sub.
  const had = (set: string) => c.badges.some((b) => b.set === set)
  const keep = (set: string) => c.badges.find((b) => b.set === set)!
  const badges: Badge[] = c.badges.filter((b) => !['broadcaster', 'moderator', 'vip', 'subscriber', 'founder', 'premium', 'turbo', 'partner', 'bits', 'sub-gifter'].includes(b.set))
  if (f.broadcaster || c.isBroadcaster || had('broadcaster')) badges.push(makeBadge('broadcaster', '1'))
  else if (f.mod || had('moderator')) badges.push(makeBadge('moderator', '1'))
  else if (f.vip || had('vip')) badges.push(makeBadge('vip', '1'))
  if (f.founder || had('founder')) badges.push(makeBadge('founder', '0'))
  else if (f.subMonths !== undefined) badges.push(subBadgeFor(c.subMonths, ctx.badgeOpts))
  else if (had('subscriber')) badges.push(keep('subscriber'))
  if (f.bits) badges.push(makeBadge('bits', bitsBadgeVersion(f.bits)))
  else if (had('bits')) badges.push(keep('bits'))
  if (f.gifter) badges.push(makeBadge('sub-gifter', gifterBadgeVersion(f.gifter)))
  else if (had('sub-gifter')) badges.push(keep('sub-gifter'))
  if (f.prime || had('premium')) badges.push(makeBadge('premium', '1'))
  else if (f.turbo || had('turbo')) badges.push(makeBadge('turbo', '1'))
  if (f.partner || had('partner')) badges.push(makeBadge('partner', '1'))
  c.badges = sortBadges(badges)
  recordBadgeState(ctx, c, before)
}

function pickChatter(ctx: Ctx, exclude?: Chatter, allowBroadcaster = false): Chatter {
  const { rng } = ctx
  for (let i = 0; i < 8; i++) {
    const c = rng.weighted(ctx.chatters, ctx.weights)
    if (c !== exclude && !c.isBot && (allowBroadcaster || !c.isBroadcaster)) return c
  }
  return ctx.chatters.find((c) => !c.isBot && !c.isBroadcaster && c !== exclude) ?? ctx.chatters[0]
}

/** A brand-new one-off chatter (first-time chatters, raiders). */
function freshChatter(ctx: Ctx, persona = 'normal', badgeless = false): Chatter {
  const { rng, cfg } = ctx
  if (cfg.customNamesOnly && cfg.customNames.trim()) return pickChatter(ctx) // never invent names the user didn't list
  let name = generateName(rng, cfg.localizedNamesRatio)
  let guard = 0
  while (ctx.byLogin.has(name.login) && guard++ < 10) name = generateName(rng, cfg.localizedNamesRatio)
  const c = newChatter(ctx, ctx.chatters.length, name.login, name.displayName, persona)
  c.weight = 0.02
  if (!badgeless) {
    const saved = ctx.badgeOpts
    ctx.badgeOpts = { ...saved, subRatio: Math.min(0.15, saved.subRatio) }
    assignBadges(rng, c, ctx.badgeOpts)
    ctx.badgeOpts = saved
  } else if (rng.chance(cfg.primeRatio * 0.5)) {
    c.isPrime = true
    c.badges = [makeBadge('premium', '1')]
  }
  ctx.chatters.push(c)
  ctx.weights.push(c.weight)
  ctx.byLogin.set(c.login, c)
  return c
}

// ---------------------------------------------------------------------------
// text generation
// ---------------------------------------------------------------------------

function fill(ctx: Ctx, text: string, extra?: { spam?: string; user?: Chatter }): string {
  const { rng, registry } = ctx
  return text.replace(/\{([a-zA-Z]+)(?::([a-zA-Z]+))?\}/g, (_m, key: string, arg?: string) => {
    switch (key) {
      case 'e': {
        if (arg) {
          const names = REACTION_EMOTES[arg]
          if (names) {
            const avail = names.filter((n) => registry.has(n))
            if (avail.length) return rng.pick(avail)
          }
        }
        if (registry.size() === 0) return ''
        return rng.weighted(registry.list, registry.weights).name
      }
      case 'streamer':
        return ctx.streamerDisplay
      case 'login':
        return ctx.streamerLogin
      case 'game':
        return ctx.game
      case 'user': {
        if (extra?.user) return '@' + extra.user.displayName
        const recentUsers = ctx.recent.map((m) => m.user).filter((u): u is Chatter => !!u && !u.isBot)
        const u = recentUsers.length && rng.chance(0.8) ? rng.pick(recentUsers.slice(-12)) : pickChatter(ctx)
        return '@' + u.displayName
      }
      case 'n':
        return String(rng.int(1, 60))
      case 'h': // hours of a stream
        return String(rng.int(1, 9))
      case 'm': // minutes
        return String(rng.int(0, 59))
      case 'd': // days
        return String(rng.int(1, 30))
      case 'mo': // months
        return String(rng.int(1, 11))
      case 'y': // years
        return String(rng.int(1, 4))
      case 'big':
        return fmtBig(rng.int(1000, 999999))
      case 'country':
        return rng.pick(COUNTRIES)
      case 'spam':
        return extra?.spam ?? rng.pick(SPAM_WORDS)
      case 'SPAM':
        return (extra?.spam ?? rng.pick(SPAM_WORDS)).toUpperCase()
      case 'song':
        return rng.pick(BOT_LINES.songs)
      case 'clip':
        return 'Clip' + Math.floor(rng.next() * 1e8).toString(36)
      default:
        return ''
    }
  })
}

function poolsFor(ctx: Ctx, persona: string): { pools: PhrasePool[]; weights: number[] } {
  const { cfg } = ctx
  const mood = cfg.mode === 'hype' ? 'hype' : cfg.mood
  const pools: PhrasePool[] = []
  const weights: number[] = []
  const add = (p: PhrasePool, mult: number) => {
    pools.push(p)
    weights.push(p.weight * mult)
  }
  const dens = cfg.emoteDensity
  for (const [k, p] of Object.entries(GENERIC)) {
    let mult = 1
    if (k === 'emoteOnly') mult = dens * 2.2
    else if (k === 'emoteWord') mult = 0.4 + dens * 1.4
    else if (k === 'question') mult = (persona === 'questioner' ? 4 : 1) * (mood === 'general' ? 0.5 : 1)
    else if (k === 'pasta') mult = persona === 'yapper' ? 5 : 1
    else if (k === 'mention') mult = cfg.mentionsRate * 2
    else if (k === 'bits') mult = cfg.cheersRate * 1.5
    else if (k === 'ratio') mult = mood === 'toxic' ? 3 : 0.5
    else if (k === 'commands') mult = ctx.bots.length ? 1 : 0.4
    else if (k === 'streamerTalk') mult = mood === 'general' ? 0.4 : 1
    else if (k === 'lurk') mult = mood === 'general' ? 0.4 : 1
    add(p, mult)
  }
  const m = MOODS[mood] ?? MOODS.chill
  for (const [k, p] of Object.entries(m)) add(p, k.endsWith('2') ? 0.6 + dens * 1.5 : 2.2)
  if (persona === 'emoter') {
    add(GENERIC.emoteOnly, 30 * Math.max(0.3, dens))
    add(GENERIC.emoteWord, 12)
  }
  if (persona === 'hater' && mood !== 'wholesome') add(MOODS.toxic.tox1, mood === 'toxic' ? 10 : 3)
  if (persona === 'wholesome' && mood !== 'toxic') add(MOODS.wholesome.whole1, mood === 'wholesome' ? 8 : 2)
  if (persona === 'backseater' && (mood === 'gaming' || mood === 'clutch')) add(MOODS.gaming.game1, 12)
  if (persona === 'yapper') {
    add(MOODS.chill.chill1, 3)
    add(GENERIC.pasta, 5)
  }
  if (cfg.mode === 'hype') {
    add(MOODS.hype.hype1, 25)
    add(MOODS.reactions.react1, 10)
  }
  return { pools, weights }
}

function mannerisms(ctx: Ctx, text: string, persona: string): string {
  const { rng, cfg, registry } = ctx
  let t = text
  const hasPlaceholderEmote = registry.size() > 0
  const isCaps = t.length > 2 && t === t.toUpperCase() && /[A-Z]/.test(t)
  if (!isCaps) {
    if (rng.chance(0.55)) t = t.toLowerCase()
    else if (rng.chance(0.08)) t = t.toUpperCase()
  }
  // preserve emote codes' case (emote names are case sensitive) — re-inject known emotes
  t = t
    .split(' ')
    .map((w) => {
      const lower = w.toLowerCase()
      for (const name of registry.byName.keys()) if (name.toLowerCase() === lower && name !== w) return name
      return w
    })
    .join(' ')
  if (rng.chance(0.06)) t = t.replace(/o+([a-z]?)$/i, (m) => m + m.charAt(0).repeat(rng.int(1, 4)))
  if (rng.chance(0.07) && !/[!?.]$/.test(t)) t += rng.pick(['!', '!!', '?', '...', ' lol', ' lmao', ' xd'])
  if (persona === 'spammer' && rng.chance(0.4)) {
    const reps = rng.int(2, 4)
    t = Array(reps).fill(t).join(' ')
  }
  if (hasPlaceholderEmote && rng.chance(cfg.emoteDensity * 0.35)) {
    const e = rng.weighted(registry.list, registry.weights).name
    t = rng.chance(0.75) ? `${t} ${e}` : `${e} ${t}`
  }
  if (rng.chance(0.02)) {
    // a small typo
    const i = rng.int(0, Math.max(0, t.length - 2))
    if (/[a-z]/.test(t[i]) && /[a-z]/.test(t[i + 1] ?? '')) t = t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2)
  }
  return t.slice(0, 500)
}

function poolLine(ctx: Ctx): string {
  const { rng } = ctx
  const line = rng.pick(ctx.fillerPool!)
  let t = fill(ctx, line.text)
  if (ctx.registry.size() > 0 && rng.chance(ctx.cfg.emoteDensity * 0.3)) t = `${t} ${rng.weighted(ctx.registry.list, ctx.registry.weights).name}`
  return t
}

function genText(ctx: Ctx, user: Chatter): string {
  const { rng } = ctx
  if (ctx.fillerPool) return poolLine(ctx)
  const { pools, weights } = poolsFor(ctx, user.persona)
  const pool = rng.weighted(pools, weights)
  const line = rng.pick(pool.lines)
  return mannerisms(ctx, fill(ctx, line), user.persona)
}

// ---------------------------------------------------------------------------
// message construction
// ---------------------------------------------------------------------------

function makeMessage(ctx: Ctx, t: number, user: Chatter | undefined, text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  const { cfg, registry } = ctx
  // Twitch caps messages at 500 characters (also keeps pathological words from stalling the layout)
  if (text.length > 500) text = text.slice(0, 500)
  const parsed = user
    ? parseMessage(text, { registry, selfLogin: cfg.viewerName || undefined, cheers: true, animatedCheermotes: cfg.animatedEmotes })
    : { fragments: [{ kind: 'text', text }] as Fragment[], bits: 0 }
  const msg: ChatMessage = {
    id: ctx.nextId++,
    t,
    user,
    fragments: parsed.fragments,
    text,
    // badges / color as they are *now*: later !mod / !sub / gift notices must not restyle older rows
    badges: user?.badges,
    color: user ? user.color : undefined,
    ...extra,
  }
  if (parsed.bits) msg.bits = parsed.bits
  if (parsed.fragments.some((f) => f.kind === 'mention' && f.self)) msg.mentionsSelf = true
  ctx.recent.push(msg)
  if (ctx.recent.length > 40) ctx.recent.shift()
  return msg
}

function systemMessage(ctx: Ctx, t: number, kind: NonNullable<ChatMessage['notice']>['kind'], parts: NoticePart[], color?: string): ChatMessage {
  return {
    id: ctx.nextId++,
    t,
    fragments: [],
    text: parts.map((p) => p.text).join(''),
    notice: { kind, parts, color },
  }
}

function tierLabel(tier: 'prime' | 1 | 2 | 3): string {
  return tier === 'prime' ? 'Prime' : `Tier ${tier}`
}

function subNotice(ctx: Ctx, t: number, user: Chatter, tier: 'prime' | 1 | 2 | 3, months: number, message?: string, streak?: number, exact = false): ChatMessage {
  ctx.now = t
  // the notice and the badge must agree: a scripted "!sub bob t1 1" *sets* the months; a random resub can
  // only continue what the badge already shows
  if (!exact && user.subMonths >= months) months = user.subMonths + 1
  if (streak !== undefined && streak > months) streak = months
  const parts: NoticePart[] = [{ text: user.displayName, bold: true, color: 'name' }, { text: ' ' }, { text: 'Subscribed', bold: true }]
  if (tier === 'prime') parts.push({ text: ' with ' }, { text: 'Prime', color: 'link' }, { text: '.' })
  else parts.push({ text: ` at ${tierLabel(tier)}.` })
  if (months > 1) {
    parts.push({ text: " They've subscribed for " }, { text: `${months} months`, bold: true })
    if (streak && streak > 1 && streak <= months) parts.push({ text: ', currently on a ' }, { text: `${streak} month streak`, bold: true }, { text: '!' })
    else parts.push({ text: '!' })
  }
  // subscribing updates the user's badge (a scripted month count is what the badge shows from now on)
  if (user.subMonths !== months) {
    user.subMonths = months
    user.subTier = tier === 'prime' ? 1 : tier
    if (tier === 'prime') user.isPrime = true
    applyFlags(ctx, user, { subMonths: months, prime: tier === 'prime' || undefined, exactSubMonths: true })
  }
  const msg = message !== undefined && message !== '' ? makeMessage(ctx, t, user, message) : { id: ctx.nextId++, t, user, fragments: [] as Fragment[], text: '' }
  msg.notice = { kind: months > 1 ? 'resub' : 'sub', parts, iconColor: tier === 'prime' ? 'prime' : undefined }
  return msg
}

/** a gifter's running "gifted in the channel" total: starts at a plausible history, only ever grows */
const giftTotals = new WeakMap<Chatter, number>()
function giftTotal(ctx: Ctx, gifter: Chatter, add: number): number {
  const prev = giftTotals.get(gifter) ?? Math.round(Math.pow(ctx.rng.next(), 2) * 200)
  const total = prev + add
  giftTotals.set(gifter, total)
  return total
}

function giftNotice(ctx: Ctx, t: number, gifter: Chatter | null, recipient: Chatter, tier: 1 | 2 | 3, total?: number): ChatMessage {
  ctx.now = t
  const parts: NoticePart[] = gifter
    ? [{ text: gifter.displayName, bold: true, color: 'name' }, { text: ` gifted a ${tierLabel(tier)} sub to ` }, { text: recipient.displayName, bold: true, color: 'name' }, { text: '!' }]
    : [{ text: 'An anonymous user', bold: true }, { text: ` gifted a ${tierLabel(tier)} sub to ` }, { text: recipient.displayName, bold: true, color: 'name' }, { text: '!' }]
  if (gifter && total && total > 1) parts.push({ text: ` They have given ${total} Gift Subs in the channel!` })
  if (recipient.subMonths < 1) {
    recipient.subMonths = 1
    recipient.subTier = tier
    applyFlags(ctx, recipient, { subMonths: 1 })
  }
  return { id: ctx.nextId++, t, user: gifter ?? undefined, fragments: [], text: parts.map((p) => p.text).join(''), notice: { kind: 'gift', parts } }
}

function communityGiftNotice(ctx: Ctx, t: number, gifter: Chatter, count: number, tier: 1 | 2 | 3, total: number): ChatMessage {
  const parts: NoticePart[] = [
    { text: gifter.displayName, bold: true, color: 'name' },
    { text: ` is gifting ${count} ${tierLabel(tier)} Subs to ${ctx.streamerDisplay}'s community! They've gifted a total of ${total} in the channel!` },
  ]
  return { id: ctx.nextId++, t, user: gifter, fragments: [], text: parts.map((p) => p.text).join(''), notice: { kind: 'communitygift', parts } }
}

function raidNotice(ctx: Ctx, t: number, raider: Chatter, count: number): ChatMessage {
  const parts: NoticePart[] = [{ text: raider.displayName, bold: true, color: 'name' }, { text: ` is raiding with a party of ${fmtBig(count)}.` }]
  return { id: ctx.nextId++, t, user: raider, fragments: [], text: parts.map((p) => p.text).join(''), notice: { kind: 'raid', parts } }
}

function announcement(ctx: Ctx, t: number, color: string, text: string, user?: Chatter): ChatMessage {
  const u = user ?? ctx.broadcaster ?? undefined
  const msg = makeMessage(ctx, t, u, text)
  msg.notice = { kind: 'announcement', parts: [{ text: 'Announcement', bold: true }], color }
  return msg
}

// ---------------------------------------------------------------------------
// script application
// ---------------------------------------------------------------------------

function applyScriptEntry(ctx: Ctx, e: ScriptEntry, t: number, out: ChatMessage[], clears: number[]): ChatMessage[] {
  const { rng, cfg } = ctx
  const even = cfg.pacing === 'even'
  ctx.now = t
  const produced: ChatMessage[] = []
  const push = (m: ChatMessage) => {
    out.push(m)
    produced.push(m)
  }
  switch (e.type) {
    case 'chat': {
      const isNew = !!e.user && !ctx.byLogin.has(loginFor(e.user))
      const user = e.user ? resolveUser(ctx, e.user, e.flags) : e.first ? freshChatter(ctx, 'normal', true) : pickChatter(ctx, ctx.lastScriptUser)
      if (e.first && isNew && !Object.keys(e.flags).length) {
        // a named first-time chatter is brand new: no sub / bits history yet
        user.badges = user.badges.filter((b) => b.set === 'premium')
        user.subMonths = 0
        user.subTier = 0
        recordBadgeState(ctx, user, null)
      }
      ctx.lastScriptUser = user
      if (!e.user && Object.keys(e.flags).length) applyFlags(ctx, user, e.flags)
      let text = fill(ctx, e.text)
      if (e.cheer) text = `Cheer${e.cheer} ${text}`.trim()
      const m = makeMessage(ctx, t, user, text, {
        action: e.action,
        firstTime: e.first,
        highlighted: e.highlight,
        rewardName: e.reward,
        gigantified: e.gigantify,
        effect: e.effect,
      })
      if (e.deleteAfter) m.deletedAt = t + e.deleteAfter * 1000
      push(m)
      break
    }
    case 'sub': {
      const user = resolveUser(ctx, e.user)
      const streak = e.months > 1 && rng.chance(0.5) ? e.months : undefined
      push(subNotice(ctx, t, user, e.tier, e.months, e.message !== undefined ? fill(ctx, e.message) : undefined, streak, true))
      break
    }
    case 'gift': {
      const gifter = e.gifter ? resolveUser(ctx, e.gifter) : rng.chance(0.15) ? null : pickChatter(ctx)
      const recipient = e.recipient ? resolveUser(ctx, e.recipient) : pickChatter(ctx, gifter ?? undefined)
      push(giftNotice(ctx, t, gifter, recipient, e.tier, gifter ? giftTotal(ctx, gifter, 1) : undefined))
      break
    }
    case 'gifts': {
      const gifter = resolveUser(ctx, e.gifter)
      const total = giftTotal(ctx, gifter, e.count)
      push(communityGiftNotice(ctx, t, gifter, e.count, e.tier, total))
      let tt = t + (even ? 1 : 250)
      const got = new Set<Chatter>([gifter])
      for (let i = 0; i < Math.min(e.count, 25); i++) {
        let recipient = pickChatter(ctx, gifter)
        for (let k = 0; k < 6 && got.has(recipient); k++) recipient = pickChatter(ctx, gifter)
        got.add(recipient)
        push(giftNotice(ctx, tt, gifter, recipient, e.tier))
        tt += even ? 1 : rng.int(60, 220)
      }
      if (cfg.mode !== 'script') spawnReaction(ctx, t + 800, 'gifted', out, gifter)
      break
    }
    case 'raid': {
      const raider = resolveUser(ctx, e.raider)
      push(raidNotice(ctx, t, raider, e.count))
      produced.push(...spawnRaid(ctx, t, e.count, out, raider, cfg.mode !== 'script'))
      break
    }
    case 'announce':
      push(announcement(ctx, t, e.color, fill(ctx, e.text)))
      break
    case 'reply': {
      const target = resolveUser(ctx, e.target)
      const orig = [...ctx.recent].reverse().find((m) => m.user === target && !m.notice)
      const replier = e.user ? resolveUser(ctx, e.user) : pickChatter(ctx, target)
      ctx.lastScriptUser = replier
      const m = makeMessage(ctx, t, replier, fill(ctx, e.text), { reply: { displayName: target.displayName, text: orig?.text ?? '' } })
      push(m)
      break
    }
    case 'timeout': {
      if (!e.user) break // "!timeout" without a user would delete a random chatter's lines
      const user = resolveUser(ctx, e.user)
      for (const m of out) if (m.user === user && !m.notice && m.t <= t && !m.deletedAt) m.deletedAt = t
      // filler chat is generated afterwards: remember the ban so those messages obey it as well
      ctx.bans.push({ user, t, untilMs: t + Math.max(1, e.seconds) * 1000 })
      break
    }
    case 'system': {
      const k = e.kind
      const parts: NoticePart[] = []
      let kind: NonNullable<ChatMessage['notice']>['kind'] = 'system'
      if (k === 'clear') {
        clears.push(t)
        parts.push({ text: 'Chat has been cleared by a moderator.' })
        kind = 'clear'
      } else if (k === 'slow') {
        parts.push({ text: `This room is now in slow mode. You may send messages every ${e.value} seconds.` })
        kind = 'slow'
      } else if (k === 'slowoff') parts.push({ text: 'This room is no longer in slow mode.' })
      else if (k === 'emoteonly') {
        parts.push({ text: 'This room is now in emote-only mode.' })
        kind = 'emoteonly'
      } else if (k === 'emoteonlyoff') parts.push({ text: 'This room is no longer in emote-only mode.' })
      else if (k === 'followers') {
        parts.push({ text: e.value ? `This room is now in ${e.value}-minute followers-only mode.` : 'This room is now in followers-only mode.' })
        kind = 'followers'
      } else if (k === 'subsonly') {
        parts.push({ text: 'This room is now in subscribers-only mode.' })
        kind = 'subsonly'
      } else parts.push({ text: fill(ctx, e.text ?? '') })
      push(systemMessage(ctx, t, kind, parts))
      break
    }
    case 'burst': {
      let tt = t
      const spam = fill(ctx, e.text)
      const n = Math.min(e.count, 200)
      for (let i = 0; i < n; i++) {
        const u = pickChatter(ctx)
        const text = /\{/.test(e.text) ? fill(ctx, e.text) : spam
        push(makeMessage(ctx, tt, u, u.persona === 'spammer' && rng.chance(0.4) ? `${text} ${text}` : text))
        tt += even ? 1 : rng.exp(2200 / n)
      }
      break
    }
    case 'setuser': {
      const u = resolveUser(ctx, e.user)
      if (e.unmod) {
        u.isMod = false
        u.badges = u.badges.filter((b) => b.set !== 'moderator')
        applyFlags(ctx, u, {})
      } else applyFlags(ctx, u, e.flags)
      break
    }
    case 'user': {
      // "Display (login)" or plain name
      const m = e.user.match(/^(.+?)\s*\((\S+)\)$/)
      const u = resolveUser(ctx, m ? m[2] : e.user)
      // an explicit definition means "exactly these badges" (no random extras)
      u.badges = []
      u.isMod = false
      u.isVip = false
      u.isPrime = false
      u.subMonths = 0
      u.subTier = 0
      applyFlags(ctx, u, e.flags)
      if (e.flags.color) u.color = e.flags.color
      if (m) u.displayName = m[1].trim()
      else if (u.displayName.toLowerCase() === u.login && e.user !== e.user.toLowerCase()) u.displayName = e.user
      // named cast members should show up as random chatters too
      if (u.weight === 0) {
        u.weight = 0.6
        ctx.weights[ctx.chatters.indexOf(u)] = u.weight
      }
      break
    }
    case 'wait':
    case 'speed':
      break
  }
  void cfg
  return produced
}

// ---------------------------------------------------------------------------
// ambient generation
// ---------------------------------------------------------------------------

function speedAt(changes: { t: number; mult: number }[], t: number): number {
  let m = 1
  for (const c of changes) if (c.t <= t) m = c.mult
  return m
}

function generateAmbient(ctx: Ctx, durationMs: number, speedChanges: { t: number; mult: number }[], out: ChatMessage[], startMs = 0): void {
  const { rng, cfg } = ctx
  const t0 = Math.min(startMs, cfg.startDelayMs)
  const mpm = Math.max(0.5, cfg.messagesPerMinute)
  const baseRate = mpm / 60000 // per ms
  const hype = cfg.mode === 'hype'
  const even = cfg.pacing === 'even'
  // burst envelope: piecewise multipliers
  const bursts: { t0: number; t1: number; mult: number }[] = []
  {
    let t = t0
    while (t < durationMs) {
      const len = rng.float(2500, 14000)
      const sd = even ? 0 : cfg.burstiness * 0.9
      const mult = Math.exp(rng.gauss(-sd * sd * 0.5, sd))
      bursts.push({ t0: t, t1: t + len, mult })
      t += len
    }
  }
  const burstAt = (t: number) => {
    for (const b of bursts) if (t >= b.t0 && t < b.t1) return b.mult
    return 1
  }
  // 1) regular ambient messages (thinning of an inhomogeneous Poisson process)
  let maxBurst = 1
  for (const b of bursts) if (b.mult > maxBurst) maxBurst = b.mult
  let maxSpeed = 1
  for (const c of speedChanges) if (c.mult > maxSpeed) maxSpeed = c.mult
  const maxRate = baseRate * maxBurst * maxSpeed
  let t = startMs < 0 ? startMs : cfg.startDelayMs
  let lastUser: Chatter | undefined
  let lastBotAt = -1e9
  const raidWindows: { t0: number; t1: number; users: Chatter[] }[] = []
  ctx.raidWindows = raidWindows
  // scripted rows already sit on the metronome (mixed mode): a filler message must not take their moment
  const scripted = even ? out.filter((m) => m.t >= (startMs < 0 ? startMs : cfg.startDelayMs)).map((m) => m.t).sort((a, b) => a - b) : []
  let scriptedIdx = 0
  while (t < durationMs) {
    if (even) {
      // metronomic: one message per interval (speed changes still apply)
      const step = 60000 / (mpm * speedAt(speedChanges, t))
      const tPrev = t
      t += step
      if (t >= durationMs) break
      while (scriptedIdx < scripted.length && scripted[scriptedIdx] <= tPrev) scriptedIdx++
      if (scriptedIdx < scripted.length && scripted[scriptedIdx] <= t + step * 0.5) {
        // a scripted row lands in this interval: it *is* this beat
        t = Math.max(t, scripted[scriptedIdx])
        scriptedIdx++
        continue
      }
    } else {
      t += rng.exp(1 / maxRate)
      if (t >= durationMs) break
      const rate = baseRate * burstAt(t) * speedAt(speedChanges, t)
      if (rng.next() > rate / maxRate) continue
    }
    const m = ambientMessage(ctx, t, lastUser)
    if (m) {
      out.push(m)
      lastUser = m.user
      // bot replies to commands
      if (ctx.bots.length && m.user && !m.user.isBot && m.text.startsWith('!') && BOT_LINES.replies[m.text.split(' ')[0]] && t - lastBotAt > 4000 && rng.chance(0.85)) {
        const bot = rng.pick(ctx.bots)
        const tpl = rng.pick(BOT_LINES.replies[m.text.split(' ')[0]])
        const text = fill(ctx, tpl.replace(/\{user\}/g, m.user.displayName))
        out.push(makeMessage(ctx, t + rng.int(300, 1200), bot, text))
        lastBotAt = t
      }
    }
  }
  // periodic bot announcements
  if (ctx.bots.length && cfg.botsEnabled) {
    let bt = t0 + rng.float(8000, 25000)
    while (bt < durationMs) {
      const bot = ctx.bots[0]
      out.push(makeMessage(ctx, bt, bot, fill(ctx, rng.pick(BOT_LINES.periodic))))
      bt += rng.float(90000, 240000)
    }
  }
  // 2) reaction moments
  {
    const perMin = even ? 0 : hype ? 7 : cfg.reactionMoments * 4
    let mt = t0 + rng.exp(60000 / Math.max(0.01, perMin))
    while (perMin > 0 && mt < durationMs) {
      spawnMoment(ctx, mt, out, mpm * burstAt(mt) * speedAt(speedChanges, mt))
      mt += rng.exp(60000 / perMin)
    }
  }
  // 3) notices (subs, gifts, raids, announcements)
  const poisson = (perMin: number, fn: (t: number) => void) => {
    if (perMin <= 0) return
    let nt = t0 + rng.exp(60000 / perMin)
    while (nt < durationMs) {
      fn(nt)
      nt += rng.exp(60000 / perMin)
    }
  }
  poisson(cfg.subsRate * (0.3 + mpm / 45), (nt) => {
    const user = rng.chance(0.3) ? freshChatter(ctx) : pickChatter(ctx)
    const prime = rng.chance(cfg.primeRatio + 0.15)
    const tier: 'prime' | 1 | 2 | 3 = prime ? 'prime' : rng.weighted([1, 2, 3], [90, 7, 3])
    const months = rng.chance(0.35) ? 1 : Math.max(2, Math.round(Math.pow(rng.next(), 1.6) * 60))
    const streak = months > 1 && rng.chance(0.55) ? (rng.chance(0.6) ? months : rng.int(2, months)) : undefined
    const msgTpl = rng.chance(0.65) ? rng.pick(SUB_MESSAGES) : ''
    const message = msgTpl ? mannerisms(ctx, fill(ctx, msgTpl.replace('{n}', String(months))), 'normal') : undefined
    out.push(subNotice(ctx, nt, user, tier, months, message, streak))
    if (rng.chance(0.5)) spawnReaction(ctx, nt + 600, 'sub', out, user)
  })
  poisson(cfg.giftsRate * (0.15 + mpm / 90), (nt) => {
    const gifter = rng.chance(0.1) ? null : pickChatter(ctx)
    if (gifter && rng.chance(0.3)) {
      const count = rng.weighted([5, 10, 20, 50, 100], [50, 30, 12, 6, 2])
      const total = giftTotal(ctx, gifter, count)
      out.push(communityGiftNotice(ctx, nt, gifter, count, 1, total))
      let tt = nt + 250
      const got = new Set<Chatter>([gifter])
      for (let i = 0; i < Math.min(count, 20); i++) {
        let recipient = pickChatter(ctx, gifter)
        for (let k = 0; k < 6 && got.has(recipient); k++) recipient = pickChatter(ctx, gifter)
        got.add(recipient)
        out.push(giftNotice(ctx, tt, gifter, recipient, 1))
        tt += rng.int(60, 200)
      }
      spawnReaction(ctx, nt + 900, 'gifted', out, gifter)
    } else {
      out.push(giftNotice(ctx, nt, gifter, pickChatter(ctx, gifter ?? undefined), rng.chance(0.93) ? 1 : 2, gifter ? giftTotal(ctx, gifter, 1) : undefined))
      if (rng.chance(0.4)) spawnReaction(ctx, nt + 700, 'gifted', out, gifter ?? undefined)
    }
  })
  poisson(cfg.raidsRate * (0.05 + mpm / 500), (nt) => {
    const raider = freshChatter(ctx)
    raider.badges = sortBadges([makeBadge('partner', '1'), ...raider.badges.filter((b) => b.set !== 'partner')].filter(() => rng.chance(0.9)))
    const count = Math.round(Math.pow(rng.next(), 2.5) * 3000) + rng.int(3, 40)
    out.push(raidNotice(ctx, nt, raider, count))
    spawnRaid(ctx, nt, count, out, raider)
  })
  poisson(cfg.announcementRate * (0.08 + mpm / 300), (nt) => {
    const lines = [
      'Follow the socials! twitter.com/{login} | youtube.com/@{login}', 'Drops are enabled for this stream!', 'New emotes are live for subs! Check them out.',
      'Reminder: be kind in chat and follow the rules.', 'Giveaway at the end of stream, stay tuned!', 'Merch is live at {login}.shop',
      'Sub goal: {n}/100 for a 24h stream!', 'Join the Discord: discord.gg/{login}', 'Next stream: tomorrow, same time!', 'We hit {big} followers, thank you all!',
    ]
    const colors = ['#9147ff', '#9147ff', '#1f69ff', '#00f593', '#ffa500']
    out.push(announcement(ctx, nt, rng.pick(colors), fill(ctx, rng.pick(lines)), rng.chance(0.6) ? ctx.chatters.find((c) => c.isMod && !c.isBot) ?? ctx.broadcaster ?? undefined : ctx.broadcaster ?? undefined))
  })
}

function ambientMessage(ctx: Ctx, t: number, lastUser?: Chatter): ChatMessage | null {
  const { rng, cfg } = ctx
  // raid chatters for a while after a raid
  const raidWin = (ctx.raidWindows ?? []).find((w) => t >= w.t0 && t < w.t1)
  let user: Chatter
  let special: ChatMessage['special']
  if (raidWin && rng.chance(0.35) && raidWin.users.length) {
    user = rng.pick(raidWin.users)
    if (rng.chance(0.4)) special = { label: 'Raider', icon: 'raider' }
  } else user = pickChatter(ctx, lastUser)
  const extra: Partial<ChatMessage> = {}
  let text: string
  const r = rng.next()
  if (r < cfg.firstTimeRate * 0.08) {
    user = freshChatter(ctx, 'normal', true)
    text = ctx.fillerPool ? poolLine(ctx) : mannerisms(ctx, fill(ctx, rng.pick(FIRST_TIME_LINES)), 'normal')
    extra.firstTime = true
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05) {
    text = ctx.fillerPool ? poolLine(ctx) : mannerisms(ctx, fill(ctx, rng.pick(HIGHLIGHT_LINES)), 'normal')
    extra.highlighted = true
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05 + cfg.replyRate * 0.09 && ctx.recent.length > 2) {
    const candidates = ctx.recent.filter((m) => m.user && m.user !== user && !m.notice && !m.user.isBot).slice(-10)
    if (candidates.length) {
      const orig = rng.pick(candidates)
      extra.reply = { displayName: orig.user!.displayName, text: orig.text }
      const p = rng.pick(GENERIC.mention.lines)
      text = ctx.fillerPool ? poolLine(ctx) : mannerisms(ctx, fill(ctx, p.replace('{user} ', ''), { user: orig.user! }), user.persona)
    } else text = genText(ctx, user)
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05 + cfg.replyRate * 0.09 + cfg.deleteRate * 0.03) {
    text = ctx.fillerPool ? poolLine(ctx) : mannerisms(ctx, fill(ctx, rng.pick(MOODS.toxic.tox1.lines)), 'hater')
    extra.deletedAt = t + rng.int(800, 4000)
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05 + cfg.replyRate * 0.09 + cfg.deleteRate * 0.03 + cfg.actionsRate * 0.03) {
    text = fill(ctx, rng.pick(['is dancing {e:jam}', 'waves at chat', 'is lurking', 'claps', 'is confused', 'is crying', 'is hyped', 'is eating', 'is back', 'is here', 'left the chat', 'is vibing', 'screams', 'sighs', 'is speechless']))
    extra.action = true
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05 + cfg.replyRate * 0.09 + cfg.deleteRate * 0.03 + cfg.actionsRate * 0.03 + cfg.powerUpsRate * 0.03) {
    if (rng.chance(0.5)) {
      const e = ctx.registry.size() ? rng.weighted(ctx.registry.list, ctx.registry.weights).name : ''
      text = e || genText(ctx, user)
      extra.gigantified = !!e
    } else {
      text = genText(ctx, user)
      extra.effect = rng.pick(['rainbow-eclipse', 'simmer', 'cosmic-abyss'])
    }
  } else if (r < cfg.firstTimeRate * 0.08 + cfg.highlightRate * 0.05 + cfg.replyRate * 0.09 + cfg.deleteRate * 0.03 + cfg.actionsRate * 0.03 + cfg.powerUpsRate * 0.03 + cfg.rewardRate * 0.03) {
    text = ctx.fillerPool ? poolLine(ctx) : mannerisms(ctx, fill(ctx, rng.pick(HIGHLIGHT_LINES)), 'normal')
    extra.rewardName = rng.pick(['Ask a question', 'Song request', 'Message on screen', 'TTS', 'Rate my setup', 'Say hi', 'Water break', 'Choose the next game', 'Hydrate!', 'Emote-only chat'])
  } else if (ctx.fillerPool) {
    const line = rng.pick(ctx.fillerPool)
    if (line.user) user = resolveUser(ctx, line.user)
    text = fill(ctx, line.text)
    if (ctx.registry.size() > 0 && rng.chance(cfg.emoteDensity * 0.3)) text = `${text} ${rng.weighted(ctx.registry.list, ctx.registry.weights).name}`
  } else {
    text = genText(ctx, user)
  }
  if (!text.trim()) return null
  return makeMessage(ctx, t, user, text, { ...extra, special })
}

function spawnMoment(ctx: Ctx, t: number, out: ChatMessage[], mpmNow: number): void {
  const { rng, cfg } = ctx
  const mood = cfg.mode === 'hype' ? 'hype' : cfg.mood
  const catWeights = MOMENTS.map((m) => {
    let w = m.weight
    if (mood === 'funny' && m.cat === 'laugh') w *= 3
    if ((mood === 'hype' || mood === 'clutch') && (m.cat === 'hype' || m.cat === 'clap' || m.cat === 'spamword')) w *= 3
    if (mood === 'gaming' && (m.cat === 'fail' || m.cat === 'scared' || m.cat === 'clap')) w *= 2.5
    if (mood === 'music' && m.cat === 'jam') w *= 4
    if (mood === 'wholesome' && (m.cat === 'love' || m.cat === 'wave')) w *= 3
    if (mood === 'toxic' && (m.cat === 'cringe' || m.cat === 'fail')) w *= 3
    if (mood === 'chill' && (m.cat === 'jam' || m.cat === 'love' || m.cat === 'wave')) w *= 2
    if (mood === 'general') {
      if (m.cat === 'hype' || m.cat === 'clap' || m.cat === 'spamword' || m.cat === 'laugh') w *= 2
      if (m.cat === 'sad' || m.cat === 'fail' || m.cat === 'scared' || m.cat === 'jam') w *= 0.35
    }
    return w
  })
  const moment = rng.weighted(MOMENTS, catWeights)
  const spam = rng.pick(SPAM_WORDS)
  const perSec = mpmNow / 60
  const dur = rng.float(1800, 6000)
  const n = Math.max(3, Math.min(120, Math.round(perSec * (dur / 1000) * rng.float(1.5, 3.5) + 2)))
  let last: Chatter | undefined
  const poolSpam = ctx.fillerPool ? rng.pick(ctx.fillerPool).text : null
  for (let i = 0; i < n; i++) {
    const u = pickChatter(ctx, last)
    last = u
    // clustered near the start of the moment
    const dt = Math.pow(rng.next(), 1.6) * dur
    let text: string
    if (poolSpam !== null) text = rng.chance(0.6) ? fill(ctx, poolSpam) : poolLine(ctx)
    else {
      const line = rng.pick(moment.lines)
      text = fill(ctx, line, { spam })
      if (u.persona === 'spammer' && rng.chance(0.5)) text = `${text} ${text}`
      if (rng.chance(0.15)) text = text.toUpperCase()
    }
    out.push(makeMessage(ctx, t + dt, u, text))
  }
}

function spawnReaction(ctx: Ctx, t: number, kind: 'sub' | 'gifted' | 'raid', out: ChatMessage[], about?: Chatter): void {
  const { rng, cfg } = ctx
  const lines =
    kind === 'sub'
      ? ['welcome {user}!', 'W sub', 'POGGERS', 'welcome to the fam', 'ty for the sub {user}', 'sub hype', '{e:hype}', 'W', 'welcome!', 'lets go {user}', 'another one', 'thank you {user} {e:love}']
      : kind === 'gifted'
        ? ['ty for the gifted!', 'thank you for the gifted subs {user}!', 'W gifter', 'GIFTED', 'POGGERS gifted', 'gift bomb', 'thank you {user} {e:love}', 'GIFTERS', 'ty {user}', 'W {user}', '{e:hype}', 'gifted subs pog', 'thanks for the sub {user}!!', 'omg thank you', 'we love {user}']
        : ['welcome raiders!', 'RAID', 'raid hype', 'hi raiders {e:wave}', 'welcome raiders {e:love}', 'RAIDERS', 'welcome welcome', 'RAID {e:hype}', 'raid pog', 'hello raiders', 'W raid', 'thanks for the raid {user}!']
  const n = Math.max(2, Math.min(40, Math.round((cfg.messagesPerMinute / 60) * 3 * rng.float(0.6, 1.5) + 1)))
  let last: Chatter | undefined
  for (let i = 0; i < n; i++) {
    const u = pickChatter(ctx, last)
    last = u
    const dt = Math.pow(rng.next(), 1.4) * 5000
    const text = mannerisms(ctx, fill(ctx, rng.pick(lines), about ? { user: about } : undefined), u.persona)
    out.push(makeMessage(ctx, t + dt, u, text))
  }
}

function spawnRaid(ctx: Ctx, t: number, count: number, out: ChatMessage[], raidingStreamer?: Chatter, withReactions = true): ChatMessage[] {
  const { rng } = ctx
  const created: ChatMessage[] = []
  const raiders: Chatter[] = []
  const n = Math.min(60, Math.max(4, Math.round(Math.sqrt(count) * 1.5)))
  // raiders come from another channel: no sub/bits badges here (maybe Prime / global badges)
  for (let i = 0; i < n; i++) raiders.push(freshChatter(ctx, rng.chance(0.4) ? 'emoter' : 'normal', true))
  const raidMsg = fill(ctx, rng.pick(['{e:hype} RAID {e:hype}', 'twitchRaid twitchRaid twitchRaid', '{e:hype} {e:hype} {e:hype}', 'RAID RAID RAID', '{e:love} RAID {e:love}', 'we are here {e:hype}', 'RAIDERS HERE', 'hello from the raid {e:wave}', 'RAID', 'twitchRaid', 'twitchRaid RAID twitchRaid', '{e:jam} RAID {e:jam}']))
  const even = ctx.cfg.pacing === 'even'
  let tt = t + (even ? 1 : 300)
  for (const r of raiders) {
    const text = rng.chance(0.6) ? raidMsg : fill(ctx, rng.pick(['hi {e:wave}', 'raid {e:hype}', 'hello!', 'RAID', 'we come in peace', 'nice stream', 'what game is this', 'hi chat', 'RAIDDD', 'raiders {e:hype}', 'raid time', 'we made it', 'hello new streamer', 'twitchRaid', 'RAID {e:hype}', 'ayo raid', 'first time here from the raid', 'this stream looks cool', 'greetings {e:wave}', 'raid squad', 'RAAAID']))
    const m = makeMessage(ctx, tt, r, text, { special: rng.chance(0.5) ? { label: 'Raider', icon: 'raider' } : undefined })
    out.push(m)
    created.push(m)
    tt += even ? 1 : rng.exp(4500 / n)
  }
  ;(ctx.raidWindows ??= []).push({ t0: t, t1: t + 90000, users: raiders })
  if (withReactions) spawnReaction(ctx, t + 1500, 'raid', out, raidingStreamer)
  return created
}

/**
 * Metronomic pacing: re-times messages so consecutive ones are exactly `gap` apart (in order),
 * keeping deliberate pauses (gaps much longer than the interval, e.g. !wait) and the pre-fill region.
 */
function evenOut(messages: ChatMessage[], gap: number, speedChanges: { t: number; mult: number }[]): void {
  if (!messages.length) return
  // original times, so moments that are not messages (deletions by a timeout) can be re-timed the same way
  const origT = new Map<ChatMessage, number>(messages.map((m) => [m, m.t]))
  const q = (v: number) => Math.round(v * 1000) / 1000 // µs grid: no float dust on frame boundaries
  const before = messages.filter((m) => m.t < 0)
  const after = messages.filter((m) => m.t >= 0)
  // pre-fill: walk backwards from 0
  for (let i = before.length - 1, k = 1; i >= 0; i--, k++) before[i].t = q(-k * gap)
  if (after.length) {
    let prevOrig = after[0].t
    let prevNew = after[0].t
    for (let i = 1; i < after.length; i++) {
      const orig = after[i].t
      const origGap = orig - prevOrig
      // "!speed" still applies to the metronome (rate changes are stamped in original time)
      const step = gap / speedAt(speedChanges, prevOrig)
      // explicit pauses (!wait, +N) are kept exactly; other far-apart timings (@N) at least keep their distance
      const wanted = Math.max(step, after[i].minGapBefore ?? 0, origGap > gap * 2.5 && !after[i].minGapBefore ? origGap : 0)
      let newT = prevNew + wanted
      // a deliberately placed row (@N, +N, after !wait) stays at its moment — later rows continue from it
      if (after[i].pinned && orig >= prevNew + 1) newT = orig
      prevOrig = orig
      after[i].t = q(newT)
      prevNew = after[i].t
    }
  }
  // deletions: the timeout happened at an original moment T — move it like the last row before T moved
  const rows = [...messages].sort((a, b) => origT.get(a)! - origT.get(b)!)
  const mapTime = (T: number) => {
    let lo = 0
    let hi = rows.length - 1
    let k = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (origT.get(rows[mid])! <= T) {
        k = mid
        lo = mid + 1
      } else hi = mid - 1
    }
    if (k < 0) return T
    return rows[k].t + (T - origT.get(rows[k])!)
  }
  for (const m of messages) if (m.deletedAt !== undefined) m.deletedAt = Math.max(m.t, q(mapTime(m.deletedAt)))
  messages.sort((a, b) => a.t - b.t || a.id - b.id)
}

export function timelineStats(tl: Timeline): { messages: number; chatters: number; notices: number } {
  return {
    messages: tl.messages.filter((m) => !m.notice).length,
    chatters: new Set(tl.messages.map((m) => m.user?.login).filter(Boolean)).size,
    notices: tl.messages.filter((m) => m.notice).length,
  }
}

export function seedFromString(s: string): number {
  return hashString(s)
}
