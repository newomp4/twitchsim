# TwitchSim — Developer Handoff

A technical breakdown for a developer picking up or extending this project. For the user-facing feature
list, see `README.md`. This document assumes you're comfortable with TypeScript, React, and (for the After
Effects side) Adobe CEP / ExtendScript.

---

## 1. What this is

TwitchSim is **two products built from one codebase**:

1. **A browser tool** (Vite + React + TS) that simulates a pixel-faithful, fully fake Twitch chat and
   **exports transparent video** (PNG sequence, WebM-alpha, MOV ProRes 4444, MP4, WebM). Everything runs
   client-side; nothing is uploaded.
2. **An After Effects CEP panel** that builds the *same* chat as **real, editable AE layers** — one precomp
   per message, driven by expressions off a controller null — so a motion designer can tweak/keyframe it.

The **golden rule of the codebase**: the browser renderer and the AE build compile from the **same scene
data and the same layout math** (`src/core/layout.ts`). They must stay visually identical. A change to
layout affects both; a change to only one side is a parity bug.

- **Repo**: https://github.com/newomp4/twitchsim  (`origin`, branch `main`)
- **Live site**: https://newomp4.github.io/twitchsim/ (GitHub Pages, deployed from `dist/`)
- **Owner**: newomp4 — a video creator (non-programmer). Priorities: realistic output, simple UI, AE control.

---

## 2. Stack & tooling

| | |
|---|---|
| Build | **Vite 8** (`vite.config.ts`), ES modules (`"type": "module"`) |
| UI | **React 19** + **TypeScript** (strict), no CSS framework — hand-written CSS |
| Lint / types | **oxlint** (`npm run lint`), `tsc --noEmit` (`npm run typecheck`) |
| Fonts | `@fontsource/inter` (bundled, subsetted) |
| Video encode | `mediabunny` (WebM/MP4/MOV muxing), `@ffmpeg/ffmpeg` (ProRes / fallback), `fflate` (PNG zip) |
| AE bridge | Adobe **CEP 12** (Chromium 99), **ExtendScript (ES3)** host |
| Deploy | `gh-pages` |

### Commands

```bash
npm install
npm run dev          # Vite dev server (browser tool)
npm run typecheck    # tsc --noEmit -p tsconfig.app.json
npm run lint         # oxlint
npm run build        # tsc -b && vite build  → dist/  (browser build)
npm run build:pages  # GITHUB_PAGES=1 vite build  (sets the /twitchsim/ base path)
npm run deploy       # build:pages + gh-pages -d dist   (publishes the live site)

# After Effects panel
npm run build:cep    # vite build --mode cep  → cep/client/  (the panel's web app)
npm run cep:install  # build:cep + copy the panel into the CEP extensions folder
npm run cep:link     # build:cep + symlink the panel (dev: edits to cep/ are live)
npm run make:controls-ffx  # regenerate cep/host/twitchsim-controls.ffx (see §8)
```

> **Deploy gotcha:** the owner's `gh` token lacks `workflow` scope, so CI-based Pages deploys fail — use the
> `gh-pages` branch push (`npm run deploy`) instead of a GitHub Action.

---

## 3. High-level architecture

Both targets share the front half of the pipeline:

```
Config  ─►  simulation.ts  ─►  Timeline  ─►  layout.ts (styleFromConfig + layoutMessage)
(user)      (who says what,     (ordered      (per-message geometry: atoms, lines, row heights)
             when, pacing)       messages)          │
                                                     ├─► WEB:  renderer.ts  ─► <canvas> / export frames
                                                     │
                                                     └─► AE:   scene.ts  ─► SceneData (JSON)
                                                                              │
                                                                              └─► cep/host/index.jsx
                                                                                    (ExtendScript builds
                                                                                     comps, layers, keyframes,
                                                                                     expressions)
```

- **`simulation.ts`** decides the content & timing (chatter pool, pacing, events, reactions) → a `Timeline`.
  Deterministic given the same seed (see `rng.ts`).
- **`layout.ts`** turns each message + a `RenderStyle` into a `RowLayout` (atoms → wrapped lines → pixel
  boxes). **This is the shared source of truth.** Both the canvas renderer and the AE scene call it.
