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
  var VERSION = '1.0.0';
  var TAG = 'twitchsim';
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
  function num(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
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
  function resolveFont(family, weight, italic) {
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
   * Text layers are expensive to style through scripting (every attribute is an undo transaction
   * in AE's text engine, and that engine slows down with every transaction of the session), so we
   * style ONE template layer per distinct look and copy it; per layer only the string changes.
   */
  function styleTemplate(spec, textOpts) {
    var font = resolveFont(spec.family, spec.weight, spec.italic);
    if (spec.noFx) textOpts = { shadow: false, strokeWidth: 0, shadowDist: textOpts.shadowDist, shadowSoft: textOpts.shadowSoft };
    var key = font.ps + '|' + (font.faux ? 1 : 0) + '|' + spec.size + '|' + spec.color.join(',') + '|' + textOpts.strokeWidth + '|' + (textOpts.shadow ? 1 : 0);
    var tl = st.templates[key];
    if (tl) return tl;
    if (!st.styleComp) {
      // as long as the build so copied layers span the whole precomp
      st.styleComp = app.project.items.addComp('text styles (used by the builder)', 100, 100, 1, Math.max(1, st.data.durationSec), st.data.fps);
      st.styleComp.parentFolder = st.root;
      st.styleComp.comment = TAG + '-styles';
    }
    tl = st.styleComp.layers.addText('Ag');
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
    if (textOpts.strokeWidth > 0) {
      td.applyStroke = true;
      td.strokeColor = [0, 0, 0];
      td.strokeWidth = textOpts.strokeWidth;
      try {
        td.strokeOverFill = false;
      } catch (e) {}
    } else td.applyStroke = false;
    td.tracking = 0;
    try {
      td.fauxBold = false;
      td.fauxItalic = !!font.faux;
    } catch (e) {}
    td.justification = ParagraphJustification.LEFT_JUSTIFY;
    tp.setValue(td);
    if (textOpts.shadow) {
      try {
        var fx = tl.property('ADBE Effect Parade').addProperty('ADBE Drop Shadow');
        fx.property('ADBE Drop Shadow-0001').setValue([0, 0, 0, 1]);
        fx.property('ADBE Drop Shadow-0002').setValue(217); // 85%
        fx.property('ADBE Drop Shadow-0003').setValue(180);
        fx.property('ADBE Drop Shadow-0004').setValue(textOpts.shadowDist);
        fx.property('ADBE Drop Shadow-0005').setValue(textOpts.shadowSoft);
      } catch (e) {}
    }
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
    if (msg.anim) {
      if (msg.anim.opacity) applyKeys(tf(ml).property('ADBE Opacity'), msg.anim.opacity, 1);
      if (msg.anim.x || msg.anim.y) pos.dimensionsSeparated = true;
      if (msg.anim.x) applyKeys(tf(ml).property('ADBE Position_0'), msg.anim.x, 1);
      if (msg.anim.y) applyKeys(tf(ml).property('ADBE Position_1'), msg.anim.y, 1);
      if (msg.anim.scale) applyKeys(tf(ml).property('ADBE Scale'), msg.anim.scale, 2);
    }
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
      var rec = { layer: l, parentName: null, local: null };
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
        l.parent = null;
      }
      out.push(rec);
    }
    return out;
  }
  function reattachForeign(main, recs) {
    var n = 0;
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (!rec.parentName) continue;
      var np = findLayerByName(main, rec.parentName);
      if (!np) continue;
      try {
        if (rec.local) {
          rec.layer.setParentWithJump(np);
          var t = tf(rec.layer);
          t.property('ADBE Position').setValue(rec.local.p);
          t.property('ADBE Anchor Point').setValue(rec.local.a);
          t.property('ADBE Scale').setValue(rec.local.s);
          t.property('ADBE Rotate Z').setValue(rec.local.r);
        } else rec.layer.parent = np;
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
      // the main comp may have been moved anywhere in the project: find it by its tag, not by folder
      var main = findCompByComment(TAG + '-main:' + data.buildKey);
      if (main) {
        st.foreign = collectForeign(main);
        for (var i = main.numLayers; i >= 1; i--) if (isOurs(main.layer(i))) main.layer(i).remove();
      }
      if (root) {
        // only OUR items go (comment tag); anything the user dropped into the folder stays
        for (var j = root.numItems; j >= 1; j--) {
          var it = root.item(j);
          if (it !== main && isOurs(it)) removeItemDeep(it);
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
      var anchor = main.layers.addNull(dur);
      anchor.name = 'TwitchSim Anchor';
      anchor.comment = TAG + '-anchor';
      anchor.label = 10;
      tf(anchor).property('ADBE Position').setValue([data.chat.x, data.chat.y]);
      st.anchor = anchor;

      if (data.background) {
        var bg = makeRect(main, { name: 'Background', x: 0, y: 0, w: data.chat.w, h: data.chat.h, radius: data.background.radius, color: data.background.color, opacity: data.background.opacity });
        bg.comment = TAG + '-bg';
        bg.parent = anchor;
        tf(bg).property('ADBE Position').setValue([0, 0]);
        tf(bg).property('ADBE Anchor Point').setValue([0, 0]);
      }

      var scroll = main.layers.addNull(dur);
      scroll.name = 'Scroll';
      scroll.comment = TAG + '-scroll';
      scroll.label = 10;
      scroll.parent = anchor;
      tf(scroll).property('ADBE Position').setValue([0, 0]);
      st.scroll = scroll;

      // The canvas clips everything to the chat rectangle; in AE a shared luma matte does the same
      // (rows sliding out at the top / in at the bottom stay inside), plus the optional top fade.
      if (aeVersion() >= 23) {
        var matte = main.layers.addSolid([1, 1, 1], data.fadeTop > 0 ? 'Chat area + top fade (matte)' : 'Chat area (matte)', data.chat.w, data.chat.h, 1, dur);
        matte.comment = TAG + '-matte';
        try {
          matte.source.comment = TAG + '-solid:' + data.buildKey;
        } catch (e) {}
        matte.parent = anchor;
        tf(matte).property('ADBE Anchor Point').setValue([0, 0]);
        tf(matte).property('ADBE Position').setValue([0, 0]);
        if (data.fadeTop > 0) {
          try {
            var ramp = matte.property('ADBE Effect Parade').addProperty('ADBE Ramp');
            ramp.property('ADBE Ramp-0001').setValue([data.chat.w / 2, 0]);
            ramp.property('ADBE Ramp-0002').setValue([0, 0, 0, 1]);
            ramp.property('ADBE Ramp-0003').setValue([data.chat.w / 2, data.fadeTop]);
            ramp.property('ADBE Ramp-0004').setValue([1, 1, 1, 1]);
          } catch (e) {}
        }
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
      // the one animated property: Scroll null Y
      var pos = tf(st.scroll).property('ADBE Position');
      pos.setValue([0, 0]);
      pos.dimensionsSeparated = true;
      var py = tf(st.scroll).property('ADBE Position_1');
      applyKeys(py, d.scroll, 1);
      if (st.matte) {
        st.matte.moveToBeginning();
        st.matte.enabled = false;
      }
      // keep the anchor at the very bottom
      st.anchor.moveToEnd();
      var re = reattachForeign(st.main, st.foreign);
      try {
        st.main.openInViewer();
      } catch (e) {}
    } finally {
      app.endUndoGroup();
    }
    var out = { compName: st.main.name, layers: st.main.numLayers, messages: st.msgLayers.length, reattached: re, folder: st.folder };
    st = null;
    return reply(out);
  }

  function remove(json) {
    var a = args(json);
    var root = findFolderByComment(TAG + ':' + a.buildKey);
    if (!root) return reply({ removed: false });
    app.beginUndoGroup('TwitchSim: remove build');
    try {
      removeItemDeep(root);
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
