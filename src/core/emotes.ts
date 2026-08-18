import twitchEmotesJson from '../data/twitchEmotes.json'
import seventvEmotesJson from '../data/seventvEmotes.json'
import type { EmoteDef, EmoteProvider, Fragment } from './types'
import { cheerTier } from './colors'

interface RawEmote {
  name: string
  id: string
  animated: boolean
}

/** Popularity weights for ambient chat (higher = used more often). Unlisted = 1. */
const POPULARITY: Record<string, number> = {
  KEKW: 40, OMEGALUL: 30, LUL: 40, PogChamp: 22, POGGERS: 20, Pog: 18, PogU: 14, monkaS: 18, monkaW: 10, Sadge: 20,
  PepeLaugh: 22, catJAM: 14, LULW: 12, Kappa: 16, peepoClap: 10, Bedge: 14, ICANT: 14, HUH: 12, xdd: 12, Aware: 10,
  WICKED: 8, Clueless: 12, Prayge: 10, Madge: 12, Okayge: 10, PauseChamp: 8, Pepega: 12, widepeepoHappy: 10,
  peepoGiggles: 6, KEKL: 6, YEP: 8, NOTED: 8, ratJAM: 8, PepoDance: 8, pepeMeltdown: 6, EDM: 4, Jammies: 5, LETSGO: 12,
  HYPERS: 8, KEKWait: 8, 'D:': 12, forsenE: 4, PepeHands: 12, monkaHmm: 6, widepeepoSad: 8, Chatting: 8, Deadge: 8,
  Susge: 8, Despairge: 6, GIGACHAD: 10, Chad: 4, catKISS: 6, weirdChamp: 6, WeirdChamp: 6, Cheems: 4, dogJAM: 5,
  AlienPls: 5, PogO: 8, MODS: 8, Weirdge: 6, EZ: 12, '5Head': 8, '3Head': 6, monkaGIGA: 4, PepeS: 4, Sussy: 4,
  POGCRAZY: 6, OOOO: 8, GAGAGA: 6, LOL: 6, LMAO: 6, dankHug: 4, peepoHug: 6, peepoLove: 6, catPls: 4, ThisIsFine: 6,
  Nerdge: 6, Smadge: 6, Pointge: 6, Corpa: 6, classic: 6, Homie: 4, forsenPls: 4, PepePls: 4, docPls: 4, peepoDance: 5,
  LETSGOOO: 8, W: 14, L: 10, ratio: 6, gg: 8, F: 10, POGGIES: 6, peepoBlush: 4, Blushge: 4, yes: 4, no: 4, hi: 6, bye: 5,
  peepoHappy: 8, peepoSad: 8, FeelsBadMan: 8, FeelsGoodMan: 8, FeelsStrongMan: 6, FeelsOkayMan: 6, FeelsWeirdMan: 5,
  FeelsDankMan: 5, monkaEyes: 4, monkaOMEGA: 4, Basedge: 6, Cringed: 4, Kapp: 8, KappaHD: 3, Jebaited: 6, peepoThink: 4,
  Thinkge: 4, monkaThink: 4, Hmmge: 4, hmm: 4, LULE: 3, haha: 3, KEKLEO: 3, OMEGAKEKW: 4, xqcL: 6, xqcKEK: 4, peepoSip: 5,
  Sip: 5, monkaSip: 3, GoodMorning: 3, gm: 3, gn: 3, Clap: 12, Clap2: 4, peepoHey: 6, peepoLeave: 6, peepoArrive: 6,
  peepoRun: 4, peepoTalk: 6, peepoShy: 4, Stare: 8, AYAYA: 6, RareParrot: 3, PartyParrot: 4, PETPET: 3, PepePls_: 1,
  gachiBASS: 4, gachiGASM: 3, WAYTOODANK: 5, ppL: 5, glorp: 4, xar2EDM: 3, TriKool: 4, EZ_: 1,
  BibleThump: 8, Kreygasm: 6, '4Head': 6, DansGame: 6, FailFish: 6, ResidentSleeper: 8, HeyGuys: 8, SeemsGood: 6,
  NotLikeThis: 8, KappaPride: 3, TriHard: 4, cmonBruh: 5, WutFace: 5, PJSalt: 5, BabyRage: 5, SwiftRage: 4, VoHiYo: 4,
  MingLee: 3, CoolStoryBob: 3, TwitchUnity: 2, GivePLZ: 3, TakeNRG: 3, PunOko: 4, OpieOP: 3, KomodoHype: 3,
  MrDestructoid: 4, Keepo: 3, BloodTrail: 2, SMOrc: 3, CoolCat: 3, OhMyDog: 3, PowerUpL: 3, PowerUpR: 3, GlitchCat: 3,
  DatSheffy: 2, TearGlove: 2, BOP: 2, HSCheers: 2, HSWP: 2, KappaClaus: 1, KappaRoss: 2, Kippa: 1, MorphinTime: 1,
  NinjaGrumpy: 2, NomNom: 3, OSFrog: 3, PeoplesChamp: 2, PraiseIt: 3, PrimeMe: 2, RaccAttack: 2, RlyTho: 3, SabaPing: 2,
  SeriousSloth: 2, ShadyLulu: 2, Squid1: 1, Squid2: 1, Squid3: 1, Squid4: 1, SSSsss: 2, StinkyCheese: 2, TBAngel: 2,
  TheIlluminati: 2, TheThing: 1, ThunBeast: 2, TombRaid: 1, TwitchSings: 1, UWot: 3, VoteNay: 2, VoteYea: 2, WholeWheat: 1,
  YouDontSay: 3, YouWHY: 3, bleedPurple: 3, CarlSmile: 2, CoolCat_: 1, DarkMode: 2, DoritosChip: 2, duDudu: 2, DxCat: 2,
  FBtouchdown: 2, FUNgineer: 2, HotPokket: 2, imGlitch: 2, KAPOW: 3, KonCha: 2, MaxLOL: 3, ModLove: 2, PartyHat: 2,
  PartyTime: 2, PopCorn: 3, SingsMic: 1, SUBprise: 2, ThankEgg: 2, VirtualHug: 3, BatChest: 3, MercyWing1: 1, MercyWing2: 1,
  DBstyle: 1, ImTyping: 2, TwitchConHYPE: 1, StinkyGlitch: 1, PogBones: 3, KEKHeim: 2, LaundryBasket: 1, BrokeBack: 1,
  CurseLit: 2, FrankerZ: 3, ItsBoshyTime: 1, KappaWealth: 2, MVGame: 1, PanicVis: 2, PermaSmug: 2, PicoMause: 1,
  PipeHype: 1, PJSugar: 1, PMSTwin: 1, PRChase: 1, PunchTrees: 1, RalpherZ: 1, RedCoat: 1, RitzMitz: 1, RuleFive: 1,
  ShazBotstix: 1, Shush: 2, SoBayed: 1, SoonerLater: 1, StoneLightning: 1, StrawBeary: 1, SuperVinlin: 1, TF2John: 1,
  TheRinger: 1, TheTarFu: 1, TinyFace: 1, TooSpicy: 1, TPFufun: 1, TTours: 1, twitchRaid: 3, TwitchVotes: 1, UnSane: 1,
  UncleNox: 1, WTRuck: 1, BegWan: 1, BigBrother: 1, BigPhish: 1, BlargNaut: 1, BuddhaBar: 1, ChefFrank: 1, copyThis: 2,
  CorgiDerp: 2, CrreamAwk: 1, DAESuppy: 1, DendiFace: 1, DogFace: 2, EarthDay: 1, EntropyWins: 1, ExtraLife: 1,
  FBBlock: 1, FBCatch: 1, FBChallenge: 1, FBPass: 1, FBPenalty: 1, FBRun: 1, FBSpiral: 1, FootBall: 1, FootGoal: 1,
  FootYellow: 1, FreakinStinkin: 1, FunRun: 1, FutureMan: 1, GingerPower: 1, GunRun: 1, HassaanChop: 1, HolidayCookie: 1,
  HolidayLog: 1, HolidayPresent: 1, HolidaySanta: 1, HolidayTree: 1, InuyoFace: 1, JKanStyle: 1, JonCarnage: 1, Kappu: 1,
  KevinTurtle: 1, MikeHogu: 1, OptimizePrime: 1, PatBaby: 1, Poooound: 1, SingsNote: 1, TwitchRPG: 1, GlitchNRG: 1,
  GlitchLit: 1, TwitchLit: 1,
}

