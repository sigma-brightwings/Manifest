/* chop-ships.cjs - cut the factory ships into modules along Astra's cuts.
 *
 *   node tools/chop-ships.cjs [ship ...]        (default: all 54 in ref/glb)
 *
 * Reads tools/ship-cuts.json (per family, per size: length cuts z from the
 * nose, deck cuts y from the keel, mirrored side cuts x from the centreline,
 * all fractions of the hull) and cuts each ship into cells of that grid.
 *
 *  - Wings come off whole, as a mirrored pair (one piece each side).
 *  - A part shorter than 40% of the hull's length (and smaller than most of
 *    its height and width) goes WHOLE into the cell its centre is in, so a
 *    nacelle, a gun or a lamp is never sliced.
 *  - Longer parts (hull shells, keels, decks) are SLICED at the planes.
 *  - Empty cells are dropped.
 *  - Every pair of neighbouring pieces records the JOINT between them: the
 *    plane, and the overlap of the two pieces' outlines on it. Those are the
 *    attachment faces; standard sockets per size class come next.
 *
 * Writes _ship-modules/<ship>.json (pieces with their triangles, in the
 * ship's own model units, coloured from the model's materials) and
 * _ship-modules/index.json, read by _ship-modules/view.html.
 * Experimental (ship-modules branch); nothing in the game reads it yet.
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var DIR = path.join(ROOT, 'ref', 'glb');
var OUT = path.join(ROOT, '_ship-modules');
var TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'ship-cuts.json'), 'utf8'));
var WING = /wing|stabili|aileron|winglet|strake|canard|fin[LR]?$|fin[A-Z]/i;

function readGlb(file) {
  var buf = fs.readFileSync(file), n = buf.readUInt32LE(12);
  var j = JSON.parse(buf.toString('utf8', 20, 20 + n));
  var off = 20 + n; j._bin = buf.subarray(off + 8, off + 8 + buf.readUInt32LE(off));
  return j;
}
function mat(n) {
  if (n.matrix) return n.matrix.slice();
  var t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
  var x = r[0], y = r[1], z = r[2], w = r[3];
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
          2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
          2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function mul(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var v = 0; for (var k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = v; } return o; }
function xf(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
function accessor(j, i) {
  var a = j.accessors[i], bv = j.bufferViews[a.bufferView];
  var size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  var bytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  var stride = bv.byteStride || size * bytes, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = [], b = j._bin;
  for (var k = 0; k < a.count; k++) for (var c = 0; c < size; c++) {
    var o = base + k * stride + c * bytes;
    out.push(a.componentType === 5126 ? b.readFloatLE(o) : a.componentType === 5125 ? b.readUInt32LE(o)
           : a.componentType === 5123 ? b.readUInt16LE(o) : b.readUInt8(o));
  }
  return out;
}
/* Linear base colour to display sRGB hex. */
function hexOf(m) {
  var f = (m && m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorFactor) || [0.5, 0.5, 0.5, 1];
  return '#' + [0, 1, 2].map(function (i) {
    var v = Math.round(255 * Math.pow(Math.max(0, Math.min(1, f[i])), 1 / 2.2));
    return (v < 16 ? '0' : '') + v.toString(16);
  }).join('');
}
function nameOf(j, n) { return n.name || (n.children || []).map(function (c) { return j.nodes[c].name || ''; }).join(' '); }

