import { encodePng } from './png'

interface Pending {
  resolve: (u: Uint8Array) => void
  reject: (e: Error) => void
}

/** Encodes canvas frames to PNG in a small pool of Web Workers (falls back to the main thread). */
export class PngEncoderPool {
  private workers: Worker[] = []
  private busy: boolean[] = []
  private pending = new Map<number, Pending>()
  private queue: { id: number; data: Uint8ClampedArray; w: number; h: number }[] = []
  private nextId = 1
  private inflight = 0
  private level: number

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)), level = 6) {
    this.level = level
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./pngWorker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e: MessageEvent<{ id: number; png?: ArrayBuffer; error?: string }>) => {
          const p = this.pending.get(e.data.id)
          this.pending.delete(e.data.id)
          this.busy[i] = false
          this.inflight--
          if (p) {
            if (e.data.png) p.resolve(new Uint8Array(e.data.png))
            else p.reject(new Error(e.data.error ?? 'png encode failed'))
          }
          this.pump()
        }
        w.onerror = () => {
          /* worker broken: fall back below */
        }
        this.workers.push(w)
        this.busy.push(false)
      }
    } catch {
      this.workers = []
    }
  }

  get concurrency(): number {
    return Math.max(1, this.workers.length)
  }

  private pump(): void {
    while (this.queue.length) {
      const idx = this.busy.indexOf(false)
      if (idx === -1) return
      const job = this.queue.shift()!
      this.busy[idx] = true
      this.inflight++
      const buf = job.data.buffer.slice(job.data.byteOffset, job.data.byteOffset + job.data.byteLength) as ArrayBuffer
      this.workers[idx].postMessage({ id: job.id, width: job.w, height: job.h, rgba: buf, level: this.level }, [buf])
    }
  }

  /** Grab the canvas pixels now (synchronously) and encode asynchronously. */
  encode(canvas: OffscreenCanvas): Promise<Uint8Array> {
    const ctx = canvas.getContext('2d')!
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    if (!this.workers.length) {
      return Promise.resolve(encodePng(img.data, canvas.width, canvas.height, this.level as 6))
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.queue.push({ id, data: img.data, w: canvas.width, h: canvas.height })
      this.pump()
    })
  }

  dispose(): void {
    for (const w of this.workers) w.terminate()
    this.workers = []
  }
}
