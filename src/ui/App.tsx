import { useEffect, useMemo, useState } from 'react'
import { useConfig, useSimConfig, encodeShare } from './useConfig'
import { Preview, Transport, usePlayer } from './Preview'
import { ChatPanel } from './panels/ChatPanel'
import { StylePanel } from './panels/StylePanel'
import { ExportPanel } from './panels/ExportPanel'
import { HelpPanel } from './panels/HelpPanel'
import { AssetCache } from '../core/assets'
import { EmoteRegistry, TWITCH_GLOBAL_EMOTES, SEVENTV_EMOTES, customEmoteDefs } from '../core/emotes'
import { buildTimeline } from '../core/simulation'
import { generateSubBadgeSet } from '../core/badges'
import { Rng } from '../core/rng'
import type { ChannelData } from '../core/channel'
import { ensureFonts } from '../core/fonts'
import type { Config } from '../core/types'
import { DEFAULT_CONFIG } from '../core/defaults'
import { makeFrameSource } from '../export/exporter'
import { collectAssetUrls } from '../core/renderer'
import { styleFromConfig } from '../core/layout'

const TABS = ['Chat', 'Style', 'Export', 'Help'] as const
type Tab = (typeof TABS)[number]

const assets = new AssetCache()
;(window as unknown as { __twitchsim?: unknown }).__twitchsim = { assets }

