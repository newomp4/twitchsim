import type { Config } from '../../core/types'
import { Section, Slider, Toggle, Row, NumberInput } from '../controls'

export function TimingPanel({ cfg, set }: { cfg: Config; set: <K extends keyof Config>(k: K, v: Config[K]) => void }) {
  const lvl = (v: number) => (v === 0 ? 'off' : v < 0.34 ? 'rare' : v < 0.67 ? 'some' : v < 1 ? 'often' : 'max')
  return (
    <>
      <Section title="Speed" hint="Messages per minute drives everything: 10–30 is a small stream, 100–300 a mid-size stream, 500+ is a huge stream (chat becomes unreadable, like the real thing).">
        <Slider label="Chat speed" value={cfg.messagesPerMinute} min={1} max={1500} step={1} onChange={(v) => set('messagesPerMinute', v)} format={(v) => `${v} msg/min (${(v / 60).toFixed(1)}/s)`} />
        <Slider label="Burstiness" value={cfg.burstiness} min={0} max={1} step={0.01} onChange={(v) => set('burstiness', v)} format={lvl} hint="0 = steady stream, 1 = wild swings between quiet and flood." />
        <Slider label="Reaction moments" value={cfg.reactionMoments} min={0} max={1} step={0.01} onChange={(v) => set('reactionMoments', v)} format={lvl} hint="Everyone reacting at once (KEKW walls, W spam, CLIP IT…)." />
        <Row>
          <NumberInput label="Start delay (ms)" value={cfg.startDelayMs} min={0} max={60000} step={100} onChange={(v) => set('startDelayMs', v)} hint="Empty chat before the first message" />
          <NumberInput label="Pre-fill (seconds of chat before t=0)" value={cfg.prefillSec} min={0} max={600} step={1} onChange={(v) => set('prefillSec', v)} hint="Start with the chat already full instead of empty" />
        </Row>
      </Section>

      <Section title="Duration">
        <Toggle label="Auto: end shortly after the last scripted line" value={cfg.durationAuto} onChange={(v) => set('durationAuto', v)} hint="Only applies when there is a script; ambient-only modes use the fixed duration." />
        <Row>
          <NumberInput label="Duration (seconds)" value={cfg.durationSec} min={1} max={3600} step={1} onChange={(v) => set('durationSec', v)} />
          <NumberInput label="Tail after last script line (s)" value={cfg.tailSec} min={0} max={120} step={0.5} onChange={(v) => set('tailSec', v)} />
        </Row>
      </Section>

      <Section title="Events" hint="How often each kind of event happens (relative to chat speed).">
        <Row>
          <Slider label="Subscriptions / resubs" value={cfg.subsRate} min={0} max={1} step={0.01} onChange={(v) => set('subsRate', v)} format={lvl} />
          <Slider label="Gift subs & gift bombs" value={cfg.giftsRate} min={0} max={1} step={0.01} onChange={(v) => set('giftsRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Raids" value={cfg.raidsRate} min={0} max={1} step={0.01} onChange={(v) => set('raidsRate', v)} format={lvl} />
          <Slider label="Bits / cheers" value={cfg.cheersRate} min={0} max={1} step={0.01} onChange={(v) => set('cheersRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Announcements (/announce)" value={cfg.announcementRate} min={0} max={1} step={0.01} onChange={(v) => set('announcementRate', v)} format={lvl} />
          <Slider label="Highlighted messages (channel points)" value={cfg.highlightRate} min={0} max={1} step={0.01} onChange={(v) => set('highlightRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Replies (Replying to @…)" value={cfg.replyRate} min={0} max={1} step={0.01} onChange={(v) => set('replyRate', v)} format={lvl} />
          <Slider label="@mentions" value={cfg.mentionsRate} min={0} max={1} step={0.01} onChange={(v) => set('mentionsRate', v)} format={lvl} />
        </Row>
        <Row>
          <Slider label="Deleted messages (mod actions)" value={cfg.deleteRate} min={0} max={1} step={0.01} onChange={(v) => set('deleteRate', v)} format={lvl} />
          <Slider label="First-time chatters" value={cfg.firstTimeRate} min={0} max={1} step={0.01} onChange={(v) => set('firstTimeRate', v)} format={lvl} hint='"First Time Chat" header only in mod view (Look tab)' />
        </Row>
        <Row>
          <Slider label="/me actions" value={cfg.actionsRate} min={0} max={1} step={0.01} onChange={(v) => set('actionsRate', v)} format={lvl} />
          <Slider label="Reward redemptions (Redeemed …)" value={cfg.rewardRate} min={0} max={1} step={0.01} onChange={(v) => set('rewardRate', v)} format={lvl} />
        </Row>
        <Slider label="Power-ups (gigantified emotes, message effects)" value={cfg.powerUpsRate} min={0} max={1} step={0.01} onChange={(v) => set('powerUpsRate', v)} format={lvl} />
      </Section>
    </>
  )
}