- **`renderer.ts`** paints a `RowLayout` stack to a 2D context at a given time (entrance animation, scroll,
  fades). Used by the live preview and every export format.
- **`scene.ts`** compiles the whole timeline into `SceneData` — plain JSON describing comps, layers,
  keyframes and the image files needed. It **bakes the scroll positions as hold keyframes** and emits the
  per-message expression inputs.
- **`cep/host/index.jsx`** (ExtendScript) consumes `SceneData` and constructs the AE comps/layers, writes
  keyframes, and attaches the expressions.

---

## 4. Directory map (annotated)

```
src/
  main.tsx                 app entry
  core/
    types.ts               ★ Config interface + all shared unions (AnimationStyle, ChatStyle, EasePreset…)
                             + scrollCanLead() helper
    defaults.ts            ★ DEFAULT_CONFIG, FRAME_PRESETS, SAMPLE_SCRIPT
    simulation.ts          ★ buildTimeline(): content + pacing → Timeline (accelerateOut, reaction moments)
    layout.ts              ★★ styleFromConfig(RenderStyle) + layoutMessage(RowLayout) — SHARED layout math
    renderer.ts            ★★ ChatRenderer: paints a RowLayout stack (entrance anim, scroll, fades, mattes)
    easing.ts              cubic-bezier + presets; parseKeyframeData (AE 9.0 Keyframe Data); easeSamples()
    fonts.ts               ensureFonts() — loads Inter subsets before measuring; timelineText()
    colors.ts              Twitch palette (dark/light), readable-color (CIELAB) transform
    assets.ts              AssetCache: badge/emote/avatar image loading (hi-res variants, animated frames)
    badges.ts, emotes.ts   Twitch/7TV badge & emote definitions + generators
    channel.ts             load a real channel's badges/emotes (Twitch/7TV/FFZ)
    customAssets.ts        user-uploaded badges/emotes/avatars (prepare, fit-to-box)
    names.ts, phrases      chatter name + message content generators
    rng.ts                 seeded PRNG (deterministic sims)
    script.ts, importFormat.ts   parse the user's "name: text" script + AI import format
  export/
    exporter.ts            ★ computeGeometry(), makeFrameSource(), runExport() orchestration
    mediabunnyExport.ts    WebM / MP4 / MOV muxing
    ffmpegExport.ts        ProRes 4444 + fallback (wasm ffmpeg)
    pngZip.ts, png*.ts     PNG sequence (worker pool)
    saveFile.ts            streamed FileSystemWritableFileStream w/ explicit commit()/discard()
  ae/
    scene.ts               ★★ compileScene(): Timeline → SceneData (the AE description)
    build.ts               buildInAE(): drives the host (ensureFonts, assets, compileScene, callHost)
    cep.ts                 CEP bridge: evalScript, callHost, file IO, systemPath (no-op outside AE)
  ui/
    App.tsx                shell, tabs, keyboard shortcuts, the window.__twitchsim debug hooks
    Preview.tsx            live canvas preview (fit/zoom); usePlayer() playback clock
    useConfig.ts           ★ config state: persistence, sanitize(), ENUMS, SIM_KEYS vs styleKey, share links
    controls.tsx           shared control components (Slider, Toggle, Select, Segmented, Collapsible, Field…)
    PresetsMenu.tsx        named presets (localStorage) + file import/export
    panels/
      ChatPanel.tsx        content: lines, pacing, chatters, events
      StylePanel.tsx       ★ look: font/size, chat size & Fit-to-frame, fonts, colours, badges, avatars
      ExportPanel.tsx      (browser) format, resolution, frame size, run export
      AEPanel.tsx          (AE) comp size, build/remove, host info
      HelpPanel.tsx, CustomIcons.tsx

cep/                       the After Effects extension (installed to ~/Library/.../CEP/extensions/)
  CSXS/manifest.xml        extension id com.twitchsim.panel, host AEFT, menu "TwitchSim"
  .debug                   enables the CEF remote-debug port 8722 (dev)
  client/                  built panel web app (output of `npm run build:cep`)
  host/
    index.jsx              ★★ the ExtendScript host — builds everything in AE
    twitchsim-controls.ffx byte-authored pseudo-effect ("TwitchSim Controls") — the grouped Effect Controls
    twitchsim-styles.ffx   layer-style preset (drop shadow / stroke / colour overlay)
scripts/
  make-controls-ffx.mjs    generator for twitchsim-controls.ffx (see §8)
  install-cep.mjs          copy/symlink the panel into the CEP extensions folder
  ffx/                     .ffx skeletons/templates for the generator
```

