import { useRef, useState } from 'react'
import type { Config } from '../../core/types'
import { scrollCanLead } from '../../core/types'
import type { ChannelData } from '../../core/channel'
import { loadChannel } from '../../core/channel'
import { Section, Slider, Toggle, Row, Segmented, ColorInput, NumberInput, Select, Field, Collapsible, TextInput } from '../controls'
import { CustomIcons } from './CustomIcons'
import { BADGE_GROUPS, ALL_BADGE_GROUPS } from '../../core/badges'
import { EASE_PRESETS, EASE_PRESET_LABELS, easeFunction, parseKeyframeData } from '../../core/easing'

function EaseControl({ cfg, set, patch }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void }) {
  const kf = cfg.easeKeyframes ? parseKeyframeData(cfg.easeKeyframes) : null
  const fn = easeFunction(cfg)
  const usingKeyframes = !!cfg.easeKeyframes && !!kf
  const usingCurve = !usingKeyframes // a preset or a custom curve → draggable handles

  // the two bézier control points behind the current selection, so the handles can be dragged from anywhere
  const curve: [number, number, number, number] = cfg.easeKeyframes
    ? [0.22, 1, 0.36, 1]
    : cfg.easePreset === 'custom'
      ? cfg.easeCurve
      : cfg.easePreset === 'smooth'
        ? [0.22, 1, 0.36, 1]
        : EASE_PRESETS[cfg.easePreset]

  // editor geometry
  const W = 190
  const H = 120
  const P = 14 // padding so edge handles stay grabbable
  const iw = W - P * 2
  const ih = H - P * 2
  const toX = (x: number) => P + x * iw
  const toY = (y: number) => H - P - y * ih
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<0 | 1 | null>(null)

  const pts: string[] = []
  for (let i = 0; i <= 48; i++) {
    const x = i / 48
    pts.push(`${toX(x).toFixed(1)},${toY(fn(x)).toFixed(1)}`)
  }

  const moveHandle = (which: 0 | 1, clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let x = ((clientX - r.left) * (W / r.width) - P) / iw
    let y = 1 - ((clientY - r.top) * (H / r.height) - P) / ih
    x = Math.max(0, Math.min(1, x))
    y = Math.max(-0.3, Math.min(1.3, y))
    const next = [...curve] as [number, number, number, number]
    next[which * 2] = Math.round(x * 100) / 100
    next[which * 2 + 1] = Math.round(y * 100) / 100
    patch({ easePreset: 'custom', easeCurve: next, easeKeyframes: '' })
  }

  return (
    <div className="ease">
      <Field label="How messages ease in" hint="the speed curve as each message appears. Pick a feel, or drag the dots to shape your own.">
        <Select label="" value={usingKeyframes ? ('custom' as typeof cfg.easePreset) : cfg.easePreset} onChange={(v) => patch({ easePreset: v, easeKeyframes: '' })} options={EASE_PRESET_LABELS} />
      </Field>
      <svg
        ref={svgRef}
        className="ease-editor"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-label="easing curve — drag the dots to shape it"
        onPointerMove={(e) => {
          if (drag === null) return
          e.preventDefault()
          moveHandle(drag, e.clientX, e.clientY)
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} className="ease-diag" />
        <polyline points={pts.join(' ')} className="ease-path" />
        {usingCurve && (
          <>
            <line x1={toX(0)} y1={toY(0)} x2={toX(curve[0])} y2={toY(curve[1])} className="ease-handle-line" />
            <line x1={toX(1)} y1={toY(1)} x2={toX(curve[2])} y2={toY(curve[3])} className="ease-handle-line" />
            {([0, 1] as const).map((h) => (
              <circle
                key={h}
                cx={toX(curve[h * 2])}
                cy={toY(curve[h * 2 + 1])}
                r={7}
                className={'ease-handle' + (drag === h ? ' on' : '')}
                onPointerDown={(e) => {
                  e.preventDefault()
                  ;(e.target as SVGElement).setPointerCapture?.(e.pointerId)
                  setDrag(h)
                }}
              />
            ))}
          </>
        )}
      </svg>
      <div className="ease-legend">
        <span>slow</span>
        <span>time →</span>
        <span>fast</span>
      </div>
      {usingKeyframes && <p className="hint">Using the curve from your pasted After Effects keyframes. Clear the box below to shape it by hand instead.</p>}
      <Collapsible title="Copy an easing curve from After Effects" hint={usingKeyframes ? 'in use' : 'optional'}>
        <ol className="steps">
          <li>In After Effects, <b>click the keyframes</b> you like on any property so they turn blue (selected).</li>
          <li>Press <b>⌘C</b> / <b>Ctrl+C</b> (Edit ▸ Copy) — After Effects only copies keyframes that are selected.</li>
          <li><b>Paste</b> into the box below (⌘V).</li>
        </ol>
        <textarea className="ta small" rows={3} spellCheck={false} placeholder={'Paste your After Effects keyframes here…'} value={cfg.easeKeyframes} onChange={(e) => set('easeKeyframes', e.target.value)} aria-label="After Effects keyframe data" />
        {cfg.easeKeyframes && !kf ? (
          <p className="err">That doesn’t look like copied keyframes. In After Effects, click the keyframes first (so they’re highlighted), then Edit ▸ Copy and paste again.</p>
        ) : (
          cfg.easeKeyframes && <button type="button" className="btn small" onClick={() => set('easeKeyframes', '')}>Clear (use the curve above)</button>
        )}
      </Collapsible>
    </div>
  )
}

export function StylePanel({
  cfg,
  set,
  patch,
  channel,
  setChannel,
}: {
  cfg: Config
  set: <K extends keyof Config>(k: K, v: Config[K]) => void
  patch: (p: Partial<Config>) => void
  channel: ChannelData | null
  setChannel: (c: ChannelData | null) => void
}) {
  const overlayish = cfg.chatStyle === 'transparent' || cfg.chatStyle === 'custom'
  const [chanInput, setChanInput] = useState(cfg.loadedChannel)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const streamerNameRef = useRef(cfg.streamerName)
  streamerNameRef.current = cfg.streamerName
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Section title="Theme">
        <Segmented
          value={cfg.chatStyle}
          onChange={(v) => {
            if (v === 'twitch-light') patch({ chatStyle: v, theme: 'light' })
            else if (v === 'twitch-dark') patch({ chatStyle: v, theme: 'dark' })
            else set('chatStyle', v)
          }}
          options={[
            { value: 'twitch-dark', label: 'Twitch dark', title: 'The twitch.tv chat column, dark theme' },
            { value: 'twitch-light', label: 'Twitch light', title: 'twitch.tv chat, light theme' },
            { value: 'transparent', label: 'Transparent', title: 'No panel background — drop it straight onto your video' },
            { value: 'custom', label: 'Custom', title: 'Your own background color / opacity' },
          ]}
        />
        {cfg.chatStyle === 'custom' && (
          <Row>
            <ColorInput label="Background" value={cfg.bgColor} onChange={(v) => set('bgColor', v)} />
            <Slider label="Opacity" value={cfg.bgOpacity} min={0} max={1} step={0.01} onChange={(v) => set('bgOpacity', v)} format={pct} />
          </Row>
        )}
        {overlayish && (
          <>
            <Field label="Text color">
              <Segmented value={cfg.theme} onChange={(v) => set('theme', v)} options={[{ value: 'dark', label: 'Light text (dark video)' }, { value: 'light', label: 'Dark text (bright video)' }]} />
            </Field>
            <Row>
              <Slider label="Text outline" value={cfg.textOutline} min={0} max={4} step={0.5} onChange={(v) => set('textOutline', v)} format={(v) => (v ? `${v}px` : 'off')} />
              <Toggle label="Text shadow" value={cfg.textShadow} onChange={(v) => set('textShadow', v)} />
            </Row>
          </>
        )}
        <Slider label="Fade out the top edge" value={cfg.fadeTopEdge} min={0} max={300} step={5} onChange={(v) => set('fadeTopEdge', v)} format={(v) => (v ? `${v}px` : 'off')} />
      </Section>

      <Section title="Size & text">
        <Row>
          <Slider label="Width" value={cfg.width} min={200} max={1200} step={2} onChange={(v) => set('width', v)} format={(v) => `${v}px`} />
          <Slider label="Height" value={cfg.height} min={60} max={2160} step={2} onChange={(v) => set('height', v)} format={(v) => `${v}px`} />
        </Row>
        <p className="hint">Twitch's own column is 340 px wide. These are Twitch-scale pixels — the export scale multiplies them (340×600 at 3× = a 1020×1800 overlay).</p>
        <Field label="Font size (Twitch chat setting)">
          <Segmented value={cfg.fontSize} onChange={(v) => set('fontSize', v)} options={[{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Bigger' }, { value: 'xlarge', label: 'Biggest' }]} />
        </Field>
        <Slider label="Letter spacing (kerning)" value={cfg.letterSpacing} min={-1} max={4} step={0.1} onChange={(v) => set('letterSpacing', v)} format={(v) => (Math.abs(v) < 0.05 ? 'none' : `${v > 0 ? '+' : ''}${v.toFixed(1)}px`)} hint="space between letters in the names and messages — negative tightens, positive spreads them out" />
      </Section>

      <Section title="New message animation">
        <Row>
          <Select
            label="Style"
            value={cfg.animation === 'slide' ? 'slide-up' : cfg.animation}
            onChange={(v) => set('animation', v)}
            options={[
              { value: 'slide-up', label: 'Slide up' },
              { value: 'instant', label: 'Instant (like real Twitch)' },
              { value: 'slide-fade', label: 'Slide up + fade' },
              { value: 'fade', label: 'Fade in' },
              { value: 'pop', label: 'Pop' },
              { value: 'slide-left', label: 'From the left' },
              { value: 'slide-right', label: 'From the right' },
            ]}
          />
          {cfg.animation !== 'instant' && <Slider label="Duration" value={cfg.animationMs} min={60} max={800} step={10} onChange={(v) => set('animationMs', v)} format={(v) => `${v}ms`} />}
        </Row>
        {(cfg.animation === 'slide-left' || cfg.animation === 'slide-right') && (
          <Slider label="Slide distance" value={cfg.slideDistance} min={0.1} max={1} step={0.01} onChange={(v) => set('slideDistance', v)} format={(v) => `${Math.round(v * 100)}% of width`} hint="how far it flies in from — 33% ≈ a subtle slide from near the middle" />
        )}
        {cfg.animation !== 'instant' && <EaseControl cfg={cfg} set={set} patch={patch} />}
        {scrollCanLead(cfg.animation) && (
          <Collapsible title="Give the scroll its own timing" hint={(cfg.scrollLead ?? 0) > 0 || cfg.scrollEasePreset !== 'match' || (cfg.scrollDurationMs ?? 0) > 0 ? 'on' : 'off'}>
            <p className="hint">The list can open the gap for a new message slightly <em>before</em> it slides in — the scroll leads the entrance, so the row lands into space that's already waiting. Give the scroll its own speed and easing here.</p>
            <Slider label="List leads the message by" value={cfg.scrollLead} min={0} max={300} step={5} onChange={(v) => set('scrollLead', v)} format={(v) => (v === 0 ? 'off — moves together' : `${v}ms ahead`)} hint="how far ahead the list opens the gap before the message arrives" />
            <Slider label="Scroll duration" value={cfg.scrollDurationMs} min={0} max={800} step={10} onChange={(v) => set('scrollDurationMs', v)} format={(v) => (v === 0 ? 'match the entrance' : `${v}ms`)} hint="how long the list takes to shift up one row" />
            <Select label="Scroll easing" value={cfg.scrollEasePreset} onChange={(v) => set('scrollEasePreset', v as Config['scrollEasePreset'])} options={[{ value: 'match', label: 'Match the entrance easing' }, ...EASE_PRESET_LABELS.filter((o) => o.value !== 'custom')]} />
          </Collapsible>
        )}
        <Toggle label="Fill down (start centered → drop to fill the screen)" value={cfg.fillDown} onChange={(v) => set('fillDown', v)} hint="cinematic: the newest message sits on the centre line, then the column drifts down to fill top-to-bottom" />
        {cfg.fillDown && (
          <Row>
            <Slider label="Stay centered for" value={cfg.fillHold} min={0} max={5} step={0.1} onChange={(v) => set('fillHold', v)} format={(v) => `${v.toFixed(1)}s`} />
            <Slider label="Drift down over" value={cfg.fillDrift} min={0.2} max={5} step={0.1} onChange={(v) => set('fillDrift', v)} format={(v) => `${v.toFixed(1)}s`} />
          </Row>
        )}
      </Section>

      <Section title="Badges & emotes">
        <Row>
          <Toggle label="Badges" value={cfg.showBadges} onChange={(v) => set('showBadges', v)} />
          <Toggle label="Timestamps" value={cfg.timestamps} onChange={(v) => set('timestamps', v)} />
        </Row>
        <Row>
          <Toggle label="Twitch global emotes" value={cfg.useTwitchEmotes} onChange={(v) => set('useTwitchEmotes', v)} />
          <Toggle label="7TV emotes (KEKW, OMEGALUL…)" value={cfg.use7tvEmotes} onChange={(v) => set('use7tvEmotes', v)} />
        </Row>
        <Row>
          <Toggle label="Animated emotes" value={cfg.animatedEmotes} onChange={(v) => set('animatedEmotes', v)} />
          <Slider label="Emotes in filler chat" value={cfg.emoteDensity} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('emoteDensity', v)} />
        </Row>
        {cfg.showBadges && (
          <Collapsible title="Which badges random chatters wear" hint={cfg.badgePool.length === ALL_BADGE_GROUPS.length ? 'all groups' : cfg.badgePool.length === 0 ? 'none' : `${cfg.badgePool.length} of ${ALL_BADGE_GROUPS.length} groups`}>
            <p className="hint">Turn groups off to simulate a chat with only a couple of icons. Badges you write explicitly in your lines ([mod], [sub]…) and your uploaded extras are unaffected.</p>
            <div className="chips">
              {BADGE_GROUPS.map((g) => {
                const on = cfg.badgePool.includes(g.key)
                return (
                  <button key={g.key} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => set('badgePool', on ? cfg.badgePool.filter((k) => k !== g.key) : [...cfg.badgePool, g.key])}>
                    {g.label}
                  </button>
                )
              })}
              <button type="button" className="chip ghost" onClick={() => set('badgePool', ALL_BADGE_GROUPS)}>
                all
              </button>
              <button type="button" className="chip ghost" onClick={() => set('badgePool', [])}>
                none
              </button>
              <button type="button" className="chip ghost" onClick={() => set('badgePool', ['moderator', 'vip', 'subscriber'])}>
                mod / vip / sub only
              </button>
            </div>
          </Collapsible>
        )}
      </Section>

      <CustomIcons cfg={cfg} set={set} patch={patch} />

      <Collapsible title="Advanced look" hint="scale, readable colors, mod view, alternating rows, padding, font">
        <Row>
          <NumberInput label="Exact width (px)" value={cfg.width} min={120} max={3000} onChange={(v) => set('width', Math.round(v))} />
          <NumberInput label="Exact height (px)" value={cfg.height} min={40} max={4000} onChange={(v) => set('height', Math.round(v))} />
        </Row>
        <Row>
          <Slider label="Extra scale (text + badges + emotes)" value={cfg.fontScale} min={0.6} max={2.5} step={0.05} onChange={(v) => set('fontScale', v)} format={(v) => `${v.toFixed(2)}×`} />
          <Slider label="Panel corner radius" value={cfg.cornerRadius} min={0} max={40} onChange={(v) => set('cornerRadius', v)} format={(v) => `${v}px`} hint="rounds the chat panel itself (no effect on the Transparent look)" />
        </Row>
        <Row>
          <Toggle label="Readable colors (Twitch default on)" value={cfg.readableColors} onChange={(v) => set('readableColors', v)} />
          <Toggle label="Bold usernames" value={cfg.boldNames} onChange={(v) => set('boldNames', v)} />
        </Row>
        <Field label="Username colours" hint="Twitch = the 15 default colours hashed from each login; Custom = your own palette (same hashing, so a given name is always the same colour). Give a user an exact colour with [color:#hex] in a line.">
          <Segmented value={cfg.nameColorMode} onChange={(v) => set('nameColorMode', v)} options={[{ value: 'twitch', label: 'Twitch default' }, { value: 'custom', label: 'Custom palette' }]} />
        </Field>
        {cfg.nameColorMode === 'custom' && (
          <div className="palette">
            {cfg.nameColorPalette.map((col, i) => (
              <span className="swatch" key={i}>
                <input type="color" aria-label={`Colour ${i + 1}`} value={/^#[0-9a-f]{6}$/i.test(col) ? col : '#000000'} onChange={(e) => patch({ nameColorPalette: cfg.nameColorPalette.map((c, j) => (j === i ? e.target.value : c)) })} />
                <button type="button" className="x" title="Remove this colour" aria-label={`Remove colour ${i + 1}`} onClick={() => patch({ nameColorPalette: cfg.nameColorPalette.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </span>
            ))}
            <button type="button" className="btn small" onClick={() => patch({ nameColorPalette: [...cfg.nameColorPalette, '#9146ff'] })}>
              + colour
            </button>
            {cfg.nameColorPalette.length === 0 && <span className="fhint">Add at least one colour.</span>}
            {cfg.readableColors && <span className="fhint">“Readable colors” (below) adjusts these for legibility — turn it off for the exact hex.</span>}
          </div>
        )}
        <Slider label="Share who pick a custom colour (Twitch mode)" value={cfg.customColorRatio} min={0} max={1} step={0.02} onChange={(v) => set('customColorRatio', v)} format={pct} hint="in Twitch mode, how many chatters set their own colour (Prime/Turbo) instead of a default" />
        <Row>
          <Toggle label="Alternating row background" value={cfg.alternateBg} onChange={(v) => set('alternateBg', v)} />
          <Toggle label="Broadcaster / mod view (First Time Chat, Raider tags)" value={cfg.modView} onChange={(v) => set('modView', v)} />
        </Row>
        <Row>
          <Toggle label="Hype Train active (gold notice bars)" value={cfg.hypeTrain} onChange={(v) => set('hypeTrain', v)} />
          <Select label="Font family" value={cfg.fontFamily} onChange={(v) => set('fontFamily', v)} options={[{ value: 'Inter', label: 'Inter (Twitch)' }, { value: 'Roobert', label: 'Roobert (if installed)' }, { value: 'Helvetica Neue', label: 'Helvetica Neue' }, { value: 'Arial', label: 'Arial' }, { value: 'system-ui', label: 'System UI' }]} />
        </Row>
        <Row>
          <Slider label="Side padding" value={cfg.paddingX} min={0} max={60} onChange={(v) => set('paddingX', v)} format={(v) => `${v}px`} />
          <Slider label="Bottom padding" value={cfg.paddingBottom} min={0} max={80} onChange={(v) => set('paddingBottom', v)} format={(v) => `${v}px`} />
        </Row>
      </Collapsible>

      <Collapsible title="Badge mix & real channel" hint="how many subs / Prime / bits badges, sub badge style, load a real channel's badges & emotes">
        <Field label="Subscriber badge style">
          <Segmented
            value={cfg.channelSubBadgeStyle}
            onChange={(v) => set('channelSubBadgeStyle', v)}
            options={[
              { value: 'generated', label: 'Generated channel set', title: 'A themed set of tiered sub badges made from the seed' },
              { value: 'default', label: 'Twitch default star' },
              { value: 'custom', label: 'My uploads', title: 'The subscriber badges you uploaded under "Your own icons"' },
              { value: 'channel', label: 'Real channel', title: 'Use the sub badges of the channel loaded below' },
            ]}
          />
        </Field>
        <Row>
          <Slider label="Subscribers" value={cfg.subRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('subRatio', v)} />
          <Slider label="Prime badge" value={cfg.primeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('primeRatio', v)} />
        </Row>
        <Row>
          <Slider label="Bits badges" value={cfg.bitsBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('bitsBadgeRatio', v)} />
          <Slider label="Gifter badges" value={cfg.gifterBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('gifterBadgeRatio', v)} />
        </Row>
        <Row>
          <Slider label="Event badges (Recap, TwitchCon…)" value={cfg.eventBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('eventBadgeRatio', v)} />
          <Slider label="Moderators" value={cfg.modCount} min={0} max={30} onChange={(v) => set('modCount', v)} />
          <Slider label="VIPs" value={cfg.vipCount} min={0} max={50} onChange={(v) => set('vipCount', v)} />
        </Row>
        <Row>
          <TextInput label="Load a real Twitch channel (sub badges + its emotes)" value={chanInput} onChange={setChanInput} placeholder="e.g. xqc" />
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={async () => {
              setLoading(true)
              setErr(null)
              try {
                const data = await loadChannel(chanInput)
                setChannel(data)
                patch({ loadedChannel: data.login, useChannelEmotes: true })
                if (data.subBadges.length) set('channelSubBadgeStyle', 'channel')
                // only fill in the streamer name if the user hasn't typed one meanwhile
                if (streamerNameRef.current === 'Streamer' || !streamerNameRef.current) set('streamerName', data.displayName)
              } catch (e) {
                setErr((e as Error).message)
              } finally {
                setLoading(false)
              }
            }}
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </Row>
        {err && <p className="err">{err}</p>}
        {channel && (
          <p className="ok">
            Loaded <b>{channel.displayName}</b>: {channel.sources.join(', ') || 'no extra data found'}.{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setChannel(null)
                patch({ loadedChannel: '', channelSubBadgeStyle: 'generated' })
              }}
            >
              clear
            </button>
          </p>
        )}
        {channel && <Toggle label="Use the loaded channel's emotes in filler chat" value={cfg.useChannelEmotes} onChange={(v) => set('useChannelEmotes', v)} />}
        <p className="hint">Uses public community APIs (IVR, 7TV, FFZ). Only the channel name is remembered; badges and emotes are fetched again next time.</p>
      </Collapsible>
    </>
  )
}
