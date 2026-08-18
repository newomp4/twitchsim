import { useState } from 'react'
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
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Section title="Look">
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
            { value: 'transparent', label: 'Transparent overlay', title: 'No panel background — drop it straight onto your video' },
            { value: 'custom', label: 'Custom background', title: 'Your own background color / opacity / rounding' },
          ]}
        />
        {cfg.chatStyle === 'custom' && (
          <Row>
            <ColorInput label="Background" value={cfg.bgColor} onChange={(v) => set('bgColor', v)} />
            <Slider label="Opacity" value={cfg.bgOpacity} min={0} max={1} step={0.01} onChange={(v) => set('bgOpacity', v)} format={pct} />
            <Slider label="Corner radius" value={cfg.cornerRadius} min={0} max={40} onChange={(v) => set('cornerRadius', v)} />
          </Row>
        )}
        {overlayish && (
          <>
            <Field label="Text color">
              <Segmented value={cfg.theme} onChange={(v) => set('theme', v)} options={[{ value: 'dark', label: 'Light text (dark video)' }, { value: 'light', label: 'Dark text (bright video)' }]} />
            </Field>
            <Row>
              <Toggle label="Text shadow" value={cfg.textShadow} onChange={(v) => set('textShadow', v)} />
              <Slider label="Text outline" value={cfg.textOutline} min={0} max={4} step={0.5} onChange={(v) => set('textOutline', v)} format={(v) => (v ? `${v}px` : 'off')} />
            </Row>
          </>
        )}
        <Slider label="Fade out the top edge" value={cfg.fadeTopEdge} min={0} max={300} step={5} onChange={(v) => set('fadeTopEdge', v)} format={(v) => (v ? `${v}px` : 'off')} />
      </Section>

      <Section title="Size">
        <Row>
          <Slider label="Height" value={cfg.height} min={60} max={2160} step={2} onChange={(v) => set('height', v)} format={(v) => `${v}px`} />
          <NumberInput label="px" value={cfg.height} min={40} max={4000} onChange={(v) => set('height', Math.round(v))} />
        </Row>
        <Row>
          <Slider label="Width" value={cfg.width} min={200} max={1200} step={2} onChange={(v) => set('width', v)} format={(v) => `${v}px`} hint="Twitch's column is 340px" />
          <NumberInput label="px" value={cfg.width} min={120} max={3000} onChange={(v) => set('width', Math.round(v))} />
        </Row>
        <p className="hint">These are Twitch-scale pixels; the export scale (Export tab) multiplies them, so 340×600 at 4× is a 1360×2400 sharp overlay.</p>
      </Section>

      <Section title="Text">
        <Field label="Font size (Twitch chat setting)">
          <Segmented value={cfg.fontSize} onChange={(v) => set('fontSize', v)} options={[{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Bigger' }, { value: 'xlarge', label: 'Biggest' }]} />
        </Field>
        <Slider label="Extra scale (text + badges + emotes)" value={cfg.fontScale} min={0.6} max={2.5} step={0.05} onChange={(v) => set('fontScale', v)} format={(v) => `${v.toFixed(2)}×`} />
      </Section>

      <Section title="New message animation">
        <Segmented
          value={cfg.animation === 'slide' ? 'slide-up' : cfg.animation}
          onChange={(v) => set('animation', v)}
          options={[
            { value: 'instant', label: 'Instant', title: 'What real Twitch does: the message just appears' },
            { value: 'slide-up', label: 'Slide up', title: 'New message pushes the chat up smoothly' },
            { value: 'slide-left', label: 'From the left', title: 'Slides in from the left edge' },
            { value: 'slide-right', label: 'From the right', title: 'Slides in from the right edge' },
            { value: 'fade', label: 'Fade in' },
            { value: 'pop', label: 'Pop', title: 'Scales in with a little bounce' },
            { value: 'slide-fade', label: 'Slide + fade' },
          ]}
        />
        {cfg.animation !== 'instant' && <Slider label="Duration" value={cfg.animationMs} min={60} max={800} step={10} onChange={(v) => set('animationMs', v)} format={(v) => `${v}ms`} />}
      </Section>

      <Section title="Badges & emotes">
        <Row>
          <Toggle label="Badges" value={cfg.showBadges} onChange={(v) => set('showBadges', v)} />
          <Toggle label="Timestamps" value={cfg.timestamps} onChange={(v) => set('timestamps', v)} />
        </Row>
        {cfg.showBadges && (
          <Field label="Badges random chatters may wear" hint="Turn groups off to simulate a chat with only a couple of icons. Badges you write explicitly in your lines ([mod], [sub]…) and your uploaded extras are unaffected.">
            <div className="chips">
              {BADGE_GROUPS.map((g) => {
                const on = cfg.badgePool.includes(g.key)
                return (
                  <button key={g.key} type="button" className={'chip' + (on ? ' on' : '')} onClick={() => set('badgePool', on ? cfg.badgePool.filter((k) => k !== g.key) : [...cfg.badgePool, g.key])}>
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
          </Field>
        )}
        <Row>
          <Toggle label="Twitch global emotes" value={cfg.useTwitchEmotes} onChange={(v) => set('useTwitchEmotes', v)} />
          <Toggle label="7TV emotes (KEKW, OMEGALUL…)" value={cfg.use7tvEmotes} onChange={(v) => set('use7tvEmotes', v)} />
        </Row>
        <Row>
          <Toggle label="Animated emotes" value={cfg.animatedEmotes} onChange={(v) => set('animatedEmotes', v)} />
          <Slider label="Emote density in filler chat" value={cfg.emoteDensity} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('emoteDensity', v)} />
        </Row>
      </Section>

      <CustomIcons cfg={cfg} set={set} patch={patch} />

      <Collapsible title="Advanced look" hint="readable colors, mod view, alternating rows, padding, font family">
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
                patch({ loadedChannel: data.login, channelSubBadgeStyle: data.subBadges.length ? 'channel' : cfg.channelSubBadgeStyle, useChannelEmotes: true, streamerName: cfg.streamerName === 'Streamer' ? data.displayName : cfg.streamerName })
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
        <p className="hint">Uses public community APIs (IVR, 7TV, FFZ); nothing is stored anywhere.</p>
      </Collapsible>
    </>
  )
}
