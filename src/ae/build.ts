/** Orchestrates a build inside After Effects: load assets → compile scene → write files → drive the host script. */
import type { Config } from '../core/types'
import type { Timeline } from '../core/simulation'
import type { AssetCache } from '../core/assets'
import { collectAssetUrls } from '../core/renderer'
import { styleFromConfig } from '../core/layout'
import { ensureFonts } from '../core/fonts'
import { compileScene, type SceneData } from './scene'
import { callHost, mkdirp, writeBase64, writeText, posixPath, jsonForES3 } from './cep'

export type AEPhase = 'assets' | 'compile' | 'write' | 'prepare' | 'build' | 'finish' | 'done' | 'error'

export interface AEProgress {
  phase: AEPhase
  done: number
  total: number
  message: string
}

export interface AEHostInfo {
  version: string
  ae: string
  aeMajor: number
  fontsApi: boolean
  trackMatteApi: boolean
  projectPath: string
  projectDir: string
  projectName: string
  scriptFileAccess: boolean | null
}

export interface AEBuildResult {
  compName: string
  layers: number
  messages: number
  reattached: number
  folder: string
  stats: SceneData['stats']
  files: number
  seconds: number
}

export interface AEBuildOptions {
  compName: string
  /** absolute folder where scene.json + images are written */
  folder: string
  batch?: number
  signal?: AbortSignal
}

export function safeCompName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'TwitchSim chat'
}

export function buildKeyFor(compName: string): string {
  return safeCompName(compName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'chat'
}

const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0))

export async function buildInAE(cfg: Config, timeline: Timeline, assets: AssetCache, opts: AEBuildOptions, onProgress: (p: AEProgress) => void): Promise<AEBuildResult> {
  const t0 = performance.now()
  const check = () => {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  }
  const style = styleFromConfig(cfg)
  onProgress({ phase: 'assets', done: 0, total: 1, message: 'Loading badges & emotes…' })
  await ensureFonts(cfg.fontFamily || 'Inter')
  const urls = collectAssetUrls(timeline, true, style)
  await assets.loadAll(urls, (d, t) => onProgress({ phase: 'assets', done: d, total: t, message: `Loading badges & emotes… ${d}/${t}` }))
  check()

  onProgress({ phase: 'compile', done: 0, total: 1, message: 'Laying out messages…' })
  await yieldUI()
  const compName = safeCompName(opts.compName)
  const scene = compileScene(cfg, timeline, assets, { compName, buildKey: buildKeyFor(compName) })
  check()

  // files
  const folder = posixPath(opts.folder)
  mkdirp(folder)
  mkdirp(folder + '/img')
  const total = scene.files.length + 1
  let n = 0
  const seqDirs = new Set<string>()
  for (const f of scene.files) {
    const full = folder + '/' + f.path
    const dir = full.slice(0, full.lastIndexOf('/'))
    if (!seqDirs.has(dir)) {
      mkdirp(dir)
      seqDirs.add(dir)
    }
    writeBase64(full, f.base64)
    n++
    if (n % 25 === 0) {
      onProgress({ phase: 'write', done: n, total, message: `Writing images… ${n}/${total}` })
      await yieldUI()
      check()
    }
  }
  const jsonPath = folder + '/scene.json'
  writeText(jsonPath, jsonForES3(scene.data))
  onProgress({ phase: 'write', done: total, total, message: `Wrote ${total} files` })

  // host
  onProgress({ phase: 'prepare', done: 0, total: 1, message: 'Importing footage into After Effects…' })
  await yieldUI()
  const begun = await callHost<{ total: number; assets: number }>('begin', { jsonPath, folder })
  // from here on the project is being modified: whatever happens, run finish() so it is left consistent
  let fin: { compName: string; layers: number; messages: number; reattached: number; folder: string }
  try {
    check()
    const batch = Math.max(1, opts.batch ?? 8)
    let done = 0
    while (done < begun.total) {
      const r = await callHost<{ done: number; total: number }>('step', { count: batch })
      done = r.done
      onProgress({ phase: 'build', done, total: begun.total, message: `Building messages… ${done}/${begun.total}` })
      await yieldUI()
      check()
    }
    onProgress({ phase: 'finish', done: begun.total, total: begun.total, message: 'Keyframing the scroll…' })
    await yieldUI()
    fin = await callHost<typeof fin>('finish')
  } catch (e) {
    await callHost('finish').catch(() => undefined)
    throw e
  }
  const seconds = (performance.now() - t0) / 1000
  onProgress({ phase: 'done', done: begun.total, total: begun.total, message: `Done in ${seconds.toFixed(1)} s` })
  return { ...fin, stats: scene.data.stats, files: total, seconds }
}

export function hostInfoAE(): Promise<AEHostInfo> {
  return callHost<AEHostInfo>('info')
}
