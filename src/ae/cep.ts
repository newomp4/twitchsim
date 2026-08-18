/**
 * Minimal bridge to Adobe CEP (the runtime that hosts HTML panels inside After Effects).
 * Only what TwitchSim needs: run ExtendScript in the host, write files, pick folders.
 * Everything here is a no-op / throws outside of a CEP panel (normal browser).
 */

interface CepFsResult<T = string> {
  err: number
  data: T
}

interface AdobeCep {
  evalScript(script: string, callback: (result: string) => void): void
  getSystemPath(type: string): string
  getHostEnvironment(): string
}

interface CepGlobal {
  fs: {
    readFile(path: string, encoding: string): CepFsResult
    writeFile(path: string, data: string, encoding: string): { err: number }
    makedir(path: string): { err: number }
    stat(path: string): CepFsResult<{ isFile(): boolean; isDirectory(): boolean }>
    showOpenDialogEx(allowMultiple: boolean, chooseDirectory: boolean, title: string, initialPath: string, fileTypes?: string[], friendlyFilePrefix?: string, prompt?: string): CepFsResult<string[]>
  }
  encoding: { Base64: string; UTF8: string }
  util: { openURLInDefaultBrowser(url: string): { err: number } }
}

declare global {
  interface Window {
    __adobe_cep__?: AdobeCep
    cep?: CepGlobal
  }
}

export function isCEP(): boolean {
  return typeof window !== 'undefined' && !!window.__adobe_cep__ && !!window.cep
}

/** Which app / version hosts us ("AEFT 25.3") — for display and feature gating. */
export function hostInfo(): { app: string; version: string } | null {
  if (!isCEP()) return null
  try {
    const env = JSON.parse(window.__adobe_cep__!.getHostEnvironment()) as { appName?: string; appVersion?: string }
    return { app: env.appName ?? '?', version: env.appVersion ?? '?' }
  } catch {
    return { app: '?', version: '?' }
  }
}

/** Runs ExtendScript in the host and resolves with its string result. */
export function evalScript(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isCEP()) return reject(new Error('Not running inside After Effects'))
    window.__adobe_cep__!.evalScript(code, (res) => resolve(res ?? ''))
  })
}

let hostReady: Promise<void> | null = null

/**
 * (Re)loads host/index.jsx into After Effects' ExtendScript engine once per panel load.
 * CEP loads it at extension start too, but doing it ourselves survives panel reloads and
 * picks up a rebuilt host script without restarting AE.
 */
export function ensureHost(): Promise<void> {
  if (!hostReady) {
    const path = systemPath('extension') + '/host/index.jsx'
    // note: evaluated at top level on purpose — inside a function wrapper the file's globals would be local
    hostReady = evalScript(`$.evalFile(${JSON.stringify(path)}); typeof TWITCHSIM`).then((r) => {
      if (r !== 'object') {
        hostReady = null
        throw new Error(`Could not load the After Effects host script (${r || 'no reply'})`)
      }
    })
  }
  return hostReady
}

/** Calls TWITCHSIM.<fn>(args) in the host script; args/results travel as JSON. */
export async function callHost<T = unknown>(fn: string, args?: unknown): Promise<T> {
  await ensureHost()
  const payload = JSON.stringify(args ?? null)
  const res = await evalScript(`(function(){ try { return TWITCHSIM.${fn}(${JSON.stringify(payload)}); } catch (e) { return '{"error":' + TWITCHSIM_JSON.quote(String(e && e.message ? e.message + (e.line ? ' (line ' + e.line + ')' : '') : e)) + '}'; } })()`)
  if (res === 'EvalScript error.') throw new Error('The After Effects side of the panel failed to load (EvalScript error). Try reopening the panel.')
  let parsed: unknown
  try {
    parsed = res ? JSON.parse(res) : null
  } catch {
    throw new Error(`Unexpected reply from After Effects: ${res.slice(0, 200)}`)
  }
  if (parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)) throw new Error(String((parsed as { error: unknown }).error))
  return parsed as T
}

/** CEP hands system paths out as file:// URLs on some builds — normalize to plain paths. */
function fromFileUrl(u: string): string {
  if (!u.startsWith('file://')) return u
  let p = decodeURI(u.slice(7))
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1) // Windows: /C:/Users → C:/Users
  return p
}

export function systemPath(type: 'userData' | 'extension' | 'myDocuments' | 'hostApplication'): string {
  return isCEP() ? fromFileUrl(window.__adobe_cep__!.getSystemPath(type)) : ''
}

export function mkdirp(path: string): void {
  const fs = window.cep!.fs
  const parts = path.split('/')
  let cur = ''
  for (const p of parts) {
    if (!p) {
      cur = '/'
      continue
    }
    if (!cur && /^[A-Za-z]:$/.test(p)) {
      cur = p // Windows drive root
      continue
    }
    cur = cur.endsWith('/') ? cur + p : cur + '/' + p
    const st = fs.stat(cur)
    if (st.err !== 0) {
      const r = fs.makedir(cur)
      if (r.err !== 0) throw new Error(`Could not create folder ${cur} (error ${r.err})`)
    }
  }
}

export function writeText(path: string, text: string): void {
  const r = window.cep!.fs.writeFile(path, text, window.cep!.encoding.UTF8)
  if (r.err !== 0) throw new Error(`Could not write ${path} (error ${r.err})`)
}

export function writeBase64(path: string, base64: string): void {
  const r = window.cep!.fs.writeFile(path, base64, window.cep!.encoding.Base64)
  if (r.err !== 0) throw new Error(`Could not write ${path} (error ${r.err})`)
}

export function pickFolder(title: string, initial: string): string | null {
  const r = window.cep!.fs.showOpenDialogEx(false, true, title, initial)
  if (r.err !== 0 || !r.data || !r.data.length) return null
  return r.data[0]
}

export function revealPath(path: string): void {
  window.cep?.util.openURLInDefaultBrowser('file://' + encodeURI(path))
}
