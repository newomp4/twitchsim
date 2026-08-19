/** File System Access helpers with graceful fallbacks. */

declare global {
  interface Window {
    showSaveFilePicker?: (opts?: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
  }
}

export function canPickFiles(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function' && window.isSecureContext
}

export async function pickSaveFile(suggestedName: string, mime: string): Promise<FileSystemFileHandle | null> {
  if (!canPickFiles()) return null
  const ext = '.' + suggestedName.split('.').pop()
  try {
    return await window.showSaveFilePicker!({ suggestedName, types: [{ description: 'Export', accept: { [mime]: [ext] } }] })
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') throw e
    return null
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 60000)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/**
 * A WritableStream over a FileSystemWritableFileStream that never commits on its own: the muxer may
 * close the stream from a `finally` even when finalizing failed, so committing (which is what makes the
 * file the user picked actually change) is an explicit `commit()`; `discard()` throws the partial swap
 * file away. A cancelled or failed export therefore never overwrites the picked file with a truncated one.
 */
export function guardedWritable(writable: FileSystemWritableFileStream): { stream: WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number } | Uint8Array<ArrayBuffer>>; commit: () => Promise<void>; discard: () => Promise<void> } {
  let done = false
  const stream = new WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number } | Uint8Array<ArrayBuffer>>({
    write: (chunk) => writable.write(chunk as FileSystemWriteChunkType),
    close: () => {
      /* committed explicitly via commit() */
    },
    abort: () => {
      /* discarded explicitly via discard() */
    },
  })
  return {
    stream,
    commit: async () => {
      if (done) return
      // mark done only after close() resolves: if the final flush fails (e.g. disk full at the last byte),
      // done stays false so the caller's discard() can still clean up the half-written swap file
      await writable.close()
      done = true
    },
    discard: async () => {
      if (done) return
      done = true
      try {
        await writable.abort()
      } catch {
        /* already closed */
      }
    },
  }
}
