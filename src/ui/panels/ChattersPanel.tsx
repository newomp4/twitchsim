import { useState } from 'react'
import type { Config } from '../../core/types'
import type { ChannelData } from '../../core/channel'
import { loadChannel } from '../../core/channel'
import { Section, Field, Slider, Toggle, Row, Segmented, TextInput } from '../controls'

export function ChattersPanel({
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
  const [chanInput, setChanInput] = useState(cfg.loadedChannel)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Section title="Chatter pool" hint="A pool of fake users is generated from the seed. A few are very active, most chat rarely (like real chat).">
        <Slider label="Number of chatters" value={cfg.chatterPoolSize} min={3} max={2000} step={1} onChange={(v) => set('chatterPoolSize', v)} />
        <Row>
          <Slider label="Moderators" value={cfg.modCount} min={0} max={30} onChange={(v) => set('modCount', v)} />
          <Slider label="VIPs" value={cfg.vipCount} min={0} max={50} onChange={(v) => set('vipCount', v)} />
        </Row>
        <Slider label="Users with a custom name color" value={cfg.customColorRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('customColorRatio', v)} hint="Others get one of Twitch's 15 default colors (hashed from the login, exactly like Twitch)." />
        <Slider label="Localized display names (e.g. 김민수 (minsu_kim))" value={cfg.localizedNamesRatio} min={0} max={0.3} step={0.01} format={pct} onChange={(v) => set('localizedNamesRatio', v)} />
        <Field label="Custom usernames (comma or newline separated; optional)" hint='Use "Display Name (login)" to control both. These names are used first, then generated ones (unless "only" is on).'>
          <textarea value={cfg.customNames} onChange={(e) => set('customNames', e.target.value)} rows={3} placeholder="xqc, pokimane, Kai Cenat (kaicenat), ..." />
        </Field>
        <Toggle label="Only use my custom names" value={cfg.customNamesOnly} onChange={(v) => set('customNamesOnly', v)} />
      </Section>

      <Section title="Badges" hint="Badges are the real Twitch badge images (loaded from Twitch's CDN) and follow Twitch's ordering rules.">
        <Toggle label="Show badges" value={cfg.showBadges} onChange={(v) => set('showBadges', v)} />
        <Slider label="Subscribers" value={cfg.subRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('subRatio', v)} />
        <Slider label="Prime Gaming badge" value={cfg.primeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('primeRatio', v)} />
        <Row>
          <Slider label="Bits badges" value={cfg.bitsBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('bitsBadgeRatio', v)} />
          <Slider label="Sub gifter badges" value={cfg.gifterBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('gifterBadgeRatio', v)} />
        </Row>
        <Slider label="Event badges (Recap, TwitchCon, SUBtember, Moments…)" value={cfg.eventBadgeRatio} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('eventBadgeRatio', v)} />
        <Field label="Subscriber badge style">
          <Segmented
            value={cfg.channelSubBadgeStyle}
            onChange={(v) => set('channelSubBadgeStyle', v)}
            options={[
              { value: 'generated', label: 'Generated channel set', title: 'A themed set of tiered sub badges made from the seed (like a channel with custom badges)' },
              { value: 'default', label: 'Twitch default (star)', title: "Twitch's default subscriber badges" },
              { value: 'channel', label: 'Real channel', title: 'Use the sub badges of a real channel loaded below' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Load a real channel" hint="Pulls a channel's sub badges and its Twitch / 7TV / FFZ emotes through public community APIs (IVR, 7TV, FFZ). Nothing is stored anywhere.">
        <Row>
          <TextInput label="Twitch channel" value={chanInput} onChange={setChanInput} placeholder="e.g. xqc" />
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
            <button type="button" className="link" onClick={() => { setChannel(null); patch({ loadedChannel: '', channelSubBadgeStyle: 'generated' }) }}>
              clear
            </button>
          </p>
        )}
      </Section>

      <Section title="Emotes" hint="Twitch global emotes + popular 7TV emotes (KEKW, OMEGALUL, monkaS, catJAM…). Images load from the official CDNs.">
        <Slider label="Emote density" value={cfg.emoteDensity} min={0} max={1} step={0.01} format={pct} onChange={(v) => set('emoteDensity', v)} />
        <Toggle label="Twitch global emotes" value={cfg.useTwitchEmotes} onChange={(v) => set('useTwitchEmotes', v)} />
        <Toggle label="7TV emotes (what most viewers see with the extension)" value={cfg.use7tvEmotes} onChange={(v) => set('use7tvEmotes', v)} />
        <Toggle label="Loaded channel's emotes" value={cfg.useChannelEmotes} onChange={(v) => set('useChannelEmotes', v)} />
        <Toggle label="Animated emotes (frame-accurate in exports)" value={cfg.animatedEmotes} onChange={(v) => set('animatedEmotes', v)} />
      </Section>
    </>
  )
}
