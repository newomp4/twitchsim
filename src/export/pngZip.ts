import { Zip, ZipPassThrough } from 'fflate'
import type { CommonExportArgs, ExportResult } from './exporter'
import { tick } from './exporter'
import { PngEncoderPool } from './pngPool'

/** PNG frame sequence (with alpha) zipped, streamed to disk when the File System Access API is available. */
export async function exportPngZip(a: CommonExportArgs): Promise<ExportResult> {
  const { source, onProgress, signal, filename, mime, fileHandle } = a
  const total = source.totalFrames
  const chunks: Uint8Array[] = []
  let bytes = 0
  let writable: FileSystemWritableFileStream | null = null
  if (fileHandle) writable = await fileHandle.createWritable()
  let writeChain: Promise<void> = Promise.resolve()
  let writeError: unknown = null
  const zip = new Zip()
  zip.ondata = (err, chunk, _final) => {
    if (err) {
      writeError = err
      return
    }
    bytes += chunk.length
    if (writable) {
      const w = writable
      writeChain = writeChain.then(() => w.write(chunk as unknown as ArrayBuffer)).catch((e) => {
        writeError = e
      })
    } else chunks.push(chunk)
  }
  const pad = String(total).length < 5 ? 5 : String(total).length
  const pool = new PngEncoderPool()
  const windowSize = pool.concurrency + 1
  const inflight: { i: number; p: Promise<Uint8Array> }[] = []
  const flushOne = async () => {
    const job = inflight.shift()!
    const data = await job.p
    const f = new ZipPassThrough(`frame_${String(job.i).padStart(pad, '0')}.png`)
    zip.add(f)
    f.push(data, true)
    if (writeError) throw writeError
    onProgress({ phase: 'rendering', frame: job.i + 1, totalFrames: total, percent: ((job.i + 1) / total) * 100, message: `Frame ${job.i + 1}/${total}` })
  }
  try {
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError')
      source.render(i)
      inflight.push({ i, p: pool.encode(source.canvas) })
      if (inflight.length >= windowSize) await flushOne()
      if (i % 2 === 0) await tick()
    }
    while (inflight.length) await flushOne()
    zip.end()
    onProgress({ phase: 'finalizing', frame: total, totalFrames: total, percent: 100, message: 'Writing zip…' })
    await writeChain
    if (writeError) throw writeError
    if (writable) {
      await writable.close()
      return { filename, mime, savedToDisk: true, bytes }
    }
    const blob = new Blob(chunks as BlobPart[], { type: mime })
    return { blob, filename, mime, savedToDisk: false, bytes: blob.size }
  } catch (e) {
    if (writable) {
      try {
        await writable.abort()
      } catch {
        /* ignore */
      }
    }
    throw e
  } finally {
    pool.dispose()
  }
}
