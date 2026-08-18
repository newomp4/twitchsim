import { Output, WebMOutputFormat, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, Quality, canEncodeVideo, type VideoCodec } from 'mediabunny'
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
  if (!(await canEncodeVideo(codec, { width: outW, height: outH }))) {
    const fallbacks: VideoCodec[] = a.container === 'mp4' ? ['avc', 'hevc', 'av1'] : ['vp9', 'vp8', 'av1']
    let found: VideoCodec | null = null
    for (const c of fallbacks) if (await canEncodeVideo(c, { width: outW, height: outH })) { found = c; break }
    if (!found) throw new Error(`This browser cannot encode ${codec} at ${outW}×${outH}. Try a smaller export scale, or use the PNG sequence export.`)
    codec = found
  }
  if (a.alpha && codec !== 'vp9' && codec !== 'vp8') throw new Error('Alpha WebM needs VP9/VP8 encoding, which this browser does not support at this size.')

  let writable: FileSystemWritableFileStream | null = null
  if (fileHandle) writable = await fileHandle.createWritable()
  const guarded = writable ? guardedWritable(writable) : null
  const target = guarded ? new StreamTarget(guarded.stream as WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number }>, { chunked: true }) : new BufferTarget()
  // when streaming to disk the index (moov) is written at the end — no need to reserve space up front
  const format = a.container === 'mp4' ? new Mp4OutputFormat({ fastStart: writable ? false : 'in-memory' }) : new WebMOutputFormat()
  const output = new Output({ format, target })
  const pixels = outW * outH
  // generous bitrate: chat text needs crisp edges
  const bitrate = Math.min(120e6, Math.max(3e6, Math.round(pixels * source.fps * 0.14)))
  const videoSource = new CanvasSource(source.canvas, {
    codec,
    bitrate: new Quality(bitrate),
    alpha: a.alpha ? 'keep' : 'discard',
    keyFrameInterval: 2,
    hardwareAcceleration: a.alpha ? 'prefer-software' : 'no-preference',
  } as ConstructorParameters<typeof CanvasSource>[1])
  output.addVideoTrack(videoSource, { frameRate: source.fps, maximumPacketCount: Math.ceil(source.totalFrames * 1.34) + 16 })
  await output.start()
  const total = source.totalFrames
  try {
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
    if (writable) {
      return { filename, mime, savedToDisk: true, bytes: 0 }
    }
    const buf = (target as BufferTarget).buffer!
    const blob = new Blob([buf], { type: mime })
    return { blob, filename, mime, savedToDisk: false, bytes: blob.size }
  } catch (e) {
    if (guarded) guarded.guard.ok = false // discard the partial file instead of committing it
    try {
      await output.cancel()
    } catch {
      /* ignore */
    }
    throw e
  }
}
