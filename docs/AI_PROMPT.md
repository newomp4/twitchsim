# AI prompt for generating TwitchSim chat lines

Paste this into ChatGPT / Claude / Gemini, fill in the `<placeholders>` at the bottom, and paste the lines it returns into the **Your lines** box (Chat tab) — or save them as a `.txt` file and use **Import**.

The output format is deliberately simple: one `username: message` per line, optionally prefixed with `[mod]`, `[vip]` or `[sub]`.

---

```text
Write a fake Twitch chat log for a video overlay.

Output ONLY the chat lines, one per line, in exactly this format (no numbering, no quotes, no commentary):
username: message

Rules:
- Usernames must look like real Twitch logins: 4-25 characters, letters/numbers/underscores only, mixed styles (xX_shadow_Xx, jake_99, PogChamper2011, lil_toaster, ttv_niko, KaiFan42, sleepysock54, notarealuser). Invent about <NUMBER OF USERS, e.g. 25> different users and reuse them so a few "regulars" chat a lot.
- You may put [mod], [vip] or [sub] in front of a username to give that user a badge, e.g. "[mod] nightbot: welcome!" or "[sub] jake_99: LETS GO". Only 1-3 mods and a few vips; roughly a third subs.
- Make it feel like real Twitch chat: mostly short lowercase messages, slang (W, L, ratio, cooked, cracked, skill issue, clip it, no way), typos and stretched words sometimes (LETS GOOOO), a few longer sentences, some ALL CAPS hype, questions, backseating, and reactions to what is happening on stream. When something hype happens, have several users spam the same short thing in a row (W W W, KEKW, CLIP IT).
- Emotes: write emote codes as plain words, e.g. KEKW, OMEGALUL, LUL, PogChamp, POGGERS, monkaS, Sadge, catJAM, PepeLaugh, Clap, EZ, ICANT, Bedge, HUH, xdd, Prayge, Madge, PauseChamp, Pepega, widepeepoHappy, peepoClap, Clueless, LETSGO, D:, FeelsBadMan, FeelsGoodMan, HeyGuys, Kappa, BibleThump, NotLikeThis, DansGame, ResidentSleeper, Kreygasm, 4Head, TriHard, VoHiYo, SeemsGood.
- Length: <NUMBER OF MESSAGES, e.g. 80> lines.
- Scenario / what is happening on stream: <DESCRIBE THE MOMENT, e.g. "streamer just hit a 1v4 clutch in Valorant ranked, chat goes crazy">.
- Tone: <e.g. hype / funny / wholesome / toxic-but-PG13 / chill>.
```

---

## Advanced: JSON format (only if you want exact control over events and timing)

The app also accepts JSON with users (colors, badges) and typed events. This is optional — plain lines already produce a realistic chat because subs, gift bombs, raids etc. are generated automatically when filler chat is on.

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
- Every chat-like entry (`chat`, `highlight`, `first`, `me`, `delete`, `reply`, `reward`, `effect`, `gigantify`) needs a non-empty `text`; `announce` colours are `purple`, `blue`, `green`, `orange`, `red` or a hex.
- The same file can also be plain script lines (see the Help tab) — the app detects JSON automatically.
