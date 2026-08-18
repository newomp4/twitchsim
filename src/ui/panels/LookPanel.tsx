import type { Config } from '../../core/types'
import { Section, Slider, Toggle, Row, Segmented, ColorInput, NumberInput, Select, Field } from '../controls'

export function LookPanel({ cfg, set, patch }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void }) {
  const overlayish = cfg.chatStyle === 'transparent' || cfg.chatStyle === 'custom'
  return (
    <>
      <Section title="Style">
        <Segmented
          value={cfg.chatStyle}
          onChange={(v) => {
            if (v === 'twitch-light') patch({ chatStyle: v, theme: 'light' })
            else if (v === 'twitch-dark') patch({ chatStyle: v, theme: 'dark' })
            else set('chatStyle', v)
          }}
          options={[
            { value: 'twitch-dark', label: 'Twitch dark', title: 'twitch.tv chat column, dark theme (#18181b)' },
            { value: 'twitch-light', label: 'Twitch light', title: 'twitch.tv chat, light theme' },
            { value: 'transparent', label: 'Transparent', title: 'No panel background — for overlays' },
            { value: 'custom', label: 'Custom bg', title: 'Your own background color / opacity / rounding' },
          ]}
        />
        {cfg.chatStyle === 'custom' && (
          <Row>
            <ColorInput label="Background" value={cfg.bgColor} onChange={(v) => set('bgColor', v)} />
            <Slider label="Opacity" value={cfg.bgOpacity} min={0} max={1} step={0.01} onChange={(v) => set('bgOpacity', v)} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Corner radius" value={cfg.cornerRadius} min={0} max={40} onChange={(v) => set('cornerRadius', v)} />
          </Row>
        )}
        {(cfg.chatStyle === 'custom' || cfg.chatStyle === 'transparent') && (
          <Field label="Text color theme">
            <Segmented value={cfg.theme} onChange={(v) => set('theme', v)} options={[{ value: 'dark', label: 'Light text (for dark backgrounds)' }, { value: 'light', label: 'Dark text (for light backgrounds)' }]} />
          </Field>
        )}
        {overlayish && (
          <Row>
            <Toggle label="Text shadow" value={cfg.textShadow} onChange={(v) => set('textShadow', v)} />
            <Slider label="Text outline" value={cfg.textOutline} min={0} max={4} step={0.5} onChange={(v) => set('textOutline', v)} format={(v) => `${v}px`} />
          </Row>
        )}
        <Slider label="Fade out the top edge" value={cfg.fadeTopEdge} min={0} max={300} step={5} onChange={(v) => set('fadeTopEdge', v)} format={(v) => (v ? `${v}px` : 'off')} hint="Older messages dissolve at the top (great for overlays)." />
      </Section>

      <Section title="Size" hint="Twitch's chat column is 340px wide. Change the height freely — a short chat shows a few lines, a tall one stretches down the whole screen. Export scale multiplies everything (4× ≈ 4K-sharp).">
        <Row>
          <Slider label="Height" value={cfg.height} min={60} max={2160} step={2} onChange={(v) => set('height', v)} format={(v) => `${v}px`} />
          <NumberInput label="Height (px)" value={cfg.height} min={40} max={4000} onChange={(v) => set('height', Math.round(v))} />
        </Row>
        <Row>
          <Slider label="Width" value={cfg.width} min={200} max={1200} step={2} onChange={(v) => set('width', v)} format={(v) => `${v}px`} />
          <NumberInput label="Width (px)" value={cfg.width} min={120} max={3000} onChange={(v) => set('width', Math.round(v))} />
        </Row>
        <Row>
          <Slider label="Side padding" value={cfg.paddingX} min={0} max={60} onChange={(v) => set('paddingX', v)} format={(v) => `${v}px`} />
          <Slider label="Bottom padding" value={cfg.paddingBottom} min={0} max={80} onChange={(v) => set('paddingBottom', v)} format={(v) => `${v}px`} />
        </Row>
      </Section>

      <Section title="Text">
        <Field label="Font size (Twitch chat setting)">
          <Segmented value={cfg.fontSize} onChange={(v) => set('fontSize', v)} options={[{ value: 'small', label: 'Small (12px)' }, { value: 'default', label: 'Default (14px)' }, { value: 'large', label: 'Bigger (16px)' }, { value: 'xlarge', label: 'Biggest (18px)' }]} />
        </Field>
        <Slider label="Extra font scale" value={cfg.fontScale} min={0.6} max={2.5} step={0.05} onChange={(v) => set('fontScale', v)} format={(v) => `${v.toFixed(2)}×`} hint="Scales text, badges and emotes together (1.00 = exact Twitch metrics)." />
        <Select label="Font family" value={cfg.fontFamily} onChange={(v) => set('fontFamily', v)} options={[{ value: 'Inter', label: 'Inter (Twitch)' }, { value: 'Roobert', label: 'Roobert (if installed)' }, { value: 'Helvetica Neue', label: 'Helvetica Neue' }, { value: 'Arial', label: 'Arial' }, { value: 'system-ui', label: 'System UI' }]} />
        <Row>
          <Toggle label="Bold usernames" value={cfg.boldNames} onChange={(v) => set('boldNames', v)} />
          <Toggle label="Readable colors (Twitch default: on)" value={cfg.readableColors} onChange={(v) => set('readableColors', v)} />
        </Row>
        <Row>
          <Toggle label="Timestamps" value={cfg.timestamps} onChange={(v) => set('timestamps', v)} />
          <Toggle label="Alternating row background" value={cfg.alternateBg} onChange={(v) => set('alternateBg', v)} />
        </Row>
        <Row>
          <Toggle label="Broadcaster / mod view (First Time Chat, Raider highlights)" value={cfg.modView} onChange={(v) => set('modView', v)} />
          <Toggle label="Hype Train active (gold notice bars)" value={cfg.hypeTrain} onChange={(v) => set('hypeTrain', v)} />
        </Row>
      </Section>

      <Section title="Animation" hint="Real Twitch just pops new messages in (instant). Slide/fade look great in videos.">
        <Segmented value={cfg.animation} onChange={(v) => set('animation', v)} options={[{ value: 'instant', label: 'Instant (Twitch)' }, { value: 'slide', label: 'Slide up' }, { value: 'fade', label: 'Fade in' }, { value: 'slide-fade', label: 'Slide + fade' }]} />
        {cfg.animation !== 'instant' && <Slider label="Animation duration" value={cfg.animationMs} min={60} max={800} step={10} onChange={(v) => set('animationMs', v)} format={(v) => `${v}ms`} />}
      </Section>
    </>
  )
}
