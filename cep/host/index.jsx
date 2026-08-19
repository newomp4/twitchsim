/*
 * TwitchSim - After Effects host script (ExtendScript / ES3).
 * The panel (client/) computes everything (layout, keyframes, image files) and hands this
 * script a scene JSON; this script only turns it into comps, layers and keyframes.
 *
 * Entry points (called by the panel through CSInterface.evalScript):
 *   TWITCHSIM.info()          -> JSON with AE / project info
 *   TWITCHSIM.begin(argsJson) -> loads the scene, prepares folder/comp, imports footage
 *   TWITCHSIM.step(argsJson)  -> builds a batch of message precomps
 *   TWITCHSIM.finish()        -> keyframes on the scroll null, mattes, re-parenting, opens the comp
 *   TWITCHSIM.remove(argsJson)-> deletes a build (folder + comps) from the project
 */

/* eslint-disable */

$.global.TWITCHSIM_JSON = (function () {
  function quote(s) {
    s = String(s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var code = s.charCodeAt(i);
      if (c === '"') out += '\\"';
      else if (c === '\\') out += '\\\\';
      else if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else if (code < 32) out += '\\u' + ('0000' + code.toString(16)).slice(-4);
      else out += c;
    }
    return '"' + out + '"';
  }
  function stringify(v) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(v) : 'null';
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'string') return quote(v);
    if (v instanceof Array) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(stringify(v[i]));
      return '[' + a.join(',') + ']';
    }
    if (t === 'object') {
      var o = [];
      for (var k in v) if (v.hasOwnProperty(k) && typeof v[k] !== 'function') o.push(quote(k) + ':' + stringify(v[k]));
      return '{' + o.join(',') + '}';
    }
    return 'null';
  }
  function parse(s) {
    if (s === null || s === undefined || s === '') return null;
    return eval('(' + s + ')');
  }
  return { quote: quote, stringify: stringify, parse: parse };
})();

