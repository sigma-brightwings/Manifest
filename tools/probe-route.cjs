/* probe-route.cjs — one berth's transfer polyline, corner by corner, in
 * metres in the model frame (2026-11-09, station grid).
 *     node tools/probe-route.cjs cradle-m 0
 */
global.window = global.window || global;
require('../src/vec3.js'); require('../src/economy.js');
var Gen = require('../src/generate.js'); var Sim = require('../src/sim.js');
require('../src/hulls.js'); require('../src/ports.js');
var Render = require('../src/render.js');
var id = process.argv[2] || 'cradle-m', b = +(process.argv[3] || 0);
var fx = Gen.generateSystem('arrival-sweep').ports.filter(function (p) { return !p.surface; })[0];
Render.portModelFor = function () { return id; };
var p = Sim.arrivalPath(fx, b);
var T = 8, pl = [p[T]].concat(p.through, [p[T + 1]]), r = fx.radius * 1000;
console.log(id, 'b' + b, 'ride@', p.rideAt, 'mover', p.rideMover, 'blocked', p.blocked, 'offAxis', p.offAxis);
var mv = (global.PortLib[id].movers || []).filter(function (m) { return m.node === p.rideMover; })[0];
if (mv) console.log('mover axis', JSON.stringify(mv.axis));
pl.forEach(function (q, i) {
  var d = i ? [(q.x - pl[i - 1].x) * r, (q.y - pl[i - 1].y) * r, (q.z - pl[i - 1].z) * r] : [0, 0, 0];
  console.log(String(i).padStart(3), (i === p.rideAt ? 'BOARD ' : i === p.rideAt + 1 ? 'ALIGHT' : '      '),
    [q.x * r, q.y * r, q.z * r].map(function (v) { return v.toFixed(0).padStart(7); }).join(' '),
    '   d', d.map(function (v) { return v.toFixed(0).padStart(6); }).join(' '));
});
