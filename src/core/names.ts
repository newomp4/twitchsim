import type { Rng } from './rng'

/**
 * A login for a display name: Twitch logins are lower-case ASCII, but a typed name in another script
 * (たけし, Дмитрий, 김민수) keeps its letters — mapping every foreign letter to "_" would fold different
 * people into one chatter (and print "(____)" behind their name).
 */
export function loginFor(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '_')
}


const ADJ = [
  'sneaky', 'silent', 'toxic', 'crispy', 'salty', 'spicy', 'lazy', 'sleepy', 'angry', 'happy', 'sad', 'tiny', 'giant',
  'dark', 'shadow', 'neon', 'cyber', 'pixel', 'retro', 'turbo', 'hyper', 'ultra', 'mega', 'super', 'epic', 'legendary',
  'cosmic', 'lunar', 'solar', 'frozen', 'burning', 'electric', 'golden', 'silver', 'crimson', 'purple', 'violet', 'cool',
  'chill', 'wild', 'feral', 'cursed', 'blessed', 'based', 'cracked', 'goated', 'washed', 'sussy', 'chaotic', 'quiet',
  'loud', 'fast', 'slow', 'big', 'lil', 'smol', 'baby', 'old', 'young', 'real', 'fake', 'not', 'the', 'its', 'im', 'mr',
  'ms', 'dr', 'sir', 'lord', 'king', 'queen', 'captain', 'agent', 'officer', 'chef', 'coach', 'uncle', 'aunt', 'grand',
  'weird', 'nerdy', 'sassy', 'fluffy', 'fuzzy', 'soggy', 'crunchy', 'smooth', 'rusty', 'shiny', 'dusty', 'foggy',
  'stormy', 'sunny', 'rainy', 'snowy', 'lucky', 'unlucky', 'random', 'average', 'certified', 'professional', 'casual',
  'sweaty', 'cracked', 'bald', 'tall', 'short', 'hungry', 'thirsty', 'sleepy', 'grumpy', 'moody', 'bored',
]
const NOUN = [
  'panda', 'wolf', 'fox', 'cat', 'dog', 'doge', 'frog', 'toad', 'duck', 'goose', 'owl', 'hawk', 'eagle', 'raven', 'crow',
  'bear', 'tiger', 'lion', 'shark', 'whale', 'dolphin', 'otter', 'ferret', 'weasel', 'badger', 'moose', 'deer', 'goat',
  'sheep', 'llama', 'alpaca', 'camel', 'horse', 'pony', 'donkey', 'zebra', 'giraffe', 'hippo', 'rhino', 'elephant',
  'monkey', 'gorilla', 'ape', 'sloth', 'koala', 'kangaroo', 'penguin', 'seal', 'walrus', 'octopus', 'squid', 'crab',
  'lobster', 'shrimp', 'snail', 'slug', 'worm', 'bee', 'wasp', 'ant', 'moth', 'beetle', 'spider', 'lizard', 'gecko',
  'snake', 'viper', 'cobra', 'dragon', 'wyvern', 'phoenix', 'griffin', 'unicorn', 'goblin', 'gnome', 'troll', 'ogre',
  'orc', 'elf', 'dwarf', 'wizard', 'witch', 'mage', 'knight', 'paladin', 'rogue', 'ninja', 'samurai', 'pirate', 'viking',
  'ghost', 'phantom', 'specter', 'wraith', 'zombie', 'skeleton', 'vampire', 'demon', 'angel', 'reaper', 'gamer', 'noob',
  'pro', 'legend', 'god', 'boss', 'chief', 'master', 'lord', 'king', 'prince', 'duke', 'baron', 'bandit', 'outlaw',
  'hunter', 'sniper', 'scout', 'medic', 'tank', 'healer', 'dps', 'support', 'carry', 'jungler', 'toaster', 'potato',
  'tomato', 'pickle', 'waffle', 'pancake', 'muffin', 'cookie', 'donut', 'bagel', 'taco', 'burrito', 'nacho', 'pizza',
  'burger', 'nugget', 'noodle', 'ramen', 'sushi', 'dumpling', 'pretzel', 'biscuit', 'cheese', 'bacon', 'butter', 'jam',
  'sock', 'boot', 'hat', 'cap', 'mask', 'cloak', 'sword', 'shield', 'axe', 'bow', 'dagger', 'hammer', 'blade', 'arrow',
  'rocket', 'comet', 'meteor', 'star', 'moon', 'sun', 'planet', 'nova', 'nebula', 'galaxy', 'void', 'storm', 'thunder',
  'lightning', 'blaze', 'flame', 'ember', 'ash', 'frost', 'ice', 'snow', 'rain', 'cloud', 'mist', 'shadow', 'light',
  'bean', 'pea', 'corn', 'rice', 'oat', 'nut', 'seed', 'root', 'leaf', 'twig', 'branch', 'tree', 'bush', 'weed', 'moss',
  'rock', 'stone', 'pebble', 'boulder', 'sand', 'mud', 'dirt', 'dust', 'gem', 'jewel', 'ruby', 'pearl', 'opal', 'jade',
  'enjoyer', 'andy', 'fan', 'main', 'lover', 'hater', 'watcher', 'lurker', 'chatter', 'viewer', 'stan', 'simp',
]
const FIRST = [
  'jake', 'emily', 'michael', 'sarah', 'josh', 'ryan', 'tyler', 'kevin', 'brandon', 'nick', 'chris', 'matt', 'alex', 'sam',
  'jordan', 'taylor', 'austin', 'dylan', 'ethan', 'noah', 'liam', 'lucas', 'mason', 'logan', 'jacob', 'daniel', 'david',
  'james', 'john', 'ben', 'zach', 'cody', 'trevor', 'connor', 'hunter', 'kyle', 'adam', 'aaron', 'jason', 'justin', 'sean',
  'ashley', 'jessica', 'megan', 'hannah', 'lauren', 'kayla', 'rachel', 'olivia', 'emma', 'sophia', 'ava', 'mia', 'chloe',
  'zoe', 'lily', 'grace', 'ella', 'maya', 'leah', 'anna', 'nina', 'lena', 'mila', 'luna', 'sofia', 'isabella', 'julia',
  'max', 'leo', 'finn', 'oscar', 'felix', 'jonas', 'luca', 'niko', 'timo', 'lars', 'sven', 'erik', 'kai', 'ren', 'yuki',
  'hiro', 'ken', 'ryo', 'jin', 'min', 'joon', 'tae', 'ali', 'omar', 'sami', 'yusuf', 'ivan', 'dima', 'sasha', 'misha',
  'pedro', 'joao', 'lucas', 'mateo', 'diego', 'carlos', 'juan', 'luis', 'pablo', 'marco', 'andrea', 'paolo', 'pierre',
]
const GAMER_PREFIX = ['xX', 'xx', 'iTz', 'Its', 'Im', 'The', 'Real', 'Not', 'Sir', 'Mr', 'Dr', 'Big', 'Lil', 'Young', 'Old', 'King', 'TTV', 'ttv', 'YT', 'Just', 'Only', 'Pro', 'Op', 'OG', 'Zz', 'oo']
const GAMER_SUFFIX = ['Xx', 'xx', 'TTV', 'ttv', 'YT', 'TV', 'HD', 'Live', 'Gaming', 'Games', 'Plays', 'Playz', 'Official', 'Real', 'Main', 'Alt', 'Smurf', 'Jr', 'Sr', 'PL', 'BR', 'UK', 'EU', 'NA', 'DE', 'FR', 'ES', 'MX', 'JP', 'KR', 'zZ', 'oO', '_', '__', 'x', 'z', 'y']
const WORDS = [
  'gigachad', 'kekw', 'pog', 'poggers', 'monka', 'pepe', 'peepo', 'sadge', 'copium', 'hopium', 'bedge', 'lulw', 'omega',
  'clueless', 'aware', 'susge', 'madge', 'okayge', 'ratio', 'wicked', 'goat', 'sigma', 'rizz', 'ohio', 'skibidi', 'gyatt',
  'griddy', 'sheesh', 'bussin', 'nocap', 'fr', 'ong', 'lowkey', 'highkey', 'vibes', 'vibe', 'chad', 'virgin', 'npc',
  'main', 'character', 'plot', 'armor', 'lore', 'canon', 'grind', 'grinder', 'sweat', 'tryhard', 'casual', 'lurker',
  'chatter', 'yapper', 'yap', 'glazer', 'hater', 'fanboy', 'stan', 'certified', 'moment', 'arc', 'season', 'episode',
  'speedrun', 'anyperc', 'wr', 'pb', 'clip', 'clips', 'vod', 'stream', 'chat', 'emote', 'twitch', 'purple', 'kappa',
  'juicer', 'juice', 'goblin', 'gremlin', 'goober', 'goofy', 'silly', 'sillyguy', 'guy', 'dude', 'bro', 'sis', 'homie',
  'wsg', 'coffee', 'tea', 'boba', 'matcha', 'energy', 'gfuel', 'monster', 'redbull', 'water', 'milk', 'juice',
]

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const LOCALIZED: { display: string; login: string }[] = [
  { display: 'たけし', login: 'takeshi_jp' }, { display: 'ゆうき', login: 'yuuki_gaming' }, { display: 'さくら', login: 'sakura_ch' },
  { display: 'ケンタ', login: 'kenta0413' }, { display: 'ミナ', login: 'mina_mina' }, { display: 'りんご', login: 'ringo_apple' },
  { display: '김민수', login: 'minsu_kim' }, { display: '박지훈', login: 'jihoon_p' }, { display: '이서연', login: 'seoyeon22' },
  { display: '최준호', login: 'junho_c' }, { display: '정하늘', login: 'haneul_j' }, { display: '한소희', login: 'sohee_h' },
  { display: '王小明', login: 'xiaoming_w' }, { display: '李华', login: 'lihua_88' }, { display: '张伟', login: 'zhangwei_gg' },
  { display: 'Дмитрий', login: 'dmitry_ru' }, { display: 'Алексей', login: 'alexey_x' }, { display: 'Катя', login: 'katya_k' },
  { display: 'Ярослав', login: 'yaroslav_pl' }, { display: 'Настя', login: 'nastya_n' },
  { display: 'ปลา', login: 'pla_th' }, { display: 'น้องแมว', login: 'nongmaew' },
  { display: 'محمد', login: 'mohammed_sa' }, { display: 'أحمد', login: 'ahmed_eg' },
  { display: 'Ελένη', login: 'eleni_gr' }, { display: 'Νίκος', login: 'nikos_gr' },
]

