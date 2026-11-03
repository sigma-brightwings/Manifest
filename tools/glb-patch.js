/* glb-patch.js — mend the ship art in ref/glb in place (2026-11-03).
 *
 *     node tools/glb-patch.js [folder]       patch, then: node tools/pack.cjs
 *     node tools/glb-patch.js --check        exit 1 if anything is still unpatched
 *
 * Astra, on the two model problems the hull-walk fix reported and could
 * not mend in code: "can you not fix the models?" This is that. It edits
 * the .glb files themselves, so the art in ref/glb is right whoever reads
 * it (glb2hulls, Blender, her own tools), not a correction applied
 * somewhere downstream of a model that is still wrong.
 *
 * WHAT WAS WRONG, measured with a vertical ray through every half-metre
 * column under her (test/airlock.test.js, tools/hull-seal.js): a closed
 * skin is crossed an even number of times, and an odd column is a place
 * where her skin has an edge that belongs to one face only - you can see
 * into her, or a walker's clearance is reading a sheet with nothing
 * behind it. Every hull had even columns but two:
 *
 *   - the CUTTER (navy-m): four belly blisters (keelBlister1/3,
 *     sensorBlister2L/R) are hemispheres with no lid. Their open rims are
 *     tucked a centimetre up inside her belly, which is why nobody saw
 *     them from outside, but they are holes, and the ray says so.
 *   - the CRAWLER (all three liveries): her frame is built of open sheets
 *     and open-ended tubes - decals, lamp lenses, hazard stripes and pad
 *     markings that are a single face, the downward RCS bells open at the
 *     throat (8 m up her track sides, the 414 columns the hull-walk fix
 *     found), strut and pipe ends, and point-defence domes with no base.
 *     Plus one thing that is not a hole but a missing door: her lowered
 *     lift comes down into a pit closed by her skirt's cross-members, 0.66
 *     m off the ground, with no way through them.
 *
 * WHAT THIS DOES, each operation named for what it is:
 *
 *   cap    - a part that is a shell missing a lid (a dome's base, a strut's
 *            end, a tube's mouth, a nozzle's throat) gets the lid: each
 *            open loop is triangulated in its own plane and filled, in the
 *            part's own material.
 *   sheet  - a part that IS a sheet (a decal, a lens, a stripe, a dish, a
 *            pane) is closed the only way a sheet can be without changing
 *            how it looks: it gets its back face. The renderer turns every
 *            face to the camera and culls nothing (gl.js, "winding-
 *            agnostic"), so a sheet with its back is drawn exactly as the
 *            sheet was; only now every edge has two faces, as a solid's do.
 *   bell   - a nozzle bell: its throat capped (the hole you could see up
 *            into her through), its bell given a back face so the mouth
 *            stays open.
 *   door   - the Crawler's walk-out door (crawlerDoor below).
 *
 * Only the parts named in PATCHES are touched, and of those only the ones
 * that are still open: a closed part is left byte-for-byte alone. So it is
 * re-runnable and idempotent - a second run finds nothing open and changes
 * nothing. Every other mesh, accessor and byte of the file is carried over
 * unchanged (the buffer is re-laid in bufferView order, which is the order
 * the exporter wrote it, so an untouched file round-trips to itself).
 *
 * IF ASTRA RE-EXPORTS a model from her own tools this patch is undone, and
 * that is fine as long as somebody notices: glb2hulls reports every model's
 * open edges and warns on any that leave a column odd, and
 * test/hull-seal.test.js fails on it. Re-run this tool, or fix the export.
 */
'use strict';
var fs = require('fs'), path = require('path');

var args = process.argv.slice(2);
var CHECK = args.indexOf('--check') >= 0;
var DIR = args.filter(function (a) { return a.charAt(0) !== '-'; })[0] || path.join(__dirname, '..', 'ref', 'glb');

/* ---- the patch list --------------------------------------------------------
 * By node name, within the scene's own tree (each Crawler file carries all
 * three liveries' nodes and shows one; only the shown one is patched). The
 * lists are the parts the ray found open, every one of them, measured on
 * 2026-11-03: see the header for what each operation means. */
var CRAWLER = [
  { op: 'sheet', re: /^floodLight\d+_lens$|^bayLights$|^berthLights$|^bayPadRings$|^berthPadMarks$/,
    why: 'single-faced lamps and deck markings' },
  { op: 'sheet', re: /^berthDoor(Port|Starboard)_hazard(Base)?$/, why: 'the belly doors\' hazard stripes, one face each' },
  { op: 'sheet', re: /^engineBandStripes$|^cockpitGlass$|^commsMainDish$/, why: 'stripes, her canopy panes and her dish: sheets' },
  { op: 'bell', re: /^rcsNozzle\d+$/, why: 'RCS bells open at the throat, looking up into her' },
  { op: 'cap', re: /^pointDefense\d+_dome$|^laserTurretDome$/, why: 'domes with no base' },
  { op: 'cap', re: /^pointDefense\d+_guns$|^laserBarrels$/, why: 'barrels open at both ends' },
  { op: 'cap', re: /^leg\d+_frame$|^trussFrame$|^spineFrame$|^fuelRack$/, why: 'open-ended struts' },
  { op: 'cap', re: /^fuelLine\d+$|^fuelMain$|^fuelManifold$|^bayFuelFeed$/, why: 'open-ended pipes' },
  { op: 'cap', re: /^link(Port|Starboard)$|^linkCarrier(Port|Starboard)$/, why: 'open-ended link tubes and their carriers' },
  /* Exactly upright, these open their faces to no vertical ray; rounded to
   * the importer's 1/1000 of her length they lean, and one column over her
   * comms mast went odd. Closed like any other open tube. */
  { op: 'cap', re: /^commsCable(Wrap)?$|^commsElAxle$|^commsLNAArm$/, why: 'open-ended comms mast tubes' },
  { op: 'door', node: 'berthFrame' },
  { op: 'raise', re: /^berthDoor(Port|Starboard)$/, dy: 0.478 }
];
/* The navy family shares one hull design across sizes, and with it the
 * Cutter's lidless belly blisters and open dishes: navy-m is the Cutter,
 * navy-l and navy-s are flown only by others but are the same art, closed
 * the same way (2026-11-03, second pass). */
