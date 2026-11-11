/* probe-lanes.cjs — what the transfer routes look like today, before the
 * station grid (2026-11-09). For each orbital model with routed berths:
 * every leg of the transfer polyline, its length in metres, and how far it
 * is from the nearest model axis — i.e. how much of today's route is
 * diagonal glide rather than graph paper.
 *
 *     node tools/probe-lanes.cjs [model-substring]
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
var Render = require('../src/render.js');

var only = process.argv[2] || '';
var lib = global.PortLib;
var fx = Gen.generateSystem('arrival-sweep').ports.filter(function (p) { return !p.surface; })[0];
var DEG = 180 / Math.PI;
var totals = { legs: 0, diag: 0, km: 0, diagKm: 0 };
Object.keys(lib).forEach(function (id) {
  if (only && id.indexOf(only) < 0) return;
  var m = lib[id];
  if (!m || m.kind !== 'orbital' || !m.anchors || !m.anchors.berths || /-site-/.test(id)) return;
  /* Force the model outright: a fixture port whose role names a model of
   * its own (a yard) ignores the orbital pool's assignment. */
  var keepFor = Render.portModelFor;
  Render.portModelFor = function () { return id; };
  fx.radius = (fx.radius || 1) + 1e-9 * Math.random();   // a fresh cache key per model
  var n = Gen.modelledBerths(fx).length;
  var mpu = m.metresPerUnit || 100, rows = [];
  for (var i = 0; i < n; i++) {
    var r = Gen.berthRoute(fx, i);
    if (!r) continue;
    var p = Sim.arrivalPath(fx, i);
    if (!p || !p.through) continue;
    var T = 8;
    var pl = [p[T]].concat(p.through, [p[T + 1]]);
    var desc = [];
    for (var k = 1; k < pl.length; k++) {
      var dx = pl[k].x - pl[k - 1].x, dy = pl[k].y - pl[k - 1].y, dz = pl[k].z - pl[k - 1].z;
      var l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 1e-9) continue;
      var off = Math.acos(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / l) * DEG;
      var metres = l * (fx.radius || 1) * 1000;
      totals.legs++; totals.km += metres / 1000;
      if (off > 2) { totals.diag++; totals.diagKm += metres / 1000; }
      desc.push(Math.round(metres) + 'm@' + Math.round(off) + (k - 1 === p.rideAt ? 'R' : ''));
    }
    rows.push('  b' + i + ' (entry ' + r.entry + (p.car ? ', car' : '') + (p.carriage ? ', carriage' : '') +
              (p.rideAt >= 1 ? ', ride@' + p.rideAt : '') + (p.blocked ? ', BLOCKED ' + p.blocked : '') +
              (p.offAxis ? ', OFF-PAPER ' + p.offAxis : '') + '): ' + desc.join(' '));
    totals.offPaper = (totals.offPaper || 0) + (p.offAxis || 0);
    totals.blocked = (totals.blocked || 0) + (p.blocked || 0);
  }
  if (rows.length) console.log(id + '  (r ' + (fx.radius || 1).toFixed(2) + ' km)\n' + rows.join('\n'));
  Render.portModelFor = keepFor;
});
console.log('\nlegs ' + totals.legs + ', off-axis (>2 deg) ' + totals.diag +
            '; ' + totals.km.toFixed(1) + ' km routed, ' + totals.diagKm.toFixed(1) + ' km of it off-axis' +
            '; legs nothing could put on paper ' + (totals.offPaper || 0) + ', blocked legs ' + (totals.blocked || 0));