/* Top-level parts: triangles (with colour index) and bounds. */
function load(file) {
  var j = readGlb(file), root = j.nodes[(j.scenes[j.scene || 0].nodes || [0])[0]];
  var colours = (j.materials || []).map(hexOf);
  var parts = (root.children || []).map(function (i) {
    var n = j.nodes[i], tris = [];
    (function walk(idx, M) {
      var nd = j.nodes[idx], m = mul(M, mat(nd));
      if (nd.mesh !== undefined) j.meshes[nd.mesh].primitives.forEach(function (p) {
        if (p.mode !== undefined && p.mode !== 4) return;
        var pos = accessor(j, p.attributes.POSITION), ix = p.indices !== undefined ? accessor(j, p.indices) : null;
        var cnt = ix ? ix.length : pos.length / 3, col = p.material !== undefined ? p.material : -1;
        for (var k = 0; k + 2 < cnt; k += 3) {
          var t = [];
          for (var v = 0; v < 3; v++) { var q = ix ? ix[k + v] : k + v; t.push(xf(m, pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2])); }
          t.col = col; tris.push(t);
        }
      });
      (nd.children || []).forEach(function (c) { walk(c, m); });
    })(i, mat({}));
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    tris.forEach(function (t) { t.forEach(function (v) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[a]); hi[a] = Math.max(hi[a], v[a]); } }); });
    return { name: nameOf(j, n), wing: WING.test(nameOf(j, n)), tris: tris, lo: lo, hi: hi };
  }).filter(function (p) { return p.tris.length; });
  return { parts: parts, colours: colours };
}

/* Sutherland-Hodgman against one axis-aligned plane. */
function clipKeep(poly, ax, v, keepAbove) {
  var out = [];
  for (var i = 0; i < poly.length; i++) {
    var a = poly[i], b = poly[(i + 1) % poly.length];
    var da = keepAbove ? a[ax] - v : v - a[ax], db = keepAbove ? b[ax] - v : v - b[ax];
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { var u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); }
  }
  return out;
}
function idxOf(v, planes) { var k = 0; while (k < planes.length && v > planes[k]) k++; return k; }

