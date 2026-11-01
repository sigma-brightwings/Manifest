/* measure-encounters.cjs — how many peaceful civilian ships you would come
 * across, near a port and out on a lane between worlds (2026-11-01).
 *
 *     node tools/measure-encounters.cjs
 *
 * "Near" is Sim.WAKE_RANGE (3,000 km), the bubble in which a ship comes off
 * its rail and becomes something you can hail, trade with or fly beside.
 * Two places a pilot actually is:
 *   PORT  a point 1,000 km off a port, at a random time;
 *   LANE  a point beside an interplanetary hull in cruise (her own count
 *         excluded), i.e. what you see flying that run.
 */
'use strict';
global.window = global.window || global;
['vec3', 'rng', 'kepler', 'economy', 'generate', 'sim'].forEach(function (m) { require('../src/' + m + '.js'); });
var Galaxy = require('../src/galaxy.js');
var V = global.V, Sim = global.Sim, Gen = global.Gen;
var R = 3000;
var port = [], lane = [], portSib = [], portLone = [], laneNone = 0, portNone = 0, routes = [];
['kawartha', 'alpha', 'pigeon', 'manifest', 'reverie', 'orrin'].forEach(function (seed) {
  var g = Galaxy.build(seed);
  for (var s = 0; s < g.stars.length && s < 30; s++) {
    var star = g.stars[s];
    if (!star.factionId) continue;
    var sys = Gen.generateSystem(star.seed, Galaxy.systemOpts(g, star));
    if (!sys.ports || sys.ports.length < 2) continue;
    routes.push((sys.traffic || []).length);
    for (var k = 0; k < 12; k++) {
      var t = 2e6 + k * 51234;
      var list = Sim.trafficAll(sys, t).filter(function (x) { return x.pos && x.phase !== 'moored' && !x.landed && !x.inside && !(x.route && x.route.runner); });
      sys.ports.forEach(function (p) {
        var pp = Sim.bodyPosition(p, sys, t);
        if (!pp) return;
        var here = V.add(pp, { x: 1000, y: 0, z: 0 });
        var n = list.filter(function (x) { return V.dist(x.pos, here) < R; }).length;
        port.push(n); if (!n) portNone++;
        var sib = sys.ports.some(function (q) { return q !== p && q.parentBody === p.parentBody; });
        (sib ? portSib : portLone).push(n);
      });
      list.forEach(function (x) {
        if (!x.route || x.route.local || x.phase !== 'cruise') return;
        var n = list.filter(function (y) { return y !== x && V.dist(y.pos, x.pos) < R; }).length;
        lane.push(n); if (!n) laneNone++;
      });
    }
  }
});
function stats(a) {
  a = a.slice().sort(function (x, y) { return x - y; });
  var mean = a.reduce(function (p, c) { return p + c; }, 0) / (a.length || 1);
  return 'n=' + a.length + ' mean ' + mean.toFixed(2) + ' median ' + a[Math.floor(a.length / 2)] + ' p90 ' + a[Math.floor(a.length * 0.9)];
}
console.log('routes per system:', stats(routes));
console.log('PORT: ships within ' + R + ' km:', stats(port), ' empty ' + (100 * portNone / port.length).toFixed(0) + '%');
console.log('  port with a sibling over her world:', stats(portSib), ' empty ' + (100 * portSib.filter(function (x) { return !x; }).length / (portSib.length || 1)).toFixed(0) + '%');
console.log('  port alone over her world:        ', stats(portLone), ' empty ' + (100 * portLone.filter(function (x) { return !x; }).length / (portLone.length || 1)).toFixed(0) + '%');
console.log('LANE: other ships within ' + R + ' km:', stats(lane), ' empty ' + (100 * laneNone / lane.length).toFixed(0) + '%');
