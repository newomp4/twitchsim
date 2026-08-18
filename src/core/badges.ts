import type { Badge, Chatter } from './types'
import type { Rng } from './rng'

/** Twitch's public badge CDN. Images are served with CORS (Access-Control-Allow-Origin: *). */
export const BADGE_CDN = 'https://static-cdn.jtvnw.net/badges/v1/'

/** Global badge catalog: set -> version -> { id, title }. IDs are Twitch's stable asset UUIDs. */
export const GLOBAL_BADGES: Record<string, Record<string, { id: string; title: string }>> = {
  broadcaster: { '1': { id: '5527c58c-fb7d-422d-b71b-f309dcb85cc1', title: 'Broadcaster' } },
  moderator: { '1': { id: '3267646d-33f0-4b17-b3df-f923a41db1d0', title: 'Moderator' } },
  vip: { '1': { id: 'b817aba4-fad8-49e2-b88a-7cc744dfa6ec', title: 'VIP' } },
  staff: { '1': { id: 'd97c37bd-a6f5-4c38-8f57-4e4bef88af34', title: 'Staff' } },
  admin: { '1': { id: '9ef7e029-4cdf-4d4d-a0d5-e2b3fb2583fe', title: 'Admin' } },
  global_mod: { '1': { id: '9384c43e-4ce7-4e94-b2a1-b93656896eba', title: 'Global Moderator' } },
  partner: { '1': { id: 'd12a2e27-16f6-41d0-ab77-b780518f00a3', title: 'Verified' } },
  premium: { '1': { id: 'bbbe0db0-a598-423e-86d0-f9fb98ca1933', title: 'Prime Gaming' } },
  turbo: { '1': { id: 'bd444ec6-8f34-4bf9-91f4-af1e3428d80f', title: 'Turbo' } },
  founder: { '0': { id: '511b78a9-ab37-472f-9569-457753bbe7d3', title: 'Founder' } },
  subscriber: {
    '0': { id: '5d9f2208-5dd8-11e7-8513-2ff4adfae661', title: 'Subscriber' },
    '2': { id: '25a03e36-2bb2-4625-bd37-d6d9d406238d', title: '2-Month Subscriber' },
    '3': { id: 'e8984705-d091-4e54-8241-e53b30a84b0e', title: '3-Month Subscriber' },
    '6': { id: '2d2485f6-d19b-4daa-8393-9493b019156b', title: '6-Month Subscriber' },
    '9': { id: 'b4e6b13a-a76f-4c56-87e1-9375a7aaa610', title: '9-Month Subscriber' },
    '12': { id: 'ed51a614-2c44-4a60-80b6-62908436b43a', title: '1-Year Subscriber' },
  },
  bits: {
    '1': { id: '73b5c3fb-24f9-4a82-a852-2f475b59411c', title: 'cheer 1' },
    '100': { id: '09d93036-e7ce-431c-9a9e-7044297133f2', title: 'cheer 100' },
    '1000': { id: '0d85a29e-79ad-4c63-a285-3acd2c66f2ba', title: 'cheer 1000' },
    '5000': { id: '57cd97fc-3e9e-4c6d-9d41-60147137234e', title: 'cheer 5000' },
    '10000': { id: '68af213b-a771-4124-b6e3-9bb6d98aa732', title: 'cheer 10000' },
    '25000': { id: '64ca5920-c663-4bd8-bfb1-751b4caea2dd', title: 'cheer 25000' },
    '50000': { id: '62310ba7-9916-4235-9eba-40110d67f85d', title: 'cheer 50000' },
    '75000': { id: 'ce491fa4-b24f-4f3b-b6ff-44b080202792', title: 'cheer 75000' },
    '100000': { id: '96f0540f-aa63-49e1-a8b3-259ece3bd098', title: 'cheer 100000' },
    '200000': { id: '4a0b90c4-e4ef-407f-84fe-36b14aebdbb6', title: 'cheer 200000' },
    '300000': { id: 'ac13372d-2e94-41d1-ae11-ecd677f69bb6', title: 'cheer 300000' },
    '400000': { id: 'a8f393af-76e6-4aa2-9dd0-7dcc1c34f036', title: 'cheer 400000' },
    '500000': { id: 'f6932b57-6a6e-4062-a770-dfbd9f4302e5', title: 'cheer 500000' },
    '1000000': { id: '494d1c8e-c3b2-4d88-8528-baff57c9bd3f', title: 'cheer 1000000' },
  },
  'sub-gifter': {
    '1': { id: 'a5ef6c17-2e5b-4d8f-9b80-2779fd722414', title: 'Sub Gifter' },
    '5': { id: 'ee113e59-c839-4472-969a-1e16d20f3962', title: '5 Gift Subs' },
    '10': { id: 'd333288c-65d7-4c7b-b691-cdd7b3484bf8', title: '10 Gift Subs' },
    '25': { id: '052a5d41-f1cc-455c-bc7b-fe841ffaf17f', title: '25 Gift Subs' },
    '50': { id: 'c4a29737-e8a5-4420-917a-314a447f083e', title: '50 Gift Subs' },
    '100': { id: '8343ada7-3451-434e-91c4-e82bdcf54460', title: '100 Gift Subs' },
    '150': { id: '514845ba-0fc3-4771-bce1-14d57e91e621', title: '150 Gift Subs' },
    '200': { id: 'c6b1893e-8059-4024-b93c-39c84b601732', title: '200 Gift Subs' },
    '250': { id: 'cd479dc0-4a15-407d-891f-9fd2740bddda', title: '250 Gift Subs' },
    '300': { id: '9e1bb24f-d238-4078-871a-ac401b76ecf2', title: '300 Gift Subs' },
    '500': { id: '60e9504c-8c3d-489f-8a74-314fb195ad8d', title: '500 Gift Subs' },
    '1000': { id: 'bfb7399a-c632-42f7-8d5f-154610dede81', title: '1000 Gift Subs' },
  },
  'sub-gift-leader': {
    '1': { id: '21656088-7da2-4467-acd2-55220e1f45ad', title: 'Gifter Leader 1' },
    '2': { id: '0d9fe96b-97b7-4215-b5f3-5328ebad271c', title: 'Gifter Leader 2' },
    '3': { id: '4c6e4497-eed9-4dd3-ac64-e0599d0a63e5', title: 'Gifter Leader 3' },
  },
  'bits-leader': {
    '1': { id: '8bedf8c3-7a6d-4df2-b62f-791b96a5dd31', title: 'Bits Leader 1' },
    '2': { id: 'f04baac7-9141-4456-a0e7-6301bcc34138', title: 'Bits Leader 2' },
    '3': { id: 'f1d2aab6-b647-47af-965b-84909cf303aa', title: 'Bits Leader 3' },
  },
  'clips-leader': {
    '1': { id: '12f70951-efea-48c2-b42b-d5e2ea0d71f7', title: 'Clips Leader 1' },
    '2': { id: '9eddf7ab-aa46-4798-abe2-710db1043254', title: 'Clips Leader 2' },
    '3': { id: 'fb838633-6ff6-46df-98b4-9e53fcff84f6', title: 'Clips Leader 3' },
  },
  'hype-train': {
    '1': { id: 'fae4086c-3190-44d4-83c8-8ef0cbe1a515', title: 'Current Hype Train Conductor' },
    '2': { id: '9c8d038a-3a29-45ea-96d4-5031fb1a7a81', title: 'Former Hype Train Conductor' },
  },
  predictions: {
    'blue-1': { id: 'e33d8b46-f63b-4e67-996d-4a7dcec0ad33', title: 'Predicted Blue (1)' },
    'blue-2': { id: 'ffdda3fe-8012-4db3-981e-7a131402b057', title: 'Predicted Blue (2)' },
    'blue-3': { id: 'f2ab9a19-8ef7-4f9f-bd5d-9cf4e603f845', title: 'Predicted Blue (3)' },
    'pink-1': { id: '75e27613-caf7-4585-98f1-cb7363a69a4a', title: 'Predicted Pink (1)' },
    'pink-2': { id: '4b76d5f2-91cc-4400-adf2-908a1e6cfd1e', title: 'Predicted Pink (2)' },
    'gray-1': { id: '144f77a2-e324-4a6b-9c17-9304fa193a27', title: 'Predicted Gray (1)' },
  },
  moments: {
    '1': { id: 'bf370830-d79a-497b-81c6-a365b2b60dda', title: 'Moments Badge - Tier 1' },
    '2': { id: 'fc46b10c-5b45-43fd-81ad-d5cb0de6d2f4', title: 'Moments Badge - Tier 2' },
    '3': { id: 'd08658d7-205f-4f75-ad44-8c6e0acd8ef6', title: 'Moments Badge - Tier 3' },
    '5': { id: 'c8a0d95a-856e-4097-9fc0-7765300a4f58', title: 'Moments Badge - Tier 5' },
    '10': { id: '9c13f2b6-69cd-4537-91b4-4a8bd8b6b1fd', title: 'Moments Badge - Tier 10' },
  },
  'glhf-pledge': { '1': { id: '3158e758-3cb4-43c5-94b3-7639810451c5', title: 'GLHF Pledge' } },
  'artist-badge': { '1': { id: '4300a897-03dc-4e83-8c0e-c332fee7057f', title: 'Artist' } },
  'game-developer': { '1': { id: '85856a4a-eb7d-4e26-a43e-d204a977ade4', title: 'Game Developer' } },
  'twitch-dj': { '1': { id: 'cf91bbc0-0332-413a-a7f3-e36bac08b624', title: 'Twitch DJ' } },
  ambassador: { '1': { id: '2cbc339f-34f4-488a-ae51-efdf74f4e323', title: 'Twitch Ambassador' } },
  'bot-badge': { '1': { id: '3ffa9565-c35b-4cad-800b-041e60659cf2', title: 'Chat Bot' } },
  no_audio: { '1': { id: 'aef2cd08-f29b-45a1-8c12-d44d7fd5e6f0', title: 'Watching without audio' } },
  no_video: { '1': { id: '199a0dba-58f3-494e-a7fc-1fa0a1001fb8', title: 'Listening only' } },
  'clip-champ': { '1': { id: 'f38976e0-ffc9-11e7-86d6-7f98b26a9d79', title: 'Power Clipper' } },
  'anonymous-cheerer': { '1': { id: 'ca3db7f7-18f5-487e-a329-cd0b538ee979', title: 'Anonymous Cheerer' } },
  'user-anniversary': { '1': { id: 'ccbbedaa-f4db-4d0b-9c2a-375de7ad947c', title: 'Twitchiversary Badge' } },
  'gold-pixel-heart': { '1': { id: '1687873b-cf38-412c-aad3-f9a4ce17f8b6', title: 'Gold Pixel Heart' } },
  'twitch-recap-2023': { '1': { id: '4d9e9812-ba9b-48a6-8690-13f3f338ee65', title: 'Twitch Recap 2023' } },
  'twitch-recap-2024': { '1': { id: '72f2a6ac-3d9b-4406-b9e9-998b27182f61', title: 'Twitch Recap 2024' } },
  'twitch-recap-2025': { '1': { id: '48b26ab3-c9f1-4f16-b02d-fe877be389fd', title: 'Twitch Recap 2025' } },
  'subtember-2024': { '1': { id: '4149750c-9582-4515-9e22-da7d5437643b', title: 'SUBtember 2024' } },
  'subtember-2025': { '1': { id: 'a9c01f28-179e-486d-a4c7-2277e4f6adb4', title: 'SUBtember 2025' } },
  'superultracombo-2023': { '1': { id: '5864739a-5e58-4623-9450-a2c0555ef90b', title: 'SuperUltraCombo 2023' } },
  'share-the-love': { '1': { id: '2de71f4f-b152-4308-a426-127a4cf8003a', title: 'Share the Love' } },
  'rplace-2023': { '1': { id: 'e33e0c67-c380-4241-828a-099c46e51c66', title: 'r/place 2023 Cake' } },
  glitchcon2020: { '1': { id: '1d4b03b9-51ea-42c9-8f29-698e3c85be3d', title: 'GlitchCon 2020' } },
  'twitchcon-2024---san-diego': { '1': { id: '6575f0d1-2dc2-4f45-a13f-a1a969dcf8fa', title: 'TwitchCon 2024 - San Diego' } },
  'twitchcon-2024---rotterdam': { '1': { id: '95b10c66-775c-4652-9b86-10bd3a709422', title: 'TwitchCon 2024 - Rotterdam' } },
  'twitchcon-2025---rotterdam': { '1': { id: 'f4d97fd0-437f-4d8d-b4d3-4b6d18e4705b', title: 'TwitchCon 2025' } },
  twitchconNA2023: { '1': { id: 'c90a753f-ab20-41bc-9c42-ede062485d2c', title: 'TwitchCon 2023 - Las Vegas' } },
  twitchconEU2023: { '1': { id: 'a8f2084e-46b9-4bb9-ae5e-00d594aafc64', title: 'TwitchCon 2023 - Paris' } },
  twitchconNA2022: { '1': { id: '344d429a-0b34-48e5-a84c-14a1b5772a3a', title: 'TwitchCon 2022 - San Diego' } },
  'minecraft-15th-anniversary-celebration': { '1': { id: '178077b2-8b86-4f8d-927c-66ed6c1b025f', title: 'Minecraft 15th Anniversary Celebration' } },
  'gone-bananas': { '1': { id: 'e2ba99f4-6079-44d1-8c07-4ca6b58de61f', title: 'Gone Bananas Badge' } },
  'raider-icon-badge': { '1': { id: '5007f3e0-41d4-4bda-a605-8f72cfe8c2d4', title: 'Raider Icon' } },
  legendus: { '1': { id: '55c355cf-ddbf-4f12-8369-6554a1f78b6f', title: 'LEGENDUS' } },
  'zevent-2024': { '1': { id: '2040d479-b815-4617-8a55-9aed027e30d0', title: 'ZEVENT 2024' } },
}

