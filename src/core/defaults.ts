import type { Config } from './types'

export const SAMPLE_SCRIPT = `# Lines you type here become chat messages, in order.
# Plain line = random chatter says it. "name: text" = a specific user.
# Commands start with "!" (see the Help tab). {e:hype} inserts a hype emote, {streamer} the streamer name.
yo chat, is this the new update?
[mod] nightbot: Welcome! Type !discord to join the community
no way he's actually doing it
LETS GOOO {e:hype}
!sub coolguy_92 prime 12 -- love the stream!
+0.4 KEKW KEKW KEKW
clip it CLIP IT
!first hi everyone, first time here :)
!gifts bigspender_ttv 5
!raid streamerfriend 231
[vip] jess_plays: hydrate {streamer}!!
!highlight can you say hi to my little brother? its his birthday
!announce green Drops are enabled for this stream!
!burst 15 W
`

export const DEFAULT_CONFIG: Config = {
  seed: 'twitchsim',
  mode: 'mixed',
  script: SAMPLE_SCRIPT,
  mood: 'gaming',
  streamerName: 'Streamer',
  streamerLogin: '',
  viewerName: '',
  gameName: 'the game',
  language: 'en',
  scriptUsersRandom: true,
  scriptGapMultiplier: 4,
  streamerChats: true,
  streamerColor: '',
  messagesPerMinute: 90,
  burstiness: 0.5,
  reactionMoments: 0.5,
  startDelayMs: 0,
  prefillSec: 0,
  durationSec: 30,
  durationAuto: true,
  tailSec: 3,
  subsRate: 0.5,
  giftsRate: 0.4,
  raidsRate: 0.15,
  cheersRate: 0.4,
  firstTimeRate: 0.4,
  highlightRate: 0.4,
  replyRate: 0.5,
  deleteRate: 0.3,
  announcementRate: 0.3,
  actionsRate: 0.15,
  mentionsRate: 0.5,
  powerUpsRate: 0.15,
  rewardRate: 0.2,
  systemNotices: true,
  welcomeMessage: true,
  chatterPoolSize: 120,
  customColorRatio: 0.45,
  subRatio: 0.35,
  primeRatio: 0.2,
  modCount: 3,
  vipCount: 4,
  bitsBadgeRatio: 0.12,
  gifterBadgeRatio: 0.1,
  eventBadgeRatio: 0.35,
  botsEnabled: true,
  customNames: '',
  customNamesOnly: false,
  localizedNamesRatio: 0.03,
  channelSubBadgeStyle: 'generated',
  loadedChannel: '',
  emoteDensity: 0.5,
  useTwitchEmotes: true,
  use7tvEmotes: true,
  useChannelEmotes: true,
  animatedEmotes: true,
  chatStyle: 'twitch-dark',
  theme: 'dark',
  bgColor: '#18181b',
  bgOpacity: 1,
  cornerRadius: 0,
  textShadow: true,
  textOutline: 0,
  fontSize: 'default',
  fontScale: 1,
  fontFamily: 'Inter',
  width: 340,
  height: 600,
  paddingX: 16,
  paddingBottom: 10,
  timestamps: false,
  alternateBg: false,
  readableColors: true,
  showBadges: true,
  boldNames: true,
  animation: 'instant',
  animationMs: 180,
  fadeTopEdge: 0,
  modView: false,
  hypeTrain: false,
  exportScale: 2,
  exportFps: 30,
  exportFormat: 'webm-alpha',
  exportTransparent: true,
  exportBg: '#000000',
  frameW: 1920,
  frameH: 1080,
  framePreset: 'chat',
  anchor: 'br',
  marginX: 40,
  marginY: 40,
}

export interface Preset {
  id: string
  name: string
  description: string
  patch: Partial<Config>
}

