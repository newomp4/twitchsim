import { useState, type ReactNode } from 'react'
import type { Config } from '../core/types'

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="sec">
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  )
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={'row ' + (className ?? '')}>{children}</div>
}

/**
 * Labelled group. Rendered as a <div>, not a <label>: a label's implicit target is its first
 * labelable descendant, so wrapping button groups (Segmented, chips) in a label made clicking the
 * caption press the first button.
 */
export function Field({ label, children, hint, inline }: { label: ReactNode; children: ReactNode; hint?: string; inline?: boolean }) {
  return (
    <div className={'field' + (inline ? ' inline' : '')}>
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="fhint">{hint}</span>}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, format, hint, log }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string; /** logarithmic track: fine control at the low end (min must be > 0) */ log?: boolean }) {
  // log sliders map an integer 0..1000 track position onto min..max exponentially
  const toPos = (v: number) => (log ? Math.round((Math.log(Math.max(min, v) / min) / Math.log(max / min)) * 1000) : v)
  const fromPos = (p: number) => {
    if (!log) return p
    const raw = min * Math.pow(max / min, p / 1000)
    const snapped = Math.round(raw / step) * step
    return Math.min(max, Math.max(min, snapped))
  }
  // while dragging a log slider the thumb follows the pointer (several positions round to the same value)
  const [dragPos, setDragPos] = useState<number | null>(null)
  return (
    <label className="field slider">
      <span className="lbl">
        {label} <b>{format ? format(value) : value}</b>
      </span>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? 1000 : max}
        step={log ? 1 : step}
        value={dragPos ?? toPos(value)}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format ? format(value) : String(value)}
        onChange={(e) => {
          const p = parseFloat(e.target.value)
          if (log) setDragPos(p)
          let next = fromPos(p)
          // arrow keys move the log track by one position, which at the low end rounds back to the same
          // value: then step by one unit in the pressed direction instead of doing nothing
          if (log && next === value && p !== toPos(value)) next = Math.min(max, Math.max(min, value + (p > toPos(value) ? step : -step)))
          onChange(next)
        }}
        onPointerUp={() => setDragPos(null)}
        onBlur={() => setDragPos(null)}
        onKeyUp={() => setDragPos(null)}
      />
      {hint && <span className="fhint">{hint}</span>}
    </label>
  )
}

export function Toggle({ label, value, onChange, hint }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="sw" />
      <span className="lbl">{label}</span>
      {hint && <span className="fhint">{hint}</span>}
    </label>
  )
}

export function Select<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="fhint">{hint}</span>}
    </label>
  )
}

export function TextInput({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="fhint">{hint}</span>}
    </label>
  )
}

export function NumberInput({ label, value, onChange, min, max, step, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  // keep what the user is typing (e.g. an empty field) until it becomes a valid number
  const [text, setText] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))
  return (
    <label className="field">
      <span className="lbl">{label}</span>
      <input
        type="number"
        value={text ?? (Number.isFinite(value) ? value : '')}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v) && v === clamp(v)) onChange(v)
        }}
        onBlur={() => {
          const v = parseFloat(text ?? '')
          if (!Number.isNaN(v)) onChange(clamp(v))
          setText(null)
        }}
      />
      {hint && <span className="fhint">{hint}</span>}
    </label>
  )
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field color">
      <span className="lbl">{label}</span>
      <span className="colorwrap">
        <input type="color" aria-label={`${label} (picker)`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        <input type="text" aria-label={`${label} (hex)`} value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} title={o.title} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const POSITIONS: { v: Config['anchor']; title: string }[] = [
  { v: 'tl', title: 'Top left' }, { v: 't', title: 'Top' }, { v: 'tr', title: 'Top right' },
  { v: 'l', title: 'Left' }, { v: 'c', title: 'Center' }, { v: 'r', title: 'Right' },
  { v: 'bl', title: 'Bottom left' }, { v: 'b', title: 'Bottom' }, { v: 'br', title: 'Bottom right' },
]

/** 3×3 picker for where the chat sits inside a bigger frame. */
export function PositionGrid({ value, onChange }: { value: Config['anchor']; onChange: (v: Config['anchor']) => void }) {
  return (
    <div className="posgrid" role="radiogroup" aria-label="Chat position">
      {POSITIONS.map((p) => (
        <button key={p.v} type="button" title={p.title} aria-label={p.title} role="radio" aria-checked={p.v === value} className={p.v === value ? 'on' : ''} onClick={() => onChange(p.v)} />
      ))}
    </div>
  )
}

export function Collapsible({ title, children, defaultOpen = false, hint }: { title: string; children: ReactNode; defaultOpen?: boolean; hint?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={'sec collapsible' + (open ? ' open' : '')}>
      <button type="button" className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="ctitle">{title}</span>
        {hint && !open && <span className="chint">{hint}</span>}
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </section>
  )
}

/** Clipboard helper with a legacy fallback (no blocking dialogs). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
