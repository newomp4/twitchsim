/// <reference lib="webworker" />
import { encodePng } from './png'

interface Req {
  id: number
  width: number
  height: number
  rgba: ArrayBuffer
  level?: number
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, width, height, rgba, level } = e.data
  try {
    const png = encodePng(new Uint8Array(rgba), width, height, (level ?? 6) as 6)
    ;(self as unknown as Worker).postMessage({ id, png: png.buffer }, [png.buffer])
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id, error: String(err) })
  }
}