/** One-click scenario presets ("modes"). */
export const PRESETS: Preset[] = [
  {
    id: 'big-hype',
    name: 'Big streamer hype',
    description: 'Fast chat, emote walls, subs & gift bombs flying in.',
    patch: { mode: 'ambient', mood: 'hype', messagesPerMinute: 420, burstiness: 0.7, reactionMoments: 0.8, subsRate: 0.9, giftsRate: 0.8, cheersRate: 0.6, emoteDensity: 0.7, chatterPoolSize: 800, subRatio: 0.45, modCount: 8, vipCount: 12, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'chill-small',
    name: 'Chill small stream',
    description: 'A cozy 40-viewer chat: slow, friendly, personal.',
    patch: { mode: 'ambient', mood: 'chill', messagesPerMinute: 14, burstiness: 0.3, reactionMoments: 0.15, subsRate: 0.25, giftsRate: 0.1, raidsRate: 0.05, cheersRate: 0.1, emoteDensity: 0.35, chatterPoolSize: 25, subRatio: 0.5, modCount: 1, vipCount: 2, botsEnabled: true, durationAuto: false, durationSec: 60 },
  },
  {
    id: 'clutch',
    name: 'Clutch moment',
    description: 'Tense gaming chat that explodes when the play happens.',
    patch: { mode: 'ambient', mood: 'clutch', messagesPerMinute: 260, burstiness: 0.8, reactionMoments: 0.9, emoteDensity: 0.65, chatterPoolSize: 400, subsRate: 0.3, giftsRate: 0.2, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'funny',
    name: 'Funny reaction',
    description: 'KEKW / OMEGALUL / ICANT everywhere.',
    patch: { mode: 'ambient', mood: 'funny', messagesPerMinute: 200, burstiness: 0.6, reactionMoments: 0.9, emoteDensity: 0.7, chatterPoolSize: 300, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'gaming',
    name: 'Gaming / backseat',
    description: 'Callouts, backseating and skill-issue accusations.',
    patch: { mode: 'ambient', mood: 'gaming', messagesPerMinute: 120, burstiness: 0.5, reactionMoments: 0.5, emoteDensity: 0.45, chatterPoolSize: 200, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'toxic',
    name: 'Toxic chat',
    description: 'Washed / L / ratio / cope (PG-13, no slurs). Mods delete messages.',
    patch: { mode: 'ambient', mood: 'toxic', messagesPerMinute: 150, burstiness: 0.6, reactionMoments: 0.5, deleteRate: 0.9, emoteDensity: 0.5, chatterPoolSize: 250, subsRate: 0.1, giftsRate: 0.05, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'wholesome',
    name: 'Wholesome',
    description: 'Hearts, hugs and encouragement.',
    patch: { mode: 'ambient', mood: 'wholesome', messagesPerMinute: 60, burstiness: 0.4, reactionMoments: 0.4, emoteDensity: 0.5, chatterPoolSize: 120, subsRate: 0.5, giftsRate: 0.4, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'music',
    name: 'Music / DJ set',
    description: 'catJAM, track IDs and vibes.',
    patch: { mode: 'ambient', mood: 'music', messagesPerMinute: 90, burstiness: 0.5, reactionMoments: 0.6, emoteDensity: 0.7, chatterPoolSize: 200, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'irl',
    name: 'IRL stream',
    description: 'Where are you, food looks fire, bitrate dropped.',
    patch: { mode: 'ambient', mood: 'irl', messagesPerMinute: 80, burstiness: 0.5, reactionMoments: 0.4, emoteDensity: 0.4, chatterPoolSize: 200, durationAuto: false, durationSec: 30 },
  },
  {
    id: 'emote-wall',
    name: 'Emote spam wall',
    description: 'Pure hype mode: constant reaction bursts and emote spam.',
    patch: { mode: 'hype', mood: 'hype', messagesPerMinute: 500, burstiness: 0.9, reactionMoments: 1, emoteDensity: 0.95, chatterPoolSize: 1000, durationAuto: false, durationSec: 20 },
  },
  {
    id: 'script-only',
    name: 'Script only',
    description: 'Only your lines, in order, at the speed you set. No random filler.',
    patch: { mode: 'script', messagesPerMinute: 60, durationAuto: true },
  },
  {
    id: 'mixed',
    name: 'Script + ambient',
    description: 'Your lines interleaved with realistic filler chatter.',
    patch: { mode: 'mixed', durationAuto: true },
  },
  {
    id: 'overlay',
    name: 'Transparent overlay look',
    description: 'No panel background, shadowed text: drop straight onto video.',
    patch: { chatStyle: 'transparent', textShadow: true, textOutline: 0, fadeTopEdge: 60, exportTransparent: true },
  },
  {
    id: 'twitch-dark',
    name: 'Twitch dark panel',
    description: 'The real twitch.tv chat column look.',
    patch: { chatStyle: 'twitch-dark', theme: 'dark', fadeTopEdge: 0, cornerRadius: 0 },
  },
]

export const FRAME_PRESETS: Record<Config['framePreset'], { w: number; h: number; label: string }> = {
  chat: { w: 0, h: 0, label: 'Chat only (tight)' },
  '1080p': { w: 1920, h: 1080, label: '1080p (1920×1080)' },
  '1440p': { w: 2560, h: 1440, label: '1440p (2560×1440)' },
  '4k': { w: 3840, h: 2160, label: '4K UHD (3840×2160)' },
  vertical: { w: 1080, h: 1920, label: 'Vertical 9:16 (1080×1920)' },
  custom: { w: 0, h: 0, label: 'Custom' },
}
