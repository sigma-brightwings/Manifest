/* How much of each hull's walkable interior is inside her own skin. */
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Combat = require('../src/combat.js');
require('../src/crew.js'); require('../src/hulls.js'); require('../src/walk.js'); require('../src/shipdeck.js');
require('../src/render.js');
var R = global.Render, H = Combat.HULLS;
function inside(mesh, p) {
  /* parity of a ray along +x, plus +y as a second vote */
  var votes = 0;
  [[1, 0.0001, 0.0002], [0.0002, 1, 0.0001]].forEach(function (d) {
    var n = 0;
    mesh.f.forEach(function (f) {
      var a = mesh.v[f[0]], b = mesh.v[f[1]], c = mesh.v[f[2]];
      var e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      var h = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
      var det = e1[0]*h[0]+e1[1]*h[1]+e1[2]*h[2]; if (Math.abs(det) < 1e-14) return;
      var s = [p[0]-a[0], p[1]-a[1], p[2]-a[2]], u = (s[0]*h[0]+s[1]*h[1]+s[2]*h[2]) / det; if (u < 0 || u > 1) return;
      var q = [s[1]*e1[2]-s[2]*e1[1], s[2]*e1[0]-s[0]*e1[2], s[0]*e1[1]-s[1]*e1[0]];
      var v = (d[0]*q[0]+d[1]*q[1]+d[2]*q[2]) / det; if (v < 0 || u + v > 1) return;
      var t = (e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2]) / det; if (t > 0) n++;
    });
    if (n % 2) votes++;
  });
  return votes >= 1;
}
var out = [];
Object.keys(H).forEach(function (id) {
  var ship = { hullId: id, bornId: 'fit|' + id, dryMass: H[id].dryMass, cargo: {}, pos: { x: 0, y: 0, z: 0 },
               fwd: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, right: { x: -1, y: 0, z: 0 } };
  var d = R.shipInterior(ship); if (!d) return;
  var mesh = R.hullPreviewMesh ? R.hullPreviewMesh(id, ship) : null;
  if (!mesh || !mesh.f) { out.push(id + ': no mesh'); return; }
  var L = R.hullLength(ship) * 1000, at = R.cockpitAt ? (R.cockpitAt(ship) || [0, 0, 0]) : [0, 0, 0];
  var plans = d.plan.decks ? Object.keys(d.plan.decks).map(function (k) { return d.plan.decks[k]; }) : [d.plan];
  /* The uniform scale her hull would need for every non-cockpit point to be inside. */
  var pts = [];
  plans.forEach(function (p) {
    (p.rooms || []).forEach(function (r) {
      if (r.kind === 'ramp' || r.kind === 'cockpit') return;
      [[r.x0 + 0.2, r.z0 + 0.2], [r.x1 - 0.2, r.z0 + 0.2], [r.x0 + 0.2, r.z1 - 0.2], [r.x1 - 0.2, r.z1 - 0.2]].forEach(function (c) {
        pts.push([at[0] + c[0], at[1] + p.floorY + 0.1, at[2] + c[1]]); pts.push([at[0] + c[0], at[1] + p.floorY + 2.1, at[2] + c[1]]);
      });
    });
  });
  var need = null;
  for (var sc = 1; sc <= 4.01; sc += 0.1) {
    if (pts.every(function (q) { return inside(mesh, [q[0] / (L * sc), q[1] / (L * sc), q[2] / (L * sc)]); })) { need = sc; break; }
  }
  var tot = 0, inn = 0, worst = '';
  out.push('   ' + id + ' needs x' + (need ? need.toFixed(1) : '>4') + ' to hold every room');
  plans.forEach(function (p) {
    (p.rooms || []).forEach(function (r) {
      if (r.kind === 'ramp') return;
      var ys = [p.floorY + 0.2, p.floorY + 2.0];
      [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]].forEach(function (c) {
        ys.forEach(function (y) {
          tot++;
          var m = [(at[0] + c[0]) / L, (at[1] + y) / L, (at[2] + c[1]) / L];
          if (inside(mesh, m)) inn++; else if (!worst) worst = r.kind + '@' + c.map(function (v) { return v.toFixed(1); }).join(',');
        });
      });
    });
  });
  out.push(id + ' (' + (H[id].mesh) + ', ' + L.toFixed(0) + ' m): ' + inn + '/' + tot + ' inside' + (worst ? '  first out: ' + worst : ''));
});
console.log(out.join('\n'));
