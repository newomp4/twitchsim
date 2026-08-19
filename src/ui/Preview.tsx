import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Config } from '../core/types'
import type { Timeline } from '../core/simulation'
import { ChatRenderer } from '../core/renderer'
import type { AssetCache } from '../core/assets'
import { styleFromConfig } from '../core/layout'
import { computeGeometry } from '../export/exporter'
import { easeFunction, easeFromPreset } from '../core/easing'

export interface PlayerState {
  t: number
  playing: boolean
  loop: boolean
  speed: number
}

export function usePlayer(durationMs: number) {
  const [playing, setPlaying] = useState(true)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const tRef = useRef(0)
  const [tState, setTState] = useState(0)
  const lastFrame = useRef<number | null>(null)
  const listeners = useRef(new Set<() => void>())
  const subscribe = useCallback((fn: () => void) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])
  useEffect(() => {
    let raf = 0
    let uiAcc = 0
    const onVis = () => {
      if (document.visibilityState !== 'hidden') {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(step)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    const step = (now: number) => {
      if (document.visibilityState !== 'hidden') raf = requestAnimationFrame(step)
      if (lastFrame.current === null) lastFrame.current = now
      const dt = now - lastFrame.current
      lastFrame.current = now
      if (playing) {
        let t = tRef.current + dt * speed
        if (t >= durationMs) {
          if (loop) t = t % Math.max(1, durationMs)
          else {
            t = durationMs
            setPlaying(false)
          }
        }
        tRef.current = t
        uiAcc += dt
        if (uiAcc > 80) {
          uiAcc = 0
          setTState(t)
        }
      }
      for (const l of listeners.current) l()
    }
    raf = requestAnimationFrame(step)
    // rAF is paused in hidden tabs; keep time flowing (at a low rate) with a timer fallback
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') step(performance.now())
    }, 100)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [playing, loop, speed, durationMs])
  const seek = useCallback((t: number) => {
    tRef.current = Math.max(0, Math.min(durationMs, t))
    setTState(tRef.current)
  }, [durationMs])
  const restart = useCallback(() => {
    tRef.current = 0
    setTState(0)
    setPlaying(true)
  }, [])
  /** play/pause; pressing play at the very end starts over */
  const toggle = useCallback(() => {
    if (!playing && tRef.current >= durationMs - 1) {
      tRef.current = 0
      setTState(0)
    }
    setPlaying(!playing)
  }, [playing, durationMs])
  return { tRef, t: tState, playing, setPlaying, toggle, loop, setLoop, speed, setSpeed, seek, restart, subscribe }
}

export type Player = ReturnType<typeof usePlayer>

export function Preview({ cfg, timeline, assets, player, zoom, fontsVersion = 0 }: { cfg: Config; timeline: Timeline; assets: AssetCache; player: Player; zoom: number | 'fit' | 'auto'; fontsVersion?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const renderer = useMemo(() => new ChatRenderer(assets), [assets])
  // a new timeline re-uses message ids from 1: drop cached layouts (also when a font arrived late)
  useEffect(() => renderer.invalidate(), [renderer, timeline, fontsVersion])
  const style = useMemo(() => styleFromConfig(cfg), [cfg])
  const ease = useMemo(() => easeFunction(cfg), [cfg])
  const scrollEase = useMemo(() => (cfg.scrollEasePreset && cfg.scrollEasePreset !== 'match' ? easeFromPreset(cfg.scrollEasePreset, cfg.easeCurve) : undefined), [cfg])
  const [fitScale, setFitScale] = useState(1)
  const dpr = Math.min(3, window.devicePixelRatio || 1)

  // fit-to-container zoom
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      // 16px padding each side, plus the meta line + gap under the stage
      const s = Math.min((r.width - 32) / cfg.width, (r.height - 32 - 28) / cfg.height)
      setFitScale(Math.max(0.1, Math.min(4, s)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [cfg.width, cfg.height])
  const zoomScale = zoom === 'fit' ? fitScale : zoom === 'auto' ? Math.min(1, fitScale) : zoom

  // draw loop (depends on the player's stable refs, not the player object — that changes ~12×/s while playing)
  const { tRef, subscribe } = player
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // supersample: at least 2 device pixels per CSS px so text stays crisp even on 1× displays
    const pxScale = Math.min(4, Math.max(2, dpr) * Math.max(0.5, zoomScale))
    canvas.width = Math.round(cfg.width * pxScale)
    canvas.height = Math.round(cfg.height * pxScale)
    const ctx = canvas.getContext('2d', { alpha: true })!
    let dirty = true
    let lastT = -1
    let lastAssets = -1
    const draw = () => {
      const t = tRef.current
      if (!dirty && t === lastT && assets.version === lastAssets) return
      dirty = false
      lastT = t
      lastAssets = assets.version
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.scale(pxScale, pxScale)
      renderer.render(ctx, timeline, t, { style, animation: cfg.animation, animationMs: cfg.animationMs, ease, fadeTopEdge: cfg.fadeTopEdge, hiRes: pxScale * (cfg.fontScale ?? 1) > 1.25, scrollEase })
    }
    const unsub = subscribe(draw)
    draw()
    return unsub
  }, [cfg, timeline, style, ease, scrollEase, renderer, tRef, subscribe, assets, dpr, zoomScale, fontsVersion])

  const geo = computeGeometry(cfg)
  return (
    <div className="preview-wrap" ref={wrapRef}>
      <div className={'preview-stage' + (style.transparent || (cfg.chatStyle === 'custom' && cfg.bgOpacity < 1) ? ' checker' : '')} style={{ width: cfg.width * zoomScale, height: cfg.height * zoomScale }}>
        <canvas ref={canvasRef} style={{ width: cfg.width * zoomScale, height: cfg.height * zoomScale }} />
      </div>
      <div className="preview-meta">
        {cfg.width}×{cfg.height} px chat · export {geo.outW}×{geo.outH} @ {cfg.exportFps}fps · {timeline.messages.length} messages · {(timeline.durationMs / 1000).toFixed(1)}s
      </div>
    </div>
  )
}

export function Transport({ player, durationMs }: { player: Player; durationMs: number }) {
  const t = player.t
  const wasPlaying = useRef(false)
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`
  }
  return (
    <div className="transport">
      <button type="button" className="icon" onClick={() => player.restart()} title="Restart" aria-label="Restart">
        ⟲
      </button>
      <button type="button" className="icon primary" onClick={() => player.toggle()} title={player.playing ? 'Pause' : 'Play'} aria-label={player.playing ? 'Pause' : 'Play'}>
        {player.playing ? '❚❚' : '▶'}
      </button>
      <span className="time">{fmt(t)}</span>
      <input
        type="range"
        min={0}
        max={durationMs}
        step={16}
        value={Math.min(t, durationMs)}
        aria-label="Seek"
        onChange={(e) => player.seek(parseFloat(e.target.value))}
        onPointerDown={() => {
          wasPlaying.current = player.playing
          player.setPlaying(false)
        }}
        onPointerUp={() => {
          if (wasPlaying.current) player.setPlaying(true)
        }}
      />
      <span className="time">{fmt(durationMs)}</span>
      <select value={player.speed} onChange={(e) => player.setSpeed(parseFloat(e.target.value))} title="Preview speed" aria-label="Preview speed">
        <option value={0.25}>0.25×</option>
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
        <option value={4}>4×</option>
      </select>
      <label className="loopbtn" title="Loop">
        <input type="checkbox" checked={player.loop} onChange={(e) => player.setLoop(e.target.checked)} /> loop
      </label>
    </div>
  )
}
