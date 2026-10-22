// Phase 1, step 1: where would each factory ship be cut?
// Bounds every top-level part (node transforms applied), sorts the major parts
// by name, finds the fore-aft axis from cockpit vs engines, and proposes cut
// planes: cockpit | mid | engine, wings split off. Dressing (lights,
// antennas, greebles) goes to whichever piece its centre falls in.
//   node "Claude outputs/ship-cut-plan.cjs" [ref/glb] [--html out.html]
var fs = require('fs'), path = require('path');
var args = process.argv.slice(2);
var htmlOut = args.indexOf('--html') >= 0 ? args[args.indexOf('--html') + 1] : null;
var dir = args.filter(function (a, i) { return a !== '--html' && args[i - 1] !== '--html'; })[0] || path.join(__dirname, '..', 'ref', 'glb');
var KINDS = [
  ['cockpit', /nose|canopy|cockpit|bridge|pilot|visor|windscreen|glass|bow/i],
  ['engine', /engine|nacelle|exhaust|thruster|nozzle|propellant|reactor|drive|booster/i],
  ['wing', /wing|stabili|aileron|winglet|strake|canard|fin[LR]?$|fin[A-Z]/i],
  ['weapon', /laser|turret|vls|gun|cannon|missile|torp|weapon|launcher|barrel/i],
  ['gear', /^gear|strut|skid/i],
  ['hull', /hull|body|spine|keel|frame|deck|bay|hold|cargo|tank|module|section|truss|boom|pod/i]
];
function parseGlb(buf) { var n = buf.readUInt32LE(12); return JSON.parse(buf.toString('utf8', 20, 20 + n)); }
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
function xf(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
function boundsOf(j, idx, M, box) {
  var n = j.nodes[idx], m = mul(M, mat(n));
  if (n.mesh !== undefined) j.meshes[n.mesh].primitives.forEach(function (p) {
    var a = j.accessors[p.attributes.POSITION]; if (!a.min) return;
    for (var c = 0; c < 8; c++) {
      var q = xf(m, [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]]);
      for (var k = 0; k < 3; k++) { box.lo[k] = Math.min(box.lo[k], q[k]); box.hi[k] = Math.max(box.hi[k], q[k]); }
    }
  });
  (n.children || []).forEach(function (c) { boundsOf(j, c, m, box); });
  return box;
}
function nameOf(j, n) { return n.name || (n.children || []).map(function (c) { return j.nodes[c].name || ''; }).join(' '); }
var files = fs.readdirSync(dir).filter(function (f) { return /\.glb$/.test(f); }).sort();
var out = [];
files.forEach(function (f) {
  var j = parseGlb(fs.readFileSync(path.join(dir, f)));
  var rootIdx = (j.scenes[j.scene || 0].nodes || [0])[0], root = j.nodes[rootIdx];
  var I = mat({});
  var parts = (root.children || []).map(function (i) {
    var n = j.nodes[i], name = nameOf(j, n);
    var k = KINDS.filter(function (p) { return p[1].test(name); })[0];
    var b = boundsOf(j, i, I, { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] });
    return { name: name.slice(0, 40), kind: k ? k[0] : 'dress', lo: b.lo, hi: b.hi,
             c: [0, 1, 2].map(function (a) { return (b.lo[a] + b.hi[a]) / 2; }) };
  }).filter(function (p) { return p.lo[0] < 1e8; });
  function centroid(kind) { var s = [0, 0, 0], n = 0; parts.forEach(function (p) { if (p.kind === kind) { n++; for (var a = 0; a < 3; a++) s[a] += p.c[a]; } }); return n ? s.map(function (v) { return v / n; }) : null; }
  var ck = centroid('cockpit'), en = centroid('engine');
  var ax = 2, sign = 1;
  if (ck && en) { var d = [0, 1, 2].map(function (a) { return ck[a] - en[a]; }); ax = [0, 1, 2].reduce(function (b, a) { return Math.abs(d[a]) > Math.abs(d[b]) ? a : b; }, 0); sign = d[ax] > 0 ? 1 : -1; }
  // fore = +sign along ax. Cockpit cut: aft-most extent of cockpit parts; engine cut: fore-most extent of engine parts.
  function fore(p) { return sign > 0 ? p.hi[ax] : -p.lo[ax]; }
  function aft(p) { return sign > 0 ? p.lo[ax] : -p.hi[ax]; }
  var all = parts.map(fore).concat(parts.map(aft));
  var len = Math.max.apply(0, all) - Math.min.apply(0, all);
  /* ROBUST boundaries: a part longer than 40% of the ship (a propellant
   * trunk, a keel) says nothing about where a section ends, and one
   * forward thruster must not drag the engine section to the nose. The
   * cockpit ends where nine in ten of its parts' centres are forward of;
   * the engines start where nine in ten of theirs are aft of. */
  function q(xs, f) { xs = xs.slice().sort(function (a, b) { return a - b; }); return xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.round(f * (xs.length - 1))))] : NaN; }
  function short(p) { return (p.hi[ax] - p.lo[ax]) < 0.4 * len; }
  function cen(p) { return sign > 0 ? p.c[ax] : -p.c[ax]; }
  var ckAft = q(parts.filter(function (p) { return p.kind === 'cockpit' && short(p); }).map(cen), 0.1);
  var enFore = q(parts.filter(function (p) { return p.kind === 'engine' && short(p); }).map(cen), 0.9);
  if (isNaN(ckAft)) ckAft = Infinity;
  if (isNaN(enFore)) enFore = -Infinity;
  var overlap = enFore > ckAft;   // engines reach forward past the cockpit's aft end: no clean mid section
  var midLen = overlap ? 0 : ckAft - enFore;
  function piece(p) {
    if (p.kind === 'wing') return 'wing';
    var c = sign > 0 ? p.c[ax] : -p.c[ax];
    if (overlap) return c > (ckAft + enFore) / 2 ? 'cockpit' : 'engine';
    return c >= ckAft ? 'cockpit' : c <= enFore ? 'engine' : 'mid';
  }
  var counts = { cockpit: 0, mid: 0, engine: 0, wing: 0 };
  parts.forEach(function (p) { p.piece = piece(p); counts[p.piece]++; });
  out.push({ ship: f.replace('.glb', ''), axis: 'xyz'[ax] + (sign > 0 ? '+' : '-'), len: len, mid: midLen, overlap: overlap, counts: counts, parts: parts, ax: ax, sign: sign });
});
console.log('ship\tfore\tlength\tmid%\tpieces (parts in each)');
out.forEach(function (o) {
  console.log(o.ship + '\t' + o.axis + '\t' + o.len.toFixed(1) + '\t' + (o.overlap ? 'none' : Math.round(100 * o.mid / o.len) + '%') + '\t' +
    Object.keys(o.counts).map(function (k) { return k + ':' + o.counts[k]; }).join(' '));
});
if (htmlOut) {
  var COL = { cockpit: '#4f9bff', mid: '#c7ccd6', engine: '#ff8a3d', wing: '#49c27a' };
  var cells = out.map(function (o) {
    var lat = [0, 1, 2].filter(function (a) { return a !== o.ax; });
    var span = lat.map(function (a) { return Math.max.apply(0, o.parts.map(function (p) { return Math.abs(p.c[a]) + (p.hi[a] - p.lo[a]) / 2; })); });
    var side = span[0] >= span[1] ? lat[0] : lat[1];   // the wider lateral axis = top view
    var lo = Math.min.apply(0, o.parts.map(function (p) { return p.lo[o.ax]; })), hi = Math.max.apply(0, o.parts.map(function (p) { return p.hi[o.ax]; }));
    var w = Math.max.apply(0, o.parts.map(function (p) { return Math.max(Math.abs(p.lo[side]), Math.abs(p.hi[side])); }));
    var S = 200 / Math.max(hi - lo, 2 * w);
    var rects = o.parts.map(function (p) {
      var x0 = o.sign > 0 ? hi - p.hi[o.ax] : p.lo[o.ax] - lo, x1 = o.sign > 0 ? hi - p.lo[o.ax] : p.hi[o.ax] - lo;
      return '<rect x="' + (10 + x0 * S).toFixed(1) + '" y="' + (110 + p.lo[side] * S).toFixed(1) + '" width="' + Math.max(0.5, (x1 - x0) * S).toFixed(1) +
        '" height="' + Math.max(0.5, (p.hi[side] - p.lo[side]) * S).toFixed(1) + '" fill="' + COL[p.piece] + '" fill-opacity="0.45" stroke="' + COL[p.piece] + '"/>';
    }).join('');
    return '<div class=c><svg width=220 height=220>' + rects + '</svg><div>' + o.ship + ' &middot; nose &larr;</div></div>';
  }).join('');
  fs.writeFileSync(htmlOut, '<!doctype html><meta charset=utf-8><title>Ship cut plan</title><style>body{background:#0b0f1a;color:#cfd9ee;font:12px monospace;margin:16px}.g{display:flex;flex-wrap:wrap;gap:8px}.c{background:#121828;padding:6px}</style>' +
    '<h3>Factory ships, top view, nose to the left: <span style="color:#4f9bff">cockpit</span> &middot; <span style="color:#c7ccd6">mid</span> &middot; <span style="color:#ff8a3d">engine</span> &middot; <span style="color:#49c27a">wings</span></h3><div class=g>' + cells + '</div>');
  console.log('wrote ' + htmlOut);
}
