import { zlibSync } from 'fflate'

/**
 * Minimal, fast PNG encoder (RGBA8, "Up" filter, zlib via fflate).
 * Used instead of canvas.convertToBlob because that is throttled to ~1 fps in background tabs
 * and cannot run in a worker pool.
 */

let crcTable: Uint32Array | null = null
function crc32(buf: Uint8Array, start: number, end: number): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function writeU32(buf: Uint8Array, off: number, v: number): void {
  buf[off] = (v >>> 24) & 255
  buf[off + 1] = (v >>> 16) & 255
  buf[off + 2] = (v >>> 8) & 255
  buf[off + 3] = v & 255
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  writeU32(out, 0, data.length)
  out[4] = type.charCodeAt(0)
  out[5] = type.charCodeAt(1)
  out[6] = type.charCodeAt(2)
  out[7] = type.charCodeAt(3)
  out.set(data, 8)
  writeU32(out, 8 + data.length, crc32(out, 4, 8 + data.length))
  return out
}

/** Encodes RGBA pixels (width*height*4 bytes) into a PNG. */
export function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  // "Up" filter (type 2): cheap and very effective on chat frames (lots of vertical repetition)
  for (let y = 0; y < height; y++) {
    const rowOff = y * (stride + 1)
    raw[rowOff] = 2
    const src = y * stride
    const prev = (y - 1) * stride
    if (y === 0) {
      for (let x = 0; x < stride; x++) raw[rowOff + 1 + x] = rgba[src + x]
    } else {
      for (let x = 0; x < stride; x++) raw[rowOff + 1 + x] = (rgba[src + x] - rgba[prev + x]) & 255
    }
  }
  const idat = zlibSync(raw, { level })
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = new Uint8Array(13)
  writeU32(ihdr, 0, width)
  writeU32(ihdr, 4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const c1 = chunk('IHDR', ihdr)
  const c2 = chunk('IDAT', idat)
  const c3 = chunk('IEND', new Uint8Array(0))
  const out = new Uint8Array(sig.length + c1.length + c2.length + c3.length)
  let o = 0
  for (const part of [sig, c1, c2, c3]) {
    out.set(part, o)
    o += part.length
  }
  return out
}
