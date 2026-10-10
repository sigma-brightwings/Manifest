/* nodes.test.js — manoeuvre nodes, checked against the textbook.
 *
 *     node test/nodes.test.js
 *
 * The rule the other physics suites follow applies here too: check against
 * an analytic result, never against our own output. A node's whole promise
 * is "this burn gives you THAT orbit", so the tests are the vis-viva
 * equation, the Hohmann transfer, and Tsiolkovsky — not a recording of what
 * the code happened to produce the day it was written.
 */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
var K = require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
var Eco = require(path.join(SRC, 'economy.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Sim = require(path.join(SRC, 'sim.js'));

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '   ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '   ' + detail : '')); }
}
function approx(a, b, relTol) {
  if (b === 0) return Math.abs(a) < (relTol || 1e-9);
  return Math.abs(a - b) / Math.abs(b) < (relTol || 1e-9);
}
function section(t) { console.log('\n' + t); }

var sys = Gen.generateSystem('kawartha');
var PLANET = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];

/* An isolated two-body world. The real system has a star and moons pulling
 * on everything, which is correct for the game and a nuisance for a test
 * that wants to compare against a closed-form conic — so several of the
 * checks below run against a lone planet in an empty universe, where the
 * analytic answer is exactly right rather than nearly right. */
function loneWorld(body) {
  return {
    bodies: [body], gravBodies: [body], ports: [], pads: [], routes: [],
    patrols: [], byId: (function () { var m = {}; m[body.id] = body; return m; })(),
    star: body,
    // finalize() normally hangs this on a generated system; bodyState memoises
    // one timestamp's worth of positions into it and expects it to exist.
    _cache: { t: null, pos: {}, vel: {} }
  };
}
var LONE = loneWorld({
  id: 'test-world', name: 'Testworld', kind: 'planet',
  radius: PLANET.radius, mass: PLANET.mass, mu: PLANET.mu,
  orbit: null, parentBody: null
});

/* ---- 1. the orbital basis --------------------------------------------- */
section('the orbital basis a node is expressed in');
(function () {
  var ship = Sim.circularOrbit(LONE.bodies[0], LONE, 0, 800);
  var b = Sim.orbitalBasisAt(ship.pos, ship.vel, LONE, 0);

  /* These two names collided once and it cost a docking system: a second
   * top-level `orbitalBasis` silently shadowed the two-argument helper the
   * docking code had always used, so every dockShip call ran with sys and t
   * undefined. They answer different questions and both are exported, so
   * pin the difference here — if they are ever merged or re-collided, this
   * fails instead of docking failing. */
  check('orbitalBasisAt and the docking helper are different functions',
        Sim.orbitalBasisAt !== Sim.orbitalBasis &&
        Sim.orbitalBasis.length === 2 && Sim.orbitalBasisAt.length === 4);
  check('only the node one works out which body you are orbiting',
        !!b.body && b.body === LONE.bodies[0] &&
        Sim.orbitalBasis(ship.pos, ship.vel).body === undefined);

  check('prograde, radial and normal are unit vectors',
        approx(V.len(b.prograde), 1, 1e-12) && approx(V.len(b.radial), 1, 1e-12) &&
        approx(V.len(b.normal), 1, 1e-12));
  check('the three axes are mutually perpendicular on a circular orbit',
        Math.abs(V.dot(b.prograde, b.radial)) < 1e-12 &&
        Math.abs(V.dot(b.prograde, b.normal)) < 1e-12 &&
        Math.abs(V.dot(b.radial, b.normal)) < 1e-12);
  check('radial points away from the body, not toward it',
        V.dot(b.radial, V.sub(ship.pos, Sim.bodyPosition(LONE.bodies[0], LONE, 0))) > 0);
  check('normal is r x v, so the set is right-handed',
        V.len(V.sub(V.cross(b.radial, b.prograde), b.normal)) < 1e-9);

  /* The axes must be the SAME ones the manual thrust keys push along, or a
   * plan cannot be flown by hand. main.js builds its frame the same way;
   * this pins the convention so a change to either has to change both. */
  var rel = V.sub(ship.pos, Sim.bodyPosition(LONE.bodies[0], LONE, 0));
  var vrel = V.sub(ship.vel, Sim.bodyVelocity(LONE.bodies[0], LONE, 0));
  check('prograde is the relative velocity direction, not the absolute one',
        V.len(V.sub(b.prograde, V.norm(vrel))) < 1e-12);
  check('radial is the relative position direction',
        V.len(V.sub(b.radial, V.norm(rel))) < 1e-12);
})();