var NAVY = [
  { op: 'cap', re: /^keelBlister[13]$|^sensorBlister2[LR]$/, why: 'belly blisters with no lid' },
  /* Each dish is two open bowls, dish and liner, whose rims miss each
   * other by a centimetre: a ray down the ring between them crosses one
   * bowl. Sheets, so they get their backs and look as they did. */
  { op: 'sheet', re: /^sensorDish(Liner)?[LR]$|^commDish(Liner)?$/, why: 'radar dishes: open bowls' }
];
var PATCHES = {
  'navy-l.glb': NAVY,
  'navy-m.glb': NAVY,
  'navy-s.glb': NAVY,
  /* The small police hull's blue beacon is a dome with no base (its
   * larger sisters' are closed). */
  'police-s.glb': [{ op: 'cap', re: /^beaconBlue$/, why: 'beacon dome with no base' }],
  'crawler_civilian.glb': CRAWLER,
  'crawler_navy.glb': CRAWLER,
  'crawler_syndicate.glb': CRAWLER
};

/* ---- GLB in and out ------------------------------------------------------ */
function readGlb(file) {
  var buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(file + ': not a GLB');
  var jl = buf.readUInt32LE(12);
  var json = JSON.parse(buf.toString('utf8', 20, 20 + jl));
  var bs = 20 + jl, bl = buf.readUInt32LE(bs);
  var bin = buf.slice(bs + 8, bs + 8 + bl);
  /* Each bufferView's bytes, as their own slice: an edit replaces one
   * view's bytes and the buffer is re-laid from them on the way out. */
  var views = json.bufferViews.map(function (bv) { return bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength); });
  return { file: file, buf: buf, json: json, views: views };
}
function pad4(n) { return (n + 3) & ~3; }
function writeGlb(g) {
  /* Re-laid in bufferView order, each on a 4-byte boundary - the exporter's
   * own layout, so an untouched file comes out byte-identical (checked by
   * roundTrip below before anything is written). */
  var off = 0, parts = [];
  g.json.bufferViews.forEach(function (bv, i) {
    var start = pad4(off);
    if (start > off) parts.push(Buffer.alloc(start - off));
    bv.byteOffset = start;
    bv.byteLength = g.views[i].length;
    parts.push(g.views[i]);
    off = start + g.views[i].length;
  });
  var tail = pad4(off) - off;
  if (tail) parts.push(Buffer.alloc(tail));
  var bin = Buffer.concat(parts);
  g.json.buffers[0].byteLength = bin.length;
  var js = Buffer.from(JSON.stringify(g.json), 'utf8');
  var jpad = pad4(js.length) - js.length;
  if (jpad) js = Buffer.concat([js, Buffer.alloc(jpad, 0x20)]);
  var head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.write('JSON', 4, 'ascii');
  bh.writeUInt32LE(bin.length, 0); bh.write('BIN\0', 4, 'binary');
  return Buffer.concat([head, jh, js, bh, bin]);
}

/* ---- accessors ----------------------------------------------------------- */
var COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
var CT = { 5126: [4, 'FloatLE'], 5125: [4, 'UInt32LE'], 5123: [2, 'UInt16LE'], 5121: [1, 'UInt8'] };
/* Only accessors that own their bufferView outright are edited: replacing
 * a shared view's bytes would change some other accessor too. */
