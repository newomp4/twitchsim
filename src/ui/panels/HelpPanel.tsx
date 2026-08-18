import { useState } from 'react'
import { Section, Collapsible, copyText } from '../controls'
import { AI_PROMPT } from '../../core/importFormat'

const EXAMPLE_JSON = `{
  "streamer": "MyStreamer",
  "game": "Valorant",
  "users": [
    { "name": "coolguy_92", "color": "#ff69b4", "badges": ["mod", "sub:12"] },
    { "name": "jess_plays", "badges": ["vip", "prime"] },
    { "name": "xX_shadow_Xx" }
  ],
  "messages": [
    { "user": "coolguy_92", "text": "yo chat what did i miss", "delay": 0.5 },
    { "user": "*", "text": "he just clutched a 1v3 KEKW", "delay": 0.8 },
    { "user": "jess_plays", "text": "LETS GOOO {e:hype}", "delay": 0.3 },
    { "type": "sub", "user": "xX_shadow_Xx", "tier": "prime", "months": 6, "text": "resub hype" },
    { "type": "burst", "count": 15, "text": "W" },
    { "type": "gifts", "user": "coolguy_92", "count": 5 },
    { "type": "highlight", "user": "jess_plays", "text": "can you say hi to my brother" },
    { "type": "raid", "user": "friendstreamer", "count": 120 },
    { "type": "wait", "seconds": 2 },
    "ok that was insane"
  ]
}`

export function HelpPanel() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyText(AI_PROMPT)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }
  return (
    <>
      <Section title="AI prompt — generate names & lines elsewhere, paste them here">
        <p className="hint">
          Copy this prompt into ChatGPT / Claude / Gemini, fill in the three &lt;placeholders&gt; at the bottom (length, scenario, tone), and paste the JSON it returns into the <b>Your lines</b> box on the Chat tab. Users, colors, badges,
          timing and events all come through.
        </p>
        <button type="button" className="btn primary" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy the AI prompt'}
        </button>
        <Collapsible title="Show the prompt">
          <pre className="help">{AI_PROMPT}</pre>
        </Collapsible>
        <Collapsible title="Show an example JSON">
          <pre className="help">{EXAMPLE_JSON}</pre>
        </Collapsible>
      </Section>

      <Section title="Writing lines by hand">
        <pre className="help">{`# comment
hello chat                     random viewer says this
name: text                     a specific user (created on the fly)
!user name [mod sub:12 color:#ff69b4]   define a user up-front (badges/color) without a message
[mod] nightbot: text           role flags: [mod] [vip] [broadcaster] [founder]
[sub:12 prime] user: text      [sub:N] months, [prime] [turbo] [partner]
[bits:1000 gifter:5] u: text   bits / gifter badges, [color:#ff69b4]
@12.5 text                     at 12.5 s (absolute time)
+0.4 text                      0.4 s after the previous line
!wait 3                        pause 3 s before the next line
!speed 2                       filler chat 2× faster from here on

!sub user [prime|t1|t2|t3] [months] [-- message]
!gift gifter recipient [t1|t2|t3]        (* = random user)
!gifts gifter 10 [t1]                    community gift bomb
!raid raider 250
!announce [purple|blue|green|orange] text
!cheer user 500 text                     bits message
!first [user:] text                      first-time chatter
!highlight [user:] text                  channel-points highlight
!reward Reward Name | [user:] text       "Redeemed …" header
!reply target: text                      someone replies to target   (!reply target | user: text)
!me [user:] text                         /me action (colored text)
!delete [user:] text                     gets deleted by a mod
!timeout user 600                        deletes that user's messages
!clear  !slow 5  !slowoff  !emoteonly  !emoteonlyoff  !followers 10  !subsonly
!system text                             gray system line
!burst 20 KEKW                           20 users spam this within ~2 s
!gigantify [user:] text KEKW             power-up: giant emote
!effect rainbow-eclipse [user:] text     power-up: message effect (simmer, cosmic-abyss)
!mod user  !vip user  !unmod user  !color user #hex

Placeholders anywhere: {e} random emote · {e:laugh|hype|sad|scared|cringe|clap|love|jam|wave|bye|think|stare|fail}
{streamer} {game} {user} {n} {big} {country}`}</pre>
      </Section>

      <Section title="Export formats">
        <ul className="help-list">
          <li>
            <b>WebM VP9 + alpha</b> — fastest transparent export. Chrome/Firefox/OBS/web play it; DaVinci Resolve reads it (Mac best); Premiere needs the WebMiere plugin.
          </li>
          <li>
            <b>MOV ProRes 4444</b> — the industry standard for alpha: Premiere, After Effects, Final Cut, Resolve, CapCut. Encoded in-browser (FFmpeg wasm), so 4K is slow.
          </li>
          <li>
            <b>PNG sequence</b> — import the frames as an image sequence at the same fps. Always works, biggest files.
          </li>
          <li>
            <b>MP4 / WebM opaque</b> — no alpha; pick a green background and key it in your editor if needed.
          </li>
          <li>Turn on <b>Stream to disk</b> for long / 4K exports. Chrome-based browsers are recommended (WebCodecs).</li>
        </ul>
      </Section>

      <Section title="How realistic is it?">
        <ul className="help-list">
          <li>Metrics measured on live twitch.tv (2026): Inter 14px / 22px lines, 4px 16px padding, 340px column, 18px badges, 28px emote boxes, the four font-size settings.</li>
          <li>Twitch's palette (#18181b panel, #efeff1 text, #d3d3d9 secondary, #bf94ff links, #26262c notices, #23094e / #755ebc highlights) and default name colors hashed like Twitch; "Readable colors" reproduces Twitch's CIELAB brightening.</li>
          <li>Real badge images in Twitch's order, real Twitch/7TV emotes (animated ones decoded frame-by-frame), notices for subs / gifts / raids / announcements, replies, deletions, highlights, first-time chat, cheers, /me, power-ups, bots and crowd reactions.</li>
        </ul>
      </Section>

      <Section title="Shortcuts">
        <ul className="help-list">
          <li>
            <kbd>Space</kbd> play / pause · <kbd>R</kbd> restart · <kbd>N</kbd> new seed
          </li>
        </ul>
      </Section>
    </>
  )
}