★ = important, ★★ = read this first.

---

## 5. Core data model

### Config (`src/core/types.ts` + `DEFAULT_CONFIG`)
One flat object holding **every** setting (content, look, animation, export). Persisted and shared:

- **localStorage** key `twitchsim.config.v1` — everything **except** the three image arrays.
- **IndexedDB** — `customBadges`, `customEmotes`, `customAvatars` (data-URL blobs, multi-MB) live here so
  they don't blow the localStorage quota. Restored async on mount (`useConfig.ts`).
- **Share links** — `#c=<base64>` encodes the diff-from-defaults (images excluded).
- **Named presets** — `twitchsim.presets.v1` (localStorage), images excluded; file import/export includes them.

**`sanitize()` (`useConfig.ts`)** validates any persisted/imported/shared config against `DEFAULT_CONFIG`
(type check + `ENUMS` whitelist for union fields). It is a strict whitelist over `DEFAULT_CONFIG` keys.
**If you add a Config field, add it to `types.ts` AND `defaults.ts`** (or `sanitize` drops it), and if it's
an enum-like union, add it to `ENUMS`.

**`SIM_KEYS` vs the render path (`useConfig.ts` + `renderer.ts:styleKey`)** — a critical performance split:
- Fields in **`SIM_KEYS`** change the *simulation* (who says what / when) → re-run `buildTimeline` (debounced).
- Everything else is **render-only** → no re-sim; the renderer's `styleKey` gates its per-message layout
  cache. Add a new *visual* field to `styleKey` if it changes geometry; keep it out of `SIM_KEYS`.

### Timeline (`src/core/simulation.ts`)
`{ messages: ChatMessage[], clears: number[], durationMs }`. Messages carry `t` (ms), user, badges,
fragments, notice/reply/deleted/highlight metadata. Deterministic from the seed.

### RenderStyle (`src/core/layout.ts`)
Derived from Config by `styleFromConfig()`. All sizes in CSS px. This is what both renderers consume.

### SceneData (`src/ae/scene.ts`)
The AE description. Notable fields: `scale` (=exportScale), `frame {w,h}`, `chat {x,y,w,h,ax,ay}`,
`background`, `fadeTop`, `text {shadow,strokeWidth,tracking}`, `anim {style,ms,slidePx,slidePct}`,
`fill` (fill-down) `| null`, `ease` (65 samples `| null`), `scrollAnim {lead,dur,ease} | null` (decoupled
scroll), `clears`, **`scroll: Key[]`** (baked hold keyframes for the scroll null), `assets`, and
`messages[]` (each: name, `h`, `compW/compH`, `localY`, `t0`, `hDel`, `delAt`, `epochStart`, `idx`, `yKeys`,
`layers[]`).

---

## 6. The web rendering pipeline

- **`layoutMessage()`** builds a row as **atoms** (text/emote/badge/avatar/gap/group) → `flow()` wraps them
  into lines → blocks → a `RowLayout` with a total `height`. Handles timestamps, badges, avatars, the
  name+colon+body, notices (sub/gift/raid/announcement), replies, deleted lines, highlights, cheers, `/me`.
- **`ChatRenderer.render()`** (`renderer.ts`) draws the visible stack at time `t`:
  - `rowAnimation()` = per-row entrance (slide/fade/pop/slide-left…): `grow`, `alpha`, `dx`, `scale`.
  - The **stack** is built bottom-up: newest at `yBottom = H - paddingBottom`, each row subtracts its
    `allotted` height (its grow fraction) so older rows push up.
  - **`fillDown`** = "start centered, drift down to fill" (a lift on the whole stack, eased).
  - **Scroll-lead** (see §9): `scrollCanLead(style)` styles can open the gap `scrollLead` ms *before* a
    message slides in, using a decoupled scroll ease/duration (`rowStackGrow`).
  - Top fade via `destination-out` then `destination-over` compositing (never thins the panel bg).