/* ---- 2. the burn a node asks for -------------------------------------- */
section('what a node costs (Tsiolkovsky, independently)');
(function () {
  var ship = Sim.circularOrbit(LONE.bodies[0], LONE, 0, 800);
  var dv = 0.4;                                  // km/s
  var burn = Sim.nodeBurn(ship, dv);

  // Independent rocket equation: m1 = m0 * exp(-dv/ve).
  var m0 = Sim.shipMass(ship);
  var ve = ship.thrusterIsp * 9.80665e-3;        // km/s
  var expected = m0 - m0 * Math.exp(-dv / ve);
  check('propellant matches the rocket equation',
        approx(burn.fuel, expected, 1e-12),
        burn.fuel.toFixed(6) + ' t vs ' + expected.toFixed(6) + ' t');

  // Independent mass flow: mdot = F / (Isp * g0).
  var mdot = (ship.thrustKN * 1000) / (ship.thrusterIsp * 9.80665) / 1000;  // t/s
  check('burn time is propellant over mass flow',
        approx(burn.duration, expected / mdot, 1e-12),
        burn.duration.toFixed(4) + ' s');

  /* A burn is not instantaneous and the plan must not pretend it is. Half
   * the delta-v early and half late is the standard centring, and it is the
   * difference between arriving on the planned orbit and arriving late. */
  check('ignition leads the node by exactly half the burn',
        approx(burn.lead, burn.duration / 2, 1e-15));

  check('a zero-delta-v node costs nothing and takes no time',
        Sim.nodeBurn(ship, 0).fuel === 0 && Sim.nodeBurn(ship, 0).duration === 0);

  /* Feasibility is about the tank. Worth knowing how big that actually is:
   * at an exhaust velocity of ~4400 km/s the thruster tank is good for
   * something like 700 km/s of delta-v, so "too big to fly" is a number no
   * orbital manoeuvre will ever reach. The check still matters — it is what
   * stops the autopilot arming on a plan it cannot finish — but the honest
   * reading is that reaction mass constrains ENDURANCE, not delta-v, which
   * is why the instruments quote burn time rather than a delta-v budget. */
  var huge = Sim.nodeBurn(ship, 2000);
  check('a plan larger than the tank is marked infeasible',
        !huge.feasible && huge.fuel > ship.thrusterFuel,
        huge.fuel.toFixed(2) + ' t needed, ' + ship.thrusterFuel + ' t aboard');
  check('and a plan within it is not', Sim.nodeBurn(ship, 0.4).feasible);

  /* Cost scales with mass, which is the whole point of carrying cargo
   * being a decision rather than a number on a screen. */
  var laden = Sim.circularOrbit(LONE.bodies[0], LONE, 0, 800);
  laden.cargo = { metals: 64 };
  Sim.refreshShip(laden);
  var ladenBurn = Sim.nodeBurn(laden, dv);
  check('the same plan costs a laden ship more propellant and more time',
        ladenBurn.fuel > burn.fuel * 1.3 && ladenBurn.duration > burn.duration * 1.3,
        burn.duration.toFixed(2) + ' s empty vs ' + ladenBurn.duration.toFixed(2) + ' s full');
})();