/** Twitch renders badges in a fixed order (authority first, subscriber, then misc, then Prime/Turbo). */
const BADGE_ORDER = [
  'broadcaster', 'staff', 'admin', 'global_mod', 'moderator', 'vip', 'partner', 'predictions',
  'founder', 'subscriber',
  'sub-gifter', 'sub-gift-leader', 'bits-leader', 'clips-leader', 'bits', 'hype-train', 'glhf-pledge', 'moments',
  'clip-champ', 'anonymous-cheerer', 'user-anniversary', 'gold-pixel-heart', 'share-the-love', 'rplace-2023',
  'superultracombo-2023', 'subtember-2024', 'subtember-2025', 'twitch-recap-2023', 'twitch-recap-2024', 'twitch-recap-2025',
  'glitchcon2020', 'twitchconNA2022', 'twitchconEU2023', 'twitchconNA2023', 'twitchcon-2024---san-diego',
  'twitchcon-2024---rotterdam', 'twitchcon-2025---rotterdam', 'minecraft-15th-anniversary-celebration', 'gone-bananas',
  'legendus', 'zevent-2024', 'raider-icon-badge', 'artist-badge', 'game-developer', 'twitch-dj', 'ambassador', 'bot-badge',
  'premium', 'turbo', 'no_audio', 'no_video',
]
const ORDER_INDEX = new Map(BADGE_ORDER.map((s, i) => [s, i]))

