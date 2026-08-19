import type { CustomBadge, CustomEmote, CustomAvatar } from './customAssets'

export type Theme = 'dark' | 'light'

export interface Badge {
  /** badge set id, e.g. "subscriber", "moderator" */
  set: string
  /** version within the set, e.g. "12" for 12-month sub, "1" for moderator */
  version: string
  title: string
  /** explicit image url override (custom / channel badges); when absent the global catalog is used */
  url?: string
  /** 4x url override */
  url4x?: string
  /** user-uploaded image: corners get rounded at draw time */
  roundable?: boolean
}

export interface Chatter {
  id: number
  login: string
  displayName: string
  /** custom color hex, or null to use Twitch's default hashed palette */
  color: string | null
  badges: Badge[]
  /** relative chattiness */
  weight: number
  isMod: boolean
  isVip: boolean
  isBroadcaster: boolean
  subMonths: number
  subTier: 0 | 1 | 2 | 3
  isPrime: boolean
  isBot: boolean
  /** ambient "personality": which phrase pools this user leans to */
  persona: string
}

export type Fragment =
  | { kind: 'text'; text: string }
  | { kind: 'emote'; name: string; url: string; url4x: string; provider: EmoteProvider; animated: boolean; scale?: number }
  | { kind: 'mention'; text: string; self: boolean }
  | { kind: 'link'; text: string }
  | { kind: 'cheer'; prefix: string; amount: number; tier: number; color: string; url: string; url4x: string }

export type EmoteProvider = 'twitch' | '7tv' | 'ffz' | 'bttv' | 'custom'

export interface EmoteDef {
  name: string
  id: string
  provider: EmoteProvider
  animated: boolean
  /** for custom emotes: full data url */
  url?: string
  /** popularity weight for ambient generation */
  weight?: number
}

export type NoticeKind =
  | 'sub'
  | 'resub'
  | 'gift'
  | 'communitygift'
  | 'raid'
  | 'announcement'
  | 'system'
  | 'timeout'
  | 'ban'
  | 'clear'
  | 'slow'
  | 'emoteonly'
  | 'followers'
  | 'subsonly'
  | 'welcome'

export interface NoticePart {
  text: string
  bold?: boolean
  color?: string
}

export interface ChatMessage {
  id: number
  /** presentation time in ms from simulation start */
  t: number
  /** the message body author (absent for pure system notices) */
  user?: Chatter
  /** the author's badges at the time of the message (chatters can be promoted / subscribe later) */
  badges?: Badge[]
  /** the author's name color at the time of the message */
  color?: string | null
  /** metronomic pacing: this row was placed deliberately (@N, +N, after !wait) — keep its time */
  pinned?: boolean
  /** metronomic pacing: keep at least this many ms between the previous message and this one (!wait, +N) */
  minGapBefore?: number
  fragments: Fragment[]
  /** raw text (for accessibility / debugging) */
  text: string
  /** `/me` action: text drawn in the user's color */
  action?: boolean
  /** first time chatter highlight */
  firstTime?: boolean
  /** channel-points "Highlight My Message" */
  highlighted?: boolean
  /** custom channel-points reward header ("Redeemed X") */
  rewardName?: string
  /** message mentions the viewer -> mention highlight */
  mentionsSelf?: boolean
  /** replying to another message */
  reply?: { displayName: string; text: string }
  /** message was deleted by a moderator at this time (ms); before that it renders normally */
  deletedAt?: number
  /** "special" chat highlight header (First Time Chat, Raider, Returning Chatter) */
  special?: { label: string; icon: 'first' | 'raider' | 'returning' }
  /** total bits cheered in this message */
  bits?: number
  /** power-up: gigantified emote (last emote drawn large) */
  gigantified?: boolean
  /** power-up: message effect background */
  effect?: 'rainbow-eclipse' | 'simmer' | 'cosmic-abyss'
  /** system / user notice envelope (sub, gift, raid, announcement, ...) */
  notice?: {
    kind: NoticeKind
    parts: NoticePart[]
    /** announcement accent color */
    color?: string
    /** icon color override */
    iconColor?: string
  }
}

import type { EasePreset } from './easing'

export type AnimationStyle = 'instant' | 'slide-up' | 'slide-left' | 'slide-right' | 'fade' | 'pop' | 'slide-fade' | 'slide'

/** Styles whose visible entrance is independent of the vertical stack, so the scroll may lead them.
 * Pure slides (slide-up/slide) and instant have no separate entrance — the row's motion IS the room —
 * so leading them would open a blank gap and then pop the finished row in; those stay coupled. */
export function scrollCanLead(style: AnimationStyle): boolean {
  return style === 'slide-left' || style === 'slide-right' || style === 'fade' || style === 'slide-fade' || style === 'pop'
}
export type ChatStyle = 'twitch-dark' | 'twitch-light' | 'transparent' | 'custom'
export type FontSizePreset = 'small' | 'default' | 'large' | 'xlarge'
export type ContentMode = 'script' | 'ambient' | 'mixed' | 'hype'
export type Mood = 'general' | 'hype' | 'chill' | 'funny' | 'gaming' | 'wholesome' | 'toxic' | 'reactions' | 'clutch' | 'music' | 'irl'