/* ---- 3. the orbit the burn buys --------------------------------------- */
section('the resulting orbit (vis-viva and Hohmann)');
(function () {
  var body = LONE.bodies[0];
  var mu = body.mu;
  var alt = 800;
  var r1 = body.radius + alt;
  var ship = Sim.circularOrbit(body, LONE, 0, alt);

  /* A prograde burn at any point of a circular orbit raises the apoapsis to
   * a radius the vis-viva equation predicts exactly. This is the single
   * most important assertion in the file: it is the claim the whole feature
   * makes to the player. */
  var dv = 0.25;
  var node = Sim.makeNode(400, { pro: dv });
  var plan = Sim.nodePlan(ship, LONE, 0, node, { samples: 40 });

  var vCirc = Math.sqrt(mu / r1);
  var v2 = vCirc + dv;
  var aExpected = 1 / (2 / r1 - (v2 * v2) / mu);
  var apoExpected = 2 * aExpected - r1;          // the burn point is periapsis

  check('the burn is applied at the radius the coast actually reaches',
        approx(V.len(V.sub(plan.pos, Sim.bodyPosition(body, LONE, plan.node.t))), r1, 1e-6),
        'r = ' + V.len(V.sub(plan.pos, Sim.bodyPosition(body, LONE, plan.node.t))).toFixed(3));
  check('the delta-v magnitude is the vector the player asked for',
        approx(plan.magnitude, dv, 1e-12));
  check('semi-major axis after the burn matches vis-viva',
        approx(plan.after.a, aExpected, 1e-7),
        plan.after.a.toFixed(3) + ' vs ' + aExpected.toFixed(3) + ' km');
  check('apoapsis after the burn matches vis-viva',
        approx(plan.after.apoapsis, apoExpected, 1e-7),
        plan.after.apoapsis.toFixed(3) + ' vs ' + apoExpected.toFixed(3) + ' km');
  check('periapsis is left where the burn happened',
        approx(plan.after.periapsis, r1, 1e-7),
        plan.after.periapsis.toFixed(3) + ' km');
  check('the orbit before the burn is still the circle we started on',
        approx(plan.before.a, r1, 1e-6) && plan.before.e < 1e-6,
        'e = ' + plan.before.e.toExponential(2));

  /* A full Hohmann transfer, both burns, against the textbook formulae. */
  var r2 = r1 * 3;
  var dv1 = Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1);
  var dv2 = Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2)));

  var hNode = Sim.makeNode(300, { pro: dv1 });
  var hPlan = Sim.nodePlan(ship, LONE, 0, hNode, { samples: 20 });
  check('the first Hohmann burn raises apoapsis to the target radius',
        approx(hPlan.after.apoapsis, r2, 1e-6),
        hPlan.after.apoapsis.toFixed(1) + ' vs ' + r2.toFixed(1) + ' km');

  /* Now stand at that apoapsis and plan the circularisation. Half the
   * transfer period after the first burn is, by construction, apoapsis. */
  var transferA = (r1 + r2) / 2;
  var half = Math.PI * Math.sqrt((transferA * transferA * transferA) / mu);
  var coasting = Sim.makeShip(hPlan.pos, hPlan.postVel);
  var node2 = Sim.makeNode(hNode.t + half, { pro: dv2 });
  var plan2 = Sim.nodePlan(coasting, LONE, hNode.t, node2, { samples: 20 });
  check('the coast arrives at apoapsis, as the transfer time says it should',
        approx(V.len(V.sub(plan2.pos, Sim.bodyPosition(body, LONE, node2.t))), r2, 1e-5),
        V.len(V.sub(plan2.pos, Sim.bodyPosition(body, LONE, node2.t))).toFixed(1) + ' km');
  check('the second Hohmann burn circularises to within a rounding error',
        plan2.after.e < 1e-5 && approx(plan2.after.a, r2, 1e-5),
        'e = ' + plan2.after.e.toExponential(2) + ', a = ' + plan2.after.a.toFixed(1));

  /* Retrograde is the same equation with the sign flipped, and it must
   * lower the far side rather than doing anything clever. */
  var retro = Sim.nodePlan(ship, LONE, 0, Sim.makeNode(400, { pro: -0.2 }), { samples: 10 });
  check('a retrograde burn lowers periapsis and leaves apoapsis alone',
        retro.after.periapsis < r1 * 0.999 && approx(retro.after.apoapsis, r1, 1e-7),
        'peri ' + retro.after.periapsis.toFixed(1) + ' km');

  /* A normal burn is pure plane change: same energy, different inclination.
   * This is the one that most easily comes out wrong, because it is the
   * only axis that does nothing at all to the shape of the orbit. */
  var norm = Sim.nodePlan(ship, LONE, 0, Sim.makeNode(400, { nor: 0.3 }), { samples: 10 });
  check('a normal burn changes inclination',
        Math.abs(norm.after.inc - norm.before.inc) > 0.01,
        (norm.before.inc * 57.2958).toFixed(2) + '° -> ' + (norm.after.inc * 57.2958).toFixed(2) + '°');
  var speedBefore = Math.sqrt(mu / r1);
  var speedAfter = Math.hypot(speedBefore, 0.3);
  check('and raises speed only by the vector sum, since it is perpendicular',
        approx(norm.after.speed, speedAfter, 1e-9),
        norm.after.speed.toFixed(6) + ' vs ' + speedAfter.toFixed(6));

  /* Enough delta-v and the orbit opens. The instrument has to say ESCAPE
   * rather than quietly reporting a negative apoapsis. */
  var esc = Sim.nodePlan(ship, LONE, 0, Sim.makeNode(400, { pro: vCirc }), { samples: 10 });
  check('a large enough burn produces an open orbit',
        !esc.after.closed && esc.after.apoAlt === Infinity,
        'e = ' + esc.after.e.toFixed(3));
})();

