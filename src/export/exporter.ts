import type { Config } from '../core/types'
import type { Timeline } from '../core/simulation'
import { ChatRenderer, collectAssetUrls } from '../core/renderer'
import type { AssetCache } from '../core/assets'
import { styleFromConfig } from '../core/layout'
import { FRAME_PRESETS } from '../core/defaults'
import { ensureFonts } from '../core/fonts'
import { exportPngZip } from './pngZip'
import { exportWithMediabunny } from './mediabunnyExport'
import { exportProRes } from './ffmpegExport'

export type ExportPhase = 'preparing' | 'loading-assets' | 'rendering' | 'encoding' | 'finalizing' | 'done' | 'error' | 'cancelled'

export interface ExportProgress {
  phase: ExportPhase
  frame: number
  totalFrames: number
  percent: number
  message?: string
}

export interface ExportResult {
  blob?: Blob
  filename: string
  mime: string
  savedToDisk: boolean
  bytes: number
}

export interface ExportGeometry {
  outW: number
  outH: number
  chatX: number
  chatY: number
  scale: number
  chatW: number
  chatH: number
}

export function computeGeometry(cfg: Config): ExportGeometry {
  const scale = cfg.exportScale
  const chatW = Math.round(cfg.width * scale)
  const chatH = Math.round(cfg.height * scale)
  let outW = chatW
  let outH = chatH
  let chatX = 0
  let chatY = 0
  if (cfg.framePreset !== 'chat') {
    const p = FRAME_PRESETS[cfg.framePreset] ?? FRAME_PRESETS.chat
    outW = cfg.framePreset === 'custom' ? cfg.frameW : p.w || chatW
    outH = cfg.framePreset === 'custom' ? cfg.frameH : p.h || chatH
    const mx = cfg.marginX
    const my = cfg.marginY
    const a = cfg.anchor
    chatX = a === 'tl' || a === 'bl' || a === 'l' ? mx : a === 'tr' || a === 'br' || a === 'r' ? outW - chatW - mx : Math.round((outW - chatW) / 2)
    chatY = a === 'tl' || a === 't' || a === 'tr' ? my : a === 'bl' || a === 'b' || a === 'br' ? outH - chatH - my : Math.round((outH - chatH) / 2)
  }
  // video codecs need even dimensions
  outW = Math.max(2, Math.ceil(outW / 2) * 2)
  outH = Math.max(2, Math.ceil(outH / 2) * 2)
  return { outW, outH, chatX, chatY, scale, chatW, chatH }
}

export interface FrameSource {
  canvas: OffscreenCanvas
  totalFrames: number
  fps: number
  /** renders frame i into the canvas */
  render(i: number): void
  geometry: ExportGeometry
  transparent: boolean
}

export function formatNeedsAlpha(f: Config['exportFormat']): boolean {
  return f === 'png-seq' || f === 'webm-alpha' || f === 'mov-prores'
}

export function makeFrameSource(cfg: Config, tl: Timeline, assets: AssetCache): FrameSource {
  const geometry = computeGeometry(cfg)
  const fps = cfg.exportFps
  const durationMs = tl.durationMs
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps))
  const canvas = new OffscreenCanvas(geometry.outW, geometry.outH)
  const ctx = canvas.getContext('2d', { alpha: true })!
  const renderer = new ChatRenderer(assets)
  const style = styleFromConfig(cfg)
  const transparent = cfg.exportTransparent && formatNeedsAlpha(cfg.exportFormat)
  const render = (i: number) => {
    const t = (i / fps) * 1000
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, geometry.outW, geometry.outH)
    if (!transparent) {
      ctx.fillStyle = cfg.exportBg
      ctx.fillRect(0, 0, geometry.outW, geometry.outH)
    }
    ctx.translate(geometry.chatX, geometry.chatY)
    ctx.scale(geometry.scale, geometry.scale)
    renderer.render(ctx, tl, t, {
      style,
      animation: cfg.animation,
      animationMs: cfg.animationMs,
      fadeTopEdge: cfg.fadeTopEdge,
      hiRes: geometry.scale > 1.25,
      forceBg: style.transparent && !transparent ? null : undefined,
    })
  }
  return { canvas, totalFrames, fps, render, geometry, transparent }
}

