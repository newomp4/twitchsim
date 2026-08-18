import type { Config, Mood } from '../../core/types'
import { PRESETS } from '../../core/defaults'
import { Section, Field, Select, TextInput, Toggle, Slider, Segmented, Row } from '../controls'

const MOODS: { value: Mood; label: string }[] = [
  { value: 'gaming', label: 'Gaming / backseat' },
  { value: 'hype', label: 'Hype' },
  { value: 'funny', label: 'Funny' },
  { value: 'clutch', label: 'Clutch moment' },
  { value: 'chill', label: 'Chill' },
  { value: 'wholesome', label: 'Wholesome' },
  { value: 'toxic', label: 'Toxic (PG-13)' },
  { value: 'reactions', label: 'Reactions only' },
  { value: 'music', label: 'Music / DJ' },
  { value: 'irl', label: 'IRL' },
]

export function ContentPanel({ cfg, set, patch }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void; patch: (p: Partial<Config>) => void }) {
  return (
    <>
      <Section title="Presets" hint="One-click scenarios. They only change the relevant settings, everything else stays as you set it.">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="preset" title={p.description} onClick={() => patch(p.patch)}>
              <b>{p.name}</b>
              <span>{p.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Mode">
        <Segmented
          value={cfg.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'mixed', label: 'Script + ambient', title: 'Your lines interleaved with generated chatter' },
            { value: 'script', label: 'Script only', title: 'Only your lines, in order' },
            { value: 'ambient', label: 'Ambient', title: 'Fully generated chat' },
            { value: 'hype', label: 'Hype wall', title: 'Constant reaction bursts / emote spam' },
          ]}
        />
        {(cfg.mode === 'script' || cfg.mode === 'mixed') && (
          <>
            <Field label="Script (one message per line)" hint="Plain text = random chatter. name: text = specific user. Commands: !sub !gift !gifts !raid !announce !cheer !first !highlight !reply !burst !wait … (see Help)">
              <textarea className="script" value={cfg.script} onChange={(e) => set('script', e.target.value)} spellCheck={false} rows={12} />
            </Field>
            {cfg.mode === 'mixed' && <Slider label="Ambient messages between script lines" value={cfg.scriptGapMultiplier} min={0} max={20} step={1} onChange={(v) => set('scriptGapMultiplier', v)} hint="0 = script lines fire at the base chat rate" />}
          </>
        )}
        {cfg.mode !== 'hype' && <Select label="Mood / vibe of generated chat" value={cfg.mood} options={MOODS} onChange={(v) => set('mood', v)} />}
      </Section>

      <Section title="Stream context" hint="Used inside generated messages ({streamer}, {game}) and for the broadcaster badge.">
        <Row>
          <TextInput label="Streamer name" value={cfg.streamerName} onChange={(v) => set('streamerName', v)} placeholder="Streamer" />
          <TextInput label="Game / topic" value={cfg.gameName} onChange={(v) => set('gameName', v)} placeholder="the game" />
        </Row>
        <Row>
          <TextInput label="Your username (mention highlight)" value={cfg.viewerName} onChange={(v) => set('viewerName', v)} placeholder="optional" />
          <TextInput label="Streamer name color" value={cfg.streamerColor} onChange={(v) => set('streamerColor', v)} placeholder="#hex (optional)" />
        </Row>
        <Toggle label="Streamer occasionally chats (broadcaster badge)" value={cfg.streamerChats} onChange={(v) => set('streamerChats', v)} />
        <Toggle label="Chat bots (Nightbot / StreamElements replies & reminders)" value={cfg.botsEnabled} onChange={(v) => set('botsEnabled', v)} />
        <Toggle label='"Welcome to the chat room!" system line at start' value={cfg.welcomeMessage} onChange={(v) => set('welcomeMessage', v)} />
      </Section>

      <Section title="Randomness">
        <Row>
          <TextInput label="Seed (same seed = same chat)" value={cfg.seed} onChange={(v) => set('seed', v)} />
          <button type="button" className="btn" onClick={() => set('seed', Math.random().toString(36).slice(2, 8))}>
            🎲 New seed
          </button>
        </Row>
      </Section>
    </>
  )
}