/* ---- 4. the node's frame belongs to the node, not to now --------------- */
section('a node is evaluated where and when it is');
(function () {
  var body = LONE.bodies[0];
  // An eccentric orbit, so prograde at the node genuinely differs from
  // prograde now — on a circle the bug this guards against is invisible.
  var ship = Sim.circularOrbit(body, LONE, 0, 800);
  ship.vel = V.addScaled(ship.vel, V.norm(ship.vel), 0.9);
  Sim.refreshShip(ship);

  var oe = Sim.oscElements(ship, LONE, 0);
  var nowBasis = Sim.orbitalBasisAt(ship.pos, ship.vel, LONE, 0);
  var node = Sim.makeNode(oe.period * 0.5, { pro: 0.1 });
  var plan = Sim.nodePlan(ship, LONE, 0, node, { samples: 10 });

  var angle = Math.acos(Math.max(-1, Math.min(1,
    V.dot(nowBasis.prograde, plan.basis.prograde))));
  check('prograde at the node is not prograde now',
        angle > 1.0,
        'they differ by ' + (angle * 57.2958).toFixed(1) + '°');
  check('and the delta-v vector follows the node, not the ship',
        approx(V.dot(V.norm(plan.dvVec), plan.basis.prograde), 1, 1e-12));

  /* Half an orbit from periapsis is apoapsis, so the same node placed there
   * has to be sitting at the far side. If the plan were built from the
   * current frame this radius would come out as the current one. */
  var rNode = V.len(V.sub(plan.pos, Sim.bodyPosition(body, LONE, node.t)));
  check('the plan is computed at the coasted position, half an orbit away',
        approx(rNode, oe.apoapsis, 2e-4),
        rNode.toFixed(1) + ' km vs apoapsis ' + oe.apoapsis.toFixed(1) + ' km');

  /* The coast must ignore whatever the pilot is holding down. A node is a
   * plan against the orbit you are ON; folding a live thruster into it
   * would make the prediction drift every time a key was touched. */
  ship.thrust = V.scale(V.norm(ship.vel), ship.maxAccel);
  var thrusting = Sim.nodePlan(ship, LONE, 0, node, { samples: 10 });
  check('a thruster held down does not leak into the plan',
        V.dist(thrusting.pos, plan.pos) < 1e-6,
        V.dist(thrusting.pos, plan.pos).toExponential(2) + ' km apart');
  ship.thrust = V.zero();
})();

