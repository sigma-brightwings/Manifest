/* tune-cuts.cjs - refine Astra's cut table against the models themselves.
 *
 *   node tools/tune-cuts.cjs            (report only)
 *   node tools/tune-cuts.cjs --write    (write tools/ship-cuts.json; Astra's
 *                                        original is kept in ship-cuts-astra.json)
 *
 * Astra, 2026-10-21: "I want you to make any changes to the cuts that I
 * made ... my judgement doesn't have to be final on this." Her lines are the
 * intent; this moves each one onto the seam it was aiming at:
 *
 *  1. SNAP. Within 4% of the ship either side of each cut, find the plane
 *     that slices the least of the model (triangle area crossed, wings and
 *     pods left out because the grid never cuts them), preferring the
 *     original position when it is a tie. A cut that lands in a gap between
 *     parts makes a clean seam and needs no plates.
 *  2. MERGE. Two cuts on one axis closer than 4% of the ship make a slice
 *     too thin to be a module: they become one, at the better-seamed of the
 *     two.
 *  3. CENTRE AND EDGE. A side cut within 3% of the centreline is a
 *     centreline split (0). A cut at 0.97 or past it trims only a lamp or a
 *     mast tip, which folds straight back into its neighbour: it goes.
 */
'use strict';
var fs = require('fs'), path = require('path');
var TOOLS = __dirname, ROOT = path.join(TOOLS, '..'), DIR = path.join(ROOT, 'ref', 'glb');
var src = fs.readFileSync(path.join(TOOLS, 'chop-ships.cjs'), 'utf8');
var mod = { exports: {} };
new Function('require', 'module', '__dirname', src.replace(/\nif \(!fs\.existsSync\(OUT\)\)[\s\S]*$/, '\nmodule.exports = { load: load, roundKind: roundKind };'))(require, mod, TOOLS);
var load = mod.exports.load, roundKind = mod.exports.roundKind;
var WIN = 0.04, STEP = 0.0025, MERGE = 0.04, CENTRE = 0.03, EDGE = 0.97;

var tablePath = path.join(TOOLS, 'ship-cuts.json');
var table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
var astraPath = path.join(TOOLS, 'ship-cuts-astra.json');
var original = fs.existsSync(astraPath) ? JSON.parse(fs.readFileSync(astraPath, 'utf8')) : JSON.parse(JSON.stringify(table));

function area(t) {
  var u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], w = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
  return 0.5 * Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
}
var report = [], changed = 0, total = 0;
fs.readdirSync(DIR).filter(function (f) { return /\.glb$/.test(f); }).sort().forEach(function (f) {
  var m = /^(.*)-([sml])\.glb$/.exec(f), fam = m[1], size = m[2];
  var row = (original[fam] || {})[size]; if (!row) return;
  var parts = load(path.join(DIR, f)).parts;
  var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  parts.forEach(function (p) { for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.lo[a]); hi[a] = Math.max(hi[a], p.hi[a]); } });
  var len = hi[2] - lo[2], H = hi[1] - lo[1], halfW = Math.max(Math.abs(lo[0]), Math.abs(hi[0]));
  var tris = [];
  parts.forEach(function (p) { if (p.wing || roundKind(p, len)) return; p.tris.forEach(function (t) { tris.push({ t: t, a: area(t) }); }); });
  /* Model position of a cut on each axis, and back. */
  var pos = {
    z: function (fr) { return hi[2] - fr * len; },
    y: function (fr) { return lo[1] + fr * H; },
    x: function (fr) { return fr * halfW; }
  };
  var AX = { x: 0, y: 1, z: 2 };
  function cost(axis, fr) {
    var ax = AX[axis], vals = axis === 'x' ? (fr === 0 ? [0] : [pos.x(fr), -pos.x(fr)]) : [pos[axis](fr)], c = 0;
    vals.forEach(function (v) { tris.forEach(function (o) { var t = o.t; var mn = Math.min(t[0][ax], t[1][ax], t[2][ax]), mx = Math.max(t[0][ax], t[1][ax], t[2][ax]); if (mn < v && mx > v) c += o.a; }); });
    return c;
  }
  var out = {}, notes = [];
  ['z', 'y', 'x'].forEach(function (axis) {
    var cuts = row[axis].slice().sort(function (a, b) { return a - b; }), res = [];
    cuts.forEach(function (fr) {
      if (fr >= EDGE) { notes.push(axis + ' ' + fr.toFixed(2) + ' dropped: trims only the outermost ' + Math.round((1 - fr) * 100) + '%'); return; }
      if (axis === 'x' && fr <= CENTRE) { res.push({ f: 0, c: cost('x', 0), from: fr }); if (fr !== 0) notes.push('x ' + fr.toFixed(2) + ' made a centreline split'); return; }
      /* Searched on the table's own two-decimal grid, so the position
       * found is the position written; and a move must slice at least 10%
       * less than Astra's line or her line stands. */
      var c0 = cost(axis, fr), best = fr, bc = c0;
      for (var gi = Math.round(Math.max(0.03, fr - WIN) * 100); gi <= Math.round(Math.min(EDGE - 0.01, fr + WIN) * 100); gi++) {
        var g = gi / 100, c = cost(axis, g) * (1 + 0.5 * Math.abs(g - fr) / WIN);   // a little loyalty to her line
        if (c < bc) { bc = c; best = g; }
      }
      var cb = cost(axis, best);
      if (!(cb <= 0.9 * c0)) { best = fr; cb = c0; }
      if (best !== fr) notes.push(axis + ' ' + fr.toFixed(2) + ' -> ' + best.toFixed(2) + ' (slices ' + (c0 > 0 ? Math.round(100 * (1 - cb / c0)) + '% less' : 'nothing either way') + ')');
      res.push({ f: best, c: cb, from: fr });
    });
    res.sort(function (a, b) { return a.f - b.f; });
    for (var i = 0; i + 1 < res.length; i++) {
      if (res[i + 1].f - res[i].f < MERGE && !(axis === 'x' && res[i].f === 0)) {
        var keep = res[i].c <= res[i + 1].c ? res[i] : res[i + 1], lose = keep === res[i] ? res[i + 1] : res[i];
        notes.push(axis + ' ' + lose.f.toFixed(2) + ' merged into ' + keep.f.toFixed(2) + ' (a ' + Math.round((res[i + 1].f - res[i].f) * 100) + '% sliver)');
        res.splice(res.indexOf(lose), 1); i--;
      }
    }
    var seen = {}; out[axis] = res.map(function (r) { return r.f; }).filter(function (v) { if (seen[v]) return false; seen[v] = 1; return true; });
  });
  total++;
  if (notes.length) { changed++; report.push(f.replace('.glb', '') + ':\n  ' + notes.join('\n  ')); }
  table[fam] = table[fam] || {}; table[fam][size] = out;
});
console.log(report.join('\n'));
console.log('\n' + changed + ' of ' + total + ' ships changed');
if (process.argv.indexOf('--write') >= 0) {
  if (!fs.existsSync(astraPath)) fs.writeFileSync(astraPath, fs.readFileSync(tablePath));
  var merge = require(path.join(ROOT, 'Claude outputs', 'merge-cuts-lib.cjs'));
  fs.writeFileSync(tablePath, merge.format(table));
  console.log('wrote ' + tablePath + ' (Astra\'s original: ' + astraPath + ')');
}