export default function App() {
  const { cfg, set, patch, reset, setCfg } = useConfig()
  const [tab, setTab] = useState<Tab>('Chat')
  const [channel, setChannel] = useState<ChannelData | null>(null)
  const [fontsReady, setFontsReady] = useState(false)
  const [zoom, setZoom] = useState<number | 'fit' | 'auto'>('auto')

  useEffect(() => {
    ensureFonts().then(() => setFontsReady(true))
    // small debugging surface (used by tests / power users in the console)
    const g = window as unknown as { __twitchsim?: Record<string, unknown> }
    g.__twitchsim = { ...(g.__twitchsim ?? {}), patch, assets }
  }, [patch])
  useEffect(() => {
    assets.animated = cfg.animatedEmotes
  }, [cfg.animatedEmotes])

  const simCfg = useSimConfig(cfg)
  const registry = useMemo(() => {
    const sets = []
    if (simCfg.customEmotes.length) sets.push(customEmoteDefs(simCfg.customEmotes, simCfg.useCustomEmotesInFiller ? 8 : 0))
    if (simCfg.useTwitchEmotes) sets.push(TWITCH_GLOBAL_EMOTES)
    if (simCfg.use7tvEmotes) sets.push(SEVENTV_EMOTES)
    if (simCfg.useChannelEmotes && channel) sets.unshift(channel.emotes)
    return new EmoteRegistry(sets, simCfg.animatedEmotes)
  }, [simCfg.useTwitchEmotes, simCfg.use7tvEmotes, simCfg.useChannelEmotes, simCfg.animatedEmotes, simCfg.customEmotes, simCfg.useCustomEmotesInFiller, channel])
  const subBadgeSet = useMemo(() => {
    if (simCfg.channelSubBadgeStyle === 'custom') {
      const tiers = simCfg.customBadges
        .filter((b) => b.kind === 'sub')
        .map((b) => ({ months: b.months ?? 0, url: b.src, title: b.name || 'Subscriber', roundable: true }))
        .sort((a, b) => a.months - b.months)
      return { tiers }
    }
    return generateSubBadgeSet(new Rng(simCfg.seed + ':badges'))
  }, [simCfg.seed, simCfg.channelSubBadgeStyle, simCfg.customBadges])
  const timeline = useMemo(
    () =>
      buildTimeline({
        config: simCfg,
        registry,
        subBadgeSet,
        channelBadges: channel ? { subscriber: channel.subBadges, bits: channel.bitsBadges } : null,
      }),
    [simCfg, registry, subBadgeSet, channel],
  )
  useEffect(() => {
    const g = window as unknown as { __twitchsim?: Record<string, unknown> }
    // snapshot(tMs) renders one frame with the export pipeline (handy for debugging / tests)
    const snapshot = async (tMs: number) => {
      const c = { ...cfg, exportFormat: 'png-seq' as const, exportTransparent: false }
      await assets.loadAll(collectAssetUrls(timeline, c.exportScale > 1.25, styleFromConfig(c)))
      const src = makeFrameSource(c, timeline, assets)
      src.render(Math.round((tMs / 1000) * cfg.exportFps))
      return src.canvas.convertToBlob({ type: 'image/png' })
    }
    g.__twitchsim = { ...(g.__twitchsim ?? {}), timeline, snapshot }
  }, [timeline, cfg])
  const player = usePlayer(timeline.durationMs)
  // restart playback when the simulation changes
  useEffect(() => {
    player.seek(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline])

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.code === 'Space') {
        e.preventDefault()
        player.setPlaying(!player.playing)
      } else if (e.key === 'r' || e.key === 'R') player.restart()
      else if (e.key === 'n' || e.key === 'N') set('seed', Math.random().toString(36).slice(2, 8))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, set])

  const share = () => {
    const url = `${location.origin}${location.pathname}#c=${encodeShare(cfg)}`
    navigator.clipboard?.writeText(url).then(
      () => alert('Share link copied to clipboard'),
      () => prompt('Copy this link', url),
    )
  }
  const savePreset = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `twitchsim-${cfg.seed}.json`
    a.click()
  }
  const loadPreset = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const j = JSON.parse(await f.text()) as Partial<Config>
        setCfg({ ...DEFAULT_CONFIG, ...j })
      } catch {
        alert('Invalid preset file')
      }
    }
    input.click()
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#9147ff" /><path d="M9 7h15v11l-5 5h-4l-3 3v-3H9z" fill="#fff" /><rect x="15" y="11" width="2" height="5" fill="#9147ff" /><rect x="19" y="11" width="2" height="5" fill="#9147ff" /></svg>
          </span>
          TwitchSim <span className="sub">fake Twitch chat → transparent video</span>
        </div>
        <div className="topbtns">
          <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === 'fit' || e.target.value === 'auto' ? (e.target.value as 'fit' | 'auto') : parseFloat(e.target.value))} title="Preview zoom">
            <option value="auto">Auto</option>
            <option value="fit">Fit</option>
            <option value="0.5">50%</option>
            <option value="1">100%</option>
            <option value="1.5">150%</option>
            <option value="2">200%</option>
          </select>
          <button type="button" className="btn small" onClick={share}>Share link</button>
          <button type="button" className="btn small" onClick={savePreset}>Save preset</button>
          <button type="button" className="btn small" onClick={loadPreset}>Load preset</button>
          <button type="button" className="btn small" onClick={() => { if (confirm('Reset all settings to defaults?')) reset() }}>Reset</button>
          <a className="btn small" href="https://github.com/newomp4/twitchsim" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </header>
      <main className="main">
        <section className="stage">
          {fontsReady ? <Preview cfg={cfg} timeline={timeline} assets={assets} player={player} zoom={zoom} /> : <div className="loading">Loading fonts…</div>}
          <Transport player={player} durationMs={timeline.durationMs} />
        </section>
        <aside className="panel">
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} type="button" className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className="panel-body">
            {tab === 'Chat' && <ChatPanel cfg={cfg} set={set} />}
            {tab === 'Style' && <StylePanel cfg={cfg} set={set} patch={patch} channel={channel} setChannel={setChannel} />}
            {tab === 'Export' && <ExportPanel cfg={cfg} set={set} patch={patch} timeline={timeline} assets={assets} />}
            {tab === 'Help' && <HelpPanel />}
          </div>
        </aside>
      </main>
    </div>
  )
}