export function sortBadges(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) => (ORDER_INDEX.get(a.set) ?? 900) - (ORDER_INDEX.get(b.set) ?? 900))
}

export function badgeUrl(b: Badge, scale: 1 | 2 | 4 = 1): string | null {
  if (b.url) return scale === 1 ? b.url : b.url4x ?? b.url
  const set = GLOBAL_BADGES[b.set]
  const v = set?.[b.version]
  if (!v) return null
  return `${BADGE_CDN}${v.id}/${scale === 1 ? 1 : scale === 2 ? 2 : 3}`
}

export function makeBadge(set: string, version: string): Badge {
  const title = GLOBAL_BADGES[set]?.[version]?.title ?? set
  return { set, version, title }
}

/** Highest available sub-badge tier <= months (versions are month thresholds). */
export function pickTier(available: string[], months: number): string {
  const nums = available.map((v) => Number(v)).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
  let best = nums[0] ?? 0
  for (const n of nums) if (n <= Math.max(months, 0)) best = n
  return String(best)
}

/** Sub badge tiers channels typically customise (months). */
export const COMMON_SUB_TIERS = [0, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60, 72]

/** Bits badge threshold from a total bits amount. */
export function bitsBadgeVersion(total: number): string {
  const tiers = Object.keys(GLOBAL_BADGES.bits).map(Number).sort((a, b) => a - b)
  let best = tiers[0]
  for (const t of tiers) if (t <= total) best = t
  return String(best)
}