/* ---- 5. apsis snapping ------------------------------------------------- */
section('finding the apsides to snap a node to');
(function () {
  var body = LONE.bodies[0];
  var ship = Sim.circularOrbit(body, LONE, 0, 800);
  ship.vel = V.addScaled(ship.vel, V.norm(ship.vel), 1.2);   // now at periapsis
  Sim.refreshShip(ship);

  var oe = Sim.oscElements(ship, LONE, 0);
  var ap = Sim.apsisTimes(ship, LONE, 0);
  check('the period agrees with the osculating elements',
        approx(ap.period, oe.period, 1e-9));
  check('starting at periapsis, the next one is a full period away',
        approx(ap.toPeriapsis, oe.period, 1e-6) || ap.toPeriapsis < 1e-6,
        ap.toPeriapsis.toFixed(2) + ' s of ' + oe.period.toFixed(2));
  check('and apoapsis is half a period away',
        approx(ap.toApoapsis, oe.period / 2, 1e-6),
        ap.toApoapsis.toFixed(2) + ' s');

  /* The real test: coast to the time it reports and check the radius is
   * actually extremal there. A time-to-apoapsis that is merely plausible is
   * worth nothing; this is the property the player is relying on. */
  var atApo = Sim.coastTo(ship, LONE, ap.toApoapsis, 0);
  var rApo = V.len(V.sub(atApo.pos, Sim.bodyPosition(body, LONE, atApo.t)));
  check('coasting to the reported apoapsis time arrives at apoapsis',
        approx(rApo, oe.apoapsis, 1e-4),
        rApo.toFixed(2) + ' km vs ' + oe.apoapsis.toFixed(2) + ' km');

  // Start somewhere arbitrary on the orbit and repeat, so it is not just
  // the symmetric case that works.
  var mid = Sim.coastTo(ship, LONE, oe.period * 0.31, 0);
  var midShip = Sim.makeShip(mid.pos, mid.vel);
  var ap2 = Sim.apsisTimes(midShip, LONE, mid.t);
  var atPeri = Sim.coastTo(midShip, LONE, mid.t + ap2.toPeriapsis, mid.t);
  var rPeri = V.len(V.sub(atPeri.pos, Sim.bodyPosition(body, LONE, atPeri.t)));
  check('from an arbitrary point, the reported periapsis time is periapsis too',
        approx(rPeri, oe.periapsis, 1e-4),
        rPeri.toFixed(2) + ' km vs ' + oe.periapsis.toFixed(2) + ' km');

  var circ = Sim.circularOrbit(body, LONE, 0, 800);
  var apc = Sim.apsisTimes(circ, LONE, 0);
  check('a circular orbit reports itself as having no meaningful apsis',
        apc.circular === true, 'e = ' + apc.e.toExponential(2));

  // An escape trajectory has no period and nothing to snap to.
  var fast = Sim.circularOrbit(body, LONE, 0, 800);
  fast.vel = V.scale(fast.vel, 1.6);
  check('an open orbit reports no apsides at all', Sim.apsisTimes(fast, LONE, 0) === null);
})();