/** Emote sets that mean something in "reaction moments" (crowd spam). */
export const REACTION_EMOTES: Record<string, string[]> = {
  laugh: ['KEKW', 'OMEGALUL', 'LUL', 'LULW', 'PepeLaugh', 'ICANT', 'KEKL', 'OMEGALUL', 'KEKW', 'LOL', 'LMAO', 'xdd'],
  hype: ['PogChamp', 'POGGERS', 'Pog', 'PogU', 'LETSGO', 'LETSGOOO', 'HYPERS', 'POGCRAZY', 'W', 'PogChamp', 'OOOO', 'catJAM', 'peepoClap', 'Clap'],
  sad: ['Sadge', 'PepeHands', 'widepeepoSad', 'BibleThump', 'FeelsBadMan', 'D:', 'Despairge', 'Deadge', 'NotLikeThis'],
  scared: ['monkaS', 'monkaW', 'monkaGIGA', 'monkaEyes', 'PauseChamp', 'D:', 'monkaS', 'WutFace'],
  cringe: ['Weirdge', 'WeirdChamp', 'weirdChamp', 'Cringed', 'Susge', 'MODS', 'Bedge', 'ResidentSleeper', 'Clueless', 'HUH'],
  clap: ['Clap', 'peepoClap', 'Clap2', 'EZ', 'gg', 'W', 'GIGACHAD', 'Basedge'],
  love: ['peepoLove', 'catKISS', 'peepoHug', 'dankHug', 'VirtualHug', 'widepeepoHappy', 'AYAYA', 'peepoHappy', 'Kreygasm'],
  jam: ['catJAM', 'ratJAM', 'dogJAM', 'PepoDance', 'peepoDance', 'Jammies', 'EDM', 'AlienPls', 'TriKool', 'PartyParrot', 'RareParrot'],
  wave: ['peepoHey', 'HeyGuys', 'peepoArrive', 'hi', 'VoHiYo', 'KonCha', 'GoodMorning'],
  bye: ['peepoLeave', 'bye', 'peepoRun', 'Sadge', 'FeelsOkayMan'],
  think: ['peepoThink', 'Thinkge', 'monkaThink', 'Hmmge', 'hmm', 'Hmm', 'monkaHmm', '5Head', 'Clueless'],
  stare: ['Stare', 'Aware', 'HUH', 'PauseChamp', 'Bedge', 'Okayge', 'peepoTalk'],
  fail: ['FailFish', 'NotLikeThis', 'Sadge', 'KEKW', 'ICANT', 'OMEGALUL', 'L', 'ratio', 'DansGame', 'PJSalt', 'BabyRage', 'SwiftRage', 'Madge'],
}

