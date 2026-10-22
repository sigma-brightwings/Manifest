// Builds _ship-cut-editor.html: every factory family at one size, from above
// and from the side, with draggable cut lines on all three axes.
//   node "Claude outputs/ship-cuts-editor.cjs" [--size m]
// Length cuts (fractions from the nose) start from tools/ship-cuts.json.
// Deck cuts (fractions from the keel up) and side cuts (fractions of the
// half-width out from the centreline, always a mirrored pair) start empty.
// The page keeps its edits in localStorage and exposes them as window.CUTS.
var fs = require('fs'), path = require('path');
var args = process.argv.slice(2);
var SIZE = args.indexOf('--size') >= 0 ? args[args.indexOf('--size') + 1] : 'm';
var ROOT = path.join(__dirname, '..');
var DIR = path.join(ROOT, 'ref', 'glb');
var TABLE = path.join(ROOT, 'tools', 'ship-cuts.json');
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
function nameOf(j, n) { return n.name || (n.children || []).map(function (c) { return j.nodes[c].name || ''; }).join(' '); }
function r3(v) { return Math.round(v * 1000) / 1000; }
function load(file) {
  var j = readGlb(file), root = j.nodes[(j.scenes[j.scene || 0].nodes || [0])[0]];
  return (root.children || []).map(function (i) {
    var n = j.nodes[i], t = [];
    (function walk(idx, M) {
      var nd = j.nodes[idx], m = mul(M, mat(nd));
      if (nd.mesh !== undefined) j.meshes[nd.mesh].primitives.forEach(function (p) {
        if (p.mode !== undefined && p.mode !== 4) return;
        var pos = accessor(j, p.attributes.POSITION), ix = p.indices !== undefined ? accessor(j, p.indices) : null;
        var cnt = ix ? ix.length : pos.length / 3;
        for (var k = 0; k < cnt; k++) { var q = ix ? ix[k] : k; xf(m, pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]).forEach(function (v) { t.push(r3(v)); }); }
      });
      (nd.children || []).forEach(function (c) { walk(c, m); });
    })(i, mat({}));
    return { w: WING.test(nameOf(j, n)) ? 1 : 0, t: t };
  }).filter(function (p) { return p.t.length; });
}
var table = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : {};
var ships = fs.readdirSync(DIR).filter(function (f) { return new RegExp('-' + SIZE + '\\.glb$').test(f); }).sort().map(function (f) {
  /* Per size: this size's own cuts if Astra has set them, else M's as the
   * starting point (a larger hull may add decks and segments M does not have). */
  var fam = f.replace(/-[sml]\.glb$/, ''), fr = table[fam] || {};
  var row = fr[SIZE] || fr.m || { z: [0.3, 0.7], y: [], x: [] };
  return { fam: fam, own: !!fr[SIZE], parts: load(path.join(DIR, f)), cuts: { z: row.z.slice(), y: row.y.slice(), x: row.x.slice() } };
});

var page = fs.readFileSync(path.join(__dirname, 'ship-cuts-editor.page.html'), 'utf8')
  .replace('/*SIZE*/', JSON.stringify(SIZE)).replace('/*DATA*/', JSON.stringify(ships));
var outName = '_ship-cut-editor-' + SIZE + '.html';
fs.writeFileSync(path.join(ROOT, outName), page);
console.log('wrote ' + outName + ', ' + ships.length + ' ships, ' + Math.round(page.length / 1024) + ' KB');