- **`styleKey()`** caches per-message layouts. Include any style field that changes geometry.
- **Fonts**: `ensureFonts()` must run before measuring (Inter ships as unicode-range subsets; a wrong
  measurement caches a stale width). The preview loads the chosen `fontFamily`/`nameFont` and redraws.

---

## 7. The After Effects build — architecture

### Comp structure (built by `cep/host/index.jsx` from `SceneData`)
```
Main comp  (size = computeGeometry → frame w×h)
 ├ TwitchSim Controls   (null, top layer)  ← PARENT OF EVERYTHING; its transform places the whole chat,
 │                                           its Effect Controls (the pseudo-effect) drive the expressions
 ├ Chat area (matte)    (white rounded rect, w=chat.w h=chat.h) ← luma track matte clipping the rows;
 │                                           carries the optional top-fade Ramp
 ├ Background           (rounded rect, w=chat.w h=chat.h)
 ├ Scroll               (null) ← parent of the message layers; holds the baked scroll hold-keys + expression
 ├ msg 001 · username   (precomp per message; parented to Scroll)
 ├ msg 002 · …
 └ …
```
Everything is parented to **"TwitchSim Controls"** at local `[0,0]`; its **anchor point = the chat's pin
point**. **Scaling / moving / rotating that null cleanly transforms the entire chat** — verified: every
generated expression works in the null's *local* space (no `thisComp.width/height`, `toComp`, `toWorld`, or
absolute coords). This is the intended, non-destructive way to place/keyframe the chat in AE.

### Expressions (all in `cep/host/index.jsx`)
- **`messageExpressions()`** — each message layer's Position Y/X, Opacity, Scale. Reads the Controls null's
  values (via `CTL()`), the row's own entrance (slide/fade/pop) from its marker, and a transient that
  accounts for older rows still growing in.
- **`scrollExpression()`** — the Scroll null: baked hold-keys (`SceneData.scroll`, the settled stack top
  `(H - pb - S(tau))`) **plus** an expression transient that smooths the per-arrival jumps.
- **`exprLib()`** — shared functions baked into every expression: `EASE`, `P`, `BACK`, `GROW`, `TS`, `CTL`,
  and (when the scroll is decoupled) `ES`/`GROWS`/`SLEAD`/`SDUR` from `scrollLib()`.
- Per-message **markers** carry `ts <t0> <h> <hDel> <delAt>` (chapter text) — expressions parse these to
  find every other row's arrival time/height.

> **CRITICAL AE invariant:** a baked keyframe and the expression transient meant to smooth it **must fire at
> the same time**. This is exactly what the scroll-lead bug was (see §9 / §11): the transient was shifted
> earlier by the lead but the baked scroll key still stepped at the arrival instant → the whole stack
> lurched. When editing scroll/stack timing, keep `scene.ts`'s baked keys and `index.jsx`'s transient in
> lockstep.

### The grouped Effect Controls = a pseudo-effect (`twitchsim-controls.ffx`)
AE has **no folders in Effect Controls** unless the effect is a *pseudo effect*, and ExtendScript **cannot
create one**. So the grouped "TwitchSim Controls" is a **hand-authored `.ffx` animation preset**, generated
by `scripts/make-controls-ffx.mjs` (`npm run make:controls-ffx`) from RIFX byte templates in `scripts/ffx/`.
It rebuilds the 148-byte `pard` parameter records and 124-byte `tdb4` stream headers.

To **add a control** to the grouped effect you must edit the generator (the parameter list + the `PN`/`NM`
name maps in `index.jsx`, `controlDefaults()`, and the preset bytes) and regenerate. The host applies it
with `layer.applyPreset(File)`, which **replaces the whole effect stack** — so snapshot the flat values
first and **re-fetch** `layer.property("ADBE Effect Parade")` after (the old ref becomes invalid). There is
a **flat expression-control fallback** (`NM` map) for when the pseudo-effect isn't present. See the
`twitchsim-ae-panel` note in the owner's memory for the byte-format specifics (pard type bytes, popup items,
group start/end blobs).

