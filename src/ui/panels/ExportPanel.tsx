import { useRef, useState } from 'react'
import type { Config } from '../../core/types'
import type { Timeline } from '../../core/simulation'
import type { AssetCache } from '../../core/assets'
import { computeGeometry, runExport, suggestedFilename, mimeFor, type ExportProgress, type ExportResult } from '../../export/exporter'
import { canPickFiles, pickSaveFile, downloadBlob, formatBytes } from '../../export/saveFile'
import { FRAME_PRESETS } from '../../core/defaults'
import { Section, Slider, Toggle, Row, Segmented, ColorInput, NumberInput, Select, Field, PositionGrid } from '../controls'

const FORMATS: { value: Config['exportFormat']; label: string; alpha: boolean; note: string }[] = [
  { value: 'webm-alpha', label: 'WebM (VP9 + alpha)', alpha: true, note: 'Transparent. Plays in Chrome/Firefox/OBS/web; DaVinci Resolve reads it (Mac best). Fast.' },
  { value: 'mov-prores', label: 'MOV ProRes 4444 (alpha)', alpha: true, note: 'Transparent. Universal in Premiere / After Effects / Final Cut / Resolve / CapCut. Slow & large; needs a one-time ~32 MB engine download.' },
  { value: 'png-seq', label: 'PNG sequence (.zip, alpha)', alpha: true, note: 'Transparent. Import as an image sequence anywhere. Biggest files but bullet-proof.' },
  { value: 'mp4', label: 'MP4 (H.264, no alpha)', alpha: false, note: 'Opaque, with the background color below (use green for keying). Smallest / most compatible.' },
  { value: 'webm', label: 'WebM (VP9, no alpha)', alpha: false, note: 'Opaque, small.' },
]