export function gifterBadgeVersion(total: number): string {
  const tiers = Object.keys(GLOBAL_BADGES['sub-gifter']).map(Number).sort((a, b) => a - b)
  let best = tiers[0]
  for (const t of tiers) if (t <= total) best = t
  return String(best)
}

// ---------------------------------------------------------------------------
// Fallback SVG badges (used when the CDN is unreachable / offline) and
// procedurally generated "channel" subscriber badges.
// ---------------------------------------------------------------------------

function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

const SHAPES: Record<string, string> = {
  star: 'M9 1.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L1.8 6.8l5-.7z',
  heart: 'M9 15.5s-6.5-4-6.5-8.3C2.5 4.9 4.3 3.3 6.3 3.3c1.2 0 2.2.7 2.7 1.6.5-.9 1.5-1.6 2.7-1.6 2 0 3.8 1.6 3.8 3.9C15.5 11.5 9 15.5 9 15.5z',
  gem: 'M4.5 3h9L17 7.5 9 16 1 7.5z M1 7.5h16 M4.5 3L9 16 13.5 3',
  bolt: 'M10.5 1.5L4 10h4l-1.5 6.5L14 8h-4z',
  crown: 'M2 13.5h14v2H2z M2 12L1 4.5l4 3 4-5 4 5 4-3-1 7.5z',
  shield: 'M9 1.5l6.5 2.5v5c0 3.5-2.8 6.3-6.5 7.5C5.3 15.3 2.5 12.5 2.5 9V4z',
  moon: 'M12.5 2.5a7 7 0 1 0 3 12.6A6 6 0 0 1 12.5 2.5z',
  skull: 'M9 1.5c-3.6 0-6.5 2.7-6.5 6.2 0 2.2 1.1 3.9 2.7 5v3.8h7.6v-3.8c1.6-1.1 2.7-2.8 2.7-5C15.5 4.2 12.6 1.5 9 1.5zM6.2 9.5a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm5.6 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z',
  flame: 'M9 1.5c1 3-1.5 4-1 6.5C6.5 7 6 5.5 6 5.5 3.5 8 3.5 10 4 12.5c.6 2.5 3 4 5 4s4.4-1.5 5-4c.6-2.6-.5-5-2-6.5 0 1-.5 2-1.5 2.5C10.8 6 11 3.5 9 1.5z',
  paw: 'M9 8.5c-2.7 0-4.8 2.4-4.8 4.5 0 1.9 1.6 2.6 2.4 2.6 1 0 1.5-.5 2.4-.5s1.4.5 2.4.5c.8 0 2.4-.7 2.4-2.6 0-2.1-2.1-4.5-4.8-4.5zM4.2 6.4a1.6 2 0 1 0 0 .1zM7 4.4a1.6 2 0 1 0 0 .1zM11 4.4a1.6 2 0 1 0 0 .1zM13.8 6.4a1.6 2 0 1 0 0 .1z',
  ghost: 'M9 1.5C5.7 1.5 3 4.2 3 7.5v9l2-1.5 2 1.5 2-1.5 2 1.5 2-1.5 2 1.5v-9c0-3.3-2.7-6-6-6zM6.8 8.5a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm4.4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z',
  sword: 'M14.5 2l1.5 1.5-7.5 7.5 1.5 1.5-1.5 1.5-1.5-1.5L4 15.5 2.5 14l3-3L4 9.5 5.5 8 7 9.5z',
  potion: 'M7 2h4v1.5H10V6l3.5 5.5c1 1.7-.2 4-2.2 4h-4.6c-2 0-3.2-2.3-2.2-4L8 6V3.5H7z',
  dice: 'M3 3h12v12H3z M6 6h1.5v1.5H6z M10.5 6H12v1.5h-1.5z M8.2 8.2h1.5v1.5H8.2z M6 10.5h1.5V12H6z M10.5 10.5H12V12h-1.5z',
  controller: 'M5 5h8a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L11 11H7l-.5.7A3 3 0 0 1 1 10V9a4 4 0 0 1 4-4zm0 2v1H4v1h1v1h1V9h1V8H6V7zm7.5 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zm1.7 1.7a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8z',
  mushroom: 'M9 1.5c-4 0-7 2.8-7 6 0 1 .5 1.5 1.5 1.5h11c1 0 1.5-.5 1.5-1.5 0-3.2-3-6-7-6zM6.5 10.5h5v4.5c0 1-1 1.5-2.5 1.5S6.5 16 6.5 15z',
  cherry: 'M6 11a3 3 0 1 0 0 .1zM12 12a3 3 0 1 0 0 .1zM6 8C6 5 8 3 11 2l.5 1.5C9 4 7.5 5.5 7.5 8zM12 9c0-3-1-5-2.5-6.5L11 2c1.5 1.5 2.5 3.5 2.5 7z',
  bear: 'M4.5 4a2 2 0 1 0 0 .1zM13.5 4a2 2 0 1 0 0 .1zM9 4.5c-3.5 0-6 2.5-6 6s2.5 6 6 6 6-2.5 6-6-2.5-6-6-6zM7 9.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM9 13c-1.2 0-2-.7-2-1.5h4c0 .8-.8 1.5-2 1.5z',
  planet: 'M9 4a5 5 0 1 0 0 10A5 5 0 0 0 9 4zm-8 5c0-.6 2.7-1.6 6.5-2L2 8.5c-.4 1 3.5 2.6 8.7 2.9 5.2.3 7.3-.6 5.3-2.4l1.5.5c1 1.5-2.7 3.5-8.5 3.3C3.5 12.5.5 10.5 1 9z',
}
const SHAPE_KEYS = Object.keys(SHAPES)

