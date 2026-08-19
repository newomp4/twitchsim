#!/usr/bin/env node
/**
 * Builds cep/host/twitchsim-controls.ffx: an After Effects animation preset that carries ONE pseudo effect
 * ("TwitchSim Controls") with collapsible groups (Animation / Layout / Look / Shadow / Background) — the
 * thing you otherwise need Adobe's PresetEffects.xml or a pseudo-effect authoring tool for.
 *
 * How: the RIFX skeleton is taken byte-for-byte from a preset After Effects itself saved
 * (scripts/ffx/ctl-template.ffx: a null with a Slider / Checkbox / Color / Dropdown expression control), the
 * per-type parameter-definition ("pard", 148 bytes) and stream-header ("tdb4", 124 bytes) records are copied
 * from it and re-filled (name, default, ranges), and the group start / end records — which no expression
 * control has — are the constants below (taken from a pseudo-effect preset, name field blanked).
 * The parameter list (PARAMS) is the single source of truth: change it, re-run, rebuild in AE.
 *
 *   node scripts/make-controls-ffx.mjs            → writes cep/host/twitchsim-controls.ffx
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
const tmplPath = path.join(here, 'ffx', 'ctl-template.ffx')
const outPath = process.argv[2] || path.join(here, '..', 'cep', 'host', 'twitchsim-controls.ffx')
const T = fs.readFileSync(tmplPath)
const GROUP_BLOBS = {
  GS_PARD: '0000000000000000000000000000000d000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  GS_TDB4: 'db990001000100000001000400006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000809000000000000000000000000051fac000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  GE_PARD: '0000000000000008000000000000000e000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
  GE_TDB4: 'db990001000100000001000400006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000809000000000000000000000000051fac000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
}

// ---------- RIFX parse ----------
function parse(buf) {
  function walk(off, end) {
    const out = []
    while (off + 8 <= end) {
      const id = buf.toString('latin1', off, off + 4)
      const size = buf.readUInt32BE(off + 4)
      const ds = off + 8
      if (id === 'LIST') out.push({ id, type: buf.toString('latin1', ds, ds + 4), kids: walk(ds + 4, ds + size), raw: buf.subarray(off, ds + size) })
      else out.push({ id, data: Buffer.from(buf.subarray(ds, ds + size)) })
      off = ds + size + (size & 1)
    }
    return out
  }
  const size = buf.readUInt32BE(4)
  return { form: buf.toString('latin1', 8, 12), kids: walk(12, 8 + size), tail: buf.subarray(8 + size) }
}
// ---------- RIFX serialize ----------
function ser(node) {
  if (node.kids) {
    const body = Buffer.concat([Buffer.from(node.type, 'latin1'), ...node.kids.map(ser)])
    return chunk('LIST', body)
  }
  return chunk(node.id, node.data)
}
function chunk(id, data) {
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length)
  const parts = [Buffer.from(id, 'latin1'), size, data]
  if (data.length & 1) parts.push(Buffer.alloc(1))
  return Buffer.concat(parts)
}
const leaf = (id, data) => ({ id, data: Buffer.from(data) })
const list = (type, kids) => ({ id: 'LIST', type, kids })
const utf8 = (s) => { const b = Buffer.from(s, 'utf8'); const len = Buffer.alloc(4); len.writeUInt32BE(b.length); return Buffer.concat([Buffer.from('Utf8', 'latin1'), len, b]) }
const tdsn = (s) => leaf('tdsn', utf8(s))
const tdmn = (s) => { const z = Buffer.alloc(s.length + 1); z.write(s, 'latin1'); return leaf('tdmn', z) } // NUL-terminated match name
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const dbl = (n) => { const b = Buffer.alloc(8); b.writeDoubleBE(n); return b }
const cdat = (vals) => leaf('cdat', Buffer.concat(vals.map(dbl)))

// ---------- pull blobs from the template ----------
const tt = parse(T)
const besc = tt.kids.find((k) => k.type === 'besc')
const head = tt.kids.find((k) => k.id === 'head')
const beso = besc.kids.find((k) => k.id === 'beso')
const tdspBlocks = besc.kids.filter((k) => k.type === 'tdsp')
const effectsName = besc.kids.find((k) => k.id === 'tdsn')
const outerTdgp = besc.kids.find((k) => k.type === 'tdgp')
// per-effect chunks: [tdmn, LIST sspc] pairs inside the outer tdgp
const effects = {}
for (let i = 0; i < outerTdgp.kids.length; i++) {
  const k = outerTdgp.kids[i]
  if (k.id === 'tdmn') {
    const name = k.data.toString('latin1').replace(/\0+$/, '')
    const sspc = outerTdgp.kids[i + 1]
    if (sspc && sspc.type === 'sspc') effects[name] = sspc
  }
}
const sliderFx = effects['ADBE Slider Control'], checkFx = effects['ADBE Checkbox Control'], colorFx = effects['ADBE Color Control']
const menuFx = effects[Object.keys(effects).find((n) => n.startsWith('Pseudo/'))]
function partOf(sspc, matchSuffix) {
  // returns { pard, pdnm } for the param whose matchname ends with suffix, and its stream { tdb4, tdum, tduM, tdpi, tdps }
  const parT = sspc.kids.find((k) => k.type === 'parT')
  const tdgp = sspc.kids.find((k) => k.type === 'tdgp')
  const out = {}
  for (let i = 0; i < parT.kids.length; i++) if (parT.kids[i].id === 'tdmn' && parT.kids[i].data.toString('latin1').replace(/\0+$/, '').endsWith(matchSuffix)) { out.pard = parT.kids[i + 1].data; if (parT.kids[i + 2] && parT.kids[i + 2].id === 'pdnm') out.pdnm = parT.kids[i + 2].data }
  for (let i = 0; i < tdgp.kids.length; i++) if (tdgp.kids[i].id === 'tdmn' && tdgp.kids[i].data.toString('latin1').replace(/\0+$/, '').endsWith(matchSuffix)) {
    const s = tdgp.kids[i + 1]
    if (s && s.type === 'tdbs') for (const c of s.kids) out[c.id] = c.data
  }
  return out
}
const H = partOf(sliderFx, '-0000') // header param + stream
const SL = partOf(sliderFx, '-0001')
const CB = partOf(checkFx, '-0001')
const CO = partOf(colorFx, '-0001')
const PU = partOf(menuFx, '-0001')
const BUILTIN = partOf(sliderFx, 'ADBE Effect Built In Params').pard
const sliderTdgp = sliderFx.kids.find((k) => k.type === 'tdgp')
const builtinTdgp = (() => { for (let i = 0; i < sliderTdgp.kids.length; i++) if (sliderTdgp.kids[i].id === 'tdmn' && sliderTdgp.kids[i].data.toString('latin1').replace(/\0+$/, '') === 'ADBE Effect Built In Params') return sliderTdgp.kids[i + 1] })()
const pgui = sliderFx.kids.find((k) => k.id === 'pgui')
// group start / end records (no expression control has them)
const GS = { pard: Buffer.from(GROUP_BLOBS.GS_PARD, 'hex'), tdb4: Buffer.from(GROUP_BLOBS.GS_TDB4, 'hex') }
const GE = { pard: Buffer.from(GROUP_BLOBS.GE_PARD, 'hex'), tdb4: Buffer.from(GROUP_BLOBS.GE_TDB4, 'hex') }

// ---------- parameter spec ----------
// Bump BOTH of these to a new version (e.g. 'TwitchSim Controls 2' / 'Pseudo/TwitchSim Controls 2')
// whenever PARAMS changes, and bump PSEUDO in cep/host/index.jsx to match — see the note there. Editing
// PARAMS without a version bump leaves existing AE sessions / projects on the old parameter set.
const NAME = 'TwitchSim Controls'
const MATCH = 'Pseudo/TwitchSim Controls'
const white = [1, 1, 1]
const PARAMS = [
  { t: 'group', name: 'Animation' },
  { t: 'popup', name: 'Style', items: ['Instant', 'Slide up', 'Slide up + fade', 'Fade', 'Slide from left', 'Slide from right', 'Pop'], def: 2 },
  { t: 'slider', name: 'Duration (frames)', def: 9, vmin: 0, vmax: 600, smin: 0, smax: 60, prec: 1 },
  { t: 'slider', name: 'Ease out (%)', def: 100, vmin: 0, vmax: 100, smin: 0, smax: 100, prec: 0 },
  { t: 'slider', name: 'Slide distance (%)', def: 100, vmin: 0, vmax: 1000, smin: 0, smax: 200, prec: 0 },
  { t: 'slider', name: 'Pop from (%)', def: 70, vmin: 0, vmax: 300, smin: 0, smax: 150, prec: 0 },
  { t: 'groupEnd' },
  { t: 'group', name: 'Layout' },
  { t: 'slider', name: 'Row gap (px)', def: 0, vmin: -500, vmax: 2000, smin: 0, smax: 100, prec: 1 },
  { t: 'groupEnd' },
  { t: 'group', name: 'Look' },
  { t: 'slider', name: 'Opacity (%)', def: 100, vmin: 0, vmax: 100, smin: 0, smax: 100, prec: 0 },
  { t: 'check', name: 'Custom text color', def: 0 },
  { t: 'color', name: 'Text color', def: white },
  { t: 'check', name: 'Custom name color', def: 0 },
  { t: 'color', name: 'Name color', def: white },
  { t: 'slider', name: 'Outline (px)', def: 0, vmin: 0, vmax: 100, smin: 0, smax: 10, prec: 1 },
  { t: 'group', name: 'Shadow' },
  { t: 'slider', name: 'Shadow (%)', def: 0, vmin: 0, vmax: 100, smin: 0, smax: 100, prec: 0 },
  { t: 'slider', name: 'Shadow softness (px)', def: 3, vmin: 0, vmax: 500, smin: 0, smax: 30, prec: 1 },
  { t: 'slider', name: 'Shadow distance (px)', def: 1, vmin: 0, vmax: 500, smin: 0, smax: 30, prec: 1 },
  { t: 'groupEnd' },
  { t: 'group', name: 'Background' },
  { t: 'slider', name: 'Background opacity (%)', def: 100, vmin: 0, vmax: 100, smin: 0, smax: 100, prec: 0 },
  { t: 'color', name: 'Background color', def: [0.094, 0.094, 0.106] },
  { t: 'slider', name: 'Background corners (px)', def: 0, vmin: 0, vmax: 1000, smin: 0, smax: 60, prec: 0 },
  { t: 'groupEnd' },
  { t: 'slider', name: 'Top fade (%)', def: 0, vmin: 0, vmax: 100, smin: 0, smax: 100, prec: 0 },
  { t: 'groupEnd' },
]
for (const p of PARAMS) if (p.name && Buffer.byteLength(p.name, 'latin1') > 31) throw new Error('name too long: ' + p.name)

// ---------- pard builders ----------
function pardBase(tmpl, type, name) {
  const d = Buffer.from(tmpl)
  d.fill(0, 16, 48)
  if (name) d.write(name, 16, 'latin1')
  return d
}
function pardFor(p) {
  if (p.t === 'slider') {
    const d = pardBase(SL.pard, 10, p.name)
    d.writeDoubleBE(p.def, 56)
    d.writeFloatBE(p.vmin, 104); d.writeFloatBE(p.vmax, 108); d.writeFloatBE(p.smin, 112); d.writeFloatBE(p.smax, 116); d.writeFloatBE(p.def, 120)
    d.writeUInt16BE(p.prec, 124); d.writeUInt16BE(0, 126)
    return { pard: d }
  }
  if (p.t === 'check') {
    const d = pardBase(CB.pard, 4, p.name)
    d.writeUInt32BE(p.def ? 1 : 0, 56); d[60] = p.def ? 1 : 0
    return { pard: d, pdnm: CB.pdnm }
  }
  if (p.t === 'color') {
    const d = pardBase(CO.pard, 5, p.name)
    const argb = (c) => Buffer.from([255, Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)])
    argb(p.def).copy(d, 56); argb(p.def).copy(d, 60)
    return { pard: d }
  }
  if (p.t === 'popup') {
    const d = pardBase(PU.pard, 7, p.name)
    d.writeUInt32BE(p.def, 56); d.writeUInt16BE(p.items.length, 60); d.writeUInt16BE(p.def, 62)
    return { pard: d, pdnm: utf8(p.items.join('|')) }
  }
  if (p.t === 'group') return { pard: pardBase(GS.pard, 13, p.name) }
  if (p.t === 'groupEnd') return { pard: pardBase(GE.pard, 14, '') }
  throw new Error('type ' + p.t)
}
function streamFor(p) {
  const kids = []
  if (p.t === 'slider') {
    kids.push(leaf('tdsb', u32(1)), tdsn(p.name), leaf('tdb4', SL.tdb4), cdat([p.def, 0, 0, 0, 0]), leaf('tdum', dbl(p.smin)), leaf('tduM', dbl(p.smax)))
  } else if (p.t === 'check') {
    kids.push(leaf('tdsb', u32(1)), tdsn(p.name), leaf('tdb4', CB.tdb4), cdat([p.def ? 1 : 0, 0, 0, 0, 0]))
  } else if (p.t === 'color') {
    kids.push(leaf('tdsb', u32(1)), tdsn(p.name), leaf('tdb4', CO.tdb4), cdat([255, p.def[0] * 255, p.def[1] * 255, p.def[2] * 255, 0, 0, 0, 0, 0, 0, 0, 0]))
  } else if (p.t === 'popup') {
    kids.push(leaf('tdsb', u32(1)), tdsn(p.name), leaf('tdb4', PU.tdb4), cdat([p.def, 0, 0, 0, 0]))
  } else if (p.t === 'group') {
    kids.push(leaf('tdsb', u32(1)), tdsn(p.name), leaf('tdb4', GS.tdb4), cdat([0, 0, 0, 0, 0]))
  } else if (p.t === 'groupEnd') {
    kids.push(leaf('tdsb', u32(1)), tdsn(NAME), leaf('tdb4', GE.tdb4), cdat([0, 0, 0, 0, 0]))
  }
  return list('tdbs', kids)
}

// ---------- assemble the effect ----------
const parT = [leaf('parn', u32(PARAMS.length + 2)), tdmn(MATCH + '-0000'), leaf('pard', H.pard)]
const streams = [leaf('tdsb', u32(1)), tdsn(NAME), tdmn(MATCH + '-0000'), list('tdbs', [leaf('tdsb', u32(3)), tdsn(''), leaf('tdb4', H.tdb4), cdat([0, 0, 0, 0, 0]), leaf('tdpi', H.tdpi), leaf('tdps', H.tdps)])]
PARAMS.forEach((p, i) => {
  const mn = MATCH + '-' + String(i + 1).padStart(4, '0')
  const { pard, pdnm } = pardFor(p)
  parT.push(tdmn(mn), leaf('pard', pard))
  if (pdnm) parT.push(leaf('pdnm', pdnm))
  streams.push(tdmn(mn), streamFor(p))
})
parT.push(tdmn('ADBE Effect Built In Params'), leaf('pard', BUILTIN))
streams.push(tdmn('ADBE Effect Built In Params'), builtinTdgp, tdmn('ADBE Group End'))
const fnam = leaf('fnam', utf8(NAME))
const sspc = list('sspc', [fnam, list('parT', parT), list('tdgp', streams), pgui])
const newOuter = list('tdgp', [leaf('tdsb', u32(1)), tdsn('Effects'), tdmn(MATCH), sspc, tdmn('ADBE Group End')])
// keep the original order of the besc children as in the template
const bescKids = []
for (const k of besc.kids) {
  if (k.type === 'tdgp') bescKids.push(newOuter)
  else bescKids.push(k)
}
const body = Buffer.concat([Buffer.from('FaFX', 'latin1'), ser(head), ser(list('besc', bescKids))])
const out = Buffer.concat([Buffer.from('RIFX', 'latin1'), u32(body.length), body, tt.tail])
fs.writeFileSync(outPath, out)
console.log('wrote', outPath, out.length, 'bytes,', PARAMS.length, 'parameters')
