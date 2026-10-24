// World boxes of named glb nodes, in the game's PORT units (src/ports frame).
// node glb-boxes.cjs model-id regex      e.g.  pad-city-site-l "^(city|surfaceApron|padSurfaceDoor)$"
global.window = global;
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'ports.js'));
var id = process.argv[2], re = new RegExp(process.argv[3] || '.', 'i');
var lib = PortLib[id], mpu = lib.metresPerUnit, org = lib.origin || [0, 0, 0];
var buf = fs.readFileSync(path.join(ROOT, 'ref', 'ports', id + '.glb'));
var jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
function mat(nd) {
  if (nd.matrix) return nd.matrix.slice();
  var t = nd.translation || [0, 0, 0], r = nd.rotation || [0, 0, 0, 1], s = nd.scale || [1, 1, 1];
  var x = r[0], y = r[1], z = r[2], w = r[3];
  return [(1 - 2*(y*y + z*z)) * s[0], (2*(x*y + z*w)) * s[0], (2*(x*z - y*w)) * s[0], 0,
          (2*(x*y - z*w)) * s[1], (1 - 2*(x*x + z*z)) * s[1], (2*(y*z + x*w)) * s[1], 0,
          (2*(x*z + y*w)) * s[2], (2*(y*z - x*w)) * s[2], (1 - 2*(x*x + y*y)) * s[2], 0,
          t[0], t[1], t[2], 1];
}
function mul(a, b) {   // column-major 4x4: a*b
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    var s = 0; for (var k = 0; k < 4; k++) s += a[k*4 + r] * b[c*4 + k]; o[c*4 + r] = s;
  }
  return o;
}
function xf(m, p) { return [m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12], m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13], m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14]]; }
function toPort(g) {   // glb (y up, metres) -> game metres (x, -z, y) -> port units
  var gm = [g[0], -g[2], g[1]];
  return [(gm[0] - org[0]) / mpu, (gm[1] - org[1]) / mpu, (gm[2] - org[2]) / mpu];
}
var out = [];
function walk(i, M) {
  var nd = J.nodes[i], W = mul(M, mat(nd)), box = null;
  function grow(p) { if (!box) box = { min: p.slice(), max: p.slice() }; for (var a = 0; a < 3; a++) { box.min[a] = Math.min(box.min[a], p[a]); box.max[a] = Math.max(box.max[a], p[a]); } }
  if (nd.mesh !== undefined) J.meshes[nd.mesh].primitives.forEach(function (pr) {
    var A = J.accessors[pr.attributes.POSITION], mn = A.min, mx = A.max;
    for (var c = 0; c < 8; c++) grow(toPort(xf(W, [c & 1 ? mx[0] : mn[0], c & 2 ? mx[1] : mn[1], c & 4 ? mx[2] : mn[2]])));
  });
  (nd.children || []).forEach(function (ch) { var b = walk(ch, W); if (b) { grow(b.min); grow(b.max); } });
  if (box && nd.name && re.test(nd.name)) out.push({ name: nd.name, min: box.min.map(r3), max: box.max.map(r3) });
  return box;
}
function r3(v) { return Math.round(v * 1000) / 1000; }
var I = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
J.scenes[J.scene || 0].nodes.forEach(function (r) { walk(r, I); });
if (process.argv[4] === 'json') console.log(JSON.stringify(out));
else out.forEach(function (b) { console.log(b.name.padEnd(28), 'x', b.min[0], '..', b.max[0], '  y', b.min[1], '..', b.max[1], '  z', b.min[2], '..', b.max[2]); });
