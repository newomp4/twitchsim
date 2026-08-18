# AI prompt for generating a TwitchSim chat file

Paste this into ChatGPT / Claude / Gemini, fill in the three `<placeholders>` at the bottom, and paste the JSON it returns into the **Your lines** box (Chat tab) — or save it as a `.json` file and use **Import file**.

---

```text
You are writing a fake Twitch chat log for a video overlay. Output ONLY valid JSON (no markdown, no commentary) in exactly this shape:

{
  "streamer": "<streamer display name>",
  "game": "<game or topic>",
  "users": [
    { "name": "<twitch-style username>", "color": "<optional #hex>", "badges": ["<optional flags>"] }
  ],
  "messages": [
    { "user": "<name from users, or * for a random viewer>", "text": "<message>", "delay": <seconds after previous message, e.g. 0.3-2.5> },
    { "type": "sub", "user": "<name>", "tier": "prime" | 1 | 2 | 3, "months": <n>, "text": "<optional resub message>" },
    { "type": "gift", "user": "<gifter>", "to": "<recipient>" },
    { "type": "gifts", "user": "<gifter>", "count": <n> },
    { "type": "raid", "user": "<raiding streamer>", "count": <viewers> },
    { "type": "announce", "text": "<mod announcement>", "color": "purple" | "blue" | "green" | "orange" },
    { "type": "cheer", "user": "<name>", "bits": <n>, "text": "<message>" },
    { "type": "highlight", "user": "<name>", "text": "<channel-points highlighted message>" },
    { "type": "first", "user": "<new name>", "text": "<first-time chatter message>" },
    { "type": "reply", "user": "<name>", "target": "<name being replied to>", "text": "<reply>" },
    { "type": "me", "user": "<name>", "text": "<action, e.g. is dancing>" },
    { "type": "delete", "user": "<name>", "text": "<message a mod will delete>" },
    { "type": "burst", "count": <n>, "text": "<thing many people spam at once, e.g. KEKW or W>" },
    { "type": "wait", "seconds": <n> }
  ]
}

Rules:
- Make it feel like real Twitch chat: mostly short lowercase messages, slang (W, L, ratio, cooked, cracked, skill issue, clip it, no way), typos and repeated letters sometimes (LETS GOOOO), a few longer sentences, some ALL CAPS hype, questions, backseating, inside jokes about what is happening on stream.
- Usernames must look like real Twitch logins: 4-25 chars, letters/numbers/underscores only, mixed styles (xX_shadow_Xx, jake_99, PogChamper2011, lil_toaster, ttv_niko, KaiFan42, sleepysock54, notarealuser). No spaces. Reuse the same users so a few "regulars" chat a lot.
- Badge flags you may use in "badges": "mod", "vip", "sub:<months>", "prime", "turbo", "founder", "bits:<total>", "gifter:<count>", "broadcaster" (only for the streamer). Most users should have no or few badges; ~1-3 mods, ~2-5 vips, roughly a third subs.
- Emotes: write emote codes as plain words in the text, e.g. KEKW, OMEGALUL, LUL, PogChamp, POGGERS, monkaS, Sadge, catJAM, PepeLaugh, Clap, EZ, ICANT, Bedge, HUH, xdd, Prayge, Madge, Okayge, PauseChamp, Pepega, widepeepoHappy, peepoClap, WICKED, Clueless, LETSGO, D:, FeelsBadMan, FeelsGoodMan, HeyGuys, Kappa, BibleThump, NotLikeThis, DansGame, ResidentSleeper, Kreygasm, 4Head, TriHard, VoHiYo, SeemsGood. You may also write {e:hype}, {e:laugh}, {e:sad}, {e:scared}, {e:clap}, {e:love}, {e:jam}, {e:wave} to insert a random fitting emote, and {streamer} for the streamer's name.
- Sprinkle a few events (subs, a gift bomb, maybe a raid, an announcement, a highlight, one deleted message, a burst when something hype happens) between normal messages. Keep "delay" small (0.2-1.5 s) during hype and larger (2-6 s) when chat is calm.
- Length: <NUMBER OF MESSAGES, e.g. 80> messages total, about <DURATION, e.g. 60> seconds of chat.
- Scenario / what is happening on stream: <DESCRIBE THE MOMENT, e.g. "streamer just hit a 1v4 clutch in Valorant ranked, chat goes crazy">.
- Tone: <e.g. hype / funny / wholesome / toxic-but-PG13 / chill>.
```

## Format reference

```json
{
  "streamer": "MyStreamer",
  "game": "Valorant",
  "users": [
    { "name": "coolguy_92", "color": "#ff69b4", "badges": ["mod", "sub:12", "prime"] },
    { "name": "jess_plays", "badges": ["vip"] }
  ],
  "messages": [
    "plain text = a random viewer says this",
    { "user": "coolguy_92", "text": "LETS GOOO {e:hype}", "delay": 0.4 },
    { "type": "sub", "user": "coolguy_92", "tier": "prime", "months": 12, "text": "resub hype" },
    { "type": "gift", "user": "a", "to": "b" },
    { "type": "gifts", "user": "a", "count": 10 },
    { "type": "raid", "user": "raider", "count": 120 },
    { "type": "announce", "text": "Drops enabled", "color": "green" },
    { "type": "cheer", "user": "x", "bits": 500, "text": "GG" },
    { "type": "highlight", "user": "x", "text": "..." },
    { "type": "first", "user": "newbie", "text": "..." },
    { "type": "reply", "user": "x", "target": "coolguy_92", "text": "..." },
    { "type": "me", "user": "x", "text": "is dancing" },
    { "type": "delete", "user": "x", "text": "..." },
    { "type": "reward", "reward": "TTS", "user": "x", "text": "..." },
    { "type": "effect", "effect": "rainbow-eclipse", "user": "x", "text": "..." },
    { "type": "gigantify", "user": "x", "text": "KEKW" },
    { "type": "burst", "count": 20, "text": "KEKW" },
    { "type": "wait", "seconds": 3 },
    { "type": "system", "text": "This room is now in slow mode." }
  ]
}
```

- `at` (absolute seconds) or `delay` (seconds after the previous line) are optional on every message; without them lines are paced by the chat speed setting.
- `user`: a name from `users`, any new name (created on the fly), or `*` / omitted for a random viewer.
- Badge flags: `mod`, `vip`, `sub:<months>`, `prime`, `turbo`, `founder`, `bits:<total>`, `gifter:<count>`, `partner`, `broadcaster`.
- The same file can also be plain script lines (see the Help tab) — the app detects JSON automatically.
