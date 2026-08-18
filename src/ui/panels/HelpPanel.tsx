import { Section } from '../controls'

export function HelpPanel() {
  return (
    <>
      <Section title="Script syntax">
        <pre className="help">{`# comment
hello chat                     random chatter says this
name: text                     a specific user (created on the fly)
[mod] nightbot: text           role flags: [mod] [vip] [broadcaster] [founder]
[sub:12 prime] user: text      [sub:N] months, [prime] [turbo] [partner]
[bits:1000 gifter:5] u: text   bits / gifter badges, [color:#ff69b4]
@12.5 text                     at 12.5 s (absolute time)
+0.4 text                      0.4 s after the previous scripted line
!wait 3                        pause 3 s before the next line
!speed 2                       ambient chat 2× faster from here on

!sub user [prime|t1|t2|t3] [months] [-- message]
!gift gifter recipient [t1|t2|t3]        (* = random user)
!gifts gifter 10 [t1]                    community gift bomb
!raid raider 250
!announce [purple|blue|green|orange] text
!cheer user 500 text                     bits message
!first [user:] text                      first-time chatter
!highlight [user:] text                  channel-points highlight
!reward Reward Name | [user:] text       "Redeemed …" header
!reply target: text                      someone replies to target
!me [user:] text                         /me action (colored text)
!delete [user:] text                     gets deleted by a mod
!timeout user 600                        deletes that user's messages
!clear  !slow 5  !slowoff  !emoteonly  !emoteonlyoff  !followers 10  !subsonly
!system text                             gray system line
!burst 20 KEKW                           20 users spam this within ~2 s
!gigantify [user:] text KEKW             power-up: giant emote
!effect rainbow-eclipse [user:] text     power-up: message effect (simmer, cosmic-abyss)
!mod user  !vip user  !unmod user  !color user #hex

Placeholders anywhere: {e} random emote, {e:laugh|hype|sad|scared|cringe|clap|love|jam|wave|bye|think|stare|fail},
{streamer} {game} {user} {n} {big} {country}`}</pre>
      </Section>
      <Section title="How realistic is it?">
        <ul className="help-list">
          <li>Metrics were measured on the live twitch.tv chat (2026): Inter 14px / 22px lines, 4px 16px padding, 340px column, 18px badges with 3px gaps, 28px emote boxes, 12/14/16/18px font-size settings.</li>
          <li>Colors are Twitch's palette: #18181b panel, #efeff1 text, #d3d3d9 secondary, #bf94ff links, #26262c notices, #23094e / #755ebc highlights.</li>
          <li>Default name colors use Twitch's 15-color list hashed from the login; "Readable colors" reproduces Twitch's CIELAB brightening (Blue → #8b58ff, FireBrick → #db4a3f…).</li>
          <li>Badges are the real global badge images with Twitch's ordering (mod → VIP → predictions → sub → gifter/bits/… → Prime/Turbo). Sub badges can come from a real channel.</li>
          <li>Emotes: Twitch globals + popular 7TV emotes, animated ones decoded frame-by-frame so exports are deterministic.</li>
          <li>Sub / gift / raid / announcement notices, replies, deleted messages, highlights, first-time chat, cheers, /me, power-ups, slow-mode notices, bots and reaction "moments" are all modeled.</li>
        </ul>
      </Section>
      <Section title="Export formats">
        <ul className="help-list">
          <li><b>WebM VP9 + alpha</b> — fastest transparent export. Chrome/Firefox/OBS/web play it. Premiere needs a plugin (WebMiere); DaVinci Resolve on Mac reads it.</li>
          <li><b>MOV ProRes 4444</b> — the industry standard for alpha. Premiere, After Effects, Final Cut, Resolve, CapCut all import it. Encoded in-browser with FFmpeg (wasm), so it's slow at 4K.</li>
          <li><b>PNG sequence</b> — import the zip's frames as an image sequence at the same fps. Always works, largest files.</li>
          <li><b>MP4 / WebM opaque</b> — no alpha; pick a green background and key it in your editor if needed.</li>
          <li>Use <b>Stream to disk</b> for long / 4K exports so nothing has to fit in memory. Chrome-based browsers are recommended (WebCodecs).</li>
        </ul>
      </Section>
      <Section title="Shortcuts">
        <ul className="help-list">
          <li><kbd>Space</kbd> play / pause · <kbd>R</kbd> restart · <kbd>N</kbd> new seed</li>
        </ul>
      </Section>
    </>
  )
}
