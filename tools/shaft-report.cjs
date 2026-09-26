/* shaft-report.cjs — where each model needs a real lift shaft.
 *
 *     node tools/shaft-report.cjs [ports.js] [id-filter-regex]
 *
 * glb2hulls writes a `shaft` on every berth whose route in could only be
 * made by an elevator across decks the art does not connect. This lists
 * them per model, de-duplicated (several berths often share one missing
 * shaft), with both ends in the model's own metres and glTF axes (+Y up),
 * the length, the angle off vertical, and the carrier volume it passes
 * through if the art already has a lift there that is not yet open. */
'use strict';
var path = require('path');
global.window = global;
require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'src', 'ports.js')));
var re = new RegExp(process.argv[3] || '.');
var lib = global.PortLib;

/* Game axes are (x, -glTF z, glTF y); back to glTF for the builder. */
var O = [0, 0, 0];
function gltf(p, s) {
  var g = [p[0] * s + O[0], p[1] * s + O[1], p[2] * s + O[2]];
  return [g[0], g[2], -g[1]].map(function (v) { return v.toFixed(1); }).join(', ');
}

Object.keys(lib).sort().forEach(function (id) {
  if (!re.test(id)) return;
  var m = lib[id], s = m.metresPerUnit || 1;
  O = m.origin || [0, 0, 0];
  var bs = (m.anchors && m.anchors.berths) || [];
  var shafts = [];
  bs.forEach(function (b) {
    if (!b.shaft) return;
    var sh = b.shaft, hit = null;
    shafts.forEach(function (o) {
      var d = Math.hypot(o.from[0] - sh.from[0], o.from[1] - sh.from[1], o.from[2] - sh.from[2]) +
              Math.hypot(o.to[0] - sh.to[0], o.to[1] - sh.to[1], o.to[2] - sh.to[2]);
      if (d < 0.05) hit = o;
    });
    if (hit) hit.berths.push(b.node);
    else shafts.push({ from: sh.from, to: sh.to, len: sh.len, deg: sh.deg, carrier: sh.carrier, berths: [b.node] });
  });
  var total = bs.filter(function (b) { return b.cls === 'SM' || m.entrances; }).length;
  console.log('\n' + id + '  (' + s + ' m per unit)  ' + shafts.length + ' missing shaft(s), ' +
              bs.filter(function (b) { return b.shaft; }).length + ' of ' + total + ' routed berths need one');
  shafts.forEach(function (o, i) {
    console.log('  ' + (i + 1) + '. ' + (o.len * s).toFixed(1) + ' m, ' + o.deg + ' deg off vertical' +
                (o.carrier ? ', through existing "' + o.carrier + '"' : ', NO lift in the art here'));
    console.log('     glTF from (' + gltf(o.from, s) + ')  to (' + gltf(o.to, s) + ')');
    console.log('     serves ' + o.berths.join(', '));
  });
});

/* ---- what is in the way (optional: pass --glb <folder>) ----------------
 * For each missing shaft, the named nodes whose own geometry the straight
 * line passes through, sampled along it: the plate, wall or closed hatch a
 * real shaft has to be cut through. Read from the .glb in its own axes. */
var gi = process.argv.indexOf('--glb');
if (gi > 0) {
  var fs = require('fs');
  var dirG = path.resolve(process.argv[gi + 1]);
  function J(f) { var b = fs.readFileSync(f), jl = b.readUInt32LE(12); return { j: JSON.parse(b.slice(20, 20 + jl).toString('utf8')), bin: b.slice(20 + jl + 8) }; }
  function mul(a, b) { var o = new Array(16).fill(0); for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) for (var k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; }
  function trs(t, q, s) { t = t || [0, 0, 0]; q = q || [0, 0, 0, 1]; s = s || [1, 1, 1]; var x = q[0], y = q[1], z = q[2], w = q[3]; var m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]; for (var i = 0; i < 3; i++) { m[i] *= s[0]; m[4 + i] *= s[1]; m[8 + i] *= s[2]; } return m; }
  function ap(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
  Object.keys(lib).sort().forEach(function (id) {
    if (!re.test(id)) return;
    var f = path.join(dirG, id + '.glb');
    if (!fs.existsSync(f)) return;
    var m = lib[id], s = m.metresPerUnit || 1, O2 = m.origin || [0, 0, 0];
    var bs = ((m.anchors && m.anchors.berths) || []).filter(function (b) { return b.shaft; });
    if (!bs.length) return;
    var g = J(f), j = g.j, boxes = [];
    function acc(i) { var a = j.accessors[i], bv = j.bufferViews[a.bufferView], off = (bv.byteOffset || 0) + (a.byteOffset || 0), out = []; for (var k = 0; k < a.count; k++) { var o = off + k * (bv.byteStride || 12); out.push([g.bin.readFloatLE(o), g.bin.readFloatLE(o + 4), g.bin.readFloatLE(o + 8)]); } return out; }
    function walk(i, pm) {
      var n = j.nodes[i], mm = mul(pm, n.matrix || trs(n.translation, n.rotation, n.scale));
      if (n.mesh !== undefined && n.name) {
        var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
        j.meshes[n.mesh].primitives.forEach(function (p) { acc(p.attributes.POSITION).forEach(function (v) { var w = ap(mm, v); for (var a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], w[a]); hi[a] = Math.max(hi[a], w[a]); } }); });
        boxes.push({ name: n.name, lo: lo, hi: hi, vol: (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) });
      }
      (n.children || []).forEach(function (c) { walk(c, mm); });
    }
    var id4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    j.scenes[j.scene || 0].nodes.forEach(function (r) { walk(r, id4); });
    console.log('\n' + id + ' - in the way:');
    var done = {};
    bs.forEach(function (b) {
      var key = b.shaft.from.join() + b.shaft.to.join();
      if (done[key]) return;
      done[key] = true;
      function toG(p) { var q = [p[0] * s + O2[0], p[1] * s + O2[1], p[2] * s + O2[2]]; return [q[0], q[2], -q[1]]; }
      var A = toG(b.shaft.from), B = toG(b.shaft.to), hits = {};
      for (var t = 0; t <= 20; t++) {
        var u = t / 20, p = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
        boxes.forEach(function (bx) {
          if (p[0] >= bx.lo[0] && p[0] <= bx.hi[0] && p[1] >= bx.lo[1] && p[1] <= bx.hi[1] && p[2] >= bx.lo[2] && p[2] <= bx.hi[2] && bx.vol < 5e4) hits[bx.name] = 1;
        });
      }
      console.log('  ' + b.node + ': ' + (Object.keys(hits).slice(0, 12).join(', ') || '(nothing named)'));
    });
  });
}
