#!/usr/bin/env node
/* item-models.cjs - every purchasable thing's 3D icon, from Astra's GLBs to
 * data the game can draw (2026-11-09).
 *
 *     node tools/item-models.cjs        reads ref/icons/, writes src/itemmodels.js
 *
 * Astra modelled an icon for every item on sale (the brief was
 * tools/catalogue.cjs's list): `eq_<id>.glb` for equipment, `con_` for
 * consumables, `good_` for trade goods, `mod_` for station modules. The
 * weapons double as the guns drawn on a ship's hull.
 *
 * The renderer eats one mesh format - vertices, triangles, one flat colour
 * per triangle, '!' for a self-lit one - so this does what glb2hulls does
 * for hulls, plus one thing it never needed: these models are TEXTURED.
 *
 *   - A painted or metal part names its colour in its material
 *     (`paint_272a2f_panel`, `metal_737b84_brushed`, `glow_7fe0ff`), in
 *     sRGB, which is what the game's colours are. That name wins.
 *   - Anything else with a texture (a decal, a placard, a manifest strip)
 *     is cut into a small grid of triangles and each is coloured from the
 *     texture at its middle, so a readout or a hazard stripe survives as a
 *     few coloured cells instead of averaging to grey.
 *   - Emissive materials come out self-lit.
 *
 * AXES. Astra's models face -Z with +Y up (glTF's own forward). The game's
 * ship frame faces +Z, so every point is turned half a turn about Y:
 * (x, y, z) -> (-x, y, -z). Kept in the model's own units and centred on
 * the bounding box; the caller scales.
 *
 * For a gun it also records where the shots leave (`muzzles`, the forward
 * face of every lens, emitter, bore or muzzle part, one per barrel) and
 * where it bolts on (`foot`, the underside of the base plate), because the
 * game hangs the model off a hull by its foot and fires from its barrels.
 *
 * Needs `sharp`, the dev dependency cargo-kit.cjs already uses. In a
 * worktree without node_modules, point NODE_PATH at a checkout that has it. */
'use strict';

var fs = require('fs');
var path = require('path');
var sharp = require('sharp');

var ROOT = path.resolve(__dirname, '..');
var IN = path.join(ROOT, 'ref', 'icons');
var OUT = path.join(ROOT, 'src', 'itemmodels.js');
var GRID = 4;                 // a decal triangle becomes GRID*GRID cells

