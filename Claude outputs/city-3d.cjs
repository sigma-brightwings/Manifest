// Low-angle views of one port's city: the tubes at the doors, the trunk at the wall.
// node city-3d.cjs model seed [yawDeg pitchDeg]
global.window = global;
var fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
['vec3', 'kepler', 'hulls', 'ports', 'port-sites'].forEach(function (m) { require(path.join(ROOT, 'src', m + '.js')); });
var R = require(path.join(ROOT, 'src', 'render.js'));
var id = process.argv[2] || 'pad-city-site-l', seed = +(process.argv[3] || 0.07);
var port = { id: 'v', surface: true, dressing: { citySeed: seed } };
var sp = R.citySpot(id, port), lay = sp.layout;
var tris = [];
function col(c) { c = String(c || '#8a909a'); var lit = c.indexOf('!') >= 0; c = c.replace(/^[!~0-9]*/, ''); if (!/^#[0-9a-f]{6}$/i.test(c)) c = '#8a909a'; return { c: c, lit: lit }; }
R.cityDrawList(id, port).forEach(function (it) {
  it.mesh.f.forEach(function (t, i) {
    tris.push({ p: t.map(function (vi) { return R.cityPlace(it.chain, it.mesh.v[vi]); }), k: col(it.mesh.c && it.mesh.c[i]) });
  });
});
/* the port's own ground and buildings near the city */
var lib = R.libPort(id), B = lay ? R.cityPlace([sp], process.argv[4] === 'wall' ? [lay.face.at[0], lay.face.at[1], 0] : [lay.branch[0], lay.branch[1], 0]) : [sp.x, sp.y, 0];
lib.shell.f.forEach(function (t, i) {
  var p = t.map(function (vi) { return lib.shell.v[vi]; });
  var cx = (p[0][0] + p[1][0] + p[2][0]) / 3, cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
  if (Math.hypot(cx - B[0], cy - B[1]) < 0.5 && Math.min(p[0][2], p[1][2], p[2][2]) > -0.05) tris.push({ p: p, k: col(lib.shell.c && lib.shell.c[i]) });
});
var views = [[30, 18], [150, 14], [260, 22], [330, 10]];
var panels = views.map(function (v) {
  var yaw = v[0] * Math.PI / 180, pit = v[1] * Math.PI / 180, W = 640, H = 420, S = (process.argv[4] === 'wall' ? 5200 : 1500);
  function P(q) {
    var x = q[0] - B[0], y = q[1] - B[1], z = q[2];
    var X = x * Math.cos(yaw) - y * Math.sin(yaw), Y = x * Math.sin(yaw) + y * Math.cos(yaw);
    var sy = Y * Math.sin(pit) - z * Math.cos(pit), depth = -Y * Math.cos(pit) - z * Math.sin(pit);
    return [W / 2 + X * S, H * 0.62 + sy * S, depth];
  }
  var out = tris.map(function (t) {
    var q = t.p.map(P);
    var a = t.p[0], b = t.p[1], c = t.p[2];
    var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    var n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
    var k = t.k.lit ? 1.2 : 0.45 + 0.55 * Math.abs((n[0] * 0.4 + n[1] * 0.3 + n[2] * 0.85) / l);
    var h = t.k.c, rgb = [1, 3, 5].map(function (i) { return Math.min(255, Math.round(parseInt(h.substr(i, 2), 16) * k)); });
    return { d: q.map(function (s) { return s[0].toFixed(1) + ',' + s[1].toFixed(1); }).join(' '), z: (q[0][2] + q[1][2] + q[2][2]) / 3, f: 'rgb(' + rgb.join(',') + ')' };
  }).sort(function (a, b) { return b.z - a.z; });
  return '<svg width=' + W + ' height=' + H + ' style="background:#1a2230">' + out.map(function (o) { return '<polygon points="' + o.d + '" fill="' + o.f + '" stroke="' + o.f + '" stroke-width="0.3"/>'; }).join('') + '</svg>';
});
fs.writeFileSync(path.join(__dirname, 'city-3d.html'), '<!doctype html><body style="margin:0;background:#0b0e14;display:flex;flex-wrap:wrap;gap:4px">' + panels.join('') + '</body>');
console.log('ok', id, seed, lay ? 'network, trunk into shed ' + lay.face.s + ' wall ' + lay.face.n : 'whole');