export function twitchEmoteUrl(id: string, scale: 1 | 2 | 3 = 1): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/${scale}.0`
}
export function seventvEmoteUrl(id: string, scale: 1 | 2 | 3 | 4 = 1): string {
  return `https://cdn.7tv.app/emote/${id}/${scale}x.webp`
}
export function ffzEmoteUrl(id: string, scale: 1 | 2 | 4 = 1): string {
  return `https://cdn.frankerfacez.com/emote/${id}/${scale}`
}
export function cheermoteUrl(tier: number, animated: boolean, scale: 1 | 2 | 4 = 1): string {
  return `https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/${animated ? 'animated' : 'static'}/${tier}/${scale}${animated ? '.gif' : '.png'}`
}

export function emoteUrl(e: EmoteDef, hi = false): string {
  if (e.url) return e.url
  switch (e.provider) {
    case 'twitch':
      return twitchEmoteUrl(e.id, hi ? 3 : 1)
    case '7tv':
      return seventvEmoteUrl(e.id, hi ? 4 : 1)
    case 'ffz':
      return ffzEmoteUrl(e.id, hi ? 4 : 1)
    case 'bttv':
      return `https://cdn.betterttv.net/emote/${e.id}/${hi ? '3x' : '1x'}`
    default:
      return e.url ?? ''
  }
}

export const TWITCH_GLOBAL_EMOTES: EmoteDef[] = (twitchEmotesJson as RawEmote[]).map((e) => ({
  name: e.name,
  id: e.id,
  provider: 'twitch' as EmoteProvider,
  animated: e.animated,
  weight: POPULARITY[e.name] ?? 1,
}))

export const SEVENTV_EMOTES: EmoteDef[] = (seventvEmotesJson as RawEmote[]).map((e) => ({
  name: e.name,
  id: e.id,
  provider: '7tv' as EmoteProvider,
  animated: e.animated,
  weight: POPULARITY[e.name] ?? 2,
}))

/** A resolved emote registry: name -> def, plus a weighted list for random picks. */
export class EmoteRegistry {
  readonly byName = new Map<string, EmoteDef>()
  readonly list: EmoteDef[] = []
  readonly weights: number[] = []

  private allowAnimated: boolean

