// Which top-level parts of the factory ships are spheres or domes?
//   node "Claude outputs/sphere-survey.cjs"
// Sphere: bounding box nearly cubic and every vertex about the same distance
// from its centre. Dome: one side about half the other two, and every vertex
// about the same distance from the centre of its flat face.
var fs = require('fs'), path = require('path');
var DIR = path.join(__dirname, '..', 'ref', 'glb');
var src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'chop-ships.cjs'), 'utf8');
// reuse the chopper's loader without running it
var mod = { exports: {} };
new Function('require', 'module', '__dirname', src.replace(/\nif \(!fs\.existsSync\(OUT\)\)[\s\S]*$/, '\nmodule.exports = { load: load };'))(require, mod, path.join(__dirname, '..', 'tools'));
var load = mod.exports.load;
function classify(p) {
  var d = [0, 1, 2].map(function (a) { return p.hi[a] - p.lo[a]; });
  var vs = []; p.tris.forEach(function (t) { t.forEach(function (v) { vs.push(v); }); });
  if (p.tris.length < 20) return null;
  function cv(c) {
    var ds = vs.map(function (v) { return Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]); });
    var m = ds.reduce(function (a, b) { return a + b; }, 0) / ds.length;
    var s = Math.sqrt(ds.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / ds.length);
    return { cv: s / m, r: m };
  }
  var mid = [0, 1, 2].map(function (a) { return (p.lo[a] + p.hi[a]) / 2; });
  var big = Math.max.apply(0, d), small = Math.min.apply(0, d);
  if (big / small <= 1.35) { var s = cv(mid); if (s.cv < 0.12) return { kind: 'sphere', r: s.r, cv: s.cv }; }
  // dome: the short axis is about half the others; test both ends of it as the flat face
  var ax = d.indexOf(small), others = d.filter(function (_, i) { return i !== ax; });
  if (Math.abs(others[0] - others[1]) / big < 0.2 && small / big > 0.35 && small / big < 0.65) {
    for (var e = 0; e < 2; e++) {
      var c = mid.slice(); c[ax] = e ? p.hi[ax] : p.lo[ax];
      var r = cv(c); if (r.cv < 0.18) return { kind: 'dome', r: r.r, cv: r.cv, flat: 'xyz'[ax] + (e ? '+' : '-') };
    }
  }
  return null;
}
var NOT_POD = /lamp|beacon|antenna|nozzle|rcs|engine|dish|interior|cockpit|canopy|glass|forebody|nose/i;
var rows = [];
fs.readdirSync(DIR).filter(function (f) { return /\.glb$/.test(f); }).sort().forEach(function (f) {
  var L = load(path.join(DIR, f));
  var lo = 1e9, hi = -1e9; L.parts.forEach(function (p) { lo = Math.min(lo, p.lo[2]); hi = Math.max(hi, p.hi[2]); });
  var len = hi - lo;
  L.parts.forEach(function (p) {
    if (NOT_POD.test(p.name || '')) return;
    var c = classify(p); if (!c) return;
    var big = Math.max(p.hi[0] - p.lo[0], p.hi[1] - p.lo[1], p.hi[2] - p.lo[2]);
    rows.push({ pct: 100 * big / len, ship: f.replace('.glb', ''), kind: c.kind, name: (p.name || '?').replace(/ShiphullMain|Shiphull/, '..').slice(0, 34) });
  });
});
rows.sort(function (a, b) { return a.pct - b.pct; });
rows.forEach(function (r) { console.log(r.pct.toFixed(1) + '%\t' + r.kind + '\t' + r.ship + '\t' + r.name); });