export interface GeneratedName {
  login: string
  displayName: string
}

/** Generates a Twitch-plausible username (login + display name casing). */
export function generateName(rng: Rng, localizedRatio = 0.02): GeneratedName {
  if (rng.chance(localizedRatio)) {
    const l = rng.pick(LOCALIZED)
    return { login: l.login, displayName: l.display }
  }
  const style = rng.weighted(
    ['adjnoun', 'gamer', 'first', 'words', 'noundigits', 'letters', 'compound'],
    [30, 14, 22, 12, 12, 3, 7],
  )
  let parts: string[] = []
  let sep = rng.weighted(['', '_', '-'], [70, 27, 3])
  switch (style) {
    case 'adjnoun':
      parts = [rng.pick(ADJ), rng.pick(NOUN)]
      break
    case 'gamer': {
      const core = rng.chance(0.5) ? rng.pick(NOUN) : rng.pick(FIRST)
      const pre = rng.chance(0.55) ? rng.pick(GAMER_PREFIX) : ''
      const suf = rng.chance(0.6) ? rng.pick(GAMER_SUFFIX) : ''
      parts = [pre, core, suf].filter(Boolean)
      sep = rng.weighted(['', '_'], [55, 45])
      break
    }
    case 'first': {
      const f = rng.pick(FIRST)
      parts = rng.chance(0.4) ? [f, rng.pick(NOUN)] : [f]
      break
    }
    case 'words':
      parts = rng.chance(0.5) ? [rng.pick(WORDS), rng.pick(NOUN)] : [rng.pick(WORDS)]
      break
    case 'noundigits':
      parts = [rng.pick(NOUN)]
      break
    case 'letters': {
      const len = rng.int(4, 9)
      let s = ''
      for (let i = 0; i < len; i++) s += 'abcdefghijklmnopqrstuvwxyz'[rng.int(0, 25)]
      parts = [s]
      break
    }
    case 'compound':
      parts = [rng.pick(ADJ), rng.pick(ADJ), rng.pick(NOUN)]
      break
  }
  // digits
  let digits = ''
  const digitStyle = rng.weighted(['none', 'short', 'year', 'long', 'lucky'], [42, 22, 18, 12, 6])
  switch (digitStyle) {
    case 'short':
      digits = String(rng.int(1, 99))
      break
    case 'year':
      digits = String(rng.chance(0.5) ? rng.int(1988, 2012) : rng.int(0, 99)).padStart(2, '0')
      break
    case 'long':
      digits = String(rng.int(100, 99999))
      break
    case 'lucky':
      digits = rng.pick(['420', '69', '1337', '777', '666', '123', '007', '99', '2000', '01', '00'])
      break
  }
  const casing = rng.weighted(['lower', 'camel', 'capfirst', 'upper'], [46, 34, 16, 4])
  const displayParts = parts.map((p, i) => {
    switch (casing) {
      case 'lower':
        return p.toLowerCase()
      case 'camel':
        return cap(p)
      case 'capfirst':
        return i === 0 ? cap(p) : p.toLowerCase()
      case 'upper':
        return p.toUpperCase()
    }
    return p
  })
  let display = displayParts.join(sep)
  if (digits) display += (rng.chance(0.25) && sep === '' ? '_' : sep === '-' ? '' : sep === '_' && rng.chance(0.5) ? '_' : '') + digits
  if (rng.chance(0.04)) display = '_' + display
  if (rng.chance(0.04)) display = display + '_'
  display = display.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_')
  if (display.length > 25) display = display.slice(0, 25)
  if (display.length < 4) display = display + String(rng.int(10, 999))
  return { login: display.toLowerCase(), displayName: display }
}

export const BOT_NAMES: GeneratedName[] = [
  { login: 'nightbot', displayName: 'Nightbot' },
  { login: 'streamelements', displayName: 'StreamElements' },
  { login: 'moobot', displayName: 'Moobot' },
  { login: 'fossabot', displayName: 'Fossabot' },
  { login: 'wizebot', displayName: 'WizeBot' },
]

/** Parses a user-provided list of names (comma / newline separated). "Display (login)" also supported. */
export function parseCustomNames(text: string): GeneratedName[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.+?)\s*\((\S+)\)$/)
      if (m) return { displayName: m[1].trim(), login: m[2].toLowerCase() }
      return { displayName: s, login: loginFor(s) }
    })
}