  constructor(sets: EmoteDef[][], allowAnimated = true) {
    this.allowAnimated = allowAnimated
    for (const set of sets) {
      for (const e of set) {
        if (this.byName.has(e.name)) continue
        this.byName.set(e.name, e)
      }
    }
    for (const e of this.byName.values()) {
      if (!this.allowAnimated && e.animated) continue
      this.list.push(e)
      this.weights.push(e.weight ?? 1)
    }
  }

  get(name: string): EmoteDef | undefined {
    return this.byName.get(name)
  }
  has(name: string): boolean {
    return this.byName.has(name)
  }
  /** first available emote out of a preference list */
  firstOf(names: string[]): EmoteDef | undefined {
    for (const n of names) {
      const e = this.byName.get(n)
      if (e && (this.allowAnimated || !e.animated)) return e
    }
    return undefined
  }
  size(): number {
    return this.list.length
  }
}

const URL_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+(com|net|org|tv|gg|io|co|me|dev|app|xyz|be|ly|us|uk|de|fr|es|jp|kr|ru|br|ca|au|nl|it|pl|se|no|fi|dk|ch|at|eu|info|live|stream|clip|link)(\/\S*)?$/i
const CHEER_RE = /^(cheer|Cheer|CHEER|kappa|Kappa|pogchamp|PogChamp|kreygasm|Kreygasm|swiftrage|SwiftRage|uni|Uni|party|Party|seemsgood|SeemsGood|pride|Pride|showlove|ShowLove|bday|BDay|doodlecheer|DoodleCheer|biblethump|BibleThump|cheerwhal|Cheerwhal|corgo|Corgo|scoops|Scoops|frankerz|FrankerZ|4head|4Head|trihard|TriHard|notlikethis|NotLikeThis|failfish|FailFish|streamlabs|Streamlabs|muxy|Muxy|holidaycheer|HolidayCheer|goal|Goal|anon|Anon|charity|Charity|dansgame|DansGame|elegiggle|EleGiggle|firstcheer|FirstCheer|heyguys|HeyGuys|kappa|mrdestructoid|MrDestructoid|pjsalt|PJSalt|residentsleeper|ResidentSleeper|shamrock|Shamrock|vohiyo|VoHiYo|wutface|WutFace|hype|Hype|ripcheer|RIPCheer|bitboss|BitBoss|cheerhype)(\d+)$/

export interface ParseOptions {
  registry: EmoteRegistry
  /** the "viewer" login for self-mention highlighting */
  selfLogin?: string
  /** allow "cheer100" tokens to become cheermotes */
  cheers?: boolean
  animatedCheermotes?: boolean
}

/** Splits message text into renderable fragments (words, emotes, mentions, links, cheers). */
export function parseMessage(text: string, opts: ParseOptions): { fragments: Fragment[]; bits: number } {
  const out: Fragment[] = []
  let bits = 0
  const tokens = text.split(/(\s+)/)
  let buf = ''
  const flush = () => {
    if (buf) {
      out.push({ kind: 'text', text: buf })
      buf = ''
    }
  }
  for (const tok of tokens) {
    if (!tok) continue
    if (/^\s+$/.test(tok)) {
      buf += tok
      continue
    }
    const emote = opts.registry.get(tok)
    if (emote) {
      flush()
      out.push({
        kind: 'emote',
        name: emote.name,
        url: emoteUrl(emote, false),
        url4x: emoteUrl(emote, true),
        provider: emote.provider,
        animated: emote.animated,
      })
      continue
    }
    if (tok.length > 1 && tok.startsWith('@')) {
      const login = tok.slice(1).replace(/[^\w]+$/, '')
      if (login) {
        flush()
        const trailing = tok.slice(1 + login.length)
        out.push({ kind: 'mention', text: '@' + login, self: !!opts.selfLogin && login.toLowerCase() === opts.selfLogin.toLowerCase() })
        if (trailing) buf += trailing
        continue
      }
    }
    if (opts.cheers !== false) {
      const m = tok.match(CHEER_RE)
      if (m) {
        const amount = parseInt(m[2], 10)
        if (amount > 0) {
          const tier = cheerTier(amount)
          flush()
          bits += amount
          out.push({
            kind: 'cheer',
            prefix: m[1],
            amount,
            tier: tier.min,
            color: tier.color,
            url: cheermoteUrl(tier.min, opts.animatedCheermotes !== false, 1),
            url4x: cheermoteUrl(tier.min, opts.animatedCheermotes !== false, 4),
          })
          continue
        }
      }
    }
    if (URL_RE.test(tok) && tok.includes('.')) {
      flush()
      out.push({ kind: 'link', text: tok })
      continue
    }
    buf += tok
  }
  flush()
  return { fragments: out, bits }
}
