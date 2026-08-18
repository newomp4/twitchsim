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
 * A WritableStream over a FileSystemWritableFileStream whose `close()` commits the file only when
 * `guard.ok` is still true; otherwise it aborts, discarding the partial swap file (so a cancelled or
 * failed export never overwrites the file the user picked with a truncated one).
 */
export function guardedWritable(writable: FileSystemWritableFileStream): { stream: WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number } | Uint8Array<ArrayBuffer>>; guard: { ok: boolean } } {
  const guard = { ok: true }
  const stream = new WritableStream<{ type: 'write'; data: Uint8Array<ArrayBuffer>; position: number } | Uint8Array<ArrayBuffer>>({
    write: (chunk) => writable.write(chunk as FileSystemWriteChunkType),
    close: () => (guard.ok ? writable.close() : writable.abort()),
    abort: (reason) => writable.abort(reason),
  })
  return { stream, guard }
}