### `twitchsim-styles.ffx`
A layer-style preset (drop shadow / stroke / colour overlay). Applied because
`app.executeCommand(9000/9006/9008)` silently no-ops until that Layer Styles submenu has been opened once in
the session; `applyPreset` targets the *selected* layer, so deselect-all + select first.

---

## 8. The "size / placement" model (read before touching sizing)

There are **four independent size knobs** — keep them straight, they're the source of most confusion:

| Knob | Config | What it does |
|---|---|---|
| **Text size** | `fontScale` (0.6–10×) + `fontSize` preset | how big the text/badges are *within the column* |
| **Overall zoom** | `chatScale` (0.5–4×) | proportional zoom of the WHOLE chat box — width, height, text, spacing together |
| **Chat area** | `width` × `height` (Twitch-px) | the column/scroll-region size |
| **Output resolution** | `exportScale` (1–5.6×) + `framePreset`/`frameW/H` | render resolution & the comp/frame size |

**`styleFromConfig` applies `zoom = chatScale` to** width, height, fontSize, lineHeight, padX,
paddingBottom, cornerRadius, letterSpacing. **`computeGeometry` applies it to** `chatW`/`chatH`. Badges,
avatars and many gaps scale with `scale = fontSize/14` (so they follow both fontScale and chatScale).

**"Fit to the frame" button (`StylePanel.tsx`)** — because a tall 340×600 chat can't *proportionally* fill a
wide 16:9 frame, this sets the chat **area** to the frame (`width = (frameW-2·marginX)/exportScale`, height
likewise) with a readable `fontScale` (~5% of frame height) at `chatScale = 1`. This is the recommended
full-screen path (nothing overflows).

**Anchor caveat:** `cfg.anchor` defaults to `'c'` (center). If a user manually over-zooms so `chatH > frame
height`, `computeGeometry`'s center math puts the newest (bottom) rows *below* the comp. Fit-to-frame avoids
this (zoom stays 1). A **bottom anchor** for full-screen is a recommended future improvement (see §11).

**exportScale × fixed frame footgun:** `chatW/chatH` are multiplied by `exportScale` but a fixed preset's
`outW/outH` are absolute px — so a hand-set width/height at `exportScale = 3` is 3× too big for the frame.
Fit-to-frame compensates by dividing by `exportScale`; manual sizing does not.

---

## 9. Recent work (context for what's fresh)

Commits (newest first), all on `main`:

- **`b7e1182` — full-screen glitch fixes.** Root cause: `chatScale` scaled width+text but not the chat-area
  **height**, so the matte/background stayed short and clipped the (taller) rows → "text cut in half / gray
  background too small." Fixed to a true uniform zoom. Also fixed a cluster of **hard-coded px constants that
  didn't scale** (`padY` row padding, accent-bar width, inline gaps → now `×(fs/14)`), the **deleted-line
  italic-measure mismatch** (baked italic into the font string so measured width = drawn width), and made the
  **Preview canvas zoom-aware** (it was sizing to un-zoomed `cfg.width/height`, showing only the top-left of a
  zoomed chat). Replaced "Fill width" with **"Fit to the frame"**; raised `fontScale` max 2.5→10.
- **`c88e476` — Chat size zoom + separate fonts.** Added `chatScale` and the `nameFont` (username font,
  separate from `fontFamily`). The AE build picks up the per-run font automatically via `parseFont`.
- **`462eb6e` — bug scan.** Fixed: preset-load wiped uploaded images; hi-res asset preload/render mismatch
  (a mid-file sharpness pop); `rowStackGrow` instant divergence; ease finite-guard + sample clamp; missing
  sanitize ENUMs; duplicated `customColorRatio` control; `prefillSec` toggle conflict.
