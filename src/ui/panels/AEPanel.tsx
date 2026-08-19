import { useEffect, useRef, useState } from 'react'
import type { Config } from '../../core/types'
import type { Timeline } from '../../core/simulation'
import type { AssetCache } from '../../core/assets'
import { computeGeometry } from '../../export/exporter'
import { FRAME_PRESETS } from '../../core/defaults'
import { Section, Row, Segmented, NumberInput, Select, Field, TextInput, Collapsible, Slider, PositionGrid } from '../controls'
import { buildInAE, hostInfoAE, safeCompName, buildKeyFor, type AEProgress, type AEBuildResult, type AEHostInfo } from '../../ae/build'
import { callHost, pickFolder, revealPath, systemPath, hostInfo, posixPath } from '../../ae/cep'

const STORAGE = 'twitchsim.ae.v1'

interface AEPrefs {
  compName: string
  folder: string
}

function loadPrefs(): AEPrefs {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (raw) return { compName: 'TwitchSim chat', folder: '', ...(JSON.parse(raw) as Partial<AEPrefs>) }
  } catch {
    /* ignore */
  }
  return { compName: 'TwitchSim chat', folder: '' }
}

export function AEPanel({ cfg, set, patch, timeline, assets }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void; timeline: Timeline; assets: AssetCache }) {
  const [prefs, setPrefs] = useState<AEPrefs>(loadPrefs)
  const [info, setInfo] = useState<AEHostInfo | null>(null)
  const [infoErr, setInfoErr] = useState<string | null>(null)
  const [progress, setProgress] = useState<AEProgress | null>(null)
  const [result, setResult] = useState<AEBuildResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const geo = computeGeometry(cfg)
  // the length only follows the lines when there are ordered lines
  const autoLen = cfg.durationAuto && (cfg.mode === 'script' || cfg.mode === 'mixed') && !!cfg.script.trim()
  const running = !!progress && progress.phase !== 'done' && progress.phase !== 'error'
  const host = hostInfo()

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify(prefs))
  }, [prefs])

  const refreshInfo = () => {
    hostInfoAE().then(
      (i) => {
        setInfo(i)
        setInfoErr(null)
      },
      (e: Error) => setInfoErr(e.message),
    )
  }
  useEffect(refreshInfo, [])

  const compName = safeCompName(prefs.compName)
  const rootFor = (i: AEHostInfo | null) => prefs.folder || (i?.projectDir ? `${posixPath(i.projectDir)}/TwitchSim` : `${systemPath('myDocuments')}/TwitchSim`)
  const root = rootFor(info)
  const folder = `${root}/${buildKeyFor(compName)}`

  const start = async () => {
    setError(null)
    setResult(null)
    setNote(null)
    const ac = new AbortController()
    abortRef.current = ac
    setProgress({ phase: 'assets', done: 0, total: 1, message: 'Starting…' })
    try {
      // the project may have been saved/renamed since the panel opened: images go next to the current project
      let liveInfo = info
      try {
        liveInfo = await hostInfoAE()
        setInfo(liveInfo)
      } catch {
        /* keep what we had */
      }
      const liveFolder = `${rootFor(liveInfo)}/${buildKeyFor(compName)}`
      const res = await buildInAE(cfg, timeline, assets, { compName, folder: liveFolder, signal: ac.signal }, setProgress)
      setResult(res)
      ;(window as unknown as { __twitchsim?: Record<string, unknown> }).__twitchsim = { ...((window as unknown as { __twitchsim?: Record<string, unknown> }).__twitchsim ?? {}), lastAEBuild: res }
      refreshInfo()
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') setProgress({ phase: 'error', done: 0, total: 1, message: 'Cancelled' })
      else {
        console.error(e)
        setError((e as Error).message || String(e))
        setProgress({ phase: 'error', done: 0, total: 1, message: 'Failed' })
      }
    } finally {
      abortRef.current = null
    }
  }

  const removeBuild = async () => {
    if (!confirm(`Remove the "${compName}" build from the project? Its comp, message precomps and imported badge/emote footage go (layers in other comps that use that footage go with it); anything of yours inside the folder stays.`)) return
    try {
      const r = await callHost<{ removed: boolean }>('remove', { buildKey: buildKeyFor(compName) })
      setResult(null)
      setError(null)
      setNote(r.removed ? `Removed the "${compName}" build (comp, messages, footage).` : `Nothing to remove — there is no "${compName}" build in this project.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const pct = progress ? (progress.total > 0 ? (progress.done / progress.total) * 100 : 0) : 0

  return (
    <>
      <Section title="Comp" hint="Builds the current chat as real AE layers: a “TwitchSim Controls” null with the live controls, one precomp per message (text & shape layers, badge/emote footage) and a “Scroll” null.">
        <p className="hint">
          {host ? `After Effects ${host.version}` : 'After Effects'}
          {info ? (info.projectPath ? ` · project “${info.projectName}”` : ' · project not saved yet (save it so the images live next to it)') : infoErr ? ` · ${infoErr}` : ' · connecting…'}
        </p>
        <Row>
          <TextInput label="Comp name" value={prefs.compName} onChange={(v) => setPrefs((p) => ({ ...p, compName: v }))} hint="Building again with the same name updates that comp in place." />
        </Row>
        <Field label="Comp size">
          <Segmented value={cfg.framePreset} onChange={(v) => set('framePreset', v)} options={(Object.keys(FRAME_PRESETS) as Config['framePreset'][]).map((k) => ({ value: k, label: FRAME_PRESETS[k].label }))} />
        </Field>
        {cfg.framePreset === 'custom' && (
          <Row>
            <NumberInput label="Comp width" value={cfg.frameW} min={16} max={7680} onChange={(v) => set('frameW', Math.round(v))} />
            <NumberInput label="Comp height" value={cfg.frameH} min={16} max={4320} onChange={(v) => set('frameH', Math.round(v))} />
          </Row>
        )}
        {cfg.framePreset !== 'chat' && (
          <>
            <Row>
              <Field label="Chat position in the comp">
                <PositionGrid value={cfg.anchor} onChange={(v) => set('anchor', v)} />
              </Field>
              <NumberInput label="Margin from the edge, X (px)" value={cfg.marginX} min={0} max={4000} onChange={(v) => set('marginX', Math.round(v))} />
              <NumberInput label="Margin Y (px)" value={cfg.marginY} min={0} max={4000} onChange={(v) => set('marginY', Math.round(v))} />
            </Row>
          </>
        )}
        <Field label="Scale (chat px → comp px)" hint="Text and shapes are vector; badges/emotes are imported at their highest resolution.">
          <Segmented value={String(cfg.exportScale)} onChange={(v) => set('exportScale', parseFloat(v))} options={[{ value: '1', label: '1×' }, { value: '2', label: '2× · 1080p' }, { value: '3', label: '3× · 1440p' }, { value: '4', label: '4× · 4K' }, { value: '5.6', label: '5.6×' }]} />
        </Field>
        <Row>
          <Select label="Frame rate" value={String(cfg.exportFps)} onChange={(v) => set('exportFps', parseInt(v, 10))} options={[{ value: '24', label: '24 fps' }, { value: '25', label: '25 fps' }, { value: '30', label: '30 fps' }, { value: '50', label: '50 fps' }, { value: '60', label: '60 fps' }]} />
          <Slider label="Duration (s)" value={autoLen ? Math.round(timeline.durationMs / 100) / 10 : cfg.durationSec} min={1} max={600} onChange={(v) => patch({ durationSec: v, durationAuto: false })} format={(v) => (autoLen ? `${v}s (auto)` : `${v}s`)} hint={autoLen ? 'ends right after your last line — moving this switches to a fixed length' : ''} />
        </Row>
        <p className="hint">
          Comp: <b>{geo.outW}×{geo.outH}</b> · chat {geo.chatW}×{geo.chatH} at ({geo.chatX},{geo.chatY}) · {(timeline.durationMs / 1000).toFixed(1)}s @ {cfg.exportFps}fps · {timeline.messages.length} messages
        </p>
      </Section>

      <Collapsible title="Images folder" hint={prefs.folder ? 'custom' : info?.projectDir ? 'next to the project' : '~/Documents/TwitchSim'}>
        <p className="hint">Badge & emote PNGs the comp links to. Keep this folder with your project.</p>
        <p className="path">{folder}</p>
        <div className="btns">
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const p = pickFolder('Choose where TwitchSim stores images for this project', root)
              if (p) setPrefs((x) => ({ ...x, folder: p }))
            }}
          >
            Change…
          </button>
          {prefs.folder && (
            <button type="button" className="btn small" onClick={() => setPrefs((x) => ({ ...x, folder: '' }))}>
              Use default
            </button>
          )}
          <button type="button" className="btn small" onClick={() => revealPath(root)}>
            Reveal
          </button>
        </div>
      </Collapsible>

      <Section title="Build">
        <div className="exportbar">
          {!running ? (
            <button type="button" className="btn primary big" onClick={start}>
              {result ? 'Rebuild in After Effects' : 'Build in After Effects'}
            </button>
          ) : (
            <button type="button" className="btn big" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          )}
        </div>
        {progress && (
          <div className="progress">
            <div className="bar">
              <div className="fill" style={{ width: `${Math.max(0, Math.min(100, progress.phase === 'done' ? 100 : pct))}%` }} />
            </div>
            <div className="ptext">{progress.message}</div>
          </div>
        )}
        {result && (
          <p className="hint">
            ✓ <b>{result.compName}</b> — {result.messages} messages, {result.layers} layers in the main comp, {result.stats.keys} keyframes, {result.files} image files{result.reattached ? `, ${result.reattached} of your layers re-parented` : ''}. The comp is open in the viewer — select <b>TwitchSim Controls</b> (top layer) for the live controls.
          </p>
        )}
        {result && result.textControls === false && (
          <p className="hint">
            The text colour / outline / shadow controls could not be wired up (After Effects refused to add layer styles). Open <i>Layer ▸ Layer Styles</i> once in this AE session and build again; opacity, background and top fade work regardless.
          </p>
        )}
        {error && <p className="err">{error}</p>}
        {note && !result && !error && <p className="hint">{note}</p>}
        <div className="btns">
          <button type="button" className="btn small" onClick={removeBuild} disabled={running}>
            Remove this build from the project
          </button>
        </div>
      </Section>

      <Collapsible title="What you get & how to tweak it">
        <ul className="help-list">
          <li>
            <b>Main comp</b>: <i>TwitchSim Controls</i> (null, top layer — everything is parented to it: move / scale / rotate it to place the whole chat), <i>Chat area</i> (matte), one layer per message named <code>msg 012 · username</code>, <i>Scroll</i> (null — the stack's push-ups: hold keys + an expression) and <i>Background</i>.
          </li>
          <li>
            <b>Effect Controls of the Controls null</b> (all keyframable, wired to the layers with expressions — no rebuild): <b>Animation ·</b> Style (dropdown: instant / slide up / slide up + fade / fade / slide from left / right / pop), Duration (frames), Ease out, Slide distance (% of the chat width), Pop from — every message reads them at the moment it arrives, so a keyframed Duration changes how <i>later</i> messages come in; <b>Layout ·</b> Row gap; <b>Look ·</b> Opacity, custom text & name colour, Outline, Shadow (+ softness / distance), Background colour / opacity / corners, Top fade (% of the chat height). Prefixes group them (AE has no folders in Effect Controls). Rebuilding keeps the null and everything you changed on it (values, keyframes, its transform); controls you never touched follow the panel's new settings.
          </li>
          <li>
            <b>Pace of the chat</b> (messages per minute) is timing, not animation: change it in the panel and rebuild, or nest this comp and time-remap / time-stretch it.
          </li>
          <li>
            <b>Parent to a message</b>: pick its <code>msg NNN</code> layer as parent — arrows, boxes, whatever you attach rides along as the chat scrolls. Each message layer is a precomp with its text, badges and emotes inside, so you can also open it and restyle a single message.
          </li>
          <li>
            <b>Live in AE</b>: everything on the Controls null, effects, motion blur, per-message tweaks. <b>Rebuild needed</b>: text changes, chat width, font size, new lines, chat speed (the panel re-flows the layout / timing).
          </li>
          <li>Rebuilding with the same comp name updates the comp in place — where you already used it stays valid, and your own layers inside it are kept and re-parented to the message with the same name. (The text-colour / outline / shadow expressions inside the message precomps find the Controls null through the comp's name, so if you rename the comp, build once more.)</li>
          <li>Text uses the Inter font (Twitch's font) — install it if AE shows a substitute. Alpha: the comp is transparent wherever the chat is; render ProRes 4444 or use it directly inside your edit.</li>
          <li>Heads-up: After Effects' text engine gets a little slower with every text layer a session creates (an AE quirk, not project size). If rebuilds start taking a minute, restarting AE resets it.</li>
        </ul>
      </Collapsible>
    </>
  )
}
