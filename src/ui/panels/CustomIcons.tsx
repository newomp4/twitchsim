import { useRef, useState } from 'react'
import type { Config } from '../../core/types'
import { prepareBadge, prepareEmote, refitBadge, REPLACEABLE_SETS, type CustomBadge, type BadgeFit } from '../../core/customAssets'
import { Collapsible, Slider, Toggle, Row, Segmented, Field } from '../controls'

const SUB_TIER_DEFAULTS = [1, 3, 6, 9, 12, 18, 24, 36, 48, 60]

export function CustomIcons({ cfg, set, patch }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void }) {
  const subRef = useRef<HTMLInputElement>(null)
  const repRef = useRef<HTMLInputElement>(null)
  const extraRef = useRef<HTMLInputElement>(null)
  const emoteRef = useRef<HTMLInputElement>(null)
  const [replaceSet, setReplaceSet] = useState('moderator')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const radiusCss = `${Math.min(50, cfg.badgeRadius * 100)}%`
  const badges = cfg.customBadges
  const subs = badges.filter((b) => b.kind === 'sub').sort((a, b) => (a.months ?? 0) - (b.months ?? 0))
  const reps = badges.filter((b) => b.kind === 'replace')
  const extras = badges.filter((b) => b.kind === 'extra')

  const updateBadge = (id: string, p: Partial<CustomBadge>) => set('customBadges', cfg.customBadges.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const removeBadge = (id: string) => set('customBadges', cfg.customBadges.filter((b) => b.id !== id))

  const addFiles = async (files: FileList | null, kind: CustomBadge['kind']) => {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      const added: CustomBadge[] = []
      let nextTier = SUB_TIER_DEFAULTS.find((m) => !subs.some((b) => b.months === m)) ?? (subs.length + 1) * 12
      for (const f of Array.from(files)) {
        const extra: Partial<CustomBadge> = {}
        if (kind === 'sub') {
          // "sub-12.png" / "12 months.png" style names set the tier automatically
          const m = f.name.match(/(\d+)/)
          const months = m ? parseInt(m[1], 10) : nextTier
          extra.months = months
          extra.name = `${months}-Month Subscriber`
          nextTier = SUB_TIER_DEFAULTS.find((x) => x > months && !subs.some((b) => b.months === x)) ?? months + 12
        } else if (kind === 'replace') {
          extra.set = replaceSet
          extra.name = REPLACEABLE_SETS.find((r) => r.value === replaceSet)?.label ?? replaceSet
        } else extra.ratio = 0.25
        added.push(await prepareBadge(f, cfg.badgeFit, kind, extra))
      }
      // replacing the same set twice keeps only the newest
      const kept = kind === 'replace' ? cfg.customBadges.filter((b) => !(b.kind === 'replace' && b.set === replaceSet)) : cfg.customBadges
      const p: Partial<Config> = { customBadges: [...kept, ...added] }
      if (kind === 'sub') p.channelSubBadgeStyle = 'custom'
      patch(p)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const addEmotes = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      const added = []
      for (const f of Array.from(files)) added.push(await prepareEmote(f))
      set('customEmotes', [...cfg.customEmotes, ...added])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const changeFit = async (fit: BadgeFit) => {
    setBusy(true)
    try {
      const refit = await Promise.all(cfg.customBadges.map((b) => refitBadge(b, fit)))
      patch({ badgeFit: fit, customBadges: refit })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Collapsible title="Your own icons" hint={badges.length + cfg.customEmotes.length ? `${badges.length} badge${badges.length === 1 ? '' : 's'}, ${cfg.customEmotes.length} emote${cfg.customEmotes.length === 1 ? '' : 's'} uploaded` : 'sub badges, custom emotes, replace a Twitch badge'}>
      <p className="hint">Upload any image — it's fitted into Twitch's square badge box for you and the corners are rounded (adjustable). PNG with transparency looks best; JPG/GIF/WebP/SVG also work.</p>
      <Row>
        <Field label="Fit uploads">
          <Segmented value={cfg.badgeFit} onChange={(v) => void changeFit(v)} options={[{ value: 'cover', label: 'Crop to square', title: 'Center-crop so the image fills the badge (like Twitch badges)' }, { value: 'contain', label: 'Fit inside', title: 'Nothing cropped; transparent padding' }]} />
        </Field>
        <Slider label="Corner rounding" value={cfg.badgeRadius} min={0} max={0.5} step={0.01} onChange={(v) => set('badgeRadius', v)} format={(v) => (v === 0 ? 'square' : v >= 0.5 ? 'circle' : `${Math.round(v * 100)}%`)} />
      </Row>

      <div className="upl-block">
        <div className="upl-head">
          <b>Subscriber badges</b>
          <span className="hint">One image per tier (months). Name files like <code>sub-12.png</code> to set the tier automatically.</span>
          <button type="button" className="btn small" disabled={busy} onClick={() => subRef.current?.click()}>
            Upload…
          </button>
          <input ref={subRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files, 'sub').then(() => (e.target.value = ''))} />
        </div>
        {subs.length > 0 && (
          <>
            <div className="upl-list">
              {subs.map((b) => (
                <div key={b.id} className="upl-item">
                  <img src={b.src} alt="" style={{ borderRadius: radiusCss }} />
                  <label>
                    <span>months ≥</span>
                    <input type="number" min={0} max={999} value={b.months ?? 0} onChange={(e) => updateBadge(b.id, { months: parseInt(e.target.value, 10) || 0, name: `${parseInt(e.target.value, 10) || 0}-Month Subscriber` })} />
                  </label>
                  <button type="button" className="x" title="Remove" onClick={() => removeBadge(b.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <Toggle label="Use these as the channel's subscriber badges" value={cfg.channelSubBadgeStyle === 'custom'} onChange={(v) => set('channelSubBadgeStyle', v ? 'custom' : 'generated')} />
          </>
        )}
      </div>

      <div className="upl-block">
        <div className="upl-head">
          <b>Replace a Twitch badge</b>
          <select value={replaceSet} onChange={(e) => setReplaceSet(e.target.value)} className="inline-select">
            {REPLACEABLE_SETS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn small" disabled={busy} onClick={() => repRef.current?.click()}>
            Upload…
          </button>
          <input ref={repRef} type="file" accept="image/*" hidden onChange={(e) => void addFiles(e.target.files, 'replace').then(() => (e.target.value = ''))} />
        </div>
        {reps.length > 0 && (
          <div className="upl-list">
            {reps.map((b) => (
              <div key={b.id} className="upl-item">
                <img src={b.src} alt="" style={{ borderRadius: radiusCss }} />
                <span className="upl-name">{b.name}</span>
                <button type="button" className="x" title="Remove" onClick={() => removeBadge(b.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="upl-block">
        <div className="upl-head">
          <b>Extra badge</b>
          <span className="hint">An additional badge some chatters wear (shown after the sub badge).</span>
          <button type="button" className="btn small" disabled={busy} onClick={() => extraRef.current?.click()}>
            Upload…
          </button>
          <input ref={extraRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files, 'extra').then(() => (e.target.value = ''))} />
        </div>
        {extras.length > 0 && (
          <div className="upl-list">
            {extras.map((b) => (
              <div key={b.id} className="upl-item wide">
                <img src={b.src} alt="" style={{ borderRadius: radiusCss }} />
                <input type="text" value={b.name} onChange={(e) => updateBadge(b.id, { name: e.target.value })} placeholder="badge name" />
                <label className="ratio">
                  <span>{Math.round((b.ratio ?? 0) * 100)}% of chatters</span>
                  <input type="range" min={0} max={1} step={0.01} value={b.ratio ?? 0} onChange={(e) => updateBadge(b.id, { ratio: parseFloat(e.target.value) })} />
                </label>
                <button type="button" className="x" title="Remove" onClick={() => removeBadge(b.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="upl-block">
        <div className="upl-head">
          <b>Custom emotes</b>
          <span className="hint">Type the name in a message to use it (e.g. <code>myEmote</code>). GIF/WebP stay animated.</span>
          <button type="button" className="btn small" disabled={busy} onClick={() => emoteRef.current?.click()}>
            Upload…
          </button>
          <input ref={emoteRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addEmotes(e.target.files).then(() => (e.target.value = ''))} />
        </div>
        {cfg.customEmotes.length > 0 && (
          <>
            <div className="upl-list">
              {cfg.customEmotes.map((e) => (
                <div key={e.id} className="upl-item">
                  <img src={e.src} alt="" className="emote" />
                  <input type="text" value={e.name} onChange={(ev) => set('customEmotes', cfg.customEmotes.map((x) => (x.id === e.id ? { ...x, name: ev.target.value.replace(/\s+/g, '') } : x)))} placeholder="emoteName" />
                  <button type="button" className="x" title="Remove" onClick={() => set('customEmotes', cfg.customEmotes.filter((x) => x.id !== e.id))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <Toggle label="Filler chatters use my emotes too" value={cfg.useCustomEmotesInFiller} onChange={(v) => set('useCustomEmotesInFiller', v)} />
          </>
        )}
      </div>
      {busy && <p className="hint">Processing…</p>}
      {err && <p className="err">{err}</p>}
      {(badges.length > 0 || cfg.customEmotes.length > 0) && (
        <button type="button" className="btn small" onClick={() => patch({ customBadges: [], customEmotes: [], channelSubBadgeStyle: cfg.channelSubBadgeStyle === 'custom' ? 'generated' : cfg.channelSubBadgeStyle })}>
          Remove all uploads
        </button>
      )}
    </Collapsible>
  )
}
