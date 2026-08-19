import { useEffect, useRef, useState } from 'react'
import type { Config } from '../core/types'
import { DEFAULT_CONFIG } from '../core/defaults'
import { sanitize } from './useConfig'
import { isCEP, writeText } from '../ae/cep'

/**
 * Named presets = a snapshot of every setting (look, animation, timing, lines, chatters) under a name you
 * choose, so you can flip between whole setups in one click. Stored in localStorage WITHOUT the uploaded
 * image blobs (those live once in IndexedDB and stay loaded across presets, keeping presets small). File
 * import/export is kept for backups / sharing and does include the images.
 */
const PRESETS_KEY = 'twitchsim.presets.v1'

interface SavedPreset {
  name: string
  savedAt: number
  config: Partial<Config>
}

const IMAGE_KEYS: (keyof Config)[] = ['customBadges', 'customEmotes', 'customAvatars']

function withoutImages(cfg: Config): Partial<Config> {
  const out: Partial<Config> = { ...cfg }
  for (const k of IMAGE_KEYS) delete out[k]
  return out
}

function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    const arr = raw ? (JSON.parse(raw) as SavedPreset[]) : []
    return Array.isArray(arr) ? arr.filter((p) => p && typeof p.name === 'string' && p.config) : []
  } catch {
    return []
  }
}

function savePresets(list: SavedPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list))
  } catch {
    /* quota — ignore */
  }
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function PresetsMenu({ cfg, apply }: { cfg: Config; apply: (c: Config) => void }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<SavedPreset[]>(() => loadPresets())
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const persist = (next: SavedPreset[]) => {
    setList(next)
    savePresets(next)
  }

  const saveCurrent = () => {
    const name = prompt('Name this preset (e.g. "SU intro", "Dark overlay"):', '')?.trim()
    if (!name) return
    const entry: SavedPreset = { name, savedAt: Date.now(), config: withoutImages(cfg) }
    const existing = list.findIndex((p) => p.name.toLowerCase() === name.toLowerCase())
    if (existing >= 0) {
      if (!confirm(`A preset called "${list[existing].name}" already exists. Replace it?`)) return
      const next = [...list]
      next[existing] = entry
      persist(next)
    } else {
      persist([entry, ...list])
    }
  }

  const load = (p: SavedPreset) => {
    apply({ ...DEFAULT_CONFIG, ...sanitize(p.config) } as Config)
    setOpen(false)
  }

  const remove = (p: SavedPreset, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete the preset "${p.name}"?`)) return
    persist(list.filter((x) => x !== p))
  }

  const rename = (p: SavedPreset, e: React.MouseEvent) => {
    e.stopPropagation()
    const name = prompt('Rename preset:', p.name)?.trim()
    if (!name) return
    persist(list.map((x) => (x === p ? { ...x, name } : x)))
  }

  const exportFile = () => {
    setOpen(false)
    const json = JSON.stringify(cfg, null, 2)
    const filename = `twitchsim-${(cfg.seed || 'preset').replace(/[^a-z0-9_-]/gi, '')}.json`
    if (isCEP()) {
      const dlg = (window.cep!.fs as unknown as { showSaveDialogEx: (t: string, i: string, ft: string[], d: string) => { err: number; data: string } }).showSaveDialogEx('Export TwitchSim preset', '', ['json'], filename)
      if (dlg.err === 0 && dlg.data) writeText(dlg.data, json)
      return
    }
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  }

  const importFile = () => {
    setOpen(false)
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        const j = JSON.parse(await f.text()) as Partial<Config>
        apply({ ...DEFAULT_CONFIG, ...sanitize(j) } as Config)
      } catch {
        alert("That file isn't a valid TwitchSim preset.")
      }
    }
    input.click()
  }

  return (
    <div className="presets" ref={ref}>
      <button type="button" className="btn small" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Presets ▾
      </button>
      {open && (
        <div className="presets-dd" role="menu">
          <p className="pd-hint">A preset saves all your settings — look, animation, timing, your lines and chatters — so you can switch whole setups in one click. Your uploaded images stay loaded across presets.</p>
          <button type="button" className="pd-save" onClick={saveCurrent}>
            + Save current settings…
          </button>
          {list.length > 0 ? (
            <div className="pd-list">
              {list.map((p) => (
                <div key={p.name + p.savedAt} className="pd-item">
                  <button type="button" className="pd-load" onClick={() => load(p)} title={`Load "${p.name}"`}>
                    <span className="pd-name">{p.name}</span>
                    <span className="pd-when">{ago(p.savedAt)}</span>
                  </button>
                  <button type="button" className="pd-mini" title="Rename" aria-label={`Rename ${p.name}`} onClick={(e) => rename(p, e)}>
                    ✎
                  </button>
                  <button type="button" className="pd-mini" title="Delete" aria-label={`Delete ${p.name}`} onClick={(e) => remove(p, e)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="pd-empty">No saved presets yet — set things up how you like, then “Save current settings…”.</p>
          )}
          <div className="pd-div" />
          <button type="button" className="pd-file" onClick={importFile}>
            Import from a file…
          </button>
          <button type="button" className="pd-file" onClick={exportFile}>
            Export to a file (backup — includes images)
          </button>
        </div>
      )}
    </div>
  )
}