- **`49c9efc` — scroll-lead.** The list can open the gap ~0.15 s **before** a message slides in (decoupled
  scroll ease/duration/lead). `scrollCanLead()` restricts it to styles whose entrance is independent of the
  vertical stack (slide-left/right, fade, slide-fade, pop) — pure slide-up/instant stay coupled (leading them
  would open a blank gap and pop the row in). **The AE fix required shifting the baked scroll keys earlier by
  the lead** so they realign with the transient (the "AE invariant" in §7).

---

## 10. Testing & debugging

### Browser
`npm run dev`, open the site. `window.__twitchsim` exposes debug hooks: `patch(partialConfig)`,
`reset()`, `timeline`, `snapshot(tMs)` (renders one export-pipeline frame → Blob), `scene(name?)` (compiles
`SceneData`), `shareCode()`, `cfg`.

### After Effects panel (the important, fiddly part)
- Install/link the panel: `npm run cep:link` (symlink — edits to `cep/` are live after a panel reload).
- The panel enables a **CEF remote-debug port `8722`** (`cep/.debug`). Drive it with a tiny CDP client
  (`Runtime.evaluate`, `Page.captureScreenshot`, `Page.reload`) — the same `window.__twitchsim` hooks are
  available, plus `callHost(fn,args)`, `evalScript(code)`, `ensureHost()`. The **host** exposes
  `TWITCHSIM.snapshot({compName,time,path})` (saveFrameToPng — async, wait for the file to stop growing),
  `TWITCHSIM.info()`, `begin/step/finish/remove`.
- **Frame-parity check**: build in AE, then compare `TWITCHSIM.snapshot` frames against `__twitchsim.snapshot`
  (PIL diff). A clean match is **~2/255 mean**. **Do not read `bad-of-ink %` as a mismatch** — its denominator
  is ink pixels (tiny for thin text), so glyph-edge AA alone inflates it to 50–75% on a perfect match. Trust
  MEAN diff, identical `img.getbbox()`, and an amplified diff heatmap (differences that trace glyph outlines =
  AA only; solid/ghosted regions = a real bug). At big font sizes mean naturally rises (magnified AA), not a bug.

### ExtendScript (ES3) landmines — `cep/host/index.jsx`
- **ASCII only**, no trailing commas, **no ES5+ array methods** (`.map/.forEach/.indexOf` on arrays), no ASI
  reliance. In particular `continue`/`break` followed by a newline + `if` parses as a **label** → an
  uncatchable empty result. Always emit semicolons. `"str" + array/Error` throws — `String(x)` first.
- `$.evalFile` inside a function wrapper makes the file's `var`s local → assign `$.global.X`.
- CEP `evalScript` **blocks the panel's JS thread** for the whole call — a long build freezes the panel.
- **AE's text engine leaks undo objects per scripted `TextDocument` attribute set, for the whole AE session**
  (even across projects). After a few thousand text layers, `addText` takes ~1 s and builds crawl. **The only
  fix is restarting AE.** The builder mitigates by styling one template layer per look and `copyToComp`; still,
  **don't run many large builds in one session** (this is what hung AE during full-screen testing).
- `TextDocument.tracking` must be an **integer** (1/1000 em). `horizontalScale/verticalScale` are fractions.

### Pseudo-effect caching
AE caches a pseudo-effect's parameter definitions by **match name, per session**. Renaming a param has no
effect for a session that already applied the old version — bump the effect name + match name (`PSEUDO` /
the generator) in lockstep when changing params, and re-test in a fresh AE session.

---

## 11. Known issues / open items (a dev's worklist)

Verified by two review passes over the current tree. Roughly prioritized.

**Feature the owner explicitly asked for (not yet built):**
- [ ] **Keyframeable "Chat height" control on the Controls null.** The null Scale already scales the whole
      chat; the ask is a dedicated *height* (chat-area) control that can be animated. Requires: a new slider
      on the pseudo-effect (regenerate `twitchsim-controls.ffx` + update `PN`/`NM`/`controlDefaults`), an
      expression driving the **matte height + background height** from it, and making the scroll bottom-pin
      respect it. Non-trivial because of the `.ffx` byte-authoring (§7).

