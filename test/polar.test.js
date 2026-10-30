/* polar.test.js - a polar survey orbit, planned in one key (2026-10-25).
 *
 *     node test/polar.test.js
 *
 * Astra: "we need easier controls to put the ship into a polar orbit for
 * mapping mineral deposits." Sim.polarPlan puts one node on the planner:
 * at the next crossing of the world's spin equator, the burn that leaves
 * the ship circular at that height, pole to pole. This checks that the
 * node really does that when flown, from inclined, eccentric and already
 * equatorial orbits; that it picks the cheaper way round; that it leaves
 * room to start the burn; and that it says why when it cannot.
 */
global.window = global.window || global;
require('../src/vec3.js');
require('../src/rng.js');
var K = require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
var V = global.V;

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}

var sys = Gen.generateSystem('polar-sweep');
var world = sys.bodies.filter(function (b) {
  return b.kind === 'planet' && b.type !== 'gasGiant' && b.type !== 'iceGiant' && b.rotation && b.rotation.tilt > 0.2;
})[0] || sys.bodies.filter(function (b) { return b.kind === 'planet' && b.type === 'rocky'; })[0];
check('a tilted rocky world to orbit', !!world, world ? world.name + ' tilt ' + world.rotation.tilt.toFixed(2) : '');
var pole = (function (b) {
  var rot = b.rotation, tilt = rot ? rot.tilt : 0, az = (rot && rot.az) || 0;
  return { x: Math.sin(tilt) * Math.sin(az), y: -Math.sin(tilt) * Math.cos(az), z: Math.cos(tilt) };
})(world);

/* The ship as the game makes it, with a tank big enough that cost is never
 * the question here (the planner shows cost; it does not refuse on it). */
function fresh(ship) {
  ship.thrusterFuel = Math.max(ship.thrusterFuel || 0, 50);
  return ship;
}
/* Fly the plan as an impulse at its node and read the orbit it leaves. */
function flown(ship, t, p) {
  var plan = Sim.nodePlan(ship, sys, t, Sim.makeNode(p.t, p.dv), { maxSteps: 40000 });
  var bs = Sim.bodyState(world, sys, p.t);
  var rel = V.sub(plan.pos, bs.pos), vrel = V.sub(plan.postVel, bs.vel);
  var oe = K.elementsFromState(rel, vrel, world.mu);
  var h = V.norm(V.cross(rel, vrel));
  return { e: oe.e, tiltOff: Math.abs(V.dot(h, pole)), plan: plan };
}

console.log('--- from an inclined orbit ---');
var t0 = 1000;
var ship = fresh(Sim.circularOrbit(world, sys, t0, world.radius * 0.3, 0.35, 0.7));
var p = Sim.polarPlan(ship, sys, t0);
check('there is a plan', p && !p.why, p && p.why);
if (p && !p.why) {
  var f = flown(ship, t0, p);
  check('flown, it runs over the poles', f.tiltOff < 0.01, 'h.pole ' + f.tiltOff.toFixed(4));
  check('and it is circular', f.e < 0.01, 'e ' + f.e.toFixed(4));
  check('the node is on the equator', (function () {
    var bs = Sim.bodyState(world, sys, p.t);
    var up = V.norm(V.sub(f.plan.pos, bs.pos));
    return Math.abs(V.dot(up, pole)) < 0.01;
  })());
  check('with room to start the burn', p.t - p.burn.lead > t0, 'lead ' + p.burn.lead.toFixed(1) + ' s, node in ' + (p.t - t0).toFixed(0) + ' s');
  /* The other way round costs more. */
  var bs = Sim.bodyState(world, sys, p.t);
  var other = Sim.polarPlan(ship, sys, t0);
  var rel = V.sub(f.plan.pos, bs.pos), r = V.len(rel);
  var vrel = V.sub(f.plan.vel, bs.vel);
  var up = V.scale(rel, 1 / r);
  var north = V.norm(V.sub(pole, V.scale(up, V.dot(pole, up))));
  var vc = Math.sqrt(world.mu / r);
  var a = V.len(V.sub(V.scale(north, vc), vrel)), b = V.len(V.sub(V.scale(north, -vc), vrel));
  check('of the two ways round, the cheaper one', Math.abs(p.magnitude - Math.min(a, b)) < 1e-6 * Math.max(1, a),
        p.magnitude.toFixed(3) + ' km/s vs ' + Math.max(a, b).toFixed(3));
  check('and the same answer twice', other && other.t === p.t && other.magnitude === p.magnitude);
}

console.log('--- from an eccentric orbit ---');
(function () {
  var s2 = fresh(Sim.circularOrbit(world, sys, t0, world.radius * 0.4, 1.1, 2.0));
  /* Stretch it: a prograde kick puts apoapsis up and leaves it eccentric. */
  var bs = Sim.bodyState(world, sys, t0);
  var vrel = V.sub(s2.vel, bs.vel);
  s2.vel = V.add(bs.vel, V.scale(vrel, 1.15));
  var q = Sim.polarPlan(s2, sys, t0);
  check('there is a plan', q && !q.why, q && q.why);
  if (q && !q.why) {
    var f2 = flown(s2, t0, q);
    check('flown, it is polar and circular anyway', f2.tiltOff < 0.01 && f2.e < 0.01,
          'h.pole ' + f2.tiltOff.toFixed(4) + ', e ' + f2.e.toFixed(4));
  }
})();

console.log('--- from the equator itself ---');
(function () {
  /* Velocity along the equator: pole x up. */
  var bs = Sim.bodyState(world, sys, t0);
  var r = world.radius * 1.4;
  var e1 = V.norm(V.cross(pole, { x: 0, y: 0, z: 1 }));
  if (V.len(e1) < 0.5) e1 = { x: 1, y: 0, z: 0 };
  var pos = V.scale(e1, r), vel = V.scale(V.norm(V.cross(pole, e1)), Math.sqrt(world.mu / r));
  var s3 = fresh(Sim.makeShip(V.add(bs.pos, pos), V.add(bs.vel, vel)));
  var q = Sim.polarPlan(s3, sys, t0);
  check('an equatorial orbit has a plan too', q && !q.why, q && q.why);
  if (q && !q.why) {
    var f3 = flown(s3, t0, q);
    check('flown, it is polar', f3.tiltOff < 0.01, 'h.pole ' + f3.tiltOff.toFixed(4));
    check('a right-angle turn costs about root two of orbital speed', Math.abs(q.magnitude / Math.sqrt(world.mu / r) - Math.SQRT2) < 0.05,
          (q.magnitude / Math.sqrt(world.mu / r)).toFixed(3) + ' x v');
  }
})();

console.log('--- when there is nothing to plan ---');
(function () {
  var star = sys.root;
  var s4 = fresh(Sim.circularOrbit(star, sys, t0, star.radius * 200, 0, 0));
  var q = Sim.polarPlan(s4, sys, t0);
  check('round a star, it says why', q && q.why, q && q.why);
  var bs = Sim.bodyState(world, sys, t0);
  var away = fresh(Sim.makeShip(V.add(bs.pos, { x: world.radius * 2, y: 0, z: 0 }),
                                V.add(bs.vel, { x: 0, y: 30, z: 0 })));
  var q2 = Sim.polarPlan(away, sys, t0);
  check('on an escape, it says why', q2 && q2.why, q2 && q2.why);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