export function ExportPanel({ cfg, set, patch, timeline, assets }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void; timeline: Timeline; assets: AssetCache }) {
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [streamToDisk, setStreamToDisk] = useState(canPickFiles())
  const abortRef = useRef<AbortController | null>(null)
  const geo = computeGeometry(cfg)
  // the length only follows the lines when there are ordered lines
  const autoLen = cfg.durationAuto && (cfg.mode === 'script' || cfg.mode === 'mixed') && !!cfg.script.trim()
  const fmt = FORMATS.find((f) => f.value === cfg.exportFormat) ?? FORMATS[0]
  const frames = Math.max(1, Math.round((timeline.durationMs / 1000) * cfg.exportFps)) // matches makeFrameSource's floor
  const running = !!progress && progress.phase !== 'done' && progress.phase !== 'error' && progress.phase !== 'cancelled'
  const megapixels = (geo.outW * geo.outH) / 1e6

  const start = async () => {
    setError(null)
    setResult(null)
    let handle: FileSystemFileHandle | null = null
    try {
      if (streamToDisk && canPickFiles()) handle = await pickSaveFile(suggestedFilename(cfg), mimeFor(cfg.exportFormat))
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
    const ac = new AbortController()
    abortRef.current = ac
    setProgress({ phase: 'preparing', frame: 0, totalFrames: frames, percent: 0 })
    try {
      const res = await runExport({ config: cfg, timeline, assets, onProgress: setProgress, signal: ac.signal, fileHandle: handle })
      setResult(res)
      ;(window as unknown as { __twitchsim?: Record<string, unknown> }).__twitchsim = { ...((window as unknown as { __twitchsim?: Record<string, unknown> }).__twitchsim ?? {}), lastExport: res }
      setProgress({ phase: 'done', frame: frames, totalFrames: frames, percent: 100, message: 'Done' })
      if (res.blob && !res.savedToDisk) downloadBlob(res.blob, res.filename)
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') setProgress({ phase: 'cancelled', frame: 0, totalFrames: frames, percent: 0, message: 'Cancelled' })
      else {
        console.error(e)
        setError((e as Error).message || String(e))
        setProgress({ phase: 'error', frame: 0, totalFrames: frames, percent: 0 })
      }
    } finally {
      abortRef.current = null
    }
  }

  return (
    <>
      <Section title="Format">
        <Select label="File type" value={cfg.exportFormat} onChange={(v) => set('exportFormat', v)} options={FORMATS.map((f) => ({ value: f.value, label: f.label + (f.alpha ? '  · transparent' : '') }))} />
        <p className="hint">{fmt.note}</p>
        {fmt.alpha ? (
          <Toggle label="Transparent background" value={cfg.exportTransparent} onChange={(v) => set('exportTransparent', v)} hint="Off = the frame is filled with the color below. A Twitch dark/light style keeps its own panel background either way; pick the Transparent look for a fully see-through overlay." />
        ) : (
          <p className="hint">No alpha channel in this format — the frame is filled with the color below.</p>
        )}
        {(!fmt.alpha || !cfg.exportTransparent) && (
          <Row>
            <ColorInput label="Frame background" value={cfg.exportBg} onChange={(v) => set('exportBg', v)} />
            <div className="btns">
              <button type="button" className="btn small" onClick={() => set('exportBg', '#00ff00')}>Green screen</button>
              <button type="button" className="btn small" onClick={() => set('exportBg', '#000000')}>Black</button>
              <button type="button" className="btn small" onClick={() => set('exportBg', '#0e0e10')}>Twitch bg</button>
            </div>
          </Row>
        )}
      </Section>

      <Section title="Resolution">
        <Field label="Scale (chat px → output px)">
          <Segmented value={String(cfg.exportScale)} onChange={(v) => set('exportScale', parseFloat(v))} options={[{ value: '1', label: '1×' }, { value: '2', label: '2× · 1080p' }, { value: '3', label: '3× · 1440p' }, { value: '4', label: '4× · 4K' }, { value: '6', label: '6×' }]} />
        </Field>
        <Field label="Frame">
          <Segmented value={cfg.framePreset} onChange={(v) => set('framePreset', v)} options={(Object.keys(FRAME_PRESETS) as Config['framePreset'][]).map((k) => ({ value: k, label: FRAME_PRESETS[k].label }))} />
        </Field>
        {cfg.framePreset === 'custom' && (
          <Row>
            <NumberInput label="Frame width" value={cfg.frameW} min={16} max={7680} onChange={(v) => set('frameW', Math.round(v))} />
            <NumberInput label="Frame height" value={cfg.frameH} min={16} max={4320} onChange={(v) => set('frameH', Math.round(v))} />
          </Row>
        )}
        {cfg.framePreset !== 'chat' && (
          <>
            <Row>
              <Field label="Chat position in the frame">
                <PositionGrid value={cfg.anchor} onChange={(v) => set('anchor', v)} />
              </Field>
              <NumberInput label="Margin from the edge, X (px)" value={cfg.marginX} min={0} max={4000} onChange={(v) => set('marginX', Math.round(v))} />
              <NumberInput label="Margin Y (px)" value={cfg.marginY} min={0} max={4000} onChange={(v) => set('marginY', Math.round(v))} />
            </Row>
          </>
        )}
        <Row>
          <Select label="Frame rate" value={String(cfg.exportFps)} onChange={(v) => set('exportFps', parseInt(v, 10))} options={[{ value: '24', label: '24 fps' }, { value: '25', label: '25 fps' }, { value: '30', label: '30 fps' }, { value: '50', label: '50 fps' }, { value: '60', label: '60 fps' }]} />
          <Slider label="Duration (s)" value={autoLen ? Math.round(timeline.durationMs / 100) / 10 : cfg.durationSec} min={1} max={600} onChange={(v) => patch({ durationSec: v, durationAuto: false })} format={(v) => (autoLen ? `${v}s (auto)` : `${v}s`)} hint={autoLen ? 'ends right after your last line — moving this switches to a fixed length' : ''} />
        </Row>
        <p className="hint">
          Output: <b>{geo.outW}×{geo.outH}</b> · chat {geo.chatW}×{geo.chatH} at ({geo.chatX},{geo.chatY}) · <b>{frames} frames</b> ({(timeline.durationMs / 1000).toFixed(1)}s @ {cfg.exportFps}fps){megapixels > 8 && cfg.exportFormat === 'mov-prores' ? ' · ProRes at this size is slow (wasm) — expect a few fps' : ''}
        </p>
      </Section>

      <Section title="Export">
        {canPickFiles() && <Toggle label="Stream to a file on disk (pick location first — recommended for big exports)" value={streamToDisk} onChange={setStreamToDisk} />}
        <div className="exportbar">
          {!running ? (
            <button type="button" className="btn primary big" onClick={start}>
              Export {fmt.label}
            </button>
          ) : (
            <button type="button" className="btn big" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
        {progress && (
          <div className="progress">
            <div className="bar">
              <div className="fill" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
            </div>
            <div className="ptext">
              {progress.phase === 'done' ? (result?.savedToDisk ? `Saved to disk ✓` : `Done ✓ ${result ? formatBytes(result.bytes) : ''} — download started`) : progress.message ?? progress.phase}
            </div>
          </div>
        )}
        {result?.blob && !result.savedToDisk && (
          <button type="button" className="btn" onClick={() => downloadBlob(result.blob!, result.filename)}>
            Download again ({formatBytes(result.bytes)})
          </button>
        )}
        {error && <p className="err">{error}</p>}
        <p className="hint">
          Tip: keep this browser tab in the foreground while exporting. Exports are rendered frame-by-frame (not screen-recorded), so they are exact regardless of how fast your machine is.
        </p>
      </Section>
    </>
  )
}