function ownsView(g, ai) {
  var bv = g.json.accessors[ai].bufferView, n = 0;
  g.json.accessors.forEach(function (a) { if (a.bufferView === bv) n++; });
  return n === 1;
}
function readAcc(g, ai) {
  var a = g.json.accessors[ai], bv = g.json.bufferViews[a.bufferView], v = g.views[a.bufferView];
  var cc = COMP[a.type], ct = CT[a.componentType], st = bv.byteStride || cc * ct[0], out = [];
  for (var i = 0; i < a.count; i++) {
    var r = [];
    for (var c = 0; c < cc; c++) r.push(v['read' + ct[1]]((a.byteOffset || 0) + i * st + c * ct[0]));
    out.push(cc === 1 ? r[0] : r);
  }
  return out;
}
function writeAcc(g, ai, data) {
  var a = g.json.accessors[ai], bv = g.json.bufferViews[a.bufferView];
  if (!ownsView(g, ai)) throw new Error('accessor ' + ai + ' shares its bufferView');
  var cc = COMP[a.type];
  /* Indices that outgrow their type are widened, never wrapped. */
  if (cc === 1 && a.componentType !== 5126) {
    var mx = data.reduce(function (m, x) { return Math.max(m, x); }, 0);
    if (mx > 65535) a.componentType = 5125; else if (mx > 255 && a.componentType === 5121) a.componentType = 5123;
  }
  var ct = CT[a.componentType], st = cc * ct[0];
  var b = Buffer.alloc(data.length * st);
  data.forEach(function (r, i) {
    for (var c = 0; c < cc; c++) b['write' + ct[1]](cc === 1 ? r : r[c], i * st + c * ct[0]);
  });
  delete bv.byteStride;
  if (bv.target === 34962 && cc > 1) bv.byteStride = st;   // vertex views keep a declared stride, as exported
  a.byteOffset = 0; a.count = data.length;
  g.views[a.bufferView] = b;
  if (a.min || a.max) {
    /* Bounds are float32 values: read back through Float32 so they agree
     * with the stored data to the bit, as glTF requires. */
    var f32 = function (x) { return a.componentType === 5126 ? Math.fround(x) : x; };
    var mn = [], mxx = [];
    for (var c2 = 0; c2 < cc; c2++) { mn.push(Infinity); mxx.push(-Infinity); }
    data.forEach(function (r) { for (var c3 = 0; c3 < cc; c3++) { var x = f32(cc === 1 ? r : r[c3]); if (x < mn[c3]) mn[c3] = x; if (x > mxx[c3]) mxx[c3] = x; } });
    a.min = mn; a.max = mxx;
  }
}
/* A new accessor with its own bufferView, appended. */
function addAcc(g, type, componentType, data, target) {
  var bvI = g.json.bufferViews.length;
  g.json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: 0, target: target });
  g.views.push(Buffer.alloc(0));
  var ai = g.json.accessors.length;
  var acc = { bufferView: bvI, componentType: componentType, count: 0, type: type };
  if (type === 'VEC3' && target === 34962) { acc.min = [0, 0, 0]; acc.max = [0, 0, 0]; }
  g.json.accessors.push(acc);
  writeAcc(g, ai, data);
  return ai;
}

