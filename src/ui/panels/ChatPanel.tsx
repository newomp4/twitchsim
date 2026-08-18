import { useMemo, useRef, useState } from 'react'
import type { Config, Mood } from '../../core/types'
import { detectImport } from '../../core/importFormat'
import { AI_PROMPT } from '../../core/importFormat'
import { SAMPLE_SCRIPT } from '../../core/defaults'
import { Section, Field, Select, TextInput, Toggle, Slider, Segmented, Row, Collapsible, NumberInput, copyText } from '../controls'

const MOODS: { value: Mood; label: string }[] = [
  { value: 'general', label: 'General hype (LFG, W, clip it…)' },
  { value: 'gaming', label: 'Gaming / backseat' },
  { value: 'hype', label: 'Hype' },
  { value: 'funny', label: 'Funny' },
  { value: 'clutch', label: 'Clutch moment' },
  { value: 'chill', label: 'Chill' },
  { value: 'wholesome', label: 'Wholesome' },
  { value: 'toxic', label: 'Toxic (PG-13)' },
  { value: 'reactions', label: 'Emote reactions only' },
  { value: 'music', label: 'Music / DJ' },
  { value: 'irl', label: 'IRL' },
]

export function ChatPanel({ cfg, set }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const usesFiller = cfg.mode !== 'script'
  // "Filler only" + "re-use my lines" still needs the lines box
  const usesLines = cfg.mode === 'script' || cfg.mode === 'mixed' || (usesFiller && cfg.fillerFromScript)
  const orderedLines = cfg.mode === 'script' || cfg.mode === 'mixed'
  const hasLines = !!cfg.script.trim()
  const scriptInfo = useMemo(() => {
    const doc = detectImport(cfg.script)
    if (doc) return `JSON detected: ${doc.users?.length ?? 0} users · ${doc.messages.length} messages`
    const lines = cfg.script.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).length
    return `${lines} line${lines === 1 ? '' : 's'}`
  }, [cfg.script])
  const lvl = (v: number) => (v === 0 ? 'off' : v < 0.34 ? 'rare' : v < 0.67 ? 'some' : v < 1 ? 'often' : 'max')

  const importFile = async (f: File) => {
    const text = await f.text()
    set('script', text)
    if (cfg.mode === 'ambient') set('mode', 'mixed')
  }
  const copyPrompt = async () => {
    if (await copyText(AI_PROMPT)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <>
      <Section title="Lines">
        <Segmented
          value={cfg.mode === 'hype' ? 'ambient' : cfg.mode}
          onChange={(v) => set('mode', v)}
          options={[
            { value: 'mixed', label: 'My lines + filler', title: 'Your lines in order, with generated chatter in between' },
            { value: 'script', label: 'My lines only', title: 'Only your lines, in order' },
            { value: 'ambient', label: 'Filler only', title: 'Fully generated chat' },
          ]}
        />
        {usesLines && (
          <>
            <div className="toolbar">
              <span className="tb-title">Your lines</span>
              <span className="tb-info">{scriptInfo}</span>
              <span className="tb-spacer" />
              <button type="button" className="btn small" onClick={() => fileRef.current?.click()} title="Import a .txt (one message per line) or .json file">
                Import
              </button>
              <button type="button" className="btn small" onClick={copyPrompt} title="Copy a prompt for ChatGPT / Claude / Gemini that writes lines in this format">
                {copied ? 'Copied ✓' : 'AI prompt'}
              </button>
              <button
                type="button"
                className="btn small"
                title="Replace the lines with the built-in example"
                onClick={() => {
                  const n = cfg.script.split(/\r?\n/).filter((l) => l.trim()).length
                  if (n > 3 && cfg.script !== SAMPLE_SCRIPT && !confirm(`Replace your ${n} lines with the example?`)) return
                  set('script', SAMPLE_SCRIPT)
                }}
              >
                Example
              </button>
              <button
                type="button"
                className="btn small"
                title="Remove all lines"
                onClick={() => {
                  const n = cfg.script.split(/\r?\n/).filter((l) => l.trim()).length
                  if (n > 3 && !confirm(`Clear all ${n} lines?`)) return
                  set('script', '')
                }}
              >
                Clear
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.txt,application/json,text/plain"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importFile(f)
                  e.target.value = '' // allow importing the same file again later
                }}
              />
            </div>
            <textarea
              className="script"
              value={cfg.script}
              onChange={(e) => set('script', e.target.value)}
              spellCheck={false}
              rows={14}
              placeholder={'One message per line:\n\ncoolguy_92: yo chat what did i miss\nhe just clutched a 1v3 KEKW\n[mod] nightbot: welcome!\nxX_shadow_Xx: LETS GOOO'}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('Files')) e.preventDefault()
              }}
              onDrop={(e) => {
                const f = e.dataTransfer.files?.[0]
                if (!f) return // plain text drops keep the browser's default behaviour
                e.preventDefault()
                void importFile(f)
              }}
            />
            <p className="hint">
              One message per line: <code>username: message</code>. No name = a random viewer says it. Paste what your AI wrote (Help tab has the prompt) or drop a .txt/.json file here.
              {cfg.mode === 'script' && !cfg.script.trim() && <b> No lines yet — generated chat is shown until you add some.</b>}
            </p>
          </>
        )}
      </Section>

      {usesFiller && (
        <Section title="Filler chat">
          <Row>
            {!cfg.fillerFromScript && <Select label="Vibe" value={cfg.mood} options={MOODS} onChange={(v) => set('mood', v)} />}
            {cfg.mode === 'mixed' && <Slider label="Filler messages between my lines" value={cfg.scriptGapMultiplier} min={0} max={20} step={1} onChange={(v) => set('scriptGapMultiplier', v)} />}
          </Row>
          <Toggle label="Filler re-uses my own lines (shuffled) instead of generic chatter" value={cfg.fillerFromScript} onChange={(v) => set('fillerFromScript', v)} />
        </Section>
      )}

      <Section title="Timing">
        <Slider
          label={cfg.pacing === 'even' ? 'Interval' : 'Chat speed'}
          value={cfg.messagesPerMinute}
          min={1}
          max={1500}
          step={1}
          log
          onChange={(v) => set('messagesPerMinute', v)}
          format={(v) => (cfg.pacing === 'even' ? `every ${(60 / v).toFixed(2)} s (${v}/min)` : `${v} msg/min`)}
          hint={cfg.pacing === 'even' ? 'Perfectly regular; !wait pauses in your lines are kept.' : '10–30 = small stream · 100–300 = mid-size · 500+ = huge'}
        />
        <Row>
          <Toggle label="Regular intervals (metronomic)" value={cfg.pacing === 'even'} onChange={(v) => set('pacing', v ? 'even' : 'natural')} />
          <Toggle label="Start with the chat already full" value={cfg.prefillSec > 0} onChange={(v) => set('prefillSec', v ? 20 : 0)} />
        </Row>
        {orderedLines && hasLines && <Toggle label="End right after my last line (loop-friendly)" value={cfg.durationAuto} onChange={(v) => set('durationAuto', v)} />}
        {!(cfg.durationAuto && orderedLines && hasLines) ? (
          <Slider label="Length" value={cfg.durationSec} min={1} max={600} onChange={(v) => set('durationSec', v)} format={(v) => `${v}s`} />
        ) : (
          <Slider label="Seconds after the last line" value={cfg.tailSec} min={0} max={60} step={0.5} onChange={(v) => set('tailSec', v)} format={(v) => `${v}s`} />
        )}
      </Section>

      <Collapsible title="Chatters & stream" hint="names, seed, streamer, how many people">
        <Row>
          <TextInput label="Streamer name" value={cfg.streamerName} onChange={(v) => set('streamerName', v)} placeholder="Streamer" />
          <TextInput label="Game / topic" value={cfg.gameName} onChange={(v) => set('gameName', v)} placeholder="the game" />
        </Row>
        <Row>
          <TextInput label="Your username (mentions get highlighted)" value={cfg.viewerName} onChange={(v) => set('viewerName', v)} placeholder="optional" />
          <TextInput label="Seed (same seed = same chat)" value={cfg.seed} onChange={(v) => set('seed', v)} />
          <button type="button" className="btn" onClick={() => set('seed', Math.random().toString(36).slice(2, 8))} title="New random seed" aria-label="New random seed">
            🎲
          </button>
        </Row>
        <Slider label="Random chatters in the pool" value={cfg.chatterPoolSize} min={3} max={2000} step={1} log onChange={(v) => set('chatterPoolSize', v)} hint="A few of them chat a lot, most rarely — like real chat." />
        <Field label="Extra usernames (comma or newline separated)" hint='Optional. "Display (login)" sets both. Users defined in your JSON are added automatically.'>
          <textarea aria-label="Extra usernames" value={cfg.customNames} onChange={(e) => set('customNames', e.target.value)} rows={2} placeholder="xqc, pokimane, Kai Cenat (kaicenat)" />
        </Field>
        <Row>
          <Toggle label="Only use my usernames" value={cfg.customNamesOnly} onChange={(v) => set('customNamesOnly', v)} />
          <Toggle label="Streamer chats occasionally" value={cfg.streamerChats} onChange={(v) => set('streamerChats', v)} />
        </Row>
        <Row>
          <Toggle label="Chat bots (Nightbot / StreamElements)" value={cfg.botsEnabled} onChange={(v) => set('botsEnabled', v)} />
          <Toggle label='"Welcome to the chat room!" line' value={cfg.welcomeMessage} onChange={(v) => set('welcomeMessage', v)} />
        </Row>
        <Row>
          <Slider label="Users with a custom name color" value={cfg.customColorRatio} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('customColorRatio', v)} />
          <Slider label="Localized names (김민수 (minsu_kim))" value={cfg.localizedNamesRatio} min={0} max={0.3} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set('localizedNamesRatio', v)} />
        </Row>
        {cfg.pacing === 'natural' && (
          <Row>
            <Slider label="Burstiness" value={cfg.burstiness} min={0} max={1} step={0.01} onChange={(v) => set('burstiness', v)} format={lvl} />
            <Slider label="Crowd reactions (KEKW walls, W spam)" value={cfg.reactionMoments} min={0} max={1} step={0.01} onChange={(v) => set('reactionMoments', v)} format={lvl} />
          </Row>
        )}
        <Row>
          <NumberInput label="Start delay (ms)" value={cfg.startDelayMs} min={0} max={60000} step={100} onChange={(v) => set('startDelayMs', v)} />
          <NumberInput label="Pre-fill seconds" value={cfg.prefillSec} min={0} max={600} step={1} onChange={(v) => set('prefillSec', v)} />
        </Row>
      </Collapsible>

      <Collapsible title="Random events" hint="subs, gifts, raids, replies… in filler chat">
        <Row>
          <Slider label="Subs / resubs" value={cfg.subsRate} min={0} max={1} step={0.01} onChange={(v) => set('subsRate', v)} format={lvl} />
          <Slider label="Gift subs & gift bombs" value={cfg.giftsRate} min={0} max={1} step={0.01} onChange={(v) => set('giftsRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Raids" value={cfg.raidsRate} min={0} max={1} step={0.01} onChange={(v) => set('raidsRate', v)} format={lvl} />
          <Slider label="Bits / cheers" value={cfg.cheersRate} min={0} max={1} step={0.01} onChange={(v) => set('cheersRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Announcements" value={cfg.announcementRate} min={0} max={1} step={0.01} onChange={(v) => set('announcementRate', v)} format={lvl} />
          <Slider label="Highlighted messages" value={cfg.highlightRate} min={0} max={1} step={0.01} onChange={(v) => set('highlightRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Replies" value={cfg.replyRate} min={0} max={1} step={0.01} onChange={(v) => set('replyRate', v)} format={lvl} />
          <Slider label="@mentions" value={cfg.mentionsRate} min={0} max={1} step={0.01} onChange={(v) => set('mentionsRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Deleted messages" value={cfg.deleteRate} min={0} max={1} step={0.01} onChange={(v) => set('deleteRate', v)} format={lvl} />
          <Slider label="First-time chatters" value={cfg.firstTimeRate} min={0} max={1} step={0.01} onChange={(v) => set('firstTimeRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="/me actions" value={cfg.actionsRate} min={0} max={1} step={0.01} onChange={(v) => set('actionsRate', v)} format={lvl} />
          <Slider label="Reward redemptions" value={cfg.rewardRate} min={0} max={1} step={0.01} onChange={(v) => set('rewardRate', v)} format={lvl} />
        </Row>
        <Slider label="Power-ups (giant emotes, message effects)" value={cfg.powerUpsRate} min={0} max={1} step={0.01} onChange={(v) => set('powerUpsRate', v)} format={lvl} />
        <p className="hint">These only affect generated filler; events in your own lines always happen exactly where you put them.</p>
      </Collapsible>
    </>
  )
}