function readGlb(file) {
  var b = fs.readFileSync(file);
  var jl = b.readUInt32LE(12);
  var json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  var off = 20 + jl, bl = b.readUInt32LE(off);
  return { json: json, bin: b.slice(off + 8, off + 8 + bl) };
}
var COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
var NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessor(g, i) {
  var J = g.json, a = J.accessors[i], bv = J.bufferViews[a.bufferView];
  var n = NCOMP[a.type], cs = COMP[a.componentType];
  var stride = bv.byteStride || n * cs, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = [];
  for (var k = 0; k < a.count; k++) {
    var o = base + k * stride, row = [];
    for (var c = 0; c < n; c++) {
      var p = o + c * cs, v;
      switch (a.componentType) {
        case 5126: v = g.bin.readFloatLE(p); break;
        case 5125: v = g.bin.readUInt32LE(p); break;
        case 5123: v = g.bin.readUInt16LE(p); if (a.normalized) v /= 65535; break;
        case 5122: v = g.bin.readInt16LE(p); if (a.normalized) v = Math.max(v / 32767, -1); break;
        case 5121: v = g.bin.readUInt8(p); if (a.normalized) v /= 255; break;
        default: v = g.bin.readInt8(p); if (a.normalized) v = Math.max(v / 127, -1);
      }
      row.push(v);
    }
    out.push(n === 1 ? row[0] : row);
  }
  return out;
}
function mat4(n) {
  if (n.matrix) return n.matrix.slice();
  var t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  var x = r[0], y = r[1], z = r[2], w = r[3];
  return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
          (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
          (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function mul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function apply(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}

/* sRGB <-> linear, for multiplying a linear factor into an sRGB texel. */
function toLin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function toSrgb(l) { l = Math.max(0, Math.min(1, l)); return Math.round(255 * (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
function hex(rgb) { return '#' + rgb.map(function (v) { return ('0' + Math.max(0, Math.min(255, v | 0)).toString(16)).slice(-2); }).join(''); }

async function decodeImages(g) {
  var J = g.json, out = [];
  for (var i = 0; i < (J.images || []).length; i++) {
    var bv = J.bufferViews[J.images[i].bufferView];
    var buf = g.bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    var img = sharp(buf).ensureAlpha();
    var meta = await img.metadata();
    out.push({ w: meta.width, h: meta.height, px: await img.raw().toBuffer() });
  }
  return out;
}
function texel(im, u, v) {
  u = u - Math.floor(u); v = v - Math.floor(v);
  var x = Math.min(im.w - 1, Math.floor(u * im.w)), y = Math.min(im.h - 1, Math.floor(v * im.h));
  var i = (y * im.w + x) * 4;
  return [im.px[i], im.px[i + 1], im.px[i + 2], im.px[i + 3]];
}

/* What a material looks like, as a function of where on it you sample.
 * Returns { named, glow, sample(u, v) -> '#rrggbb' or null } */
function materialOf(g, images, mi) {
  var J = g.json, m = (J.materials || [])[mi] || {};
  var pbr = m.pbrMetallicRoughness || {};
  var f = pbr.baseColorFactor || [1, 1, 1, 1];
  var name = m.name || '';
  var em = m.emissiveFactor || [0, 0, 0];
  var glow = (em[0] + em[1] + em[2]) > 0.05;
  var named = /^(?:paint|metal|glow)_([0-9a-f]{6})(?:_|$)/i.exec(name);
  var texIdx = pbr.baseColorTexture ? pbr.baseColorTexture.index
             : (m.emissiveTexture ? m.emissiveTexture.index : null);
  var im = texIdx != null ? images[J.textures[texIdx].source] : null;
  var flat = hex(named ? [parseInt(named[1].slice(0, 2), 16), parseInt(named[1].slice(2, 4), 16), parseInt(named[1].slice(4, 6), 16)]
                       : [toSrgb(f[0]), toSrgb(f[1]), toSrgb(f[2])]);
  if (glow && !im) flat = hex([toSrgb(em[0]), toSrgb(em[1]), toSrgb(em[2])]);
  var pre = glow ? '!' : '';
  return {
    textured: !named && !!im,
    glow: glow,
    blend: m.alphaMode === 'BLEND' || m.alphaMode === 'MASK',
    sample: function (u, v) {
      if (named || !im) return pre + flat;
      var t = texel(im, u, v);
      if (t[3] < 96) return null;          // a transparent cell of a decal: leave it out
      return pre + hex([toSrgb(f[0] * toLin(t[0])), toSrgb(f[1] * toLin(t[1])), toSrgb(f[2] * toLin(t[2]))]);
    }
  };
}

var MUZZLE_RE = /^(?:muzzle_lens|lens|emitter|bore)_\d+$/i;
var MUZZLE_FALLBACK_RE = /^muzzle(?:_brake)?_\d+$/i;
var FOOT_RE = /^(?:base_plate|base)_\d+$/i;

/* Groups left out. `fire_*` is a muzzle flash modelled in place - lit all
 * the time it would read as a gun forever firing. The hull's copy of a gun
 * (opts.hull) also drops the `arc_*` lightning between a pion gun's prongs:
 * a hundred and fifty slivers that are under a pixel at the size a gun is
 * on a ship, and most of that gun's triangles. */
var DROP_RE = /^fire_/i, HULL_DROP_RE = /^(?:fire|arc)_/i;

async function convert(file, opts) {
  opts = opts || {};
  var grid = opts.hull ? 1 : GRID, drop = opts.hull ? HULL_DROP_RE : DROP_RE;
  var g = readGlb(file), J = g.json;
  var images = await decodeImages(g);
  var V = [], F = [], C = [], vkey = {};
  var parts = [];               // { name, lo, hi } in game axes, per mesh node
  function addV(p) {
    var k = p[0].toFixed(4) + ',' + p[1].toFixed(4) + ',' + p[2].toFixed(4);
    if (vkey[k] === undefined) { vkey[k] = V.length; V.push(p); }
    return vkey[k];
  }
  function game(p) { return [-p[0], p[1], -p[2]]; }

  function walk(ni, parent) {
    var n = J.nodes[ni], m = mul(parent, mat4(n));
    if (drop.test(n.name || '')) return;
    if (n.mesh != null) {
      var flip = det3(m) < 0;
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      J.meshes[n.mesh].primitives.forEach(function (pr) {
        if (pr.mode !== undefined && pr.mode !== 4) return;
        var pos = accessor(g, pr.attributes.POSITION).map(function (p) { return game(apply(m, p)); });
        pos.forEach(function (p) { for (var a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; } });
        var uv = pr.attributes.TEXCOORD_0 != null ? accessor(g, pr.attributes.TEXCOORD_0) : null;
        var idx = pr.indices != null ? accessor(g, pr.indices) : pos.map(function (_, k) { return k; });
        var mat = materialOf(g, images, pr.material);
        for (var t = 0; t + 2 < idx.length; t += 3) {
          var ia = idx[t], ib = flip ? idx[t + 2] : idx[t + 1], ic = flip ? idx[t + 1] : idx[t + 2];
          var A = pos[ia], B = pos[ib], Cc = pos[ic];
          if (!mat.textured || !uv) {
            var col = mat.sample(0, 0);
            if (col) { F.push([addV(A), addV(B), addV(Cc)]); C.push(col); }
            continue;
          }
          /* A decal: GRID*GRID smaller triangles, each the colour under its
           * middle. Barycentric steps, so the cells tile the triangle. */
          var ua = uv[ia], ub = uv[ib], uc = uv[ic];
          var P = function (i, j) {
            var a = 1 - (i + j) / grid, b = i / grid, c = j / grid;
            return { p: [A[0] * a + B[0] * b + Cc[0] * c, A[1] * a + B[1] * b + Cc[1] * c, A[2] * a + B[2] * b + Cc[2] * c],
                     u: ua[0] * a + ub[0] * b + uc[0] * c, v: ua[1] * a + ub[1] * b + uc[1] * c };
          };
          for (var i = 0; i < grid; i++) for (var j = 0; j + i < grid; j++) {
            var tris = [[P(i, j), P(i + 1, j), P(i, j + 1)]];
            if (i + j + 1 < grid) tris.push([P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)]);
            tris.forEach(function (tr) {
              var col2 = mat.sample((tr[0].u + tr[1].u + tr[2].u) / 3, (tr[0].v + tr[1].v + tr[2].v) / 3);
              if (!col2) return;
              F.push([addV(tr[0].p), addV(tr[1].p), addV(tr[2].p)]);
              C.push(col2);
            });
          }
        }
      });
      if (isFinite(lo[0])) parts.push({ name: n.name || '', lo: lo, hi: hi });
    }
    (n.children || []).forEach(function (c) { walk(c, m); });
  }
  var I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  J.scenes[J.scene || 0].nodes.forEach(function (n) { walk(n, I); });

  /* Centre on the bounding box. */
  var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  V.forEach(function (p) { for (var a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; } });
  /* The hull's copy is centred where the full model was, so one set of
   * muzzles and one foot serve both. */
  var mid = opts.mid || [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  function r4(x) { return Math.round(x * 10000) / 10000; }
  function place(p) { return [r4(p[0] - mid[0]), r4(p[1] - mid[1]), r4(p[2] - mid[2])]; }

  var pal = [], palIdx = {}, ci = C.map(function (c) {
    if (palIdx[c] === undefined) { palIdx[c] = pal.length; pal.push(c); }
    return palIdx[c];
  });
  var out = {
    v: [].concat.apply([], V.map(place)),
    f: [].concat.apply([], F),
    pal: pal, ci: ci,
    size: [r4(hi[0] - lo[0]), r4(hi[1] - lo[1]), r4(hi[2] - lo[2])]
  };

  /* A gun's barrels and foot. One muzzle per lens/emitter/bore part, at its
   * forward face (+z, the game's forward); parts within 2% of the model's
   * width of one another are the same barrel. */
  var mz = parts.filter(function (p) { return MUZZLE_RE.test(p.name); });
  if (!mz.length) mz = parts.filter(function (p) { return MUZZLE_FALLBACK_RE.test(p.name); });
  /* A pion gun has no barrel: the shot leaves between the prongs of its
   * fork. One muzzle, in the middle of the prong tips, at their front. */
  var tips = parts.filter(function (p) { return /^prong_tip_\d+$/i.test(p.name); });
  if (!mz.length && tips.length) {
    var tl = [Infinity, Infinity, Infinity], th = [-Infinity, -Infinity, -Infinity];
    tips.forEach(function (p) { for (var a = 0; a < 3; a++) { tl[a] = Math.min(tl[a], p.lo[a]); th[a] = Math.max(th[a], p.hi[a]); } });
    mz = [{ name: 'fork', lo: tl, hi: th }];
  }
  if (mz.length) {
    var pts = [];
    mz.forEach(function (p) {
      var q = place([(p.lo[0] + p.hi[0]) / 2, (p.lo[1] + p.hi[1]) / 2, p.hi[2]]);
      var same = pts.filter(function (o) { return Math.abs(o[0] - q[0]) < out.size[0] * 0.02 && Math.abs(o[1] - q[1]) < out.size[1] * 0.02; })[0];
      if (same) { if (q[2] > same[2]) same[2] = q[2]; } else pts.push(q);
    });
    out.muzzles = pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  var foot = parts.filter(function (p) { return FOOT_RE.test(p.name); })[0];
  if (foot) {
    /* Which face of the plate is the one against the hull: the side away
     * from the rest of the gun. */
    var fy = (foot.lo[1] + foot.hi[1]) / 2 < mid[1] ? foot.lo[1] : foot.hi[1];
    out.foot = place([(foot.lo[0] + foot.hi[0]) / 2, fy, (foot.lo[2] + foot.hi[2]) / 2]);
  }
  Object.defineProperty(out, 'mid', { enumerable: false, value: mid });
  return out;
}

async function main() {
  var files = fs.readdirSync(IN).filter(function (f) { return /^(eq|con|good|mod)_.+\.glb$/.test(f); }).sort();
  var models = {}, tris = 0;
  for (var i = 0; i < files.length; i++) {
    var id = files[i].replace(/\.glb$/, '');
    models[id] = await convert(path.join(IN, files[i]));
    tris += models[id].f.length / 3;
    /* A gun is also drawn on hulls, many at once: it gets a lighter copy
     * for that (`hull`), same frame, so the muzzles and foot hold for both. */
    if (models[id].muzzles && models[id].foot) {
      var h = await convert(path.join(IN, files[i]), { hull: true, mid: models[id].mid });
      models[id].hull = { v: h.v, f: h.f, pal: h.pal, ci: h.ci };
      tris += h.f.length / 3;
    }
  }
  var text = '/* GENERATED by tools/item-models.cjs from ref/icons/ (Astra\'s icon models,\n' +
    ' * 2026-11-09). Do not edit by hand: change the art and run the tool.\n' +
    ' * Keyed by file stem (eq_<item id>, con_, good_, mod_). Each model: v flat\n' +
    ' * xyz in the game\'s axes (+z forward, +y up), centred, in the model\'s own\n' +
    ' * units; f flat triangle indices; pal + ci one colour per triangle (\'!\'\n' +
    ' * self-lit); size its extent; a gun adds muzzles (barrel tips) and foot\n' +
    ' * (the face of its base plate). Drawn by render.js. */\n' +
    '(function (global) {\n  \'use strict\';\n  var ItemModels = ' + JSON.stringify(models) + ';\n' +
    '  global.ItemModels = ItemModels;\n' +
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = ItemModels;\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(OUT, text, 'utf8');
  console.log('wrote', path.relative(ROOT, OUT), files.length, 'models,', Math.round(tris), 'triangles,', Math.round(text.length / 1024), 'KB');
  Object.keys(models).filter(function (k) { return /^eq_/.test(k); }).forEach(function (k) {
    var m = models[k];
    if (m.muzzles || m.foot) console.log(k, 'muzzles', JSON.stringify(m.muzzles || []), 'foot', JSON.stringify(m.foot || null), 'size', JSON.stringify(m.size));
  });
}
main().catch(function (e) { console.error(e); process.exit(1); });
