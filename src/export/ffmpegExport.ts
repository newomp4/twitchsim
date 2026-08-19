import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
import { Output, MovOutputFormat, BufferTarget, StreamTarget, EncodedVideoPacketSource, Input, BlobSource, QTFF, EncodedPacketSink, ALL_FORMATS } from 'mediabunny'
import type { CommonExportArgs, ExportResult } from './exporter'
import { tick } from './exporter'
import { PngEncoderPool } from './pngPool'
import { guardedWritable } from './saveFile'

const CORE_VERSION = '0.12.10'
const CORE_BASES = [`https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`, `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`]

let ffmpegInstance: FFmpeg | null = null
let ffmpegLoading: Promise<FFmpeg> | null = null

async function getFFmpeg(onStatus: (s: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (ffmpegLoading) return ffmpegLoading
  ffmpegLoading = (async () => {
    const ff = new FFmpeg()
    let lastErr: unknown = null
    for (const base of CORE_BASES) {
      try {
        onStatus(`Downloading FFmpeg engine (~32 MB, once)…`)
        const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript')
        const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
        await ff.load({ coreURL, wasmURL })
        ffmpegInstance = ff
        return ff
      } catch (e) {
        lastErr = e
      }
    }
    throw new Error('Could not load FFmpeg (needed for ProRes). Check your internet connection. ' + String(lastErr))
  })()
  try {
    return await ffmpegLoading
  } finally {
    ffmpegLoading = null
  }
}

/**
 * ProRes 4444 (with alpha) QuickTime .mov.
 * ffmpeg.wasm encodes PNG frames in small chunks (bounded memory), each chunk is demuxed with mediabunny
 * and the ProRes packets are remuxed into one continuous MOV that streams to disk.
 */
export async function exportProRes(a: CommonExportArgs): Promise<ExportResult> {
  const { source, onProgress, signal, filename, mime, fileHandle } = a
  const total = source.totalFrames
  const fps = source.fps
  // Cancel must work while the engine (32 MB) downloads: race the load against the abort signal (the
  // download itself keeps going in the background and lands in the cache for next time)
  const ff = await new Promise<FFmpeg>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('cancelled', 'AbortError'))
    const onAbortEarly = () => reject(new DOMException('cancelled', 'AbortError'))
    signal.addEventListener('abort', onAbortEarly, { once: true })
    getFFmpeg((s) => onProgress({ phase: 'preparing', frame: 0, totalFrames: total, percent: 0, message: s })).then(
      (f) => {
        signal.removeEventListener('abort', onAbortEarly)
        resolve(f)
      },
      (e) => {
        signal.removeEventListener('abort', onAbortEarly)
        reject(e)
      },
    )
  })
  if (signal.aborted) throw new DOMException('cancelled', 'AbortError')

  let writable: FileSystemWritableFileStream | null = null
  if (fileHandle) writable = await fileHandle.createWritable()
  const guarded = writable ? guardedWritable(writable) : null
  const target = guarded ? new StreamTarget(guarded.stream as WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number }>, { chunked: true }) : new BufferTarget()
  const output = new Output({ format: new MovOutputFormat({ fastStart: writable ? false : 'in-memory' }), target })
  // Cancel while ffmpeg is busy: kill the wasm worker (exec() cannot be interrupted otherwise)
  const onAbort = () => {
    ff.terminate()
    ffmpegInstance = null
  }
  signal.addEventListener('abort', onAbort, { once: true })
  const packetSource = new EncodedVideoPacketSource('prores')
  output.addVideoTrack(packetSource, { frameRate: fps, maximumPacketCount: Math.ceil(total * 1.34) + 16 })

  // chunk size scales with resolution to keep wasm memory modest (~≤120 MB of raw RGBA per chunk)
  const pixels = source.geometry.outW * source.geometry.outH
  const chunkFrames = Math.max(4, Math.min(48, Math.floor(1.2e8 / Math.max(1, pixels * 4))))
  let firstPacket = true
  const logs: string[] = []
  const pool = new PngEncoderPool(2, 3)
  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    if (logs.length > 200) logs.shift()
  }
  ff.on('log', onLog)
  try {
    await output.start()
    for (let start = 0; start < total; start += chunkFrames) {
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
      const end = Math.min(total, start + chunkFrames)
      // 1) render chunk frames to PNG files (encoded in a worker pool)
      const jobs: Promise<Uint8Array>[] = []
      for (let i = start; i < end; i++) {
        source.render(i)
        jobs.push(pool.encode(source.canvas))
        onProgress({ phase: 'rendering', frame: i + 1, totalFrames: total, percent: ((i + 0.5) / total) * 100, message: `Rendering frame ${i + 1}/${total}` })
        // keep only a few raw frames in flight (each is a full RGBA copy)
        if (i - start >= pool.concurrency + 1) await jobs[i - start - pool.concurrency - 1]
        if ((i - start) % 2 === 0) await tick()
        if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
      }
      const files: File[] = (await Promise.all(jobs)).map((png, k) => new File([png as unknown as BlobPart], `f_${String(k).padStart(5, '0')}.png`, { type: 'image/png' }))
      // 2) encode with ffmpeg.wasm (input mounted, no copy)
      const dir = `/in${start}`
      await ff.createDir(dir)
      await ff.mount(FFFSType.WORKERFS, { files }, dir)
      onProgress({ phase: 'encoding', frame: end, totalFrames: total, percent: (end / total) * 100, message: `Encoding ProRes 4444 frames ${start + 1}–${end}/${total}…` })
      const outName = `chunk${start}.mov`
      const code = await ff.exec([
        '-framerate', String(fps),
        '-i', `${dir}/f_%05d.png`,
        // RGB→YCbCr with the Rec.709 matrix and tagged as such (untagged ProRes is read as 709 by every NLE;
        // swscale's default would be 601 → visible colour shift on saturated colours)
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', '-bits_per_mb', '8000',
        '-threads', '1',
        outName,
      ])
      await ff.unmount(dir)
      await ff.deleteDir(dir)
      if (code !== 0) throw new Error('FFmpeg failed to encode ProRes: ' + logs.slice(-5).join(' | '))
      const data = (await ff.readFile(outName)) as Uint8Array
      await ff.deleteFile(outName)
      // 3) demux the chunk and append its packets, shifted in time
      const input = new Input({ source: new BlobSource(new Blob([data as unknown as BlobPart])), formats: [QTFF, ...ALL_FORMATS] })
      const track = await input.getPrimaryVideoTrack()
      if (!track) throw new Error('FFmpeg produced no video track')
      const sink = new EncodedPacketSink(track)
      const decoderConfig = await track.getDecoderConfig()
      const offset = start / fps
      for await (const packet of sink.packets()) {
        const shifted = packet.clone({ timestamp: packet.timestamp + offset, duration: 1 / fps })
        if (firstPacket) {
          await packetSource.add(shifted, decoderConfig ? { decoderConfig } : undefined)
          firstPacket = false
        } else await packetSource.add(shifted)
      }
      input.dispose()
    }
    packetSource.close()
    onProgress({ phase: 'finalizing', frame: total, totalFrames: total, percent: 100, message: 'Finalizing .mov…' })
    await output.finalize()
    if (guarded) {
      await guarded.commit() // only a fully finalized file replaces the one the user picked
      return { filename, mime, savedToDisk: true, bytes: 0 }
    }
    const buf = (target as BufferTarget).buffer!
    const blob = new Blob([buf], { type: mime })
    return { blob, filename, mime, savedToDisk: false, bytes: blob.size }
  } catch (err) {
    // terminate() rejects the in-flight ffmpeg call with its own Error: report the cancel as a cancel
    const e = signal.aborted ? new DOMException('cancelled', 'AbortError') : err
    try {
      await output.cancel()
    } catch {
      /* ignore */
    }
    if (guarded) await guarded.discard() // the partial swap file goes; the picked file stays as it was
    if (!signal.aborted) {
      // a failed exec leaves the wasm instance in an unknown state (mounted dirs, OOM): start fresh next time
      try {
        ff.terminate()
      } catch {
        /* ignore */
      }
      ffmpegInstance = null
    }
    throw e
  } finally {
    signal.removeEventListener('abort', onAbort)
    try {
      ff.off('log', onLog)
    } catch {
      /* terminated */
    }
    pool.dispose()
  }
}
