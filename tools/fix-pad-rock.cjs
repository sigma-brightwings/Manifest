/* fix-pad-rock.cjs — open the pad sites' south bays (24-09).
 *
 *     node tools/fix-pad-rock.cjs            print what it would do
 *     node tools/fix-pad-rock.cjs --apply    rewrite ref/ports/pad-site-* and pad-city-site-*
 *
 * THE FAULT, measured: every pad site wraps its underground deck in rock
 * (`deckRock`: floor, west, east and south walls), sized to the DECK and
 * not to the berths off it. The south wall, 4 m thick and full height to
 * the surface, therefore stands inside the south berths' own throats — at
 * pad-site-m it runs z -21.4..-17.4 through bays that reach back to -25.8
 * — so a ship coming off the deck meets solid rock halfway into its bay,
 * and the interior router could only reach those bays by jumping through
 * it. The north berths were fine only because there is no north wall.
 *
 * THE FIX, in the glTF node transforms only (no vertex is touched, so the
 * change is exact and reversible): the south wall moves out behind the
 * deepest south bay, the west and east walls and the floor stretch along z
 * to meet it (and the floor runs under the north bays too), with 0.5 m of
 * clearance behind each bay's back wall. The original file is kept in
 * ref/ports-retired/<today>/<id>.pre-rockfix.glb.
 *
 * The sources in model_update/ are not changed: re-exporting from the
 * builder brings the fault back until the builder sizes deckRock to the
 * berths. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var APPLY = process.argv.indexOf('--apply') >= 0;
var CLEAR = 0.5;

function readGlb(f) {
  var b = fs.readFileSync(f), jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.slice(20, 20 + jl).toString('utf8')), rest: b.slice(20 + jl) };
}
function writeGlb(f, g) {
  var js = Buffer.from(JSON.stringify(g.json), 'utf8');
  var pad = (4 - (js.length % 4)) % 4;
  js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  var head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + js.length + g.rest.length, 8);
  head.writeUInt32LE(js.length, 12); head.writeUInt32LE(0x4E4F534A, 16);
  fs.writeFileSync(f, Buffer.concat([head, js, g.rest]));
}
function boxOfMesh(g, bin, mi) {
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], j = g.json;
  j.meshes[mi].primitives.forEach(function (p) {
    var a = j.accessors[p.attributes.POSITION];
    for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a.min[k]); hi[k] = Math.max(hi[k], a.max[k]); }
  });
  return { lo: lo, hi: hi };
}

var ids = fs.readdirSync(path.join(ROOT, 'ref', 'ports')).filter(function (f) { return /^pad(-city)?-site-[sml]\.glb$/.test(f); });
var today = new Date().toISOString().slice(0, 10);
ids.forEach(function (f) {
  var file = path.join(ROOT, 'ref', 'ports', f), g = readGlb(file), j = g.json;
  var byName = {};
  j.nodes.forEach(function (n, i) { if (n.name) byName[n.name] = i; });
  /* The throats, straight off their meshes: every one of these files has
   * its bays' vertices in the site frame (identity node transforms), which
   * is checked rather than assumed. */
  var parent = {};
  j.nodes.forEach(function (n, i) { (n.children || []).forEach(function (c) { parent[c] = i; }); });
  function local(n) {
    if (n.matrix) return n.matrix.slice();
    var t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    var x = q[0], y = q[1], z = q[2], w = q[3];
    var m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
             2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
    for (var i = 0; i < 3; i++) { m[i] *= s[0]; m[4 + i] *= s[1]; m[8 + i] *= s[2]; }
    return m;
  }
  function mul(a, c) { var o = new Array(16).fill(0); for (var r = 0; r < 4; r++) for (var k = 0; k < 4; k++) for (var m = 0; m < 4; m++) o[k * 4 + r] += a[m * 4 + r] * c[k * 4 + m]; return o; }
  function world(i) { var m = local(j.nodes[i]); for (var p = parent[i]; p !== undefined; p = parent[p]) m = mul(local(j.nodes[p]), m); return m; }
  function worldBox(i) {
    var bx = boxOfMesh(g, null, j.nodes[i].mesh), m = world(i), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (var c = 0; c < 8; c++) {
      var p = [c & 1 ? bx.hi[0] : bx.lo[0], c & 2 ? bx.hi[1] : bx.lo[1], c & 4 ? bx.hi[2] : bx.lo[2]];
      var w = [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
      for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
    }
    return { lo: lo, hi: hi };
  }
  var south = Infinity, north = -Infinity, ok = true;
  j.nodes.forEach(function (n, i) {
    if (!/^berthSM\d+Throat$/.test(n.name || '') || n.mesh === undefined) return;
    var bx = worldBox(i);
    if (bx.hi[2] < 0) south = Math.min(south, bx.lo[2]);
    else north = Math.max(north, bx.hi[2]);
  });
  /* The rock is edited as a z-stretch in the SITE frame, pushed down into
   * each part's own matrix. That needs the frames above each part to be
   * pure translations — checked, not assumed. */
  var names = ['deckRockWallS', 'deckRockWallW', 'deckRockWallE', 'deckRockFloor'];
  var idx = names.map(function (nm) { return byName[nm]; });
  if (idx.some(function (i) { return i === undefined; })) { console.log(f + ': no deckRock parts'); return; }
  function parentWorld(i) { var p = parent[i]; return p === undefined ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] : world(p); }
  idx.forEach(function (i) {
    var P = parentWorld(i), id3 = [0, 1, 2, 4, 5, 6, 8, 9, 10], want = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (id3.some(function (k, n) { return Math.abs(P[k] - want[n]) > 1e-9; })) ok = false;
  });
  if (!ok) { console.log(f + ': skipped — the rock sits under a rotated or scaled frame, fix by hand'); return; }
  var parts = idx.map(function (i) { return j.nodes[i]; });
  var S = worldBox(idx[0]), W = worldBox(idx[1]), F = worldBox(idx[3]);
  /* Apply z' = s z + t (site frame) to part i. */
  function applyZ(i, s, t) {
    var P = parentWorld(i), L = local(j.nodes[i]), pz = P[14];
    var A = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, s, 0, 0, 0, s * pz + t - pz, 1];
    var n = j.nodes[i];
    n.matrix = mul(A, L);
    delete n.translation; delete n.rotation; delete n.scale;
  }
  var thick = S.hi[2] - S.lo[2];
  var sIn = south - CLEAR;                         // inner face of the moved south wall
  if (!(S.hi[2] > sIn)) { console.log(f + ': south wall already clear of the bays'); return; }
  var dzS = sIn - S.hi[2];
  /* A z-stretch that maps [a0, a1] onto [b0, b1]: scale about the origin
   * plus a translation, both along z only. */
  function stretch(a0, a1, b0, b1) { var s = (b1 - b0) / (a1 - a0); return { s: s, t: b0 - s * a0 }; }
  var wall = stretch(W.lo[2], W.hi[2], sIn, W.hi[2]);
  var floorHi = Math.max(F.hi[2], north + CLEAR);
  var floor = stretch(F.lo[2], F.hi[2], sIn - thick, floorHi);
  console.log(f + ': south bays reach z ' + south.toFixed(2) + ', south wall was ' + S.lo[2].toFixed(2) + '..' + S.hi[2].toFixed(2) +
              ' -> ' + (S.lo[2] + dzS).toFixed(2) + '..' + (S.hi[2] + dzS).toFixed(2) + '; W/E walls ' + W.lo[2].toFixed(2) + ' -> ' + sIn.toFixed(2) +
              '; floor ' + F.lo[2].toFixed(2) + '..' + F.hi[2].toFixed(2) + ' -> ' + (sIn - thick).toFixed(2) + '..' + floorHi.toFixed(2));
  if (!APPLY) return;
  applyZ(idx[0], 1, dzS);
  applyZ(idx[1], wall.s, wall.t);
  applyZ(idx[2], wall.s, wall.t);
  applyZ(idx[3], floor.s, floor.t);
  var S2 = worldBox(idx[0]), W2 = worldBox(idx[1]), F2 = worldBox(idx[3]);
  console.log('   now: south wall ' + S2.lo[2].toFixed(2) + '..' + S2.hi[2].toFixed(2) + ', west wall ' + W2.lo[2].toFixed(2) + '..' + W2.hi[2].toFixed(2) +
              ', floor ' + F2.lo[2].toFixed(2) + '..' + F2.hi[2].toFixed(2));
  var keep = path.join(ROOT, 'ref', 'ports-retired', today);
  fs.mkdirSync(keep, { recursive: true });
  var bak = path.join(keep, f.replace(/\.glb$/, '.pre-rockfix.glb'));
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  writeGlb(file, g);
});
