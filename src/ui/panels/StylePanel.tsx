import { useRef, useState } from 'react'
import type { Config } from '../../core/types'
import type { ChannelData } from '../../core/channel'
import { loadChannel } from '../../core/channel'
import { Section, Slider, Toggle, Row, Segmented, ColorInput, NumberInput, Select, Field, Collapsible, TextInput } from '../controls'
import { CustomIcons } from './CustomIcons'
import { BADGE_GROUPS, ALL_BADGE_GROUPS } from '../../core/badges'

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
