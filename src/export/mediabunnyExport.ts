import { Output, WebMOutputFormat, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, canEncodeVideo, type VideoCodec } from 'mediabunny'
import type { CommonExportArgs, ExportResult } from './exporter'
import { tick } from './exporter'
import { guardedWritable } from './saveFile'

export interface MediabunnyArgs extends CommonExportArgs {
  container: 'webm' | 'mp4'
  codec: 'vp9' | 'vp8' | 'avc' | 'av1'
  alpha: boolean
}

/** WebM (VP9, optionally with alpha) or MP4 (H.264) via WebCodecs + mediabunny. Deterministic, frame-accurate. */
export async function exportWithMediabunny(a: MediabunnyArgs): Promise<ExportResult> {
  const { source, onProgress, signal, filename, mime, fileHandle } = a
  const { outW, outH } = source.geometry
  let codec: VideoCodec = a.codec
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(window.isSecureContext ? 'This browser has no WebCodecs video encoder. Use Chrome / Edge, or the PNG sequence export.' : 'Video encoding needs a secure page (https:// or localhost). Open the hosted version, or use the PNG sequence export.')
  }
  const pixels = outW * outH
  // generous bitrate: chat text needs crisp edges
  const bitrate = Math.min(120e6, Math.max(3e6, Math.round(pixels * source.fps * 0.14)))
  const alpha = a.alpha ? ('keep' as const) : ('discard' as const)
  const hardwareAcceleration = a.alpha ? ('prefer-software' as const) : ('no-preference' as const)
  // ask about the configuration we are really going to use (size, bitrate, alpha, hw preference)
  const can = (c: VideoCodec) => canEncodeVideo(c, { width: outW, height: outH, bitrate, alpha, hardwareAcceleration } as Parameters<typeof canEncodeVideo>[1])
  if (!(await can(codec))) {
    const fallbacks: VideoCodec[] = a.container === 'mp4' ? ['avc', 'hevc', 'av1'] : ['vp9', 'vp8', 'av1']
    let found: VideoCodec | null = null
    for (const c of fallbacks) if (await can(c)) { found = c; break }
    if (!found) throw new Error(`This browser cannot encode ${codec}${a.alpha ? ' with alpha' : ''} at ${outW}×${outH} / ${(bitrate / 1e6).toFixed(0)} Mbps. Try a smaller export scale, or use the PNG sequence export.`)
    codec = found
  }
  if (a.alpha && codec !== 'vp9' && codec !== 'vp8') throw new Error('Alpha WebM needs VP9/VP8 encoding, which this browser does not support at this size.')
  const encoderConfig = {
    codec,
    // a plain number = bits per second (`new Quality(n)` would be a *quality level*, which broke H.264 on
    // software encoders with "quantizer 0 / Infinity bps")
    bitrate,
    alpha,
    keyFrameInterval: 2,
    hardwareAcceleration,
  }
  // in-memory exports (no "save to disk" file handle) must fit in RAM several times over
  if (!fileHandle) {
    const estBytes = (bitrate / 8) * (source.totalFrames / source.fps)
    if (estBytes > 1.5e9) throw new Error(`This export is roughly ${(estBytes / 1e9).toFixed(1)} GB — too large to build in memory. Turn on "Save to disk" (Chrome / Edge), lower the export scale or the duration, or export a PNG sequence.`)
  }
  let writable: FileSystemWritableFileStream | null = null
  if (fileHandle) writable = await fileHandle.createWritable()
  const guarded = writable ? guardedWritable(writable) : null
  const target = guarded ? new StreamTarget(guarded.stream as WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number }>, { chunked: true }) : new BufferTarget()
  // when streaming to disk the index (moov) is written at the end — no need to reserve space up front
  const format = a.container === 'mp4' ? new Mp4OutputFormat({ fastStart: writable ? false : 'in-memory' }) : new WebMOutputFormat()
  const output = new Output({ format, target })
  const total = source.totalFrames
  let videoSource: CanvasSource
  try {
    videoSource = new CanvasSource(source.canvas, encoderConfig as ConstructorParameters<typeof CanvasSource>[1])
    output.addVideoTrack(videoSource, { frameRate: source.fps })
    await output.start()
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
      source.render(i)
      await videoSource.add(i / source.fps, 1 / source.fps)
      onProgress({ phase: 'encoding', frame: i + 1, totalFrames: total, percent: ((i + 1) / total) * 100, message: `Encoding frame ${i + 1}/${total} (${codec}${a.alpha ? ' + alpha' : ''})` })
      if (i % 3 === 0) await tick()
    }
    videoSource.close()
    onProgress({ phase: 'finalizing', frame: total, totalFrames: total, percent: 100, message: 'Finalizing file…' })
    await output.finalize()
    if (guarded) {
      await guarded.commit() // only a fully finalized file replaces the one the user picked
      return { filename, mime, savedToDisk: true, bytes: 0 }
    }
    const buf = (target as BufferTarget).buffer!
    const blob = new Blob([buf], { type: mime })
    return { blob, filename, mime, savedToDisk: false, bytes: blob.size }
  } catch (e) {
    try {
      await output.cancel()
    } catch {
      /* ignore */
    }
    if (guarded) await guarded.discard() // the partial swap file goes; the picked file stays as it was
    throw e
  }
}