export interface Config {
  seed: string
  // content
  mode: ContentMode
  script: string
  mood: Mood
  streamerName: string
  streamerLogin: string
  viewerName: string
  gameName: string
  language: 'en'
  scriptUsersRandom: boolean
  scriptGapMultiplier: number
  /** filler chat re-uses (shuffles) your own lines instead of the built-in corpus */
  fillerFromScript: boolean
  streamerChats: boolean
  streamerColor: string
  // pacing
  messagesPerMinute: number
  /** natural = human-like random gaps & bursts; even = metronomic; accelerate = gaps shrink each message (speed ramp) */
  pacing: 'natural' | 'even' | 'accelerate'
  /** speed-ramp (pacing='accelerate'): first gap in ms, per-message multiplier, and the floor gap in ms */
  rampStartGap: number
  rampRatio: number
  rampMinGap: number
  burstiness: number // 0..1
  reactionMoments: number // 0..1 how often the crowd reacts together
  startDelayMs: number
  /** seconds of chat generated before t=0 so the chat starts already populated */
  prefillSec: number
  durationSec: number
  durationAuto: boolean
  tailSec: number
  // events (0..1 relative frequency; 0 = off)
  subsRate: number
  giftsRate: number
  raidsRate: number
  cheersRate: number
  firstTimeRate: number
  highlightRate: number
  replyRate: number
  deleteRate: number
  announcementRate: number
  actionsRate: number
  mentionsRate: number
  powerUpsRate: number
  rewardRate: number
  systemNotices: boolean
  welcomeMessage: boolean
  // chatters
  chatterPoolSize: number
  customColorRatio: number
  subRatio: number
  primeRatio: number
  modCount: number
  vipCount: number
  bitsBadgeRatio: number
  gifterBadgeRatio: number
  eventBadgeRatio: number
  /** which badge groups random chatters may wear (see BADGE_GROUPS); empty = none */
  badgePool: string[]
  botsEnabled: boolean
  customNames: string
  customNamesOnly: boolean
  localizedNamesRatio: number
  channelSubBadgeStyle: 'default' | 'generated' | 'channel' | 'custom'
  loadedChannel: string
  /** uploaded badge images (see customAssets.ts) */
  customBadges: CustomBadge[]
  customEmotes: CustomEmote[]
  /** uploaded avatar / profile images shown before the badges & name */
  customAvatars: CustomAvatar[]
  avatarMode: 'off' | 'assigned' | 'all'
  avatarShape: 'circle' | 'rounded' | 'square'
  /** corner radius for uploaded badges, as a fraction of the badge size (0 = square, 0.5 = circle) */
  badgeRadius: number
  badgeFit: 'cover' | 'contain'
  useCustomEmotesInFiller: boolean
  // emotes
  emoteDensity: number // 0..1
  useTwitchEmotes: boolean
  use7tvEmotes: boolean
  useChannelEmotes: boolean
  animatedEmotes: boolean
  // look
  chatStyle: ChatStyle
  theme: Theme
  bgColor: string
  bgOpacity: number
  cornerRadius: number
  textShadow: boolean
  textOutline: number
  fontSize: FontSizePreset
  fontScale: number
  /** proportional zoom of the whole chat (column width + text + badges + spacing), independent of the
   * output resolution (exportScale). 1 = normal; raise it to make the chat fill more of the frame width. */
  chatScale: number
  /** kerning: extra letter spacing in px (can be negative) */
  letterSpacing: number
  /** the message-body font (and the default for names) */
  fontFamily: string
  /** the username font; '' = use fontFamily (same as the messages) */
  nameFont: string
  width: number
  height: number
  paddingX: number
  paddingBottom: number
  timestamps: boolean
  alternateBg: boolean
  readableColors: boolean
  /** how names get their colour: twitch = the 15 default hashed colours; custom = your palette (hashed the same way) */
  nameColorMode: 'twitch' | 'custom'
  /** the palette used when nameColorMode = custom (hex colours) */
  nameColorPalette: string[]
  showBadges: boolean
  boldNames: boolean
  animation: AnimationStyle
  animationMs: number
  /** entrance easing: a preset, a custom cubic-bézier (easeCurve), or a pasted AE keyframe curve (easeKeyframes) */
  easePreset: EasePreset
  easeCurve: [number, number, number, number]
  easeKeyframes: string
  /** slide entrance travel as a fraction of the chat width (0..1) */
  slideDistance: number
  /** cinematic: newest message starts on the vertical centre line, then the column drifts down to fill the frame */
  fillDown: boolean
  fillHold: number
  fillDrift: number
  /** the list scroll (making room) leads the message by this many ms; 0 = coupled to the entrance */
  scrollLead: number
  /** the scroll's own duration in ms (0 = match the entrance duration) */
  scrollDurationMs: number
  /** the scroll's own easing preset, or 'match' to use the entrance easing */
  scrollEasePreset: EasePreset | 'match'
  fadeTopEdge: number
  modView: boolean
  hypeTrain: boolean
  // export
  exportScale: number
  exportFps: number
  exportFormat: 'png-seq' | 'webm-alpha' | 'mov-prores' | 'mp4' | 'webm'
  exportTransparent: boolean
  exportBg: string
  frameW: number
  frameH: number
  framePreset: 'chat' | '1080p' | '1440p' | '4k' | 'vertical' | 'custom'
  anchor: 'tl' | 't' | 'tr' | 'l' | 'c' | 'r' | 'bl' | 'b' | 'br'
  marginX: number
  marginY: number
}