/** Tier ramp colors ("bronze -> silver -> gold -> diamond -> ...") for generated sub badges. */
const RAMPS: string[][] = [
  ['#7d5a3c', '#a9a9b3', '#e0b93b', '#4fc3f7', '#b388ff', '#ff5c8a', '#00e5a0', '#ff9100', '#ffffff', '#00b0ff', '#e040fb', '#ffd740'],
  ['#9147ff', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95', '#a970ff', '#bf94ff', '#d3b8ff', '#e2ceff', '#ffb8f9', '#ff8ce8', '#ff5cd6'],
  ['#3d5afe', '#00b0ff', '#00e5ff', '#1de9b6', '#00e676', '#76ff03', '#c6ff00', '#ffea00', '#ffc400', '#ff9100', '#ff3d00', '#ff1744'],
  ['#ff5252', '#ff4081', '#e040fb', '#7c4dff', '#536dfe', '#448aff', '#40c4ff', '#18ffff', '#64ffda', '#69f0ae', '#b2ff59', '#eeff41'],
  ['#8d6e63', '#78909c', '#ffca28', '#26c6da', '#ab47bc', '#ec407a', '#66bb6a', '#ffa726', '#42a5f5', '#d4e157', '#ff7043', '#26a69a'],
]

export interface GeneratedSubBadgeSet {
  /** month threshold -> data url (1x, drawn as 72px SVG for crispness) */
  tiers: { months: number; url: string; title: string }[]
}

/** Builds a themed set of subscriber badges for a fictional channel. */
export function generateSubBadgeSet(rng: Rng): GeneratedSubBadgeSet {
  const shape = rng.pick(SHAPE_KEYS)
  const ramp = rng.pick(RAMPS)
  const bgStyle = rng.weighted(['round', 'square', 'circle', 'none'], [40, 25, 20, 15])
  const glyphWhite = rng.chance(0.75)
  const tiers = COMMON_SUB_TIERS.map((months, i) => {
    const color = ramp[Math.min(i, ramp.length - 1)]
    const bg = bgStyle === 'none' ? 'none' : color
    const light = relLum(color) > 0.55
    const glyph = bgStyle === 'none' ? color : glyphWhite && !light ? '#ffffff' : shade(color, light ? -0.6 : -0.45)
    const stroke = bgStyle === 'none' ? `stroke="${shade(color, -0.4)}" stroke-width="0.8"` : ''
    let bgEl = ''
    if (bgStyle === 'round') bgEl = `<rect x="0.5" y="0.5" width="17" height="17" rx="3.5" fill="${bg}"/>`
    else if (bgStyle === 'square') bgEl = `<rect x="0.5" y="0.5" width="17" height="17" rx="1.5" fill="${bg}"/>`
    else if (bgStyle === 'circle') bgEl = `<circle cx="9" cy="9" r="8.5" fill="${bg}"/>`
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="72" height="72" shape-rendering="geometricPrecision">${bgEl}<path d="${SHAPES[shape]}" fill="${glyph}" ${stroke} fill-rule="evenodd"/></svg>`
    return { months, url: svgDataUrl(svg), title: months === 0 ? 'Subscriber' : `${months}-Month Subscriber` }
  })
  return { tiers }
}

function relLum(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const t = amt < 0 ? 0 : 255
  const p = Math.abs(amt)
  r = Math.round(r + (t - r) * p)
  g = Math.round(g + (t - g) * p)
  b = Math.round(b + (t - b) * p)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** Simple offline stand-ins for the most common global badges. */
const FALLBACK_SVGS: Record<string, string> = {
  broadcaster: `<rect width="18" height="18" rx="2.5" fill="#e91916"/><path d="M3.5 5.5h7.5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zm9.5 2.2l2.5-1.7v6l-2.5-1.7z" fill="#fff"/>`,
  moderator: `<rect width="18" height="18" rx="2.5" fill="#00ad03"/><path d="M13.6 3l1.4 1.4-6.4 6.4 1.2 1.2-1.4 1.4-1.2-1.2L4.6 14.8 3.2 13.4l2.6-2.6-1.2-1.2L6 8.2l1.2 1.2z" fill="#fff"/>`,
  vip: `<rect width="18" height="18" rx="2.5" fill="#e005b9"/><path d="M5 5h8l2 3-6 6-6-6z" fill="#fff"/>`,
  subscriber: `<rect width="18" height="18" rx="2.5" fill="#8b46ff"/><path d="M9 3l1.8 3.7 4.1.6-3 2.9.7 4.1L9 12.4l-3.6 1.9.7-4.1-3-2.9 4.1-.6z" fill="#fff"/>`,
  founder: `<rect width="18" height="18" rx="2.5" fill="#c56cf0"/><path d="M6.5 4h5.5v2.2H8.6v2.1h3v2.2h-3V14H6.5z" fill="#fff"/>`,
  premium: `<rect width="18" height="18" rx="2.5" fill="#0e9bd8"/><path d="M3 12V6l3 2.5L9 5l3 3.5L15 6v6z" fill="#fff"/>`,
  turbo: `<rect width="18" height="18" rx="2.5" fill="#59399a"/><path d="M6 4h6v2H6zm-1 3h8v7H5z" fill="#fff"/><path d="M9.5 8l-2 3.5h1.5l-.5 2.5 2-3.5H9z" fill="#59399a"/>`,
  partner: `<path d="M9 1l2.3 1.4 2.7.1 1.3 2.4 2.1 1.7-.5 2.6.5 2.6-2.1 1.7-1.3 2.4-2.7.1L9 17l-2.3-1.4-2.7-.1-1.3-2.4L.6 11.4l.5-2.6L.6 6.2l2.1-1.7L4 2.1l2.7-.1z" fill="#8f42ff"/><path d="M4.5 9.2l1.4-1.4 2 2 4.2-4.2 1.4 1.4-5.6 5.6z" fill="#fff"/>`,
  staff: `<rect width="18" height="18" rx="2.5" fill="#000"/><path d="M13.5 3.5a3.5 3.5 0 0 0-4.7 4L3.5 12.8 5.2 14.5l5.3-5.3a3.5 3.5 0 0 0 4-4.7L12.4 6.6l-1-1z" fill="#fff"/>`,
  bits: `<rect width="18" height="18" rx="2.5" fill="#c9c9d1"/><path d="M9 4l5 8H4z" fill="#3a3a44"/>`,
  'sub-gifter': `<path d="M2 7h14v3H2zM3 10h12v6H3zM8 7h2v9H8z" fill="#a970ff"/><path d="M9 7C7 4 4 4 4 5.5S7 7 9 7c2 0 5 0 5-1.5S11 4 9 7z" fill="#a970ff"/>`,
  'hype-train': `<path d="M2 12h14v2H2zM3 5h6l3 3h3v3H3z" fill="#f4a51c"/><circle cx="5" cy="15" r="1.4" fill="#f4a51c"/><circle cx="13" cy="15" r="1.4" fill="#f4a51c"/>`,
  predictions: `<circle cx="9" cy="9" r="8" fill="#1f69ff"/><text x="9" y="13" font-family="Inter,Arial" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">1</text>`,
  'bot-badge': `<rect width="18" height="18" rx="2.5" fill="#6441a5"/><rect x="4" y="6" width="10" height="7" rx="1.5" fill="#fff"/><rect x="6" y="8" width="2" height="2" fill="#6441a5"/><rect x="10" y="8" width="2" height="2" fill="#6441a5"/>`,
  no_audio: `<rect width="18" height="18" rx="2.5" fill="#3b3b44"/><path d="M4 7h3l3-3v10l-3-3H4z" fill="#fff"/>`,
  no_video: `<rect width="18" height="18" rx="2.5" fill="#3b3b44"/><path d="M3 5h9v8H3zM13 7l2.5-1.5v7L13 11z" fill="#fff"/>`,
  moments: `<rect width="18" height="18" rx="2.5" fill="#f2c94c"/><path d="M4 5h10v8H4z" fill="#3a2e00"/>`,
}
const fallbackCache = new Map<string, string>()

export function fallbackBadgeUrl(set: string): string {
  const key = FALLBACK_SVGS[set] ? set : 'subscriber'
  let u = fallbackCache.get(key)
  if (!u) {
    u = svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" width="72" height="72">${FALLBACK_SVGS[key]}</svg>`)
    fallbackCache.set(key, u)
  }
  return u
}

const EVENT_BADGE_SETS = [
  'twitch-recap-2024', 'twitch-recap-2025', 'twitch-recap-2023', 'subtember-2025', 'subtember-2024', 'superultracombo-2023',
  'share-the-love', 'rplace-2023', 'glitchcon2020', 'twitchcon-2024---san-diego', 'twitchcon-2024---rotterdam',
  'twitchcon-2025---rotterdam', 'twitchconNA2023', 'twitchconEU2023', 'twitchconNA2022', 'minecraft-15th-anniversary-celebration',
  'gone-bananas', 'legendus', 'zevent-2024', 'user-anniversary', 'gold-pixel-heart', 'moments', 'glhf-pledge', 'clip-champ',
  'raider-icon-badge', 'artist-badge', 'game-developer', 'twitch-dj',
]
const EVENT_BADGE_WEIGHTS = [
  14, 16, 8, 8, 6, 5,
  4, 4, 3, 3, 2,
  4, 2, 2, 2, 3,
  2, 2, 2, 5, 3, 6, 4, 4,
  3, 2, 1, 1,
]

export interface BadgeAssignOptions {
  subRatio: number
  primeRatio: number
  bitsBadgeRatio: number
  gifterBadgeRatio: number
  eventBadgeRatio: number
  subBadgeSet: GeneratedSubBadgeSet | null
  channelBadges: Record<string, { version: string; url: string; url4x: string; title: string }[]> | null
}

/** Draws a chatter's badge set from Twitch-like probabilities. Mutates the chatter's sub fields too. */
export function assignBadges(rng: Rng, c: Chatter, o: BadgeAssignOptions): void {
  const badges: Badge[] = []
  if (c.isBroadcaster) badges.push(makeBadge('broadcaster', '1'))
  else if (c.isMod) badges.push(makeBadge('moderator', '1'))
  else if (c.isVip) badges.push(makeBadge('vip', '1'))
  if (c.isBot) {
    c.badges = badges
    return
  }
  // subscriber (mods/vips are much more likely to be subs)
  const subP = c.isMod || c.isVip || c.isBroadcaster ? Math.max(o.subRatio, 0.75) : o.subRatio
  if (rng.chance(subP)) {
    const months = Math.max(1, Math.round(Math.pow(rng.next(), 2.2) * 84))
    c.subMonths = months
    c.subTier = rng.weighted([1, 2, 3], [88, 8, 4]) as 1 | 2 | 3
    if (rng.chance(0.03)) badges.push(makeBadge('founder', '0'))
    else badges.push(subBadgeFor(months, o))
  }
  if (c.isBroadcaster && !c.subMonths) badges.push(subBadgeFor(999, o))
  if (rng.chance(0.06)) badges.push(makeBadge('predictions', rng.pick(['blue-1', 'blue-2', 'pink-1', 'pink-2', 'blue-3', 'gray-1'])))
  if (rng.chance(o.gifterBadgeRatio)) {
    const total = Math.round(Math.pow(rng.next(), 3) * 500) + 1
    if (rng.chance(0.03)) badges.push(makeBadge('sub-gift-leader', String(rng.int(1, 3))))
    badges.push(makeBadge('sub-gifter', gifterBadgeVersion(total)))
  }
  if (rng.chance(o.bitsBadgeRatio)) {
    if (rng.chance(0.03)) badges.push(makeBadge('bits-leader', String(rng.int(1, 3))))
    const total = Math.round(Math.pow(rng.next(), 3.5) * 100000) + 1
    badges.push(makeBadge('bits', bitsBadgeVersion(total)))
  }
  if (rng.chance(0.015)) badges.push(makeBadge('hype-train', rng.chance(0.3) ? '1' : '2'))
  const eventCount = rng.chance(o.eventBadgeRatio) ? (rng.chance(0.15) ? 2 : 1) : 0
  const used = new Set<string>()
  for (let i = 0; i < eventCount; i++) {
    const set = rng.weighted(EVENT_BADGE_SETS, EVENT_BADGE_WEIGHTS)
    if (used.has(set)) continue
    used.add(set)
    const versions = Object.keys(GLOBAL_BADGES[set] ?? {})
    if (versions.length) badges.push(makeBadge(set, rng.pick(versions)))
  }
  if (rng.chance(o.primeRatio)) {
    c.isPrime = true
    badges.push(makeBadge('premium', '1'))
  } else if (rng.chance(0.02)) badges.push(makeBadge('turbo', '1'))
  if (rng.chance(0.004)) badges.push(makeBadge('partner', '1'))
  if (rng.chance(0.01)) badges.push(makeBadge(rng.chance(0.5) ? 'no_audio' : 'no_video', '1'))
  c.badges = sortBadges(badges)
}

export function subBadgeFor(months: number, o: BadgeAssignOptions): Badge {
  if (o.channelBadges?.subscriber?.length) {
    const versions = o.channelBadges.subscriber
    const v = pickTier(versions.map((x) => x.version), months)
    const found = versions.find((x) => x.version === v) ?? versions[0]
    return { set: 'subscriber', version: found.version, title: found.title, url: found.url, url4x: found.url4x }
  }
  if (o.subBadgeSet) {
    let best = o.subBadgeSet.tiers[0]
    for (const t of o.subBadgeSet.tiers) if (t.months <= months) best = t
    return { set: 'subscriber', version: String(best.months), title: best.title, url: best.url, url4x: best.url }
  }
  const v = pickTier(Object.keys(GLOBAL_BADGES.subscriber), months)
  return makeBadge('subscriber', v)
}