export interface ExportParams {
  config: Config
  timeline: Timeline
  assets: AssetCache
  onProgress: (p: ExportProgress) => void
  signal: AbortSignal
  /** ask the user for a save location up-front (streams to disk when possible) */
  fileHandle?: FileSystemFileHandle | null
}

export function suggestedFilename(cfg: Config): string {
  const seed = cfg.seed.replace(/[^a-z0-9_-]/gi, '')
  const base = `twitchsim${seed && seed !== 'twitchsim' ? '-' + seed : ''}-${cfg.exportFps}fps`
  switch (cfg.exportFormat) {
    case 'png-seq':
      return `${base}-png.zip`
    case 'webm-alpha':
      return `${base}-alpha.webm`
    case 'webm':
      return `${base}.webm`
    case 'mp4':
      return `${base}.mp4`
    case 'mov-prores':
      return `${base}-prores4444.mov`
  }
}

export function mimeFor(f: Config['exportFormat']): string {
  switch (f) {
    case 'png-seq':
      return 'application/zip'
    case 'webm-alpha':
    case 'webm':
      return 'video/webm'
    case 'mp4':
      return 'video/mp4'
    case 'mov-prores':
      return 'video/quicktime'
  }
}

export async function runExport(p: ExportParams): Promise<ExportResult> {
  const { config: cfg, timeline: tl, assets, onProgress, signal } = p
  onProgress({ phase: 'preparing', frame: 0, totalFrames: 0, percent: 0, message: 'Loading fonts…' })
  await ensureFonts(cfg.fontFamily)
  const style = styleFromConfig(cfg)
  const geometry = computeGeometry(cfg)
  const urls = collectAssetUrls(tl, geometry.scale > 1.25, style)
  onProgress({ phase: 'loading-assets', frame: 0, totalFrames: 0, percent: 0, message: `Loading ${urls.length} images…` })
  await assets.loadAll(urls, (done, total) => {
    if (signal.aborted) throw new DOMException('cancelled', 'AbortError') // Cancel works while images load, too
    onProgress({ phase: 'loading-assets', frame: done, totalFrames: total, percent: total ? (done / total) * 100 : 100, message: `Loading images ${done}/${total}` })
  })
  if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
  const source = makeFrameSource(cfg, tl, assets)
  const filename = suggestedFilename(cfg)
  const mime = mimeFor(cfg.exportFormat)
  const common = { source, onProgress, signal, filename, mime, fileHandle: p.fileHandle ?? null }
  switch (cfg.exportFormat) {
    case 'png-seq':
      return exportPngZip(common)
    case 'webm-alpha':
      return exportWithMediabunny({ ...common, container: 'webm', codec: 'vp9', alpha: true })
    case 'webm':
      return exportWithMediabunny({ ...common, container: 'webm', codec: 'vp9', alpha: false })
    case 'mp4':
      return exportWithMediabunny({ ...common, container: 'mp4', codec: 'avc', alpha: false })
    case 'mov-prores':
      return exportProRes(common)
  }
}

export interface CommonExportArgs {
  source: FrameSource
  onProgress: (p: ExportProgress) => void
  signal: AbortSignal
  filename: string
  mime: string
  fileHandle: FileSystemFileHandle | null
}

/** Yield to the event loop so the UI can repaint (MessageChannel is not throttled in background tabs, unlike setTimeout). */
export function tick(): Promise<void> {
  return new Promise((r) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => {
      ch.port1.close()
      r()
    }
    ch.port2.postMessage(0)
  })
}