/* ---- 6. the coast itself ----------------------------------------------- */
section('coasting to the node');
(function () {
  var body = LONE.bodies[0];
  var ship = Sim.circularOrbit(body, LONE, 0, 800);
  var oe = Sim.oscElements(ship, LONE, 0);

  /* One full period of coasting has to come back to where it started —
   * the same clockwork guarantee the rails give the planets, except this
   * one is an integration and therefore has to be earned. */
  var round = Sim.coastTo(ship, LONE, oe.period, 0);
  var drift = V.dist(round.pos, ship.pos);
  check('a full period of coasting returns to the starting point',
        drift < 1, drift.toFixed(6) + ' km after ' + oe.period.toFixed(0) + ' s');

  check('coasting to now is a no-op',
        V.dist(Sim.coastTo(ship, LONE, 0, 0).pos, ship.pos) === 0);
  check('and coasting to the past does not run backwards',
        V.dist(Sim.coastTo(ship, LONE, -500, 0).pos, ship.pos) === 0);

  var sampled = Sim.coastTo(ship, LONE, oe.period, 0, { samples: 50, reference: body });
  check('sampling thins the path to about what was asked for',
        sampled.points.length > 10 && sampled.points.length < 140,
        sampled.points.length + ' points');
  check('the last sampled point is the arrival state, in the body frame',
        V.dist(sampled.points[sampled.points.length - 1],
               V.sub(sampled.pos, Sim.bodyPosition(body, LONE, sampled.t))) < 1e-9);

  /* The step budget is a guard against a node placed absurdly far out
   * hanging the frame. It has to report that it gave up rather than
   * quietly handing back a position it never reached. */
  var cut = Sim.coastTo(ship, LONE, oe.period * 400, 0, { maxSteps: 50 });
  check('an unreachable node truncates rather than hanging', cut.truncated === true);
})();

/* ---- 7. against the real system, with everything pulling --------------- */
section('in a real system, where the two-body answer is only nearly right');
(function () {
  var ship = Sim.circularOrbit(PLANET, sys, 0, 900);
  var oe = Sim.oscElements(ship, sys, 0);
  var node = Sim.makeNode(oe.period * 0.5, { pro: 0.15 });
  var plan = Sim.nodePlan(ship, sys, 0, node, { samples: 60, reference: PLANET });

  check('a plan can be made inside a populated system', !!plan && plan.magnitude > 0);
  check('the node picks the planet as its dominant body, not the star',
        plan.body === PLANET, plan.body.name);
  check('the burn raises the orbit', plan.after.apoapsis > plan.before.apoapsis);
  check('the path comes back in the reference frame it was asked for',
        plan.reference === PLANET && plan.path.length > 5);

  /* The path is stored relative to a body precisely so it can be drawn.
   * In absolute coordinates a planetary orbit is a two-million-kilometre
   * smear across the sky; the whole span of these points has to be the
   * size of an orbit, not the size of a year of heliocentric travel. */
  var maxR = 0;
  for (var i = 0; i < plan.path.length; i++) maxR = Math.max(maxR, V.len(plan.path[i]));
  check('and those points are orbit-sized, not orbit-of-the-planet-sized',
        maxR < oe.apoapsis * 3,
        'furthest point ' + maxR.toFixed(0) + ' km');

  var after = Sim.predictAfterNode(plan, sys, { maxPoints: 120, reference: PLANET });
  check('the post-burn trajectory is predicted from the post-burn state',
        !!after && after.points.length > 5);
  check('it starts where the node is',
        V.dist(after.points[0], plan.path[plan.path.length - 1]) < 1e-6);

  /* Real gravity from the star and the moons means the two-body prediction
   * is close but not exact. "Close" is the honest claim, so pin it: the
   * integrated path should agree with the conic to well under a percent
   * over one orbit, and if that ever stops being true the prediction has a
   * problem worth knowing about. */
  var maxAfter = 0;
  for (var j = 0; j < after.points.length; j++) {
    maxAfter = Math.max(maxAfter, V.len(after.points[j]));
  }
  check('the integrated post-burn path agrees with the conic apoapsis',
        Math.abs(maxAfter - plan.after.apoapsis) / plan.after.apoapsis < 0.01,
        'integrated ' + maxAfter.toFixed(0) + ' km vs conic ' +
        plan.after.apoapsis.toFixed(0) + ' km');

  check('a null node plans nothing rather than throwing',
        Sim.nodePlan(ship, sys, 0, null) === null);
  check('and a node with no delta-v leaves the orbit alone',
        approx(Sim.nodePlan(ship, sys, 0, Sim.makeNode(100, {}), { samples: 5 }).after.a,
               Sim.nodePlan(ship, sys, 0, Sim.makeNode(100, {}), { samples: 5 }).before.a,
               1e-12));
})();

console.log('');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