function chop(file) {
  var base = path.basename(file, '.glb'), m = /^(.*)-([sml])$/.exec(base);
  var fam = m[1], size = m[2], row = (TABLE[fam] || {})[size] || (TABLE[fam] || {}).m;
  if (!row) throw new Error('no cuts for ' + base);
  var L = load(file), parts = L.parts;
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  parts.forEach(function (p) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.lo[a]); hi[a] = Math.max(hi[a], p.hi[a]); } });
  var len = hi[2] - lo[2], H = hi[1] - lo[1], halfW = Math.max(Math.abs(lo[0]), Math.abs(hi[0]));
  /* Planes ascending in model units. z: nose is +z, so a cut f from the nose is at hi - f*len. */
  var P = [
    row.x.reduce(function (a, f) { return a.concat([f * halfW, -f * halfW]); }, []).sort(function (a, b) { return a - b; }),
    row.y.map(function (f) { return lo[1] + f * H; }).sort(function (a, b) { return a - b; }),
    row.z.map(function (f) { return hi[2] - f * len; }).sort(function (a, b) { return a - b; })
  ];
  var cells = {};   // key "xi,yi,zi" or "wingL"/"wingR" -> [{p:[v,v,v], c:col}]
  function put(key, poly, col) {
    (cells[key] = cells[key] || []);
    for (var k = 1; k + 1 < poly.length; k++) cells[key].push({ p: [poly[0], poly[k], poly[k + 1]], c: col });
  }
  parts.forEach(function (p) {
    var c = [0, 1, 2].map(function (a) { return (p.lo[a] + p.hi[a]) / 2; });
    if (p.wing) { p.tris.forEach(function (t) { put(c[0] < 0 ? 'wingR' : 'wingL', t, t.col); }); return; }
    var long = (p.hi[2] - p.lo[2]) >= 0.4 * len || (p.hi[1] - p.lo[1]) >= 0.6 * H || (p.hi[0] - p.lo[0]) >= 0.8 * halfW;
    if (!long) {
      var key = [idxOf(c[0], P[0]), idxOf(c[1], P[1]), idxOf(c[2], P[2])].join(',');
      p.tris.forEach(function (t) { put(key, t, t.col); });
      return;
    }
    p.tris.forEach(function (t) {
      var items = [{ poly: t, cell: [0, 0, 0] }];
      [2, 1, 0].forEach(function (ax) {
        var planes = P[ax]; if (!planes.length) return;
        var next = [];
        items.forEach(function (it) {
          for (var k = 0; k <= planes.length; k++) {
            var q = it.poly;
            if (k > 0) q = clipKeep(q, ax, planes[k - 1], true);
            if (k < planes.length && q.length >= 3) q = clipKeep(q, ax, planes[k], false);
            if (q.length >= 3) { var cc = it.cell.slice(); cc[ax] = k; next.push({ poly: q, cell: cc }); }
          }
        });
        items = next;
      });
      items.forEach(function (it) { put(it.cell.join(','), it.poly, t.col); });
    });
  });

  /* Pieces, with bounds. Role along the length: the nose slab is the fore
   * piece, the tail slab the aft piece, everything between is mid. */
  var nz = P[2].length;
  var pieces = Object.keys(cells).map(function (key) {
    var tr = cells[key], b = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
    tr.forEach(function (t) { t.p.forEach(function (v) { for (var a = 0; a < 3; a++) { b.lo[a] = Math.min(b.lo[a], v[a]); b.hi[a] = Math.max(b.hi[a], v[a]); } }); });
    var cell = /^wing/.test(key) ? null : key.split(',').map(Number);
    var role = !cell ? 'wing' : nz === 0 ? 'mid' : cell[2] === nz ? 'fore' : cell[2] === 0 ? 'aft' : 'mid';
    return { id: key, cell: cell, cells: cell ? [key] : [], role: role, lo: b.lo.map(r4), hi: b.hi.map(r4), tris: tr };
  }).filter(function (p) { return p.tris.length; });

  /* FRAGMENTS FOLD IN. A cell holding only a nav light, a lamp or the end of
   * a bracket is not a module anybody would buy. A piece is a fragment if
   * its outline is under 12% of the ship's length across its longest side,
   * or it has fewer than 40 triangles; it joins the piece whose centre is
   * nearest to its own, smallest fragments first, until none is left.
   *  - Wings never fold: they are a mirrored pair, whatever their size.
   *  - A fragment folds into a piece of its own role (fore, mid, aft) when
   *    there is one, so a small cockpit joins the cockpit and not the hold.
   *  - The last piece of a role never folds away: a ship keeps its fore and
   *    its aft however small they are.
   *  - A merged piece keeps every cell it absorbed, for the joints below. */
  var before = pieces.length;
  function extentOf(p) { return Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]); }
  function hull(p) { return !!p.cell; }
  function frag(p) { return hull(p) && (extentOf(p) < 0.12 * len || p.tris.length < 40); }
  function centre(p) { return [0, 1, 2].map(function (a) { return (p.lo[a] + p.hi[a]) / 2; }); }
  function roleCount(r) { return pieces.filter(function (p) { return p.role === r; }).length; }
  var stuck = {};
  for (var guard = 0; guard < 2000; guard++) {
    var smalls = pieces.filter(function (p) { return frag(p) && !stuck[p.id]; }).sort(function (a, b) { return extentOf(a) - extentOf(b); });
    var f = smalls[0]; if (!f) break;
    var fc = centre(f), into = null, bd = Infinity;
    var sameRole = pieces.some(function (p) { return p !== f && hull(p) && p.role === f.role; });
    if (!sameRole && roleCount(f.role) <= 1 && f.role !== 'mid') { stuck[f.id] = true; continue; }
    pieces.forEach(function (p) {
      if (p === f || !hull(p)) return;
      if (sameRole && p.role !== f.role) return;
      var pc = centre(p), d = Math.hypot(pc[0] - fc[0], pc[1] - fc[1], pc[2] - fc[2]);
      if (frag(p)) d *= 3;   // prefer a real piece, so lamps do not cluster into a bigger lamp
      if (d < bd) { bd = d; into = p; }
    });
    if (!into) { stuck[f.id] = true; continue; }
    into.tris = into.tris.concat(f.tris);
    into.cells = into.cells.concat(f.cells);
    for (var a2 = 0; a2 < 3; a2++) { into.lo[a2] = Math.min(into.lo[a2], f.lo[a2]); into.hi[a2] = Math.max(into.hi[a2], f.hi[a2]); }
    pieces.splice(pieces.indexOf(f), 1);
  }

  /* Joints: neighbouring cells across one plane, with the overlap of their
   * outlines on that plane. A wing joins the hull piece its root touches. */
  /* A joint wherever a cell of one piece neighbours a cell of another, one
   * per plane crossing; several crossings between the same two pieces on
   * the same plane are one joint. */
  var owner = {}; pieces.forEach(function (p) { p.cells.forEach(function (k) { owner[k] = p; }); });
  var joints = [], seen = {};
  pieces.forEach(function (a) {
    a.cells.forEach(function (key) {
      var cell = key.split(',').map(Number);
      [0, 1, 2].forEach(function (ax) {
        var nb = cell.slice(); nb[ax]++;
        var b = owner[nb.join(',')]; if (!b || b === a) return;
        var at = P[ax][cell[ax]], tag = [a.id, b.id, ax, at].join('|');
        if (seen[tag]) return;
        var o = [0, 1, 2].filter(function (k) { return k !== ax; });
        var rect = o.map(function (k) { return [Math.max(a.lo[k], b.lo[k]), Math.min(a.hi[k], b.hi[k])]; });
        if (rect[0][1] <= rect[0][0] || rect[1][1] <= rect[1][0]) return;   // they do not actually meet
        seen[tag] = true;
        joints.push({ a: a.id, b: b.id, axis: 'xyz'[ax], at: r4(at), span: rect.map(function (r) { return r.map(r4); }) });
      });
    });
  });
  pieces.forEach(function (w) {
    if (w.cell) return;
    var root = w.id === 'wingL' ? w.lo : w.hi, best = null, bd = Infinity;
    pieces.forEach(function (p) {
      if (!p.cell) return;
      var cx = (w.lo[2] + w.hi[2]) / 2, cy = (w.lo[1] + w.hi[1]) / 2;
      var d = Math.abs(cx - (p.lo[2] + p.hi[2]) / 2) + Math.abs(cy - (p.lo[1] + p.hi[1]) / 2) + Math.abs(root[0] - (w.id === 'wingL' ? p.hi[0] : p.lo[0]));
      if (d < bd) { bd = d; best = p; }
    });
    if (best) joints.push({ a: best.id, b: w.id, axis: 'x', at: r4(root[0]), span: null });
  });

  var tris = 0; pieces.forEach(function (p) { tris += p.tris.length; });
  var out = {
    ship: base, family: fam, size: size, colours: L.colours,
    bounds: { lo: lo.map(r4), hi: hi.map(r4) }, planes: P.map(function (a) { return a.map(r4); }),
    pieces: pieces.map(function (p) {
      var flat = [], cols = [];
      p.tris.forEach(function (t) { t.p.forEach(function (v) { flat.push(r4(v[0]), r4(v[1]), r4(v[2])); }); cols.push(t.c); });
      return { id: p.id, cell: p.cell, role: p.role, lo: p.lo, hi: p.hi, v: flat, c: cols };
    }),
    joints: joints
  };
  return { out: out, summary: { ship: base, pieces: pieces.length, cells: before, joints: joints.length, tris: tris,
    roles: pieces.reduce(function (r, p) { r[p.role] = (r[p.role] || 0) + 1; return r; }, {}) } };
}
function r4(v) { return Math.round(v * 10000) / 10000; }

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
var want = process.argv.slice(2);
var files = fs.readdirSync(DIR).filter(function (f) { return /\.glb$/.test(f) && (!want.length || want.indexOf(f.replace('.glb', '')) >= 0); }).sort();
var index = [];
files.forEach(function (f) {
  var r = chop(path.join(DIR, f));
  fs.writeFileSync(path.join(OUT, r.summary.ship + '.json'), JSON.stringify(r.out));
  index.push(r.summary);
  console.log(r.summary.ship + '\t' + r.summary.cells + ' cells > ' + r.summary.pieces + ' pieces\t' + r.summary.joints + ' joints\t' +
    Object.keys(r.summary.roles).map(function (k) { return k + ' ' + r.summary.roles[k]; }).join(', '));
});
if (!want.length) fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