$.global.TWITCHSIM = (function () {
  var VERSION = '1.1.0';
  var TAG = 'twitchsim';
  var CTL = 'TwitchSim Controls'; // the null everything hangs off; its Effect Controls drive the expressions below
  var HOST_DIR = (function () {
    try {
      return new File($.fileName).parent.fsName;
    } catch (e) {
      return '';
    }
  })();
  var J = TWITCHSIM_JSON;
  var st = null; // current build state
  var fontCache = {};

  function reply(o) {
    return J.stringify(o);
  }
  function args(json) {
    var a = J.parse(json);
    return a || {};
  }
  function readFile(path) {
    var f = new File(path);
    if (!f.exists) throw new Error('File not found: ' + path);
    f.encoding = 'UTF-8';
    if (!f.open('r')) throw new Error('Could not open ' + path);
    var s = f.read();
    f.close();
    return s;
  }
  function aeVersion() {
    var m = String(app.version).match(/^(\d+)\.(\d+)/);
    return m ? parseFloat(m[1] + '.' + m[2]) : 0;
  }
  function isOurs(x) {
    return !!x && typeof x.comment === 'string' && x.comment.indexOf(TAG) === 0;
  }
  function tf(layer) {
    return layer.property('ADBE Transform Group');
  }
  function q(sv) {
    // string literal for an expression / ES3 source
    return '"' + String(sv).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  /** expression snippet that resolves the Controls null (from the main comp or from inside a message precomp) */
  function ctlRef(inMain) {
    return inMain ? 'thisComp.layer(' + q(CTL) + ')' : 'comp(' + q(st.data.compName) + ').layer(' + q(CTL) + ')';
  }
  function ctlProp(key, kind, inMain) {
    // the pseudo effect's parameter, or the flat control's single parameter (1) when the effect is absent
    var r = ctlRef(inMain);
    return '(function () { try { return ' + r + '.effect(' + q(PSEUDO) + ')(' + q(PN[key]) + '); } catch (e) { return ' + r + '.effect(' + q(NM[key]) + ')(1); } })()';
  }
  /** `value` unless the control resolves (a renamed comp / null must not break the layer) */
  function safeExpr(body, fallback) {
    return 'var v = ' + (fallback || 'value') + ';\ntry {\n  v = ' + body + ';\n} catch (e) {}\nv';
  }
  function setExpr(prop, expr) {
    try {
      prop.expression = expr;
    } catch (e) {}
  }
  function num(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
  }

  // Effect Controls on the Controls null, grouped by prefix (AE has no folders in Effect Controls;
  // the prefix keeps each group together and sorted the way the panel's tabs are)
  var DOT = ' \u00b7 ';
  var NM = {
    style: 'Animation' + DOT + 'Style',
    dur: 'Animation' + DOT + 'Duration (frames)',
    ease: 'Animation' + DOT + 'Ease out (%)',
    slide: 'Animation' + DOT + 'Slide distance (% of chat width)',
    pop: 'Animation' + DOT + 'Pop from (%)',
    gap: 'Layout' + DOT + 'Row gap (px)',
    opacity: 'Look' + DOT + 'Opacity (%)',
    textOn: 'Look' + DOT + 'Custom text color',
    text: 'Look' + DOT + 'Text color',
    nameOn: 'Look' + DOT + 'Custom name color',
    name: 'Look' + DOT + 'Name color',
    outline: 'Look' + DOT + 'Outline (px)',
    shadow: 'Look' + DOT + 'Shadow (%)',
    shadowSoft: 'Look' + DOT + 'Shadow softness',
    shadowDist: 'Look' + DOT + 'Shadow distance',
    bgOpacity: 'Look' + DOT + 'Background opacity (%)',
    bgColor: 'Look' + DOT + 'Background color',
    radius: 'Look' + DOT + 'Background corners (px)',
    fade: 'Look' + DOT + 'Top fade (% of chat height)'
  };
  var ANIM_STYLES = ['Instant', 'Slide up', 'Slide up + fade', 'Fade', 'Slide from left', 'Slide from right', 'Pop'];
  // The preferred form of the controls: ONE pseudo effect "TwitchSim Controls" (cep/host/twitchsim-controls.ffx,
  // generated by scripts/make-controls-ffx.mjs) with collapsible groups Animation / Layout / Look. Its
  // parameters (PN) are addressed by name inside the effect. The flat, prefixed Expression Controls (NM)
  // stay as the fallback when the preset cannot be applied.
  // IMPORTANT: changing the grouped controls' PARAMETER SET (add / remove / rename a control in
  // scripts/make-controls-ffx.mjs) requires bumping BOTH names below to a new version, e.g.
  // 'TwitchSim Controls 2' and matchName 'Pseudo/TwitchSim Controls 2' in the generator, in lockstep.
  // Why: (a) After Effects caches a pseudo effect's parameter definitions by match name for the whole
  // session, so re-applying a changed .ffx under the same match name keeps the OLD definition; (b) the
  // Controls null survives rebuilds and ensureControls skips applyPreset when an effect named PSEUDO
  // already exists, so an existing project would never see the new param set. A version bump gives the
  // effect a fresh identity so both new and rebuilt-existing projects pick it up (their transform /
  // keyframes are re-parented by name and survive; only the grouped control values reset to defaults).
  var PSEUDO = 'TwitchSim Controls';
  var PN = {
    style: 'Style',
    dur: 'Duration (frames)',
    ease: 'Ease out (%)',
    slide: 'Slide distance (%)',
    pop: 'Pop from (%)',
    gap: 'Row gap (px)',
    opacity: 'Opacity (%)',
    textOn: 'Custom text color',
    text: 'Text color',
    nameOn: 'Custom name color',
    name: 'Name color',
    outline: 'Outline (px)',
    shadow: 'Shadow (%)',
    shadowSoft: 'Shadow softness (px)',
    shadowDist: 'Shadow distance (px)',
    bgOpacity: 'Background opacity (%)',
    bgColor: 'Background color',
    radius: 'Background corners (px)',
    fade: 'Top fade (%)'
  };
  /** expression arguments for CTL(): the pseudo-effect parameter name and the flat control name */
  function cn(key) {
    return q(PN[key]) + ', ' + q(NM[key]);
  }

  /** shared expression helpers: easing (custom curve baked from st.data.ease, else easeOutCubic), growth, markers */
  function exprLib() {
    var samples = st && st.data && st.data.ease && st.data.ease.length ? st.data.ease : null;
    var ease;
    if (samples) {
      ease = 'function EASE(x) { if (x <= 0) return 0; if (x >= 1) return 1; var S = [' + samples.join(',') + ']; var n = S.length - 1; var p = x * n; var i = Math.floor(p); return S[i] + (S[i + 1] - S[i]) * (p - i); }\n';
    } else {
      ease = 'function EASE(x) { return 1 - Math.pow(1 - x, 3); }\n';
    }
    return (
      ease +
      'function P(x, e) { x = Math.max(0, Math.min(1, x)); var c = EASE(x); var v = x + (c - x) * e; return Math.max(0, Math.min(1, v)); }\n' +
      'function BACK(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }\n' +
      'function GROW(st, age, dur, e) { if (st == 1) return 1; if (age <= 0) return 0; if (age >= dur) return 1; if (st == 4) return Math.min(1, 3 * age / dur); return P(age / dur, e); }\n' +
      'function TS(L) { try { for (var q = 1; q <= L.marker.numKeys; q++) { var ch = L.marker.key(q).chapter; if (ch.indexOf("ts ") == 0) return ch.split(" "); } } catch (e) {} return null; }\n' +
      'function CTL(C, n, f, t) { var p; try { p = C.effect(' + q(PSEUDO) + ')(n); } catch (e) { p = C.effect(f)(1); } return t === undefined ? p.value : p.valueAtTime(t); }\n'
    );
  }
  /** the entrance parameters of the row that arrived at t0 (sampled at its arrival, so keyframed controls apply per row) */
  function exprAnimAt(tExpr) {
    return 'var st = Math.round(CTL(C, ' + cn('style') + ', ' + tExpr + '));\n' + 'var dur = Math.min(6, Math.max(0.001, CTL(C, ' + cn('dur') + ', ' + tExpr + ') * thisComp.frameDuration));\n' + 'var e = 1; try { e = Math.max(0, Math.min(1, CTL(C, ' + cn('ease') + ', ' + tExpr + ') / 100)); } catch (ee) {}\n';
  }

  // ---------------------------------------------------------------- fonts

  function styleNamesFor(weight, italic) {
    var base;
    if (weight >= 700) base = ['Bold'];
    else if (weight >= 600) base = ['SemiBold', 'Semi Bold', 'Semibold', 'DemiBold', 'Demi Bold'];
    else if (weight >= 500) base = ['Medium'];
    else base = ['Regular', 'Normal', 'Roman', 'Book'];
    if (!italic) return base;
    var out = [];
    for (var i = 0; i < base.length; i++) {
      out.push(base[i] + ' Italic');
      out.push(base[i] + 'Italic');
    }
    if (weight < 500) out.push('Italic');
    return out;
  }
  function psGuess(family, weight, italic) {
    var fam = String(family).replace(/\s+/g, '');
    var w = weight >= 700 ? 'Bold' : weight >= 600 ? 'SemiBold' : weight >= 500 ? 'Medium' : 'Regular';
    if (italic) return fam + '-' + (weight < 500 ? 'Italic' : w + 'Italic');
    return fam + '-' + w;
  }
  function fontExists(ps) {
    try {
      if (app.fonts && app.fonts.getFontsByPostScriptName) {
        var arr = app.fonts.getFontsByPostScriptName(ps);
        return !!(arr && arr.length);
      }
    } catch (e) {}
    return true; // can't tell on old versions; assume it is there
  }
  /** -> { ps: postScriptName, faux: use fauxItalic } */
  // CSS generic families have no PostScript name: use what the browser draws them with on this OS
  var GENERIC_FAMILIES = { 'system-ui': true, 'sans-serif': true, 'ui-sans-serif': true, serif: true, 'ui-serif': true, monospace: true, 'ui-monospace': true, cursive: true, fantasy: true };
  function concreteFamily(family) {
    var f = String(family || '').toLowerCase();
    if (!GENERIC_FAMILIES[f]) return family;
    var win = $.os.toLowerCase().indexOf('windows') >= 0;
    if (f === 'monospace' || f === 'ui-monospace') return win ? 'Consolas' : 'Menlo';
    if (f === 'serif' || f === 'ui-serif') return win ? 'Times New Roman' : 'Times';
    return win ? 'Segoe UI' : 'Helvetica Neue';
  }

  function resolveFont(family, weight, italic) {
    family = concreteFamily(family);
    var key = family + '|' + weight + '|' + (italic ? 1 : 0);
    if (fontCache[key]) return fontCache[key];
    var res = null;
    try {
      if (app.fonts && app.fonts.getFontsByFamilyNameAndStyleName) {
        var styles = styleNamesFor(weight, italic);
        for (var i = 0; i < styles.length && !res; i++) {
          var arr = app.fonts.getFontsByFamilyNameAndStyleName(family, styles[i]);
          if (arr && arr.length) res = { ps: arr[0].postScriptName, faux: false };
        }
      }
    } catch (e) {}
    if (!res) {
      var g = psGuess(family, weight, italic);
      if (fontExists(g)) res = { ps: g, faux: false };
    }
    if (!res && italic) {
      // no italic face: use the upright one and fake the slant
      var up = resolveFont(family, weight, false);
      res = { ps: up.ps, faux: true };
    }
    if (!res) res = { ps: psGuess(family, weight, italic), faux: false };
    fontCache[key] = res;
    return res;
  }

  // ---------------------------------------------------------------- keys

  function applyKeys(prop, keys, dims) {
    if (!keys || !keys.length) return;
    var times = [];
    var vals = [];
    for (var i = 0; i < keys.length; i++) {
      times.push(keys[i].t);
      var v = keys[i].v;
      vals.push(dims === 2 ? [v, v] : dims === 3 ? [v, v, v] : v);
    }
    prop.setValuesAtTimes(times, vals);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      // look the key up by time (AE may merge keys that land on the same time)
      var idx = prop.nearestKeyIndex(key.t);
      if (!idx || Math.abs(prop.keyTime(idx) - key.t) > 0.002) continue;
      var interp = key.interp || 'bezier';
      try {
        if (interp === 'hold') {
          prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
          continue;
        }
        if (interp === 'linear') {
          prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, key.holdOut ? KeyframeInterpolationType.HOLD : KeyframeInterpolationType.LINEAR);
          continue;
        }
        prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        if (typeof key.inSpeed === 'number') {
          var inE = [];
          var outE = [];
          var cnt = dims === 2 ? 2 : dims === 3 ? 3 : 1;
          for (var d = 0; d < cnt; d++) {
            inE.push(new KeyframeEase(num(key.inSpeed, 0), Math.min(100, Math.max(0.1, num(key.inInf, 33.333)))));
            outE.push(new KeyframeEase(num(key.outSpeed, 0), Math.min(100, Math.max(0.1, num(key.outInf, 33.333)))));
          }
          prop.setTemporalContinuousAtKey(idx, false);
          prop.setTemporalAutoBezierAtKey(idx, false);
          prop.setTemporalEaseAtKey(idx, inE, outE);
        }
        if (key.holdOut) prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.HOLD);
      } catch (e) {
        // never let one bad tangent kill the build
      }
    }
  }

  // ---------------------------------------------------------------- project items

  /** a null layer gets a "Null N" footage item in Solids: tag it (removed with the build) and name it */
  function tagNullSource(layer, name, tag) {
    try {
      layer.source.comment = tag;
      layer.source.name = name;
    } catch (e) {}
  }

  function findFolderByComment(comment) {
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
      var it = items[i];
      if (it instanceof FolderItem && it.comment === comment) return it;
    }
    return null;
  }
  function findCompByComment(comment) {
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) {
      var it = items[i];
      if (it instanceof CompItem && it.comment === comment) return it;
    }
    return null;
  }
  function removeTaggedItems(comment) {
    var items = app.project.items;
    for (var i = items.length; i >= 1; i--) {
      var it = items[i];
      if (it && it.comment === comment) {
        try {
          it.remove();
        } catch (e) {}
      }
    }
  }
  function findCompInFolder(folder, comment) {
    for (var i = 1; i <= folder.numItems; i++) {
      var it = folder.item(i);
      if (it instanceof CompItem && it.comment === comment) return it;
    }
    return null;
  }
  function removeItemDeep(item) {
    if (item instanceof FolderItem) {
      for (var i = item.numItems; i >= 1; i--) removeItemDeep(item.item(i));
    }
    item.remove();
  }
  function findLayerByName(comp, name) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).name === name) return comp.layer(i);
    return null;
  }

  function importStill(path, name, folder) {
    var f = new File(path);
    if (!f.exists) throw new Error('Missing image: ' + path);
    var io = new ImportOptions(f);
    io.importAs = ImportAsType.FOOTAGE;
    var it = app.project.importFile(io);
    it.name = name;
    it.parentFolder = folder;
    it.comment = TAG + '-footage';
    try {
      it.mainSource.alphaMode = AlphaMode.STRAIGHT;
    } catch (e) {}
    return it;
  }
  function importSequence(firstPath, name, folder, fps, loops) {
    var f = new File(firstPath);
    if (!f.exists) throw new Error('Missing image sequence: ' + firstPath);
    var io = new ImportOptions(f);
    io.importAs = ImportAsType.FOOTAGE;
    io.sequence = true;
    io.forceAlphabetical = true;
    var it = app.project.importFile(io);
    it.name = name;
    it.parentFolder = folder;
    it.comment = TAG + '-footage';
    try {
      it.mainSource.conformFrameRate = fps;
    } catch (e) {}
    try {
      it.mainSource.loop = Math.max(1, Math.min(9999, Math.ceil(loops)));
    } catch (e) {}
    try {
      it.mainSource.alphaMode = AlphaMode.STRAIGHT;
    } catch (e) {}
    return it;
  }

  // ---------------------------------------------------------------- layer factories

  function makeRect(comp, spec) {
    var l = comp.layers.addShape();
    l.name = spec.name;
    var contents = l.property('ADBE Root Vectors Group');
    var grp = contents.addProperty('ADBE Vector Group');
    grp.name = 'rect';
    var g = grp.property('ADBE Vectors Group');
    var rect = g.addProperty('ADBE Vector Shape - Rect');
    rect.property('ADBE Vector Rect Size').setValue([spec.w, spec.h]);
    rect.property('ADBE Vector Rect Position').setValue([spec.x + spec.w / 2, spec.y + spec.h / 2]);
    rect.property('ADBE Vector Rect Roundness').setValue(num(spec.radius, 0));
    var fill = g.addProperty('ADBE Vector Graphic - Fill');
    fill.property('ADBE Vector Fill Color').setValue([spec.color[0], spec.color[1], spec.color[2], 1]);
    fill.property('ADBE Vector Fill Opacity').setValue(num(spec.opacity, 100));
    tf(l).property('ADBE Anchor Point').setValue([0, 0]);
    tf(l).property('ADBE Position').setValue([0, 0]);
    return l;
  }

  /**
   * One text layer per build that carries the three layer styles the live controls drive (Drop Shadow,
   * Stroke, Color Overlay). Layer styles can only be added through menu commands (slow, ~1 s each and
   * they need the comp in the viewer), so it is done once and every style template is a duplicate.
   */
  function masterTemplate() {
    if (st.master) return st.master;
    if (!st.styleComp) {
      // as long as the build so copied layers span the whole precomp
      st.styleComp = app.project.items.addComp('text styles (used by the builder)', 100, 100, 1, Math.max(1, st.data.durationSec), st.data.fps);
      st.styleComp.parentFolder = st.root;
      st.styleComp.comment = TAG + '-styles';
    }
    var m = st.styleComp.layers.addText('Ag');
    m.name = '\u00b7master';
    var hasStyles = function () {
      try {
        var ls = m.property('ADBE Layer Styles');
        return ls.numProperties > 0 && ls.property('dropShadow/enabled').enabled && ls.property('frameFX/enabled').enabled && ls.property('solidFill/enabled').enabled;
      } catch (e) {
        return false;
      }
    };
    // 1) the shipped animation preset (Drop Shadow + Stroke + Color Overlay, all switched off): applyPreset
    //    targets the *selected* layers, so select exactly this one
    try {
      for (var li = 1; li <= st.styleComp.numLayers; li++) st.styleComp.layer(li).selected = false;
      m.selected = true;
      var f = st.presetPath ? new File(st.presetPath) : null;
      if (!(f && f.exists) && HOST_DIR) f = new File(HOST_DIR + '/twitchsim-styles.ffx');
      if (f && f.exists) m.applyPreset(f);
    } catch (e) {}
    // 2) fallback: the Layer > Layer Styles menu commands. AE registers them lazily (only once that submenu
    //    was opened in the session), so this may silently do nothing - hence the preset first.
    if (!hasStyles()) {
      try {
        st.styleComp.openInViewer();
        for (var lj = 1; lj <= st.styleComp.numLayers; lj++) st.styleComp.layer(lj).selected = false;
        m.selected = true;
        app.executeCommand(9000); // Drop Shadow
        app.executeCommand(9008); // Stroke
        app.executeCommand(9006); // Color Overlay
      } catch (e) {}
      try {
        st.main.openInViewer();
      } catch (e) {}
    }
    try {
      m.selected = false;
    } catch (e) {}
    st.textControls = hasStyles();
    st.master = m;
    return m;
  }

  /**
   * Text layers are expensive to style through scripting (every attribute is an undo transaction
   * in AE's text engine, and that engine slows down with every transaction of the session), so we
   * style ONE template layer per distinct look and copy it; per layer only the string changes.
   */
  function styleTemplate(spec, textOpts) {
    var font = resolveFont(spec.family, spec.weight, spec.italic);
    var noFx = !!spec.noFx;
    var role = spec.role || '';
    var key = font.ps + '|' + (font.faux ? 1 : 0) + '|' + spec.size + '|' + spec.color.join(',') + '|' + (noFx ? 'nofx' : 'fx') + '|' + role;
    var tl = st.templates[key];
    if (tl) return tl;
    tl = masterTemplate().duplicate();
    tl.name = '\u00b7tmpl ' + key; // unique, never used as a real layer name
    var tp = tl.property('ADBE Text Properties').property('ADBE Text Document');
    var td = tp.value;
    try {
      td.resetCharStyle();
    } catch (e) {}
    try {
      td.font = font.ps;
    } catch (e) {}
    td.fontSize = spec.size;
    td.applyFill = true;
    td.fillColor = [spec.color[0], spec.color[1], spec.color[2]];
    td.applyStroke = false; // the outline is a Stroke layer style (live-adjustable), see below
    td.tracking = 0;
    try {
      td.fauxBold = false;
      td.fauxItalic = !!font.faux;
    } catch (e) {}
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    tp.setValue(td);
    // Live tweaks come from the Controls null through the LAYER STYLES the master carries (drop shadow /
    // stroke / colour overlay), not text-style expressions: a sourceText expression costs ~100 ms per
    // layer in AE's text engine, layer styles copy for free with the layer.
    try {
      var ls = tl.property('ADBE Layer Styles');
      var ds = ls.property('dropShadow/enabled');
      var sk = ls.property('frameFX/enabled');
      var so = ls.property('solidFill/enabled');
      if (noFx) {
        ds.enabled = false;
        sk.enabled = false;
      } else {
        ds.property('dropShadow/color').setValue([0, 0, 0, 1]);
        ds.property('dropShadow/opacity').setValue(textOpts.shadow ? 85 : 0);
        ds.property('dropShadow/useGlobalAngle').setValue(0);
        ds.property('dropShadow/localLightingAngle').setValue(90); // light from above: the shadow falls down, like the canvas
        ds.property('dropShadow/distance').setValue(textOpts.shadowDist);
        ds.property('dropShadow/blur').setValue(textOpts.shadowSoft);
        ds.property('dropShadow/chokeMatte').setValue(0);
        setExpr(ds.property('dropShadow/opacity'), safeExpr(ctlProp('shadow', 'Slider', false)));
        setExpr(ds.property('dropShadow/distance'), safeExpr(ctlProp('shadowDist', 'Slider', false)));
        setExpr(ds.property('dropShadow/blur'), safeExpr(ctlProp('shadowSoft', 'Slider', false)));
        sk.property('frameFX/color').setValue([0, 0, 0, 1]);
        // size cannot go below 1: "no outline" = opacity 0. Canvas strokes are centred under the fill, so half shows.
        sk.property('frameFX/size').setValue(Math.max(1, textOpts.strokeWidth / 2));
        sk.property('frameFX/opacity').setValue(textOpts.strokeWidth > 0 ? 100 : 0);
        try {
          sk.property('frameFX/style').setValue(1); // outside
        } catch (e) {}
        setExpr(sk.property('frameFX/size'), safeExpr('Math.max(1, ' + ctlProp('outline', 'Slider', false) + ')'));
        setExpr(sk.property('frameFX/opacity'), safeExpr(ctlProp('outline', 'Slider', false) + ' > 0 ? 100 : 0'));
      }
      if (!role) so.enabled = false;
      else {
        so.property('solidFill/color').setValue([1, 1, 1, 1]);
        so.property('solidFill/opacity').setValue(0);
        setExpr(so.property('solidFill/color'), safeExpr(ctlProp(role === 'name' ? 'name' : 'text', 'Color', false)));
        setExpr(so.property('solidFill/opacity'), safeExpr(ctlProp(role === 'name' ? 'nameOn' : 'textOn', 'Checkbox', false) + ' > 0 ? 100 : 0', '0'));
      }
    } catch (e) {}
    st.templates[key] = tl;
    return tl;
  }

  function makeText(comp, spec, textOpts) {
    var tmpl = styleTemplate(spec, textOpts);
    tmpl.copyToComp(comp);
    // the copy keeps the template's (unique) name; it is not always inserted on top, so look it up
    var l = null;
    for (var i = 1; i <= comp.numLayers; i++) {
      if (comp.layer(i).name === tmpl.name) {
        l = comp.layer(i);
        break;
      }
    }
    if (!l) l = comp.layer(1);
    l.moveToBeginning(); // keep "newest on top" like every other layer we add
    l.name = spec.name;
    var tp = l.property('ADBE Text Properties').property('ADBE Text Document');
    var ok = false;
    try {
      tp.setValue(spec.text); // string form keeps the copied style (AE 22+)
      ok = tp.value.text === spec.text;
    } catch (e) {}
    if (!ok) {
      var td = tp.value;
      td.text = spec.text;
      tp.setValue(td);
    }
    tf(l).property('ADBE Position').setValue([spec.x, spec.y]);
    if (num(spec.opacity, 100) !== 100) tf(l).property('ADBE Opacity').setValue(spec.opacity);
    return l;
  }

  function makeImage(comp, spec, msg) {
    var item = st.footage[spec.asset];
    if (!item) return null;
    var l = comp.layers.add(item);
    l.name = spec.name;
    var meta = st.assetMeta[spec.asset];
    if (meta && meta.kind === 'sequence' && meta.frames && meta.fps && msg) {
      // keep the animation phase in sync with the preview: frame = comp time mod loop
      var loopSec = meta.frames / meta.fps;
      var phase = msg.inT - Math.floor(msg.inT / loopSec) * loopSec;
      l.startTime = -phase;
      l.inPoint = 0;
    }
    var sx = (spec.w / item.width) * 100;
    var sy = (spec.h / item.height) * 100;
    tf(l).property('ADBE Scale').setValue([sx, sy]);
    tf(l).property('ADBE Position').setValue([spec.cx, spec.cy]);
    if (num(spec.opacity, 100) !== 100) tf(l).property('ADBE Opacity').setValue(spec.opacity);
    return l;
  }

  /** the Controls null's defaults for this build: [key, matchName (flat fallback kind), value] in display order */
  function controlDefaults(data) {
    var bgd = data.background || { color: [0.09, 0.09, 0.1], opacity: 0, radius: 0 };
    var stroke = num(data.text.strokeWidth, 0);
    var an = data.anim || { style: 2, ms: 300, slidePx: 340 };
    return [
      ['style', 'ADBE Dropdown Control', Math.max(1, Math.min(ANIM_STYLES.length, num(an.style, 2)))],
      ['dur', 'ADBE Slider Control', Math.round((num(an.ms, 300) / 1000) * data.fps * 100) / 100],
      ['ease', 'ADBE Slider Control', 100],
      ['slide', 'ADBE Slider Control', 100],
      ['pop', 'ADBE Slider Control', 70],
      ['gap', 'ADBE Slider Control', 0],
      ['opacity', 'ADBE Slider Control', 100],
      ['textOn', 'ADBE Checkbox Control', 0],
      ['text', 'ADBE Color Control', [1, 1, 1, 1]],
      ['nameOn', 'ADBE Checkbox Control', 0],
      ['name', 'ADBE Color Control', [1, 1, 1, 1]],
      ['outline', 'ADBE Slider Control', stroke / 2],
      ['shadow', 'ADBE Slider Control', data.text.shadow ? 85 : 0],
      ['shadowSoft', 'ADBE Slider Control', 3 * data.scale],
      ['shadowDist', 'ADBE Slider Control', 1 * data.scale],
      ['bgOpacity', 'ADBE Slider Control', num(bgd.opacity, 0)],
      ['bgColor', 'ADBE Color Control', [bgd.color[0], bgd.color[1], bgd.color[2], 1]],
      ['radius', 'ADBE Slider Control', num(bgd.radius, 0)],
      ['fade', 'ADBE Slider Control', Math.max(0, Math.min(100, (num(data.fadeTop, 0) / Math.max(1, data.chat.h)) * 100))]
    ];
  }
  function sameValue(a, b) {
    if (a instanceof Array || b instanceof Array) {
      if (!(a instanceof Array) || !(b instanceof Array) || a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-4) return false;
      return true;
    }
    return Math.abs(num(a, 0) - num(b, 0)) < 1e-4;
  }
  function addOneControl(fx, name, match, v) {
    if (match === 'ADBE Dropdown Control') {
      var dd = null;
      try {
        dd = fx.addProperty('ADBE Dropdown Control');
        // setPropertyParameters re-creates the effect: name it afterwards, through the returned property
        var menu = dd.property(1).setPropertyParameters(ANIM_STYLES);
        menu.parentProperty.name = name;
        menu.setValue(v);
        if (fx.property(fx.numProperties).name === name) return;
        fx.property(fx.numProperties).remove();
        dd = null;
      } catch (e) {}
      // AE < 17.0.1 has no dropdown: drop the half-built one and use a slider (1 Instant ... 7 Pop)
      try {
        if (dd) dd.remove();
      } catch (e) {}
      match = 'ADBE Slider Control';
    }
    var c = fx.addProperty(match);
    c.name = name;
    c.property(1).setValue(v);
  }
  /** the value-holding property for a control: inside the pseudo effect, or the flat control's parameter */
  function ctlValueProp(fx, key) {
    try {
      var ef = fx.property(PSEUDO);
      if (ef) {
        var pp = ef.property(PN[key]);
        if (pp) return pp;
      }
    } catch (e) {}
    try {
      var flat = fx.property(NM[key]);
      if (flat) return flat.property(1);
    } catch (e2) {}
    return null;
  }
  /**
   * Effect Controls on the Controls null: the live, expression-driven tweaks. Preferred form: the grouped
   * "TwitchSim Controls" pseudo effect from the shipped preset; fallback: flat expression controls. Existing
   * controls are kept (values, keyframes, expressions = the user's work); a control the user never touched
   * (still at the previous build's default) follows the new default; missing ones are added.
   * Returns the map of defaults to remember for the next build.
   */
  function ensureControls(layer, data, prevDefaults) {
    var fx = layer.property('ADBE Effect Parade');
    var defs = controlDefaults(data);
    var out = {};
    var pseudo = null;
    var justApplied = false;
    try {
      pseudo = fx.property(PSEUDO);
    } catch (e) {
      pseudo = null;
    }
    if (!pseudo) {
      // the grouped effect can only come from the preset (applyPreset targets the *selected* layers).
      // applyPreset REPLACES the whole effect stack, so snapshot any existing flat-control values first.
      var flatSnapshot = {};
      var flatAnimated = false;
      for (var fi = 0; fi < defs.length; fi++) {
        try {
          var ff = fx.property(NM[defs[fi][0]]);
          if (!ff) continue;
          if (ff.property(1).numKeys > 0 || ff.property(1).expression) flatAnimated = true;
          else flatSnapshot[defs[fi][0]] = ff.property(1).value;
        } catch (e) {}
      }
      try {
        if (flatAnimated) throw new Error('keep flat: a flat control is keyframed or expression-driven');
        var f = st.controlsPresetPath ? new File(st.controlsPresetPath) : null;
        if (!(f && f.exists) && HOST_DIR) f = new File(HOST_DIR + '/twitchsim-controls.ffx');
        if (f && f.exists) {
          var comp = layer.containingComp;
          var wasSelected = [];
          for (var li = 1; li <= comp.numLayers; li++) {
            if (comp.layer(li).selected) wasSelected.push(comp.layer(li));
            comp.layer(li).selected = false;
          }
          layer.selected = true;
          layer.applyPreset(f);
          // applyPreset replaces the whole effect stack: the old parade reference is now stale
          fx = layer.property('ADBE Effect Parade');
          layer.selected = false;
          for (var wi = 0; wi < wasSelected.length; wi++) {
            try {
              wasSelected[wi].selected = true;
            } catch (e3) {}
          }
          pseudo = fx.property(PSEUDO);
          justApplied = !!pseudo;
        }
      } catch (e) {
        pseudo = null;
      }
    }
    // a build made with the flat controls: carry the snapshotted values into the grouped effect and leave them
    var migrated = {};
    if (justApplied && typeof flatSnapshot !== 'undefined') {
      for (var mi = 0; mi < defs.length; mi++) {
        var mk = defs[mi][0];
        if (flatSnapshot[mk] === undefined) continue;
        try {
          var toP = pseudo.property(PN[mk]);
          if (toP) {
            toP.setValue(flatSnapshot[mk]);
            migrated[mk] = true;
          }
        } catch (e) {}
      }
    }
    for (var i = 0; i < defs.length; i++) {
      var key = defs[i][0];
      var match = defs[i][1];
      var v = defs[i][2];
      out[key] = v;
      if (migrated[key]) continue; // keep the value carried over from the flat controls
      var p = ctlValueProp(fx, key);
      if (p) {
        try {
          // (builds before the grouped effect stored the defaults under the flat control names)
          var pd = prevDefaults ? (prevDefaults[key] !== undefined ? prevDefaults[key] : prevDefaults[NM[key]]) : undefined;
          var untouched = pd !== undefined && sameValue(p.value, pd);
          if (justApplied) untouched = true; // a freshly applied preset: the baked values are placeholders, use our defaults
          if (untouched && p.numKeys === 0 && !p.expression) p.setValue(v);
        } catch (e) {}
      } else if (!pseudo) addOneControl(fx, NM[key], match, v);
    }
    // flat controls: display order - ours first in the canonical order, anything the user added after
    if (!pseudo) {
      try {
        for (var k = 0; k < defs.length; k++) {
          var pr = fx.property(NM[defs[k][0]]);
          if (pr && pr.propertyIndex !== k + 1) pr.moveTo(k + 1);
        }
      } catch (e) {}
    } else {
      try {
        if (pseudo.propertyIndex !== 1) pseudo.moveTo(1);
      } catch (e) {}
    }
    st.groupedControls = !!pseudo;
    return out;
  }

  /**
   * Entrance + stack expressions for one message layer. The settled position is baked (hold keys); the
   * expressions add, live from the Controls null: the row's own entrance (slide / fade / pop) and the
   * transient of older rows still growing in (the canvas stacks on their *allotted* height, so a new
   * row starts higher and settles down as they finish). Rows read each other through a marker on each
   * message layer: chapter "ts <arrival> <height> <deleted height> <deletion time>".
   */
  function messageExpressions(ml, msg) {
    // CAP (s): rows older than this are settled whatever the controls say - the live Duration is clamped to it
    var lit = 'var t0 = ' + msg.t0 + ', e0 = ' + msg.epochStart + ', idx = ' + num(msg.idx, 0) + ', CW = ' + st.data.chat.w + ';\n';
    var head = lit + exprLib() + 'var v = value;\ntry {\n  var C = ' + ctlRef(true) + ';\n  var CAP = 6;\n';
    var tail = '} catch (err) {}\nv';
    // Y (local, inside Scroll): + row gap, - transient of older rows still growing
    var y =
      head +
      '  var gap = CTL(C, ' + cn('gap') + ');\n' +
      '  var tr = 0;\n' +
      '  for (var j = index + 1; j <= thisComp.numLayers; j++) {\n' +
      '    var a = TS(thisComp.layer(j));\n' +
      '    if (!a) continue;\n' +
      '    var tk = parseFloat(a[1]);\n' +
      '    if (tk < e0) break;\n' + // older than my /clear: everything below is older still
      '    if (tk > t0) continue;\n' +
      '    var age = time - tk;\n' +
      '    if (age >= CAP) break;\n' + // layers are in arrival order: the rest is older
      '    if (age < 0) continue;\n' +
      '    ' + exprAnimAt('tk').replace(/\n/g, '\n    ') + 'var g = GROW(st, age, dur, e);\n' +
      '    if (g < 1) tr += (time >= parseFloat(a[4]) ? parseFloat(a[3]) : parseFloat(a[2])) * (1 - g);\n' +
      '  }\n' +
      '  v = value + gap * idx - tr;\n' +
      tail;
    // X: slide from left / right
    var x =
      head +
      '  var age = time - t0;\n' +
      '  ' + exprAnimAt('t0').replace(/\n/g, '\n  ') + 'if ((st == 5 || st == 6) && age >= 0 && age < dur) {\n' +
      '    var p = P(age / dur, e);\n' +
      '    v = value + (st == 5 ? -1 : 1) * CW * (CTL(C, ' + cn('slide') + ', t0) / 100) * (1 - p);\n' +
      '  }\n' +
      tail;
    // opacity: fade-ins x the global Look opacity
    var o =
      head +
      '  var look = CTL(C, ' + cn('opacity') + ') / 100;\n' +
      '  var a = 1;\n' +
      '  var age = time - t0;\n' +
      '  ' + exprAnimAt('t0').replace(/\n/g, '\n  ') + 'if (age >= 0 && age < dur) {\n' +
      '    var x = age / dur;\n' +
      '    if (st == 3 || st == 4) a = P(x, e);\n' +
      '    else if (st == 5 || st == 6) a = Math.min(1, 2 * x);\n' +
      '    else if (st == 7) a = Math.min(1, 2.5 * x);\n' +
      '  }\n' +
      '  v = value * a * look;\n' +
      tail;
    // scale: pop
    var sc =
      head +
      '  var age = time - t0;\n' +
      '  ' + exprAnimAt('t0').replace(/\n/g, '\n  ') + 'if (st == 7 && age >= 0 && age < dur) {\n' +
      '    var ps = CTL(C, ' + cn('pop') + ', t0) / 100;\n' +
      '    var k = (ps + (1 - ps) * BACK(age / dur)) * 100;\n' +
      '    v = [k, k];\n' +
      '  }\n' +
      tail;
    var t = tf(ml);
    setExpr(t.property('ADBE Position_1'), y);
    setExpr(t.property('ADBE Position_0'), x);
    setExpr(t.property('ADBE Opacity'), o);
    setExpr(t.property('ADBE Scale'), sc);
  }

  /** Scroll null Y: baked hold keys (every instant push-up) + live growth transient and row gap */
  function scrollExpression(clears) {
    var cl = [];
    for (var i = 0; i < (clears || []).length; i++) cl.push(String(clears[i]));
    return (
      'var clears = [' + cl.join(', ') + '];\n' +
      exprLib() +
      'var v = value;\ntry {\n' +
      '  var C = ' + ctlRef(true) + ';\n' +
      '  var gap = CTL(C, ' + cn('gap') + ');\n' +
      '  var e0 = -1e9;\n' +
      '  for (var i = 0; i < clears.length; i++) if (clears[i] <= time) e0 = clears[i];\n' +
      '  var count = 0, tr = 0;\n' +
      '  var CAP = 6;\n' +
      '  for (var j = 1; j <= thisComp.numLayers; j++) {\n' +
      '    var a = TS(thisComp.layer(j));\n' +
      '    if (!a) continue;\n' +
      '    var tk = parseFloat(a[1]);\n' +
      '    if (tk < e0) break;\n' +
      '    if (tk > time) continue;\n' +
      '    var age = time - tk;\n' +
      '    if (gap != 0) count++;\n' +
      '    if (age < CAP) {\n' +
      '      ' + exprAnimAt('tk').replace(/\n/g, '\n      ') + 'var g = GROW(st, age, dur, e);\n' +
      '      if (g < 1) tr += (time >= parseFloat(a[4]) ? parseFloat(a[3]) : parseFloat(a[2])) * (1 - g);\n' +
      '    } else if (gap == 0) break;\n' +
      '  }\n' +
      '  v = value - gap * Math.max(0, count - 1) + tr;\n' +
      '} catch (err) {}\nv'
    );
  }

  function buildMessage(msg) {
    var d = st.data;
    var pc = app.project.items.addComp(msg.name, msg.compW, msg.compH, 1, d.durationSec, d.fps);
    pc.parentFolder = st.msgFolder;
    pc.comment = TAG + '-msg';
    var textOpts = st.textOpts;
    for (var i = 0; i < msg.layers.length; i++) {
      var spec = msg.layers[i];
      var l = null;
      if (spec.type === 'rect') l = makeRect(pc, spec);
      else if (spec.type === 'text') {
        l = makeText(pc, spec, textOpts);
        if (spec.underline) {
          var ul = makeRect(pc, { name: 'underline', x: spec.x, y: spec.y + 1.5 * d.scale, w: spec.underline, h: Math.max(1, d.scale), radius: 0, color: spec.color, opacity: spec.opacity });
          if (spec.state === 'normal') ul.outPoint = msg.deletedAtRel;
          else if (spec.state === 'deleted') ul.inPoint = msg.deletedAtRel;
        }
      } else if (spec.type === 'image') l = makeImage(pc, spec, msg);
      if (!l) continue;
      if (spec.state === 'normal' && typeof msg.deletedAtRel === 'number') l.outPoint = msg.deletedAtRel;
      else if (spec.state === 'deleted' && typeof msg.deletedAtRel === 'number') l.inPoint = msg.deletedAtRel;
    }
    // layer in the main comp
    var ml = st.main.layers.add(pc);
    ml.name = msg.name;
    ml.comment = TAG + '-msg';
    try {
      ml.label = msg.label;
    } catch (e) {}
    ml.startTime = msg.inT;
    ml.inPoint = msg.inT;
    ml.outPoint = Math.max(msg.inT + 1 / d.fps, msg.outT);
    ml.parent = st.scroll;
    tf(ml)
      .property('ADBE Anchor Point')
      .setValue([0, msg.h / 2]);
    var pos = tf(ml).property('ADBE Position');
    pos.setValue([0, msg.localY + msg.h / 2]);
    pos.dimensionsSeparated = true;
    if (msg.yKeys) applyKeys(tf(ml).property('ADBE Position_1'), msg.yKeys, 1);
    // row data for the expressions of the Scroll null and of newer rows (chapter text: invisible in the timeline)
    try {
      var mv = new MarkerValue('');
      mv.chapter = 'ts ' + msg.t0 + ' ' + msg.h + ' ' + num(msg.hDel, msg.h) + ' ' + num(msg.delAt, 1e9);
      ml.property('ADBE Marker').setValueAtTime(msg.inT, mv);
    } catch (e) {}
    messageExpressions(ml, msg);
    if (st.matte) {
      try {
        ml.setTrackMatte(st.matte, TrackMatteType.LUMA);
      } catch (e) {}
    }
    st.msgLayers.push(ml);
    return ml;
  }

  // ---------------------------------------------------------------- foreign layers (user's own layers in our comp)

  function collectForeign(main) {
    var out = [];
    for (var i = 1; i <= main.numLayers; i++) {
      var l = main.layer(i);
      if (isOurs(l)) continue;
      var rec = { layer: l, parentName: null, local: null, belowName: null };
      // remember which of our layers sat right below it, so the rebuild can put it back at the same depth
      // (otherwise the user's overlays end up under the Background)
      for (var b = i + 1; b <= main.numLayers; b++) {
        if (isOurs(main.layer(b))) {
          rec.belowName = main.layer(b).name;
          break;
        }
      }
      if (l.parent && isOurs(l.parent)) {
        rec.parentName = l.parent.name;
        try {
          var t = tf(l);
          var p = t.property('ADBE Position');
          var a = t.property('ADBE Anchor Point');
          var s = t.property('ADBE Scale');
          var r = t.property('ADBE Rotate Z');
          if (p.numKeys === 0 && a.numKeys === 0 && s.numKeys === 0 && r.numKeys === 0 && !p.dimensionsSeparated) rec.local = { p: p.value, a: a.value, s: s.value, r: r.value };
        } catch (e) {}
        // detach before its parent disappears (keeps world position)
        try {
          var wasLocked = l.locked;
          if (wasLocked) l.locked = false;
          l.parent = null;
          if (wasLocked) l.locked = true;
        } catch (e) {}
      }
      out.push(rec);
    }
    return out;
  }
  function reattachForeign(main, recs) {
    var n = 0;
    // stacking first (top to bottom, so relative order among the user's layers survives)
    for (var s0 = 0; s0 < recs.length; s0++) {
      var r0 = recs[s0];
      if (!r0.belowName) continue;
      var below = findLayerByName(main, r0.belowName);
      if (!below && r0.belowName === 'TwitchSim Anchor') below = findLayerByName(main, CTL);
      if (below) {
        try {
          r0.layer.moveBefore(below);
        } catch (e) {}
      }
    }
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (!rec.parentName) continue;
      var np = findLayerByName(main, rec.parentName);
      if (!np && rec.parentName === 'TwitchSim Anchor') np = findLayerByName(main, CTL); // builds before 1.1
      if (!np) continue;
      try {
        var relock = false;
        try {
          relock = !!rec.layer.locked;
          if (relock) rec.layer.locked = false;
        } catch (e) {}
        if (rec.local) {
          rec.layer.setParentWithJump(np);
          var t = tf(rec.layer);
          t.property('ADBE Position').setValue(rec.local.p);
          t.property('ADBE Anchor Point').setValue(rec.local.a);
          t.property('ADBE Scale').setValue(rec.local.s);
          t.property('ADBE Rotate Z').setValue(rec.local.r);
        } else rec.layer.parent = np;
        if (relock) rec.layer.locked = true;
        n++;
      } catch (e) {}
    }
    return n;
  }

  // ---------------------------------------------------------------- public API

  function info() {
    var f = app.project ? app.project.file : null;
    return reply({
      version: VERSION,
      ae: String(app.version),
      aeMajor: aeVersion(),
      fontsApi: !!(app.fonts && app.fonts.getFontsByFamilyNameAndStyleName),
      trackMatteApi: aeVersion() >= 23,
      projectPath: f ? f.fsName : '',
      projectDir: f ? f.parent.fsName : '',
      projectName: f ? decodeURI(f.name).replace(/\.aep$/i, '') : '',
      scriptFileAccess: (function () {
        try {
          return app.preferences.getPrefAsLong('Main Pref Section', 'Pref_SCRIPTING_FILE_NETWORK_SECURITY') === 1;
        } catch (e) {
          return null;
        }
      })()
    });
  }

  function begin(json) {
    var a = args(json);
    var text = readFile(a.jsonPath);
    var data = J.parse(text);
    if (!data || data.version !== 1) throw new Error('Unexpected scene data');
    var folder = String(a.folder);
    st = {
      data: data,
      folder: folder,
      i: 0,
      msgLayers: [],
      footage: {},
      assetMeta: {},
      templates: {},
      master: null,
      textControls: null,
      groupedControls: null,
      presetPath: a.presetPath ? String(a.presetPath) : '',
      controlsPresetPath: a.controlsPresetPath ? String(a.controlsPresetPath) : '',
      styleComp: null,
      foreign: [],
      main: null,
      root: null,
      msgFolder: null,
      footFolder: null,
      anchor: null,
      scroll: null,
      matte: null,
      textOpts: null
    };
    st.textOpts = { shadow: !!data.text.shadow, strokeWidth: num(data.text.strokeWidth, 0), shadowDist: 1 * data.scale, shadowSoft: 3 * data.scale };
    app.beginUndoGroup('TwitchSim: build (prepare)');
    try {
      var key = TAG + ':' + data.buildKey;
      var root = findFolderByComment(key);
      // the main comp: the one in our folder if it is still there, else wherever the user moved it
      var mainTag = TAG + '-main:' + data.buildKey;
      var main = root ? findCompInFolder(root, mainTag) : null;
      if (!main) main = findCompByComment(mainTag);
      var oldAnchor = null;
      if (main) {
        st.foreign = collectForeign(main);
        // the Controls null survives a rebuild (its values, keyframes and transform are the user's work);
        // an old build's "TwitchSim Anchor" (no controls) is replaced
        for (var i = main.numLayers; i >= 1; i--) {
          var ol = main.layer(i);
          if (!isOurs(ol)) continue;
          try {
            ol.locked = false; // a locked layer refuses to be changed or removed
          } catch (e) {}
          if (ol.comment.indexOf(TAG + '-anchor') === 0 && ol.name === CTL && !oldAnchor) oldAnchor = ol;
          else ol.remove();
        }
      }
      if (!oldAnchor) removeTaggedItems(TAG + '-null:' + data.buildKey); // an old Controls null's source, if it went
      if (root) {
        // only OUR generated items go (comment tag); anything the user dropped into the folder stays,
        // and so does any duplicate of the main comp (a copy the user made keeps the tag)
        for (var j = root.numItems; j >= 1; j--) {
          var it = root.item(j);
          if (it !== main && isOurs(it) && it.comment.indexOf(TAG + '-main:') !== 0) removeItemDeep(it);
        }
      } else {
        root = app.project.items.addFolder('TwitchSim \u00b7 ' + data.compName);
        root.comment = key;
      }
      root.name = 'TwitchSim \u00b7 ' + data.compName;
      // matte solids from earlier builds live in the Solids folder
      removeTaggedItems(TAG + '-solid:' + data.buildKey);
      var dur = Math.max(1 / data.fps, data.durationSec);
      if (!main) {
        main = app.project.items.addComp(data.compName, data.frame.w, data.frame.h, 1, dur, data.fps);
        main.parentFolder = root;
        main.comment = TAG + '-main:' + data.buildKey;
      } else {
        main.name = data.compName;
        main.width = data.frame.w;
        main.height = data.frame.h;
        main.frameRate = data.fps;
        main.duration = dur;
      }
      st.root = root;
      st.main = main;
      st.footFolder = root.items.addFolder('footage');
      st.footFolder.comment = TAG + '-part';
      st.msgFolder = root.items.addFolder('messages');
      st.msgFolder.comment = TAG + '-part';

      // footage
      for (var k = 0; k < data.assets.length; k++) {
        var as = data.assets[k];
        var name = as.id;
        st.assetMeta[as.id] = as;
        if (as.kind === 'sequence') {
          var seqFps = as.fps || data.fps;
          var loops = dur / (Math.max(1, as.frames) / seqFps) + 1;
          st.footage[as.id] = importSequence(folder + '/' + as.file + '/f_00000.png', name, st.footFolder, as.fps || data.fps, loops);
        } else st.footage[as.id] = importStill(folder + '/' + as.file, name, st.footFolder);
      }

      // structure layers (created bottom -> top)
      // The Controls null is the parent of everything. Its layer-space origin stays at the chat's top-left
      // (children sit at [0,0]) while its anchor point is the chat's pin point, so scaling / rotating it
      // works about the same corner or centre the chat is aligned to.
      var ax = num(data.chat.ax, 0.5) * data.chat.w;
      var ay = num(data.chat.ay, 0.5) * data.chat.h;
      var geo = [data.chat.x, data.chat.y, data.chat.w, data.chat.h, ax, ay].join(',');
      var anchor = oldAnchor;
      var prev = null; // what the previous build wrote: { g: geometry, d: control defaults }
      if (anchor) {
        try {
          var cm = anchor.comment;
          var brace = cm.indexOf('{');
          if (brace > 0) prev = J.parse(cm.slice(brace));
        } catch (e) {
          prev = null;
        }
        // the null's source (a "Null N" solid) was removed with the tagged solids: re-tag the new one AE gives it
        try {
          if (!anchor.source || !anchor.source.name) anchor = null;
        } catch (e) {
          anchor = null;
        }
      }
      if (!anchor) {
        anchor = main.layers.addNull(dur);
        anchor.name = CTL;
        anchor.label = 10;
      }
      // its "Null N" source lives in Solids: tagged apart from the per-build solids, it survives rebuilds
      // (deleting a footage item deletes the layers that use it) and goes with remove()
      tagNullSource(anchor, 'TwitchSim Controls (null)', TAG + '-null:' + data.buildKey);
      try {
        anchor.outPoint = Math.max(anchor.outPoint, dur);
      } catch (e) {}
      // transform: a moved / scaled / rotated null keeps its transform; only when the chat's place in the
      // frame changed in the panel (other size / anchor / margins) is the position reset to the new default
      if (!prev || prev.g !== geo) {
        tf(anchor).property('ADBE Anchor Point').setValue([ax, ay]);
        tf(anchor).property('ADBE Position').setValue([data.chat.x + ax, data.chat.y + ay]);
      }
      var defaults = ensureControls(anchor, data, prev ? prev.d : null);
      anchor.comment = TAG + '-anchor ' + J.stringify({ g: geo, d: defaults });
      st.anchor = anchor;

      var bgd = data.background || { color: [0.09, 0.09, 0.1], opacity: 0, radius: 0 };
      var bg = makeRect(main, { name: 'Background', x: 0, y: 0, w: data.chat.w, h: data.chat.h, radius: bgd.radius, color: bgd.color, opacity: bgd.opacity });
      bg.comment = TAG + '-bg';
      bg.parent = anchor;
      tf(bg).property('ADBE Position').setValue([0, 0]);
      tf(bg).property('ADBE Anchor Point').setValue([0, 0]);
      try {
        var bgg = bg.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group');
        setExpr(bgg.property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Color'), safeExpr(ctlProp('bgColor', 'Color', true)));
        setExpr(bgg.property('ADBE Vector Graphic - Fill').property('ADBE Vector Fill Opacity'), safeExpr(ctlProp('bgOpacity', 'Slider', true)));
        setExpr(bgg.property('ADBE Vector Shape - Rect').property('ADBE Vector Rect Roundness'), safeExpr(ctlProp('radius', 'Slider', true)));
      } catch (e) {}

      var scroll = main.layers.addNull(dur);
      scroll.name = 'Scroll';
      scroll.comment = TAG + '-scroll';
      scroll.label = 10;
      tagNullSource(scroll, 'TwitchSim Scroll (null)', TAG + '-solid:' + data.buildKey);
      scroll.parent = anchor;
      tf(scroll).property('ADBE Position').setValue([0, 0]);
      st.scroll = scroll;

      // The canvas clips everything to the chat rectangle; in AE a shared luma matte does the same
      // (rows sliding out at the top / in at the bottom stay inside), plus the optional top fade.
      if (aeVersion() >= 23) {
        // a white rounded rectangle (its corners follow "Background corners", like the canvas' clip)
        var matte = makeRect(main, { name: 'Chat area (matte)', x: 0, y: 0, w: data.chat.w, h: data.chat.h, radius: bgd.radius, color: [1, 1, 1], opacity: 100 });
        matte.comment = TAG + '-matte';
        matte.parent = anchor;
        try {
          var mg = matte.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group');
          setExpr(mg.property('ADBE Vector Shape - Rect').property('ADBE Vector Rect Roundness'), safeExpr(ctlProp('radius', 'Slider', true)));
        } catch (e) {}
        // top fade: black->white ramp over the first N % of the chat height ("Top fade" on the Controls null; 0 = none)
        try {
          var ramp = matte.property('ADBE Effect Parade').addProperty('ADBE Ramp');
          ramp.name = 'Top fade';
          ramp.property('ADBE Ramp-0001').setValue([data.chat.w / 2, -1]);
          ramp.property('ADBE Ramp-0002').setValue([0, 0, 0, 1]);
          ramp.property('ADBE Ramp-0003').setValue([data.chat.w / 2, Math.max(0, num(data.fadeTop, 0))]);
          ramp.property('ADBE Ramp-0004').setValue([1, 1, 1, 1]);
          setExpr(ramp.property('ADBE Ramp-0003'), safeExpr('[value[0], Math.max(0, ' + ctlProp('fade', 'Slider', true) + ') / 100 * ' + data.chat.h + ']'));
        } catch (e) {}
        st.matte = matte;
      }
    } finally {
      app.endUndoGroup();
    }
    return reply({ total: data.messages.length, assets: data.assets.length });
  }

  function step(json) {
    if (!st) throw new Error('No build in progress');
    var a = args(json);
    var count = Math.max(1, num(a.count, 10));
    var d = st.data;
    app.beginUndoGroup('TwitchSim: build (messages)');
    try {
      var end = Math.min(d.messages.length, st.i + count);
      for (; st.i < end; st.i++) buildMessage(d.messages[st.i]);
    } finally {
      app.endUndoGroup();
    }
    return reply({ done: st.i, total: d.messages.length });
  }

  function finish() {
    if (!st) throw new Error('No build in progress');
    var d = st.data;
    app.beginUndoGroup('TwitchSim: build (finish)');
    try {
      // Scroll null Y: hold keys for every instant push-up; the expression adds the entrance growth + row gap
      var pos = tf(st.scroll).property('ADBE Position');
      pos.setValue([0, 0]);
      pos.dimensionsSeparated = true;
      var py = tf(st.scroll).property('ADBE Position_1');
      applyKeys(py, d.scroll, 1);
      setExpr(py, scrollExpression(d.clears));
      if (st.matte) {
        st.matte.moveToBeginning();
        st.matte.enabled = false;
      }
      // the Controls null on top, where you look first
      st.anchor.moveToBeginning();
      try {
        st.anchor.selected = true;
      } catch (e) {}
      var re = reattachForeign(st.main, st.foreign);
      try {
        st.main.openInViewer();
      } catch (e) {}
    } finally {
      app.endUndoGroup();
    }
    var out = { compName: st.main.name, layers: st.main.numLayers, messages: st.msgLayers.length, reattached: re, folder: st.folder, textControls: st.textControls, groupedControls: st.groupedControls };
    st = null;
    return reply(out);
  }

  function remove(json) {
    var a = args(json);
    var root = findFolderByComment(TAG + ':' + a.buildKey);
    var main = findCompByComment(TAG + '-main:' + a.buildKey);
    if (!root && !main) return reply({ removed: false });
    app.beginUndoGroup('TwitchSim: remove build');
    try {
      // only OUR items go (comment tag); anything the user dropped into the folder stays, and the
      // folder itself only when it is empty afterwards
      if (root) {
        for (var j = root.numItems; j >= 1; j--) if (isOurs(root.item(j))) removeItemDeep(root.item(j));
        if (root.numItems === 0) root.remove();
      }
      // the main comp may live outside the folder; the null sources live in Solids
      main = findCompByComment(TAG + '-main:' + a.buildKey);
      if (main) main.remove();
      removeTaggedItems(TAG + '-solid:' + a.buildKey);
      removeTaggedItems(TAG + '-null:' + a.buildKey);
    } finally {
      app.endUndoGroup();
    }
    return reply({ removed: true });
  }

  /** Renders one frame of the last/named comp to a PNG (used by automated checks). */
  function snapshot(json) {
    var a = args(json);
    var comp = null;
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) if (items[i] instanceof CompItem && items[i].name === a.compName) comp = items[i];
    if (!comp) throw new Error('Comp not found: ' + a.compName);
    if (typeof comp.saveFrameToPng !== 'function') throw new Error('saveFrameToPng not available in this version');
    comp.saveFrameToPng(num(a.time, 0), new File(a.path));
    return reply({ ok: true });
  }

  /** Text-width report for fidelity checks: AE-rendered width of every text layer in a message precomp. */
  function measure(json) {
    var a = args(json);
    var comp = null;
    var items = app.project.items;
    for (var i = 1; i <= items.length; i++) if (items[i] instanceof CompItem && items[i].name === a.compName) comp = items[i];
    if (!comp) throw new Error('Comp not found: ' + a.compName);
    var out = [];
    for (var j = 1; j <= comp.numLayers; j++) {
      var l = comp.layer(j);
      if (!(l instanceof TextLayer)) continue;
      var r = l.sourceRectAtTime(0, false);
      var td = l.property('ADBE Text Properties').property('ADBE Text Document').value;
      out.push({
        name: l.name,
        text: td.text,
        font: td.font,
        size: td.fontSize,
        x: tf(l).property('ADBE Position').value[0],
        w: r.width,
        left: r.left,
        isSubstitute: (function () {
          try {
            return td.fontLocation === undefined ? null : false;
          } catch (e) {
            return null;
          }
        })()
      });
    }
    return reply(out);
  }

  return { info: info, begin: begin, step: step, finish: finish, remove: remove, snapshot: snapshot, measure: measure, version: VERSION };
})();
