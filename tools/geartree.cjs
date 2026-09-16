/* Scratch probe: dump the gear subtree of a .glb so we can see exactly what
 * the artist gave us and in what local frame. Left untracked deliberately,
 * like the other *verify.cjs scratch files. Run:
 *   node tools/geartree.cjs ref/glb/courier-m.glb
 */
var fs = require('fs');
var file = process.argv[2] || 'ref/glb/courier-m.glb';
var b = fs.readFileSync(file);
var jl = b.readUInt32LE(12);
var j = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
var N = j.nodes;

function q2eulerDeg(q) {
  if (!q) return '';
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var sx = 2 * (w * x + y * z), cx = 1 - 2 * (x * x + y * y);
  var sy = 2 * (w * y - z * x);
  var sz = 2 * (w * z + x * y), cz = 1 - 2 * (y * y + z * z);
  var ex = Math.atan2(sx, cx);
  var ey = Math.abs(sy) >= 1 ? Math.sign(sy) * Math.PI / 2 : Math.asin(sy);
  var ez = Math.atan2(sz, cz);
  var d = 180 / Math.PI;
  return 'eulXYZ(' + (ex * d).toFixed(1) + ',' + (ey * d).toFixed(1) + ',' + (ez * d).toFixed(1) + ')';
}

function fmt(n) {
  var s = '';
  if (n.translation) s += ' T[' + n.translation.map(function (v) { return v.toFixed(3); }).join(' ') + ']';
  if (n.rotation) s += ' R' + q2eulerDeg(n.rotation);
  if (n.scale) s += ' S[' + n.scale.map(function (v) { return v.toFixed(3); }).join(' ') + ']';
  if (n.matrix) s += ' MATRIX';
  if (n.mesh !== undefined) s += ' mesh#' + n.mesh;
  return s;
}

function walk(i, d, on) {
  var n = N[i];
  var name = n.name || '?';
  var mine = on ? true : /^gear/i.test(name);
  if (mine) console.log(new Array(d + 1).join('  ') + name + fmt(n));
  var kids = n.children || [];
  for (var k = 0; k < kids.length; k++) walk(kids[k], mine ? d + 1 : 0, mine);
}

var roots = j.scenes[j.scene || 0].nodes;
console.log('=== ' + file);
for (var r = 0; r < roots.length; r++) walk(roots[r], 0, false);
