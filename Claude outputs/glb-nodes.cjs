// List a glb's node tree: name, mesh, triangle count, translation. node glb-nodes.cjs file.glb [filter]
var fs = require('fs');
var buf = fs.readFileSync(process.argv[2]);
var jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
var filt = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
function tris(mi) {
  if (mi === undefined) return 0;
  var n = 0;
  J.meshes[mi].primitives.forEach(function (p) { n += p.indices !== undefined ? J.accessors[p.indices].count / 3 : J.accessors[p.attributes.POSITION].count / 3; });
  return n;
}
function walk(i, d, path) {
  var nd = J.nodes[i], name = nd.name || ('#' + i), p = path + '/' + name;
  var sub = 0;
  (nd.children || []).forEach(function (c) { sub += walk(c, d + 1, p); });
  var t = tris(nd.mesh) + sub;
  if (d <= (filt ? 99 : 3) && (!filt || filt.test(name)))
    console.log('  '.repeat(d) + name + '  tris ' + t + (nd.translation ? '  t ' + nd.translation.map(function (v) { return v.toFixed(1); }).join(',') : '') +
      ((nd.children || []).length ? '  kids ' + nd.children.length : ''));
  return t;
}
(J.scenes[J.scene || 0].nodes).forEach(function (r) { walk(r, 0, ''); });