/* ---- the scene's nodes, with their world matrices -------------------------- */
function matMul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function matTRS(n) {
  if (n.matrix) return n.matrix.slice();
  var t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  var x = q[0], y = q[1], z = q[2], w = q[3];
  return [(1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
          (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
          (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function apply(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function sceneNodes(g) {
  var out = [], parent = {};
  (function walk(list, pm, par) {
    list.forEach(function (ni) {
      var n = g.json.nodes[ni], w = matMul(pm, matTRS(n));
      parent[ni] = par;
      out.push({ i: ni, node: n, world: w, parent: par });
      walk(n.children || [], w, ni);
    });
  })(g.json.scenes[g.json.scene || 0].nodes, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], undefined);
  return out;
}

/* ---- a primitive, as vertices with every attribute, and triangles ---------- */
function loadPrim(g, prim) {
  var names = Object.keys(prim.attributes);
  names.forEach(function (k) { if (!ownsView(g, prim.attributes[k])) throw new Error(k + ' shares a view'); });
  var attr = {};
  names.forEach(function (k) { attr[k] = readAcc(g, prim.attributes[k]); });
  var n = attr.POSITION.length;
  var idx = prim.indices !== undefined ? readAcc(g, prim.indices) : null;
  var tris = [];
  for (var t = 0; t + 2 < (idx ? idx.length : n); t += 3) tris.push(idx ? [idx[t], idx[t + 1], idx[t + 2]] : [t, t + 1, t + 2]);
  return { names: names, attr: attr, tris: tris, indexed: !!idx };
}
function savePrim(g, prim, P) {
  if (P.indexed) {
    P.names.forEach(function (k) { writeAcc(g, prim.attributes[k], P.attr[k]); });
    var flat = [];
    P.tris.forEach(function (t) { flat.push(t[0], t[1], t[2]); });
    writeAcc(g, prim.indices, flat);
    return;
  }
  /* Unindexed, as exported: every triangle its own three vertices. */
  var out = {};
  P.names.forEach(function (k) { out[k] = []; });
  P.tris.forEach(function (t) { t.forEach(function (vi) { P.names.forEach(function (k) { out[k].push(P.attr[k][vi]); }); }); });
  P.names.forEach(function (k) { writeAcc(g, prim.attributes[k], out[k]); });
}
/* A vertex copied from `src` with a new position and normal. */
function addVert(P, src, pos, nrm) {
  P.names.forEach(function (k) {
    var v = P.attr[k][src];
    P.attr[k].push(k === 'POSITION' ? pos.slice() : k === 'NORMAL' && nrm ? nrm.slice() : Array.isArray(v) ? v.slice() : v);
  });
  return P.attr.POSITION.length - 1;
}

/* ---- open edges ------------------------------------------------------------
 * Welded by position (a hundredth of a millimetre at a metre scale; these
 * files are authored in metres), because a flat-shaded export gives every
 * face its own corners and "two faces share this edge" is a question
 * about where they are, not which index they used. */
function weldKey(p) { return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5); }
function openEdges(P) {
  var pos = P.attr.POSITION, key = pos.map(weldKey), E = {};
  P.tris.forEach(function (t) {
    for (var e = 0; e < 3; e++) {
      var a = t[e], b = t[(e + 1) % 3];
      if (key[a] === key[b]) continue;
      var k = key[a] < key[b] ? key[a] + '|' + key[b] : key[b] + '|' + key[a];
      var r = E[k] || (E[k] = { n: 0, a: a, b: b });
      r.n++;
    }
  });
  return Object.keys(E).map(function (k) { return E[k]; }).filter(function (r) { return r.n % 2; });
}
/* Open edges chained into loops of vertex indices (one representative per
 * welded corner). */
function loopsOf(P) {
  var pos = P.attr.POSITION, key = pos.map(weldKey), open = openEdges(P);
  var adj = {}, rep = {};
  open.forEach(function (e) {
    var ka = key[e.a], kb = key[e.b];
    rep[ka] = rep[ka] === undefined ? e.a : rep[ka]; rep[kb] = rep[kb] === undefined ? e.b : rep[kb];
    (adj[ka] = adj[ka] || []).push(kb); (adj[kb] = adj[kb] || []).push(ka);
  });
  var used = {}, loops = [], ok = true;
  open.forEach(function (e) {
    var ka = key[e.a], kb = key[e.b];
    if (used[ka + '|' + kb]) return;
    used[ka + '|' + kb] = used[kb + '|' + ka] = 1;
    var loop = [ka], prev = ka, cur = kb, guard = 0;
    while (cur !== ka && guard++ < 100000) {
      loop.push(cur);
      var nx = adj[cur].filter(function (q) { return q !== prev && !used[cur + '|' + q]; });
      if (!nx.length) { ok = false; break; }
      used[cur + '|' + nx[0]] = used[nx[0] + '|' + cur] = 1;
      prev = cur; cur = nx[0];
    }
    loops.push(loop.map(function (k) { return rep[k]; }));
  });
  return { loops: loops, ok: ok, open: open.length };
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/* One loop filled in its own plane: ear-clipped, so a lid fits a loop
 * that is not convex. Returns triangles (vertex-index triples into P, new
 * vertices added with the lid's normal), or null where the loop is not
 * flat enough to be one face (then the caller falls back to a back face). */
function capLoop(P, loop, centroid) {
  var pos = P.attr.POSITION, pts = loop.map(function (i) { return pos[i]; });
  var c = [0, 0, 0];
  pts.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
  c = [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
  var nw = [0, 0, 0];
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i], q = pts[(i + 1) % pts.length];
    nw[0] += (p[1] - q[1]) * (p[2] + q[2]); nw[1] += (p[2] - q[2]) * (p[0] + q[0]); nw[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  var nl = Math.hypot(nw[0], nw[1], nw[2]);
  if (!(nl > 0)) return null;
  var n = [nw[0] / nl, nw[1] / nl, nw[2] / nl];
  var size = 0;
  pts.forEach(function (p) { size = Math.max(size, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])); });
  var flat = pts.every(function (p) { return Math.abs(dot(sub(p, c), n)) <= Math.max(1e-4, size * 1e-3); });
  if (!flat) return null;
  /* The lid faces away from the part it closes. */
  var out = dot(sub(c, centroid), n) >= 0 ? n : [-n[0], -n[1], -n[2]];
  var u = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), w = cross(n, u);
  var P2 = pts.map(function (p) { var d = sub(p, c); return [dot(d, u), dot(d, w)]; });
  var ids = loop.map(function (vi, k) { return addVert(P, vi, pts[k], out); });
  /* Ear clipping on the loop's own winding (CCW about n). */
  var poly = P2.map(function (_, k) { return k; }), tris = [];
  var area2 = function (a, b, d) { return (P2[b][0] - P2[a][0]) * (P2[d][1] - P2[a][1]) - (P2[b][1] - P2[a][1]) * (P2[d][0] - P2[a][0]); };
  var inside = function (p, a, b, d) {
    return area2(a, b, p) >= 0 && area2(b, d, p) >= 0 && area2(d, a, p) >= 0;
  };
  var guard = 0;
  while (poly.length > 3 && guard++ < 100000) {
    var cut = false;
    for (var k = 0; k < poly.length; k++) {
      var a = poly[(k + poly.length - 1) % poly.length], b = poly[k], d = poly[(k + 1) % poly.length];
      if (area2(a, b, d) <= 1e-12) continue;
      var ear = true;
      for (var m = 0; m < poly.length && ear; m++) {
        var pm = poly[m];
        if (pm === a || pm === b || pm === d) continue;
        if (inside(pm, a, b, d)) ear = false;
      }
      if (!ear) continue;
      tris.push([a, b, d]); poly.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (poly.length === 3) tris.push(poly.slice());
  else if (poly.length > 3) return null;
  /* Wound so its geometric normal is the lid's: kept for tools that do
   * cull, though this game does not. */
  return tris.map(function (t) {
    var tri = [ids[t[0]], ids[t[1]], ids[t[2]]];
    var gn = cross(sub(pos[tri[1]], pos[tri[0]]), sub(pos[tri[2]], pos[tri[0]]));
    return dot(gn, out) >= 0 ? tri : [tri[0], tri[2], tri[1]];
  });
}
function centroidOf(P) {
  var c = [0, 0, 0], pos = P.attr.POSITION;
  pos.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
  return [c[0] / pos.length, c[1] / pos.length, c[2] / pos.length];
}
/* Every triangle again, the other way round, with its normals turned. */
function backFaces(P, which) {
  var add = [];
  (which || P.tris).forEach(function (t) {
    var ids = t.map(function (vi) {
      var nv = P.attr.NORMAL ? P.attr.NORMAL[vi] : null;
      return addVert(P, vi, P.attr.POSITION[vi], nv ? [-nv[0], -nv[1], -nv[2]] : null);
    });
    add.push([ids[0], ids[2], ids[1]]);
  });
  P.tris = P.tris.concat(add);
}
/* Connected pieces of a primitive (by welded corner), as triangle lists. */
function pieces(P) {
  var key = P.attr.POSITION.map(weldKey), par = {};
  var find = function (k) { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
  key.forEach(function (k) { par[k] = k; });
  P.tris.forEach(function (t) { var a = find(key[t[0]]); [1, 2].forEach(function (e) { var b = find(key[t[e]]); if (a !== b) par[b] = a; }); });
  var by = {};
  P.tris.forEach(function (t) { var r = find(key[t[0]]); (by[r] = by[r] || []).push(t); });
  return Object.keys(by).map(function (k) { return by[k]; });
}

function closePrim(op, P) {
  var before = P.tris.length, notes = [];
  if (op === 'sheet') { backFaces(P); return { added: P.tris.length - before, notes: notes }; }
  if (op === 'cap' || op === 'bell') {
    var L = loopsOf(P), cen = centroidOf(P), lids = [], fall = 0;
    if (!L.ok) throw new Error('open edges do not form loops');
    var loops = L.loops;
    if (op === 'bell') {
      /* The throat: each bell's smaller loop. */
      var key = P.attr.POSITION.map(weldKey), keep = [];
      pieces(P).forEach(function (pc) {
        var ks = {};
        pc.forEach(function (t) { t.forEach(function (vi) { ks[key[vi]] = 1; }); });
        var mine = loops.filter(function (lp) { return ks[key[lp[0]]]; });
        var area = function (lp) {
          var s = [0, 0, 0], pos = P.attr.POSITION;
          for (var i = 0; i < lp.length; i++) { var cr = cross(pos[lp[i]], pos[lp[(i + 1) % lp.length]]); s[0] += cr[0]; s[1] += cr[1]; s[2] += cr[2]; }
          return Math.hypot(s[0], s[1], s[2]);
        };
        mine.sort(function (a, b) { return area(a) - area(b); });
        if (mine.length) keep.push(mine[0]);
      });
      loops = keep;
    }
    var orig = P.tris.slice();
    loops.forEach(function (lp) {
      var t = capLoop(P, lp, cen);
      if (t) lids = lids.concat(t); else fall++;
    });
    P.tris = P.tris.concat(lids);
    /* The bell and its throat lid both get their backs: the lid alone on a
     * doubled bell would leave the throat's edges with three faces. */
    if (op === 'bell') backFaces(P);
    /* A loop that is not one flat face cannot be lidded: the part gets its
     * back face instead, so it is closed either way. Said, not hidden. */
    if (fall && op === 'cap') { backFaces(P, orig); notes.push(fall + ' loop(s) not flat: back face instead'); }
    return { added: P.tris.length - before, notes: notes };
  }
  throw new Error('unknown op ' + op);
}

/* ---- the Crawler's walk-out door ------------------------------------------------
 * Astra's Crawler lowers her lift between her tracks into a pit under her
 * closed belly doors, 1.80 m to their undersides at her fitted 164 m, and
 * the pit is boxed in by her skirt (berthFrame): two side rails and a
 * cross-member fore and aft, 0.65-1.68 m off the ground, with a lintel
 * along the top of each cross-member's outer edge. No door. The hull-walk
 * fix let you duck under the fore member along a 0.6 m "lift lane" as a
 * stopgap; this is the door that replaces it.
 *
 * Cut through the FORE cross-member (the lift is 10 m from it and 53 m
 * from the aft one, which is why the lane went that way too), centred on
 * the lift: 2.30 m wide and 2.13 m clear from the ground (the lintel over
 * it stays, cut to a header). Framed on the outer face in her hazard
 * colour, and a door leaf in her belly doors' colour stands open, slid
 * aside on the same face: the skirt is structure in this model's style,
 * so the opening in it is a doorway with a door, not a gap.
 *
 * Every new corner is on the importer's own lattice (glb2hulls rounds a
 * hull to 1/1000 of her length, 0.478 m of this model, 0.164 m of her
 * as flown), so the door is the size it is meant to be after the import
 * and no face of it collapses or slivers: 14 x 13 cells, a frame one cell
 * thick. Everything stays inside her old bounds, so the import's centre
 * and scale - and every number tuned against them - are untouched.
 *
 * NOT on the inner face, deliberately: render.js CR_DOOR cuts her belly
 * leaves out of the founded-station mesh by face centroid (y -96.9..-94.3,
 * z up to 137.2 in these units), and an inner frame's header would land in
 * that box and slide away with the doors. The outer face is at z 143. */
var DOOR_W = 14, DOOR_H = 13, FRAME = 1;          // in lattice cells
function crawlerDoor(g, nodes, log) {
  var J = g.json, NAME = 'berthWalkDoor';
  var bf = nodes.filter(function (n) { return n.node.name === 'berthFrame'; })[0];
  if (!bf) throw new Error('no berthFrame');
  var berth = nodes.filter(function (n) { return n.i === bf.parent; })[0];
  if (nodes.some(function (n) { return n.node.name === NAME + 'Frame'; })) return false;   // already has its door
  /* The importer's frame: centre and scale over everything it imports
   * (glb2hulls measures over the exterior and the gear; this model has
   * neither interior nor gear). */
  var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  nodes.forEach(function (n) {
    if (n.node.mesh === undefined) return;
    J.meshes[n.node.mesh].primitives.forEach(function (pr) {
      readAcc(g, pr.attributes.POSITION).forEach(function (p) {
        var w = apply(n.world, p);
        for (var q = 0; q < 3; q++) { if (w[q] < lo[q]) lo[q] = w[q]; if (w[q] > hi[q]) hi[q] = w[q]; }
      });
    });
  });
  var mid = [0, 1, 2].map(function (q) { return (lo[q] + hi[q]) / 2; });
  var cell = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 1000;
  var snap = function (q, x) { return Math.round((x - mid[q]) / cell); };
  var at = function (q, k) { return mid[q] + k * cell; };
  /* berthFrame's boxes, in world space (her node chain only translates). */
  var w = bf.world;
  if (Math.abs(w[0] - 1) + Math.abs(w[5] - 1) + Math.abs(w[10] - 1) + Math.abs(w[1]) + Math.abs(w[2]) + Math.abs(w[4]) + Math.abs(w[6]) + Math.abs(w[8]) + Math.abs(w[9]) > 1e-9)
    throw new Error('berthFrame is rotated or scaled: the door assumes a translation');
  var T = [w[12], w[13], w[14]], prim = J.meshes[bf.node.mesh].primitives[0];
  var P = loadPrim(g, prim);
  /* Her boxes touch corner to corner (a rail ends where a member starts),
   * so welding would run them together: the exporter writes each box as
   * twelve triangles in a row, and each run of twelve is checked to be one
   * closed box with eight corners before it is trusted. */
  var runs = [];
  for (var r0 = 0; r0 < P.tris.length; r0 += 12) {
    var run = P.tris.slice(r0, r0 + 12), corners = {};
    run.forEach(function (t) { t.forEach(function (vi) { corners[weldKey(P.attr.POSITION[vi])] = 1; }); });
    var sub0 = { attr: { POSITION: P.attr.POSITION }, tris: run };
    if (run.length !== 12 || Object.keys(corners).length !== 8 || openEdges(sub0).length) throw new Error('berthFrame is not twelve-triangle boxes');
    runs.push(run);
  }
  var boxes = runs.map(function (tris) {
    var b = { tris: tris, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    tris.forEach(function (t) { t.forEach(function (vi) { var p = P.attr.POSITION[vi]; for (var q = 0; q < 3; q++) { b.lo[q] = Math.min(b.lo[q], p[q] + T[q]); b.hi[q] = Math.max(b.hi[q], p[q] + T[q]); } }); });
    return b;
  });
  /* The fore cross-member: full beam, lowest, furthest forward; its lintel
   * sits on it, full beam, at its outer edge. */
  var beam = function (b) { return b.hi[0] - b.lo[0] > 0.9 * (hi[0] - lo[0]) * 0.5; };
  var fore = boxes.filter(beam).sort(function (a, b) { return a.lo[1] - b.lo[1] || b.hi[2] - a.hi[2]; })
    .filter(function (b, _, all) { return Math.abs(b.lo[1] - all[0].lo[1]) < 1e-3; })
    .sort(function (a, b) { return b.hi[2] - a.hi[2]; })[0];
  var lintel = boxes.filter(function (b) {
    return beam(b) && b !== fore && Math.abs(b.lo[1] - fore.hi[1]) < 1e-3 && b.lo[2] >= fore.lo[2] - 1e-3 && b.hi[2] <= fore.hi[2] + 1e-3;
  })[0];
  if (!fore || !lintel) throw new Error('berthFrame: no fore cross-member and lintel');
  /* The lift's centreline, from the lift model the game builds: x = -2.01 m
   * at 164 m = -5.86 here. Asked of the art, not typed in, would be nicer;
   * the lift is not in the art (shipdeck.js plans it), so it is the plan's
   * number, written down once, here. */
  var LIFT_X = -5.858;
  var kx0 = Math.round(LIFT_X / cell - DOOR_W / 2) , kx1 = kx0 + DOOR_W;
  /* The ground: the lowest thing she has (her nav light under this very
   * member). The opening and the frame stand on it; nothing goes lower. */
  var ky0 = snap(1, lo[1]), yG = lo[1], kyH = ky0 + DOOR_H, yH = at(1, kyH);
  var x0 = at(0, kx0), x1 = at(0, kx1);
  if (!(yH > lintel.lo[1] && yH < lintel.hi[1])) throw new Error('door head ' + yH + ' not inside the lintel');
  /* Faces of an axis box, as triangles of [x,y,z] in world space, each
   * quad wound outward. */
  function boxTris(b0, b1, skip) {
    var X = [b0[0], b1[0]], Y = [b0[1], b1[1]], Z = [b0[2], b1[2]], out = [];
    var quad = function (a, b, c, d) { out.push([a, b, c], [a, c, d]); };
    var v = function (i, j, k) { return [X[i], Y[j], Z[k]]; };
    if (!(skip && skip.nx)) quad(v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0));
    if (!(skip && skip.px)) quad(v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1));
    quad(v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1));
    quad(v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0));
    quad(v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0));
    quad(v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1));
    return out;
  }
  /* The member and the lintel, re-made as boxes either side of the
   * opening, and the lintel's middle as the header over it. */
  var drop = {};
  fore.tris.concat(lintel.tris).forEach(function (t) { drop[t.join(',')] = 1; });
  var srcV = fore.tris[0][0];
  var pieceTris = []
    .concat(boxTris([fore.lo[0], fore.lo[1], fore.lo[2]], [x0, fore.hi[1], fore.hi[2]]))
    .concat(boxTris([x1, fore.lo[1], fore.lo[2]], [fore.hi[0], fore.hi[1], fore.hi[2]]))
    .concat(boxTris([lintel.lo[0], lintel.lo[1], lintel.lo[2]], [x0, lintel.hi[1], lintel.hi[2]]))
    .concat(boxTris([x1, lintel.lo[1], lintel.lo[2]], [lintel.hi[0], lintel.hi[1], lintel.hi[2]]))
    .concat(boxTris([x0, yH, lintel.lo[2]], [x1, lintel.hi[1], lintel.hi[2]]));
  P.tris = P.tris.filter(function (t) { return !drop[t.join(',')]; });
  var addTri = function (Pm, src, tri) {
    var n = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
    Pm.tris.push(tri.map(function (p) { return addVert(Pm, src, [p[0] - T[0], p[1] - T[1], p[2] - T[2]], n); }));
  };
  pieceTris.forEach(function (tri) { addTri(P, srcV, tri); });
  savePrim(g, prim, P);
  /* The frame and the leaf: new parts, new nodes beside berthFrame, in the
   * model's own materials - her hazard colour (the belly doors' stripes)
   * for the frame, her belly doors' own for the leaf. */
  var matOf = function (name) {
    var n = nodes.filter(function (q) { return q.node.name === name; })[0];
    return n ? J.meshes[n.node.mesh].primitives[0].material : prim.material;
  };
  var zF = fore.hi[2], kz = snap(2, zF), zA = at(2, kz), zB = at(2, kz + FRAME), zC = at(2, kz + 2 * FRAME);
  /* The outer face as the importer will round it: the frame stands on that
   * plane, so the two meet after the import instead of overlapping. */
  if (zA < zF - cell) throw new Error('outer face off the lattice by more than a cell');
  var c = cell * FRAME;
  var frame = []
    .concat(boxTris([x0 - c, yG, zA], [x0, yH + c, zB]))                 // jamb, outboard
    .concat(boxTris([x1, yG, zA], [x1 + c, yH + c, zB]))                 // jamb, inboard
    .concat(boxTris([x0 - c - DOOR_W * cell, yH, zA], [x1 + c, yH + c, zB]));   // header and the leaf's track
  /* The leaf, open: slid outboard along its track, clear of the opening,
   * a cell proud of the frame. */
  var leaf = boxTris([x0 - c - DOOR_W * cell, yG, zB], [x0 - c, yH, zC]);
  var mkMesh = function (name, tris, mat) {
    var pos = [], nrm = [];
    tris.forEach(function (tri) {
      var n = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
      tri.forEach(function (p) { pos.push([p[0] - T[0], p[1] - T[1], p[2] - T[2]]); nrm.push(n); });
    });
    var pa = addAcc(g, 'VEC3', 5126, pos, 34962), na = addAcc(g, 'VEC3', 5126, nrm, 34962);
    J.meshes.push({ name: name, primitives: [{ mode: 4, attributes: { POSITION: pa, NORMAL: na }, material: mat }],
                    extras: { manifestPatch: '2026-11-03 walk-out door, tools/glb-patch.js' } });
    J.nodes.push({ name: name, mesh: J.meshes.length - 1 });
    berth.node.children.push(J.nodes.length - 1);
  };
  mkMesh(NAME + 'Frame', frame, matOf('berthDoorPort_hazard'));
  mkMesh(NAME + 'Leaf', leaf, matOf('berthDoorPort_leaf'));
  J.meshes[bf.node.mesh].extras = Object.assign({}, J.meshes[bf.node.mesh].extras, { manifestPatch: '2026-11-03 walk-out door cut, tools/glb-patch.js' });
  log.push('door: fore cross-member cut ' + (x1 - x0).toFixed(2) + ' x ' + (yH - yG).toFixed(2) + ' (' + DOOR_W + 'x' + DOOR_H +
           ' cells of ' + cell.toFixed(3) + '), frame ' + frame.length + ' tris, leaf ' + leaf.length + ', member/lintel ' +
           (fore.tris.length + lintel.tris.length) + ' tris -> ' + pieceTris.length);
  return true;
}

/* ---- one file ---------------------------------------------------------------- */
function patchFile(file, spec) {
  var g = readGlb(file);
  /* The layout this tool writes is the exporter's: prove it on this very
   * file before trusting it with an edit. */
  if (!writeGlb(readGlb(file)).equals(g.buf)) throw new Error(path.basename(file) + ': does not round-trip unchanged; refusing to edit it');
  var nodes = sceneNodes(g), log = [], changed = false, open = 0;
  spec.forEach(function (s) {
    if (s.op === 'door') {
      if (CHECK) { if (!nodes.some(function (n) { return n.node.name === 'berthWalkDoorFrame'; })) { open++; log.push('door: missing'); } return; }
      if (crawlerDoor(g, nodes, log)) changed = true;
      return;
    }
    if (s.op === 'raise') {
      /* HER BELLY DOORS, RAISED (2026-11-03, second pass). Closed, their
       * undersides were 1.80 m off the ground at her flown 164 m, and
       * that is the pit her lift comes down into: 3 cm under a standing
       * head (render.js STAND_CLEAR 1.83), so you crouched from the lift
       * to her walk-out door. Each door group (leaf and both hazard
       * layers) is lifted EXACTLY ONE IMPORT CELL, 0.478 here (glb2hulls
       * rounds her to 1/1000 of her 478-unit length; 0.164 m flown), so
       * the pit is 1.97 m after the import. One cell and not "about 0.4":
       * a lift that is a whole cell moves every rounded corner of the
       * doors by exactly one cell, so the leaves import as the same faces
       * one cell higher - which is what lets render.js CR_DOOR, which
       * finds them for the founded station by where their faces lie, move
       * by the same cell and find exactly what it found before. A 0.4 lift
       * rounded some corners up a cell and some not at all, and the box
       * lost faces. Their tops go 8 cm up into her hangar floor's slab
       * (-94.0..-93.0), hidden, and import onto the floor's underside
       * exactly as they did before the lift. Moved by its node's
       * translation, so the geometry is untouched and the move is one
       * number Blender shows. */
      nodes.forEach(function (n) {
        if (!s.re.test(n.node.name || '')) return;
        var ex = n.node.extras || {};
        if (ex.manifestRaise === s.dy) return;            // raised already
        if (CHECK) { open++; log.push(n.node.name + ' not raised'); return; }
        if (n.node.matrix || n.node.rotation || n.node.scale) throw new Error(n.node.name + ': raise expects a plain node');
        /* Relative to wherever an earlier run of this left it, so changing
         * dy here re-raises rather than stacking. */
        var t = n.node.translation || [0, 0, 0];
        n.node.translation = [t[0], t[1] - (ex.manifestRaise || 0) + s.dy, t[2]];
        n.node.extras = Object.assign({}, ex, { manifestRaise: s.dy, manifestPatch: '2026-11-03 belly door raised ' + s.dy + ', tools/glb-patch.js' });
        changed = true;
        log.push('raise ' + n.node.name + ' ' + s.dy + ' (her pit\'s headroom)');
      });
      return;
    }
    var hit = 0, faces = 0, edges = 0;
    nodes.forEach(function (n) {
      if (n.node.mesh === undefined || !s.re.test(n.node.name || '')) return;
      var mesh = g.json.meshes[n.node.mesh];
      mesh.primitives.forEach(function (prim) {
        if (prim.mode !== undefined && prim.mode !== 4) return;
        var P = loadPrim(g, prim), oe = openEdges(P).length;
        if (!oe) return;                       // closed already: left exactly as it is
        if (CHECK) { open++; return; }
        var r = closePrim(s.op, P);
        var left = openEdges(P).length;
        if (left) throw new Error(n.node.name + ': ' + left + ' edge(s) still open after ' + s.op);
        savePrim(g, prim, P);
        mesh.extras = Object.assign({}, mesh.extras, { manifestPatch: '2026-11-03 ' + s.op + ', tools/glb-patch.js' });
        hit++; faces += r.added; edges += oe; changed = true;
        r.notes.forEach(function (t) { log.push('  ' + n.node.name + ': ' + t); });
      });
    });
    if (hit) log.push(s.op + ' ' + hit + ' part(s), ' + edges + ' open edges closed with ' + faces + ' faces: ' + s.why);
  });
  return { g: g, changed: changed, log: log, open: open };
}

var files = Object.keys(PATCHES), bad = 0;
files.forEach(function (f) {
  var file = path.join(DIR, f);
  if (!fs.existsSync(file)) { console.log(f + ': not here (run node tools/pack.cjs unpack)'); bad++; return; }
  var r = patchFile(file, PATCHES[f]);
  if (CHECK) {
    console.log(f + ': ' + (r.open ? r.open + ' part(s) still open' : 'closed') + (r.log.length ? '  ' + r.log.join('; ') : ''));
    if (r.open) bad++;
    return;
  }
  if (!r.changed) { console.log(f + ': nothing open, unchanged'); return; }
  var out = writeGlb(r.g);
  fs.writeFileSync(file, out);
  console.log(f + ': patched (' + r.g.buf.length + ' -> ' + out.length + ' bytes)');
  r.log.forEach(function (l) { console.log('  ' + l); });
});
if (bad) process.exit(1);
if (!CHECK) console.log('\nnow: node tools/pack.cjs (store the .gz) and node tools/glb2hulls.js ref/glb (regenerate src/hulls.js)');