**Correctness / robustness (from the scan; some may be quick wins):**
- [ ] **Center anchor drops newest rows below the comp when `chatH > frameH`** (`exporter.ts` computeGeometry
      + host null anchor). Recommend a **bottom anchor** option for full-screen, or clamp/warn when the chat
      is taller than the frame. Fit-to-frame currently avoids it.
- [ ] **`fadeTopEdge` (top fade) not scaled by `chatScale`.** Scaled by `exportScale` in `scene.ts` but not
      by zoom → a fixed-px fade covers the wrong fraction of a zoomed chat. Multiply by `zoom` in the render
      options (`Preview.tsx`, `exporter.ts`) and in `scene.ts`.
- [ ] **Separate name-font vertical metrics.** Name runs use the *message* font's ascent/descent
      (`fontMetrics(fs, style.fontFamily)`), and badges center on the message font's x-height. If `nameFont`
      is a taller face, the username can clip into the row above at large sizes. Measure name metrics with
      `nameFontFamily`.
- [ ] **Matte gated on AE ≥ 2023 with no fallback** (`index.jsx`). On older AE no track matte is created, so
      rows scroll out over/above the background (content exceeds the gray panel). Add a non-track-matte clip
      fallback (e.g. a mask or a pre-comp).
- [ ] **`exportScale` × fixed-preset unit mismatch** (§8) — a latent footgun for hand-set width/height. Either
      multiply preset `outW/outH` by `exportScale` too, or keep steering users through Fit-to-frame.

**Lower-severity polish (all in `layout.ts`/`renderer.ts`, same "hard-coded px" class as §9):**
- [ ] Highlight body pill padding/radius, text-shadow blur/offset, link underline thickness — fixed px, look
      thin/invisible under large text; scale by `fs/14`.
- [ ] Notice inter-block gap and outer margins — already partly scaled in `b7e1182`; audit the rest.

---

## 12. Landmines cheat-sheet (things that will bite you)

1. **Web ↔ AE parity is the prime directive.** Layout changes hit both; verify with the frame-parity check.
2. **Baked AE keyframe ↔ expression transient must fire at the same time** (§7) or the stack lurches.
3. **New Config field?** Add to `types.ts` + `defaults.ts` (+ `ENUMS` if a union) or `sanitize` drops it.
   Decide `SIM_KEYS` (re-sim) vs render-only + `styleKey` (relayout).
4. **ES3 in `index.jsx`** — semicolons, no trailing commas, no array methods, ASCII (§10).
5. **Don't do many big AE builds in one session** — text-engine slowdown hangs AE; restart AE between heavy
   sessions.
6. **Pseudo-effect param changes** need `.ffx` regeneration + a fresh AE session (caching, §10).
7. **`applyPreset` replaces the effect stack** — re-fetch the effect parade ref after.
8. **Four size knobs** (§8) — don't conflate `chatScale` (zoom), `fontScale` (text), `width/height` (area),
   `exportScale` (resolution).
9. **Deploy** via `npm run deploy` (gh-pages branch), not a GitHub Action (token lacks `workflow` scope).

---

## 13. Contact points in code (where to start for common tasks)

| Task | Start here |
|---|---|
| Change how a message *looks* (spacing, badges, colours) | `src/core/layout.ts` (`layoutMessage`, `styleFromConfig`) |
| Change entrance animation / scroll | `renderer.ts` (`rowAnimation`, `rowStackGrow`) + `scene.ts` + `index.jsx` expressions |
| Add a look/animation setting | `types.ts` + `defaults.ts` + `useConfig.ts` (ENUMS/SIM_KEYS) + a control in `panels/StylePanel.tsx` (+ `renderer`/`scene`/`layout` to consume it) |
| Change chat content / pacing | `src/core/simulation.ts` (+ `phrases`, `names`, `script.ts`) |
| Add/adjust an AE Controls-null control | `scripts/make-controls-ffx.mjs` + `index.jsx` (`PN`/`NM`/`controlDefaults`/`ensureControls`) |
| Export format work | `src/export/*` |
| AE comp structure / layers | `cep/host/index.jsx` (build flow ~line 1180+) + `src/ae/scene.ts` |

---

*Generated as a handoff snapshot. If something here disagrees with the code, the code wins — this was
accurate at commit `b7e1182`.*
