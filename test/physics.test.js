/* Physics verification. Run: node test/physics.test.js
 * Everything here checks our code against an analytic result or a conserved
 * quantity, not against itself. */
'use strict';
var path = require('path');
var SRC = path.join(__dirname, '..', 'src');
var V = require(path.join(SRC, 'vec3.js'));
var K = require(path.join(SRC, 'kepler.js'));
var RNG = require(path.join(SRC, 'rng.js'));
var Gen = require(path.join(SRC, 'generate.js'));
var Sim = require(path.join(SRC, 'sim.js'));
var Combat = require(path.join(SRC, 'combat.js'));

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

var DEGR = Math.PI / 180;
var MU_SUN = V.G * 1.98892e30; // km^3/s^2

/* ---- 1. Kepler equation solver ---------------------------------------- */
section('Kepler equation solver');
(function () {
  var worst = 0, worstE = 0;
  var eccs = [0, 0.001, 0.05, 0.2, 0.5, 0.7, 0.9, 0.95, 0.99];
  for (var i = 0; i < eccs.length; i++) {
    var e = eccs[i];
    for (var j = 0; j < 720; j++) {
      var M = (j / 720) * K.TAU;
      var E = K.solveKepler(M, e);
      // Residual of the equation we claim to have solved.
      var residual = Math.abs(K.wrapAngle(E - e * Math.sin(E)) - K.wrapAngle(M));
      residual = Math.min(residual, K.TAU - residual);
      if (residual > worst) { worst = residual; worstE = e; }
    }
  }
  check('M = E - e*sin(E) satisfied for e up to 0.99',
        worst < 1e-10, 'worst residual ' + worst.toExponential(2) + ' at e=' + worstE);
  check('circular case returns E = M', K.solveKepler(1.234, 0) === 1.234);
})();

/* ---- 2. Circular orbit invariants ------------------------------------- */
section('Circular orbit (analytic invariants)');
(function () {
  var el = { a: 1.496e8, e: 0, inc: 0.4, lan: 1.1, argp: 0.7, m0: 0.3 };
  var rMin = Infinity, rMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  var T = K.period(el.a, MU_SUN);
  for (var i = 0; i < 500; i++) {
    var s = K.state(el, MU_SUN, (i / 500) * T);
    var r = V.len(s.pos), v = V.len(s.vel);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  check('radius constant', (rMax - rMin) / rMax < 1e-12,
        'spread ' + ((rMax - rMin) / rMax).toExponential(2));
  check('speed constant', (vMax - vMin) / vMax < 1e-12);
  check('speed equals sqrt(mu/a)', approx(vMin, Math.sqrt(MU_SUN / el.a), 1e-12),
        vMin.toFixed(6) + ' km/s');
  // Earth's orbital period should come out at roughly a year.
  check('1 AU period is ~365.25 days', approx(T / 86400, 365.25, 0.01),
        (T / 86400).toFixed(2) + ' days');
})();

/* ---- 3. Elliptical orbit: conservation + closure ---------------------- */
section('Elliptical orbit (conservation laws)');
(function () {
  var el = { a: 2.5e8, e: 0.62, inc: 0.35, lan: 2.2, argp: 1.4, m0: 5.0 };
  var T = K.period(el.a, MU_SUN);
  var h0 = null, en0 = null, hDrift = 0, enDrift = 0;
  for (var i = 0; i < 400; i++) {
    var s = K.state(el, MU_SUN, (i / 400) * T);
    var h = V.len(V.cross(s.pos, s.vel));
    var en = V.len2(s.vel) / 2 - MU_SUN / V.len(s.pos);
    if (h0 === null) { h0 = h; en0 = en; }
    hDrift = Math.max(hDrift, Math.abs(h - h0) / h0);
    enDrift = Math.max(enDrift, Math.abs(en - en0) / Math.abs(en0));
  }
  check('specific angular momentum conserved', hDrift < 1e-12, hDrift.toExponential(2));
  check('specific orbital energy conserved', enDrift < 1e-12, enDrift.toExponential(2));

  // Periapsis and apoapsis distances match a(1-e), a(1+e).
  var rp = Infinity, ra = 0;
  for (var j = 0; j < 20000; j++) {
    var r = K.state(el, MU_SUN, (j / 20000) * T).r;
    rp = Math.min(rp, r); ra = Math.max(ra, r);
  }
  check('periapsis = a(1-e)', approx(rp, el.a * (1 - el.e), 1e-6));
  check('apoapsis  = a(1+e)', approx(ra, el.a * (1 + el.e), 1e-6));

  // After exactly one period the body must be back where it started.
  var p0 = K.state(el, MU_SUN, 0).pos;
  var p1 = K.state(el, MU_SUN, T).pos;
  check('orbit closes after one period', V.dist(p0, p1) / el.a < 1e-12,
        (V.dist(p0, p1)).toExponential(2) + ' km');

  // And after 10,000 periods — the "leave it running for a century" guarantee.
  var pFar = K.state(el, MU_SUN, T * 10000).pos;
  check('no drift after 10,000 orbits', V.dist(p0, pFar) / el.a < 1e-9,
        (V.dist(p0, pFar)).toExponential(2) + ' km');
})();

/* ---- 4. Round-trip: elements -> state -> elements -------------------- */
section('Osculating element recovery (state -> elements)');
(function () {
  var rng = new RNG('roundtrip');
  var worst = { a: 0, e: 0, inc: 0, lan: 0, argp: 0 };
  for (var i = 0; i < 300; i++) {
    var el = {
      a: rng.logRange(1e6, 5e9),
      e: rng.range(0.0, 0.85),
      inc: rng.range(0.01, Math.PI - 0.01),
      lan: rng.angle(),
      argp: rng.angle(),
      m0: rng.angle()
    };
    var s = K.state(el, MU_SUN, rng.range(0, 1e8));
    var rec = K.elementsFromState(s.pos, s.vel, MU_SUN);
    worst.a = Math.max(worst.a, Math.abs(rec.a - el.a) / el.a);
    worst.e = Math.max(worst.e, Math.abs(rec.e - el.e));
    worst.inc = Math.max(worst.inc, Math.abs(rec.inc - el.inc));
    var dl = Math.abs(K.wrapAngle(rec.lan - el.lan));
    worst.lan = Math.max(worst.lan, Math.min(dl, K.TAU - dl));
    var dw = Math.abs(K.wrapAngle(rec.argp - el.argp));
    worst.argp = Math.max(worst.argp, Math.min(dw, K.TAU - dw));
  }
  check('semi-major axis recovered', worst.a < 1e-9, worst.a.toExponential(2));
  check('eccentricity recovered', worst.e < 1e-9, worst.e.toExponential(2));
  check('inclination recovered', worst.inc < 1e-9, worst.inc.toExponential(2));
  check('ascending node recovered', worst.lan < 1e-8, worst.lan.toExponential(2));
  check('argument of periapsis recovered', worst.argp < 1e-8, worst.argp.toExponential(2));
})();

/* ---- 5. RK4 integrator vs the analytic rails ------------------------- */
section('Ship integrator (RK4) cross-checked against analytic orbit');
(function () {
  // A lone star, and a test particle launched on a known ellipse. The rails
  // give the exact answer; RK4 has to reproduce it.
  var star = {
    id: 'star', name: 'Test', kind: 'star', mass: 1.98892e30,
    radius: 696000, mu: MU_SUN, orbit: null, children: []
  };
  var system = Gen.finalize({ root: star, seed: 0, name: 'Test' });

  var el = { a: 1.5e8, e: 0.4, inc: 0.2, lan: 0.9, argp: 2.1, m0: 0.0 };
  var T = K.period(el.a, MU_SUN);
  var s0 = K.state(el, MU_SUN, 0);

  var ship = Sim.makeShip(s0.pos, s0.vel);
  var t = 0;
  var steps = 4000;
  var h = T / steps;
  for (var i = 0; i < steps; i++) {
    Sim.stepShip(ship, system, t, h);
    t += h;
  }
  var exact = K.state(el, MU_SUN, T);
  var posErr = V.dist(ship.pos, exact.pos);
  check('position after one orbit matches analytic solution',
        posErr / el.a < 1e-9, 'error ' + posErr.toFixed(6) + ' km over ' +
        (el.a * K.TAU / 1e6).toFixed(0) + ' million km travelled');

  // Energy drift is the honest measure of integrator quality.
  var en0 = V.len2(s0.vel) / 2 - MU_SUN / V.len(s0.pos);
  var en1 = V.len2(ship.vel) / 2 - MU_SUN / V.len(ship.pos);
  check('specific energy drift < 1e-10 over one orbit',
        Math.abs((en1 - en0) / en0) < 1e-10,
        Math.abs((en1 - en0) / en0).toExponential(2));

  // Twenty orbits, coarser steps: does it stay bounded rather than spiral?
  var ship2 = Sim.makeShip(s0.pos, s0.vel);
  t = 0; h = T / 800;
  for (var j = 0; j < 800 * 20; j++) { Sim.stepShip(ship2, system, t, h); t += h; }
  var en2 = V.len2(ship2.vel) / 2 - MU_SUN / V.len(ship2.pos);
  check('energy still bounded after 20 orbits',
        Math.abs((en2 - en0) / en0) < 1e-7,
        Math.abs((en2 - en0) / en0).toExponential(2));
})();

/* ---- 6. Determinism of world generation ------------------------------ */
section('Seeded world generation');
(function () {
  var a = Gen.generateSystem('kawartha');
  var b = Gen.generateSystem('kawartha');
  var c = Gen.generateSystem('kawartha ');
  check('same seed -> byte-identical system',
        JSON.stringify(Gen.describe(a)) === JSON.stringify(Gen.describe(b)));
  check('different seed -> different system',
        JSON.stringify(Gen.describe(a)) !== JSON.stringify(Gen.describe(c)));

  // Regenerating after simulated time has passed must still match.
  var d = Gen.generateSystem('kawartha');
  Sim.bodyPosition(d.bodies[3], d, 8.64e9); // poke it with 100 days of time
  check('generation unaffected by simulation',
        JSON.stringify(Gen.describe(d)) === JSON.stringify(Gen.describe(a)));

  check('system has a star', a.root.kind === 'star');
  check('system has planets', a.bodies.filter(function (x) { return x.kind === 'planet'; }).length >= 3);
  check('system has moons', a.bodies.filter(function (x) { return x.kind === 'moon'; }).length >= 1);
  check('system has stations', a.bodies.filter(function (x) { return x.kind === 'station'; }).length >= 1);
})();

/* ---- 7. Generated systems are physically sane ------------------------ */
section('Generated systems obey physical constraints (200 seeds)');
(function () {
  var crossings = 0, hillViolations = 0, insideParent = 0, badEcc = 0, subOrbital = 0;
  var seeds = 200;
  for (var s = 0; s < seeds; s++) {
    var sys = Gen.generateSystem('audit-' + s);
    var planets = sys.bodies.filter(function (b) { return b.kind === 'planet'; });

    // No two planet orbits may overlap: apoapsis of the inner must clear the
    // periapsis of the next one out.
    planets.sort(function (x, y) { return x.orbit.a - y.orbit.a; });
    for (var i = 0; i + 1 < planets.length; i++) {
      var inner = planets[i].orbit, outer = planets[i + 1].orbit;
      if (inner.a * (1 + inner.e) >= outer.a * (1 - outer.e)) crossings++;
    }

    for (var j = 0; j < sys.bodies.length; j++) {
      var b = sys.bodies[j];
      if (!b.orbit) continue;
      var parent = sys.byId[b.orbit.parent];
      if (b.orbit.e < 0 || b.orbit.e >= 1) badEcc++;
      // Periapsis must clear the parent's surface.
      if (b.orbit.a * (1 - b.orbit.e) <= parent.radius) insideParent++;
      // Moons/stations must sit inside the parent's Hill sphere, or the star
      // would strip them away.
      if (b.kind === 'moon' || b.kind === 'station') {
        if (parent.orbit) {
          var gp = sys.byId[parent.orbit.parent];
          var hill = parent.orbit.a * (1 - parent.orbit.e) *
                     Math.pow(parent.mass / (3 * gp.mass), 1 / 3);
          if (b.orbit.a * (1 + b.orbit.e) > hill * 0.5) hillViolations++;
        }
      }
      // Stations should be in orbits that clear the atmosphere.
      if (b.kind === 'station' && b.orbit.a * (1 - b.orbit.e) < parent.radius * 1.05) subOrbital++;
    }
  }
  check('no crossing planetary orbits', crossings === 0, crossings + ' found');
  check('all eccentricities in [0,1)', badEcc === 0, badEcc + ' found');
  check('no orbit passes through its parent', insideParent === 0, insideParent + ' found');
  check('moons and stations inside parent Hill sphere', hillViolations === 0, hillViolations + ' found');
  check('stations orbit above the surface', subOrbital === 0, subOrbital + ' found');
})();

/* ---- 8. Gravity field sanity ----------------------------------------- */
section('N-body gravity field');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var pp = Sim.bodyPosition(planet, sys, 0);

  // Just above a planet's surface, that planet must dominate the field.
  var probe = V.add(pp, { x: planet.radius * 1.2, y: 0, z: 0 });
  var acc = Sim.acceleration(probe, sys, 0);
  var expected = planet.mu / Math.pow(planet.radius * 1.2, 2);
  check('surface gravity dominated by the planet underneath',
        Math.abs(V.len(acc) - expected) / expected < 0.05,
        V.len(acc).toExponential(3) + ' vs ' + expected.toExponential(3) + ' km/s^2');

  // Acceleration must fall off as 1/r^2 far from everything.
  var far1 = { x: 4e9, y: 0, z: 3e9 };
  var far2 = { x: 8e9, y: 0, z: 6e9 };
  var a1 = V.len(Sim.acceleration(far1, sys, 0));
  var a2 = V.len(Sim.acceleration(far2, sys, 0));
  check('inverse-square falloff at distance', approx(a1 / a2, 4, 0.02),
        'ratio ' + (a1 / a2).toFixed(4) + ' (expected 4)');

  // Dominant-body selection should name the planet when we are next to it.
  check('dominant body identified correctly',
        Sim.dominantBody(probe, sys, 0).id === planet.id);
})();

/* ---- 9. Deorbit and impact, in the correct reference frame ------------ */
section('Deorbit, impact and landing');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];

  // A retrograde burn must be applied in the PLANET's frame. Scaling the
  // ship's absolute velocity instead would also cancel the planet's 48 km/s
  // orbital motion around the star, and the "impact" would be the planet
  // running the ship down at interplanetary speed. Frames matter.
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  var bv = Sim.bodyVelocity(planet, sys, 0);
  var rel = V.sub(ship.vel, bv);
  ship.vel = V.add(bv, V.scale(rel, 0.55));   // drop periapsis into the ground

  var oe = Sim.oscElements(ship, sys, 0);
  check('retrograde burn puts periapsis below the surface', oe.periAlt < 0,
        'periapsis ' + Math.round(oe.periAlt) + ' km');

  var t = 0, guard = 0;
  while (!ship.landed && guard++ < 20000) {
    var r = Sim.advanceShip(ship, sys, t, 15, 3000);
    t = r.t;
  }
  check('impact detected', ship.landed === true);
  check('impact is on the planet we deorbited over',
        ship.landedOn && ship.landedOn.id === planet.id);

  var finalR = V.dist(ship.pos, Sim.bodyPosition(planet, sys, t));
  check('ship placed on the surface, not inside it',
        Math.abs(finalR - planet.radius) < 1e-6,
        'r = ' + finalR.toFixed(3) + ' vs radius ' + planet.radius.toFixed(3));

  // Impact speed must not exceed escape velocity from the starting radius.
  var vEsc = Math.sqrt(2 * planet.mu / planet.radius);
  check('impact speed below surface escape velocity',
        ship.impactSpeed < vEsc,
        ship.impactSpeed.toFixed(3) + ' km/s vs v_esc ' + vEsc.toFixed(3));

  /* A gentle touchdown should register as a landing, not a crash. Note how
   * little height that allows: this planet pulls at 0.58 g, so an unpowered
   * drop from even 4 km arrives at 250 m/s and is a crash by any reasonable
   * standard. A soft landing has to start from tens of metres with the
   * descent already arrested — which is exactly why landing needs its own
   * gameplay later, and cannot just fall out of the orbital physics. */
  var surfaceG = planet.mu / (planet.radius * planet.radius);
  var lander = Sim.circularOrbit(planet, sys, 0, 0.01, 0, 0);   // 10 m up
  var lv = Sim.bodyVelocity(planet, sys, 0);
  var up = V.norm(V.sub(lander.pos, Sim.bodyPosition(planet, sys, 0)));
  lander.vel = V.add(lv, V.scale(up, -0.001));                  // 1 m/s descent
  /* Gear down. This test is about the SPEED threshold and predates the gear
   * existing; without this it now fails for the right reason — arriving on
   * the hull is a wreck however gently you do it — and stops saying
   * anything about the number it was written to check. */
  lander.gear = true;
  Sim.refreshShip(lander);
  var t2 = 0, g2 = 0;
  while (!lander.landed && g2++ < 5000) { var rr = Sim.advanceShip(lander, sys, t2, 0.2, 3000); t2 = rr.t; }
  check('slow descent counts as a landing, not a crash',
        lander.landed && !lander.crashed,
        'contact at ' + (lander.impactSpeed * 1000).toFixed(1) + ' m/s, surface gravity ' +
        (surfaceG * 1000).toFixed(2) + ' m/s^2');

  /* And the free-fall arithmetic itself should match the textbook — IN
   * VACUUM. This test predates atmospheres and failed the moment they
   * arrived, correctly: sqrt(2gh) is a vacuum result, and a ship dropped
   * through air arrives slower. `noDrag` isolates the integrator's gravity,
   * which is what this was always actually checking, and the drop is then
   * repeated with the air switched back on to pin the difference down. */
  function dropFrom(dropH, noDrag) {
    var f = Sim.makeShip(V.add(Sim.bodyPosition(planet, sys, 0), V.scale(up, planet.radius + dropH)),
                         V.clone(lv));
    f.noDrag = !!noDrag;
    Sim.refreshShip(f);
    var tt = 0, guard = 0;
    while (!f.landed && guard++ < 20000) { tt = Sim.advanceShip(f, sys, tt, 0.5, 3000).t; }
    return f.impactSpeed;
  }
  var dropH = 4.0;
  var predicted = Math.sqrt(2 * surfaceG * dropH);
  var vacuumHit = dropFrom(dropH, true);
  check('free-fall impact speed matches sqrt(2*g*h) in vacuum',
        Math.abs(vacuumHit - predicted) / predicted < 0.02,
        (vacuumHit * 1000).toFixed(1) + ' m/s vs predicted ' +
        (predicted * 1000).toFixed(1) + ' m/s');

  var airHit = dropFrom(dropH, false);
  check('and air slows the same drop down',
        !planet.atmosphere || airHit < vacuumHit,
        (airHit * 1000).toFixed(1) + ' m/s through ' +
        (planet.atmosphere ? 'air' : 'vacuum'));
})();

/* ---- 10. Escape trajectories ----------------------------------------- */
section('Escape trajectories');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius, 0, 0);
  var bv = Sim.bodyVelocity(planet, sys, 0);
  var rel = V.sub(ship.vel, bv);

  // Just under and just over the escape threshold: sqrt(2) times circular.
  var lo = Sim.makeShip(ship.pos, V.add(bv, V.scale(rel, 1.40)));
  var hi = Sim.makeShip(ship.pos, V.add(bv, V.scale(rel, 1.45)));
  check('1.40x circular stays captured', Sim.oscElements(lo, sys, 0).closed === true);
  check('1.45x circular escapes', Sim.oscElements(hi, sys, 0).closed === false);

  var oe = Sim.oscElements(hi, sys, 0);
  check('escaping orbit reports eccentricity > 1', oe.e > 1, 'e = ' + oe.e.toFixed(3));
  check('escaping orbit still has a real periapsis', oe.periapsis > 0,
        Math.round(oe.periapsis) + ' km');
})();

/* ---- 11. Ship attitude ------------------------------------------------ */
section('Ship attitude (orientation independent of velocity)');
(function () {
  var ship = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 });
  check('basis starts orthonormal',
        Math.abs(V.len(ship.fwd) - 1) < 1e-12 && Math.abs(V.len(ship.up) - 1) < 1e-12 &&
        Math.abs(V.len(ship.right) - 1) < 1e-12 && Math.abs(V.dot(ship.fwd, ship.up)) < 1e-12 &&
        Math.abs(V.dot(ship.fwd, ship.right)) < 1e-12 && Math.abs(V.dot(ship.up, ship.right)) < 1e-12);
  check('default facing is prograde', V.dist(ship.fwd, V.norm({ x: 3, y: 0, z: 0 })) < 1e-12);

  // Sign conventions the game's key bindings rely on (main.js comments this
  // exact mapping — if this test ever fails, the fix belongs in main.js's
  // key mapping, not by flipping signs inside integrateAttitude).
  function spin(cmd, frames) {
    var s = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    var origUp = V.clone(s.up), origRight = V.clone(s.right);
    for (var i = 0; i < frames; i++) Sim.integrateAttitude(s, 1 / 60, cmd);
    return { ship: s, origUp: origUp, origRight: origRight };
  }
  var p1 = spin({ pitch: 1, yaw: 0, roll: 0 }, 200);
  check('pitch command tilts the nose toward the ship\'s own up',
        V.dot(p1.ship.fwd, p1.origUp) > 0.5);

  // Raw positive yaw rate turns the nose toward the ship's own LEFT (i.e.
  // away from its own right) — this is just what falls out of the right-hand
  // rule for rotating about the "up" axis, and it is fine left as-is: it is
  // an internal convention, not something the player ever sees directly.
  // main.js's key mapping is what makes ArrowRight actually yaw right on
  // screen, by commanding yaw:-1 for that key — see its comment. If this
  // test ever flips, the fix belongs in that mapping, not here.
  var y1 = spin({ pitch: 0, yaw: 1, roll: 0 }, 200);
  check('positive yaw rate turns the nose toward the ship\'s own left',
        V.dot(y1.ship.fwd, y1.origRight) < -0.5);

  var r1 = spin({ pitch: 0, yaw: 0, roll: 1 }, 200);
  check('roll command tilts the top of the ship toward its own right',
        V.dot(r1.ship.up, r1.origRight) > 0.5);

  // Orthonormality must survive sustained, mixed rotation, not just one axis.
  var tumbler = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 });
  var worstOrtho = 0, worstLen = 0;
  for (var f = 0; f < 3000; f++) {
    Sim.integrateAttitude(tumbler, 1 / 60, {
      pitch: Math.sin(f * 0.031), yaw: Math.cos(f * 0.017), roll: Math.sin(f * 0.043 + 1)
    });
    worstOrtho = Math.max(worstOrtho, Math.abs(V.dot(tumbler.fwd, tumbler.up)),
                          Math.abs(V.dot(tumbler.fwd, tumbler.right)),
                          Math.abs(V.dot(tumbler.up, tumbler.right)));
    worstLen = Math.max(worstLen, Math.abs(V.len(tumbler.fwd) - 1),
                        Math.abs(V.len(tumbler.up) - 1), Math.abs(V.len(tumbler.right) - 1));
  }
  check('basis stays orthogonal through 3000 frames of mixed tumbling',
        worstOrtho < 1e-9, worstOrtho.toExponential(2));
  check('basis vectors stay unit length through the same tumble',
        worstLen < 1e-9, worstLen.toExponential(2));

  // Letting go of the stick should coast to a stop, not spin forever or
  // snap instantly — that's the deliberate RCS-damping simplification.
  var damped = Sim.makeShip({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  for (var g = 0; g < 60; g++) Sim.integrateAttitude(damped, 1 / 60, { pitch: 1, yaw: 0, roll: 0 });
  var rateAtRelease = Math.abs(damped.angRate.pitch);
  for (var h = 0; h < 300; h++) Sim.integrateAttitude(damped, 1 / 60, { pitch: 0, yaw: 0, roll: 0 });
  check('rotation decays to a stop once input is released',
        Math.abs(damped.angRate.pitch) < 1e-3 && rateAtRelease > 1e-3,
        'released at ' + rateAtRelease.toFixed(4) + ' rad/s, now ' + damped.angRate.pitch.toExponential(2));
})();

/* ---- 12. Spawn attitude is relative, not absolute ---------------------- */
section('Spawn facing uses the RELATIVE prograde frame');
(function () {
  // Regression test for a real bug: a ship spawned circularly around a
  // planet was facing the planet's ~50 km/s heliocentric velocity (because
  // makeShip's generic default faces whatever absolute velocity it's given),
  // not the ship's own several-km/s motion relative to that planet. The
  // fix lives in circularOrbit(), which knows the relative velocity and
  // re-faces the ship along it. Prove it holds for a variety of systems.
  for (var s = 0; s < 12; s++) {
    var sys = Gen.generateSystem('facing-' + s);
    var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1] ||
                 sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
    var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.5, 0.1, 0.4);
    var lv = Sim.localVertical(ship.pos, sys, 0);
    check('seed ' + s + ': facing is perpendicular to local vertical (circular orbit)',
          Math.abs(V.dot(ship.fwd, lv.up)) < 0.05,
          'dot=' + V.dot(ship.fwd, lv.up).toFixed(4));
    check('seed ' + s + ': dominant body at spawn is the host planet',
          lv.body.id === planet.id);
  }
})();

/* ---- 13. Attitude ladder math (pitch/roll relative to local vertical) -- */
section('Attitude ladder: pitch and roll relative to local vertical');
(function () {
  // A clean, hand-constructed frame: local vertical is +Z ("up" away from
  // the planet), and the ship starts level and unrolled — nose horizontal
  // along +X, its own up matching local vertical, right along -Y (so the
  // basis is right-handed: right, up, fwd).
  var upRef = { x: 0, y: 0, z: 1 };
  function levelShip() {
    return { fwd: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, right: { x: 0, y: -1, z: 0 } };
  }

  var flat = Sim.attitudeAngles(levelShip(), upRef);
  check('level, unrolled: pitch = 0', Math.abs(flat.pitchDeg) < 1e-9, flat.pitchDeg.toFixed(6));
  check('level, unrolled: roll = 0', Math.abs(flat.rollDeg) < 1e-9, flat.rollDeg.toFixed(6));

  // Pitch the nose 30 degrees up (toward local vertical) with no roll.
  var p30 = levelShip();
  p30.fwd = V.norm({ x: Math.cos(30 * DEGR), y: 0, z: Math.sin(30 * DEGR) });
  p30.up = V.norm(V.sub(upRef, V.scale(p30.fwd, V.dot(upRef, p30.fwd)))); // stays "over the top"
  p30.right = V.cross(p30.fwd, p30.up);
  var att30 = Sim.attitudeAngles(p30, upRef);
  check('nose 30° above local horizontal reads pitch = 30°',
        Math.abs(att30.pitchDeg - 30) < 1e-6, att30.pitchDeg.toFixed(4));
  check('pure pitch change carries no roll',
        Math.abs(att30.rollDeg) < 1e-6, att30.rollDeg.toFixed(4));

  // Nose 20 degrees BELOW horizontal.
  var pDive = levelShip();
  pDive.fwd = V.norm({ x: Math.cos(-20 * DEGR), y: 0, z: Math.sin(-20 * DEGR) });
  pDive.up = V.norm(V.sub(upRef, V.scale(pDive.fwd, V.dot(upRef, pDive.fwd))));
  pDive.right = V.cross(pDive.fwd, pDive.up);
  check('nose 20° below local horizontal reads pitch = -20°',
        Math.abs(Sim.attitudeAngles(pDive, upRef).pitchDeg - (-20)) < 1e-6);

  // Roll 40 degrees about the nose, level flight otherwise.
  var r40 = levelShip();
  r40.up = V.rotateAroundAxis(r40.up, r40.fwd, 40 * DEGR);
  r40.right = V.rotateAroundAxis(r40.right, r40.fwd, 40 * DEGR);
  var attR = Sim.attitudeAngles(r40, upRef);
  check('40° roll about the nose reads pitch = 0 (roll does not leak into pitch)',
        Math.abs(attR.pitchDeg) < 1e-6, attR.pitchDeg.toFixed(4));
  check('40° roll about the nose reads roll = 40°',
        Math.abs(attR.rollDeg - 40) < 1e-6, attR.rollDeg.toFixed(4));

  // Straight up (nadir/zenith): the degenerate case an ADI can't avoid.
  var vertical = levelShip();
  vertical.fwd = { x: 0, y: 0, z: 1 };
  vertical.right = { x: 1, y: 0, z: 0 };
  vertical.up = { x: 0, y: -1, z: 0 };
  var attV = Sim.attitudeAngles(vertical, upRef);
  check('nose pointed exactly along local vertical is reported as degenerate', attV.degenerate === true);
  check('degenerate case still reports the correct pole', attV.pitchDeg === 90);
})();

/* ---- 14. Docking ------------------------------------------------------- */
section('Docking');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var station = sys.bodies.filter(function (b) { return b.kind === 'station'; })[0];
  var host = sys.byId[station.orbit.parent];
  var t0 = 12345;

  var ss = Sim.bodyState(station, sys, t0);
  check('capture envelope comes from the station\'s own generated fields',
        station.dockCaptureRadius === station.radius * 4 && station.dockMaxSpeed === 0.006);

  // Far away and fast: not dockable.
  var far = Sim.makeShip(V.addScaled(ss.pos, { x: 1, y: 0, z: 0 }, station.dockCaptureRadius * 50),
                         V.addScaled(ss.vel, { x: 1, y: 0, z: 0 }, 2));
  var dsFar = Sim.dockingStatus(far, station, sys, t0);
  check('far and fast ship is out of range', !dsFar.inRange);
  check('far and fast ship is not slow enough either', !dsFar.slowEnough);

  // Placed inside the capture envelope, matching velocity closely.
  var near = Sim.makeShip(
    V.addScaled(ss.pos, { x: 0.3, y: 0.2, z: 0.1 }, station.dockCaptureRadius * 0.5),
    V.addScaled(ss.vel, { x: 1, y: 0, z: 0 }, station.dockMaxSpeed * 0.4)
  );
  var dsNear = Sim.dockingStatus(near, station, sys, t0);
  check('near, slow ship is in range', dsNear.inRange, fmtKm(dsNear.range));
  check('near, slow ship is slow enough', dsNear.slowEnough, dsNear.relSpeed.toExponential(3) + ' km/s');

  Sim.dockShip(near, station, sys, t0);
  check('dockShip records the target', near.docked === station.id);
  check('docking zeroes commanded thrust and spin',
        V.len(near.thrust) === 0 && near.angRate.pitch === 0 && near.angRate.yaw === 0 && near.angRate.roll === 0);

  // The whole point: as the station swings around its orbit, the docked
  // ship must go with it, staying at the same distance and (very nearly)
  // the same orientation relative to the station.
  var offsets = [], t = t0;
  for (var i = 0; i < 40; i++) {
    t += station.orbit.period / 400;   // small fraction of one station orbit
    var target = Sim.updateDockedShip(near, sys, t);
    var ts2 = Sim.bodyState(target, sys, t);
    offsets.push(V.dist(near.pos, ts2.pos));
  }
  var minOff = Math.min.apply(null, offsets), maxOff = Math.max.apply(null, offsets);
  check('docked ship keeps a constant distance from the station as it orbits',
        (maxOff - minOff) / maxOff < 1e-6,
        'spread ' + ((maxOff - minOff) / maxOff).toExponential(2) + ' over ' + offsets.length + ' steps');
  check('docked ship rides along at zero relative velocity',
        V.dist(near.vel, Sim.bodyState(station, sys, t).vel) < 1e-9);

  var before = V.clone(near.pos);
  var released = Sim.undockShip(near, sys, t, 0.004);
  check('undockShip clears the docked flag', near.docked === null);
  check('undockShip reports the station it left', released.id === station.id);
  check('undocking imparts outward separation speed',
        Math.abs(V.len(V.sub(near.vel, Sim.bodyState(station, sys, t).vel)) - 0.004) < 1e-9);
  check('undocking does not teleport the ship', V.dist(near.pos, before) === 0);

  function fmtKm(km) { return km.toFixed(3) + ' km'; }
})();

/* ---- 15. Undock doesn't instantly re-capture -------------------------- */
section('Undocking actually lets go');
(function () {
  // Regression test for a real bug: undocking gave the ship only a few
  // metres per second of separation, and the game's docking-capture check
  // (correctly!) saw a ship still sitting inside the envelope one physics
  // tick later and silently re-docked it — so pressing "undock" appeared to
  // do nothing. The fix keeps this at the SIMULATION level too: a caller
  // must stop asking dockingStatus about a target after undocking rather
  // than re-arming the same target immediately (main.js does this by
  // clearing its dockTarget on undock). Prove the raw numbers that made the
  // bug happen: right after undockShip, the ship is STILL inside the
  // capture envelope for at least one tick, so any caller that re-checks
  // the same target without a gap will re-trigger it.
  var sys = Gen.generateSystem('kawartha');
  var station = sys.bodies.filter(function (b) { return b.kind === 'station'; })[0];
  var ss = Sim.bodyState(station, sys, 0);
  var ship = Sim.makeShip(
    V.addScaled(ss.pos, { x: 1, y: 0, z: 0 }, station.dockCaptureRadius * 0.3),
    V.clone(ss.vel)
  );
  Sim.dockShip(ship, station, sys, 0);
  Sim.undockShip(ship, sys, 0, 0.003);

  var dsRightAfter = Sim.dockingStatus(ship, station, sys, 0);
  check('immediately after undocking, the ship is still inside the capture envelope',
        dsRightAfter.inRange && dsRightAfter.slowEnough,
        'this is WHY a caller must drop its dock target on undock, not re-poll it');

  // And confirm that given enough time coasting outward, it genuinely does
  // clear the envelope — the escape is real, just not instantaneous.
  var t = 0, cleared = false;
  for (var i = 0; i < 20000 && !cleared; i++) {
    ship.pos = V.addScaled(ship.pos, V.sub(ship.vel, ss.vel), 1);
    t += 1;
    if (!Sim.dockingStatus(ship, station, sys, t).inRange) cleared = true;
  }
  check('coasting on the undock separation velocity eventually clears the envelope',
        cleared, 'after ' + t + ' s');
})();

/* ---- 16. Radar/compass projection -------------------------------------- */
section('Radar/compass: relative-to-ship-frame projection');
(function () {
  // Ship at the origin, wings-level, nose along +X, right along +Y, up
  // along +Z -- the simplest possible frame to reason a hand-worked case
  // through.
  var ship = { pos: { x: 0, y: 0, z: 0 },
               fwd: { x: 1, y: 0, z: 0 }, right: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 } };

  var ahead = Sim.relativeToShipFrame(ship, { x: 10, y: 0, z: 0 });
  check('dead ahead: azimuth = 0', Math.abs(ahead.azimuth) < 1e-9, ahead.azimuth.toFixed(6));
  check('dead ahead: elevation = 0', Math.abs(ahead.elevation) < 1e-9);
  check('dead ahead: range = distance', Math.abs(ahead.range - 10) < 1e-9);

  var toRight = Sim.relativeToShipFrame(ship, { x: 0, y: 10, z: 0 });
  check('dead right: azimuth = +90°', Math.abs(toRight.azimuth - Math.PI / 2) < 1e-9);

  var behind = Sim.relativeToShipFrame(ship, { x: -10, y: 0, z: 0 });
  check('directly behind: azimuth = ±180°', Math.abs(Math.abs(behind.azimuth) - Math.PI) < 1e-9);

  var toLeft = Sim.relativeToShipFrame(ship, { x: 0, y: -10, z: 0 });
  check('dead left: azimuth = -90°', Math.abs(toLeft.azimuth - (-Math.PI / 2)) < 1e-9);

  var above = Sim.relativeToShipFrame(ship, { x: 10, y: 0, z: 10 });
  check('ahead and above: elevation = +45°',
        Math.abs(above.elevation - Math.PI / 4) < 1e-9, (above.elevation / DEGR).toFixed(3));
  check('ahead and above: azimuth stays 0 (elevation does not leak into azimuth)',
        Math.abs(above.azimuth) < 1e-9);

  var below = Sim.relativeToShipFrame(ship, { x: 10, y: 0, z: -10 });
  check('ahead and below: elevation = -45°',
        Math.abs(below.elevation - (-Math.PI / 4)) < 1e-9);

  var same = Sim.relativeToShipFrame(ship, { x: 0, y: 0, z: 0 });
  check('coincident point: range = 0, no NaNs',
        same.range === 0 && isFinite(same.azimuth) && isFinite(same.elevation));

  // A rolled/pitched ship: bearings are body-frame, not world-frame, so a
  // point sitting on the world +Z axis should read as "dead ahead" once
  // the ship's own nose is pointed there.
  var tilted = { pos: { x: 0, y: 0, z: 0 },
                 fwd: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 } };
  var t2 = Sim.relativeToShipFrame(tilted, { x: 0, y: 0, z: 10 });
  check('bearings are body-frame: "ahead" tracks the nose, not world +X',
        Math.abs(t2.azimuth) < 1e-9 && Math.abs(t2.elevation) < 1e-9);
})();

section('--- elements you can hand back to state() ---');
(function () {
  /* elementsFromState used to describe a shape and not a position, which
   * meant you could read an orbit off a state vector but never fly it. The
   * round trip is the whole guarantee: state -> elements -> state must come
   * back to where it started, or nothing can be taken off an integrator and
   * put onto a rail. */
  var mu = MU_SUN;
  var cases = [
    { name: 'circular equatorial', pos: { x: 1.5e8, y: 0, z: 0 }, e: 0 },
    { name: 'circular inclined', pos: { x: 0, y: 1.2e8, z: 0 }, e: 0, inc: 0.7 },
    { name: 'eccentric inclined', pos: { x: 9e7, y: 3e7, z: 1e7 }, e: 0.45, inc: 0.4 },
    { name: 'retrograde', pos: { x: 1.1e8, y: -2e7, z: 5e6 }, e: 0.2, inc: 2.6 }
  ];
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    var r = V.len(c.pos);
    // A velocity of the right magnitude, perpendicular to the radius, tilted
    // by inc — enough to make a real orbit of roughly the intended shape.
    var speed = Math.sqrt(mu * (1 + c.e) / r);
    var radial = V.norm(c.pos);
    var axis = V.norm({ x: Math.sin(c.inc || 0), y: 0.2, z: Math.cos(c.inc || 0) });
    var vdir = V.norm(V.cross(axis, radial));
    var vel = V.scale(vdir, speed);

    var t0 = 12345;
    var el = K.elementsFromState(c.pos, vel, mu);
    check(c.name + ': the orbit closes', el.closed, 'e = ' + el.e.toFixed(4));
    el.m0 = el.m - K.meanMotion(el.a, mu) * t0;
    var back = K.state(el, mu, t0);
    check(c.name + ': position survives the round trip',
          V.dist(back.pos, c.pos) < r * 1e-6,
          V.dist(back.pos, c.pos).toFixed(3) + ' km of ' + r.toFixed(0));
    check(c.name + ': velocity survives it too',
          V.dist(back.vel, vel) < speed * 1e-6,
          V.dist(back.vel, vel).toFixed(6) + ' km/s of ' + speed.toFixed(3));

    // And a quarter of a period later it is a quarter of the way round.
    var later = K.state(el, mu, t0 + el.period / 4);
    check(c.name + ': and it advances along the orbit',
          V.dist(later.pos, c.pos) > r * 0.5);
  }
})();

/* The predictor is the most expensive thing in the game, and it now runs a
 * few milliseconds at a time across frames instead of all at once. The
 * thing that must not change is the ANSWER: a job stepped in slices has to
 * produce exactly the path the one-shot call produces, point for point, or
 * the display is now lying more cheaply than it used to. */
section('--- prediction, in slices ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[1];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 1.4, 0.2, 0);
  Sim.refreshShip(ship);
  var opts = { maxPoints: 200, horizon: 4 * 3600, includeThrust: false };

  var whole = Sim.predictTrajectory(ship, sys, 0, opts);

  /* Stepped one point at a time — the pathological case for any scheme that
   * keeps state between calls. A tiny budget with a real clock would be
   * timing-dependent and therefore flaky, so this drives it by hand. */
  var job = Sim.beginPrediction(ship, sys, 0, opts);
  var slices = 0, doneAt = -1;
  for (var i = 0; i < 5000; i++) {
    slices++;
    /* budgetMs 1e-9 means "one check interval then yield", which is 16
     * points; anything above zero exercises the resume path. */
    if (Sim.stepPrediction(job, sys, 1e-9)) { doneAt = slices; break; }
  }
  check('a sliced job finishes', doneAt > 0, doneAt + ' slices');
  check('and it really was sliced, not run out in one go', doneAt > 1, doneAt + ' slices');
  check('the sliced path has the same number of points',
        job.result.points.length === whole.points.length,
        job.result.points.length + ' vs ' + whole.points.length);

  var worst = 0;
  for (i = 0; i < whole.points.length; i++) {
    worst = Math.max(worst, V.dist(whole.points[i], job.result.points[i]));
  }
  check('and every point is identical to the one-shot answer', worst === 0,
        worst.toExponential(2) + ' km apart at worst');
  check('the reference body survives the split', job.result.reference === whole.reference);
  check('so does the horizon', job.result.horizon === whole.horizon);

  /* An impact must still stop the integration where it happens, not run on
   * to maxPoints — the truncation is what makes the impact marker mean
   * something. */
  var faller = Sim.circularOrbit(planet, sys, 0, planet.radius * 1.4, 0.2, 0);
  var pv = Sim.bodyVelocity(planet, sys, 0);
  // Kill four fifths of the orbital velocity: periapsis ends up underground.
  faller.vel = V.add(pv, V.scale(V.sub(faller.vel, pv), 0.2));
  Sim.refreshShip(faller);
  var hitWhole = Sim.predictTrajectory(faller, sys, 0, opts);
  var hitJob = Sim.beginPrediction(faller, sys, 0, opts);
  while (!Sim.stepPrediction(hitJob, sys, 1e-9)) { /* slice away */ }
  check('an impact is still found', !!hitWhole.impact && !!hitJob.result.impact);
  if (hitWhole.impact && hitJob.result.impact) {
    check('the sliced job hits the same body',
          hitJob.result.impact.body === hitWhole.impact.body);
    check('at the same moment', hitJob.result.impact.t === hitWhole.impact.t,
          hitJob.result.impact.t + ' vs ' + hitWhole.impact.t);
    check('and stopped there rather than running to the end',
          hitJob.result.points.length < opts.maxPoints,
          hitJob.result.points.length + ' of ' + opts.maxPoints);
  }
})();

section('--- jettisoned cargo is an object, not a deletion ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var ship = Sim.circularOrbit(planet, sys, 0, planet.radius * 0.6, 0.1, 0);
  ship.cargo = { grain: 10 };
  Sim.refreshShip(ship);
  sys.canisters = [];

  var can = Sim.dropCanister(sys, ship, 'grain', 4, 0);
  check('the drop produces a canister', !!can && sys.canisters.length === 1);
  check('it remembers what it is and how much', can.cid === 'grain' && can.tonnes === 4);

  /* It must not share the ship's state vector exactly, or the first time
   * the pilot decelerates they collide with their own rubbish. */
  check('it is pushed clear of the ship',
        V.dist(can.pos, ship.pos) > 0 && V.dist(can.vel, ship.vel) > 0.005,
        V.dist(can.vel, ship.vel).toFixed(4) + ' km/s of separation');
  check('and pushed backwards, not forwards',
        V.dot(V.sub(can.vel, ship.vel), ship.fwd) < 0);

  /* From then on it is on the same physics as everything else: it falls,
   * and its orbit is a real orbit. */
  var r0 = V.dist(can.pos, Sim.bodyPosition(planet, sys, 0));
  var p0 = V.clone(can.pos);
  var t = 0;
  /* Keep the player alongside it, so it stays on the integrator rather
   * than being put on a rail — this is the near-field path. */
  for (var i = 0; i < 200; i++) {
    Sim.updateCanisters(sys, can.pos, t, 30);
    t += 30;
  }
  check('it survives being simulated', sys.canisters.length === 1);
  if (sys.canisters.length) {
    check('it moved, on gravity alone', V.dist(sys.canisters[0].pos, p0) > 1);
    var oe = Sim.oscElements({ pos: sys.canisters[0].pos, vel: sys.canisters[0].vel },
                             sys, t);
    check('and it is still on the orbit it was dropped into',
          oe.body === planet && oe.e < 0.05, oe.body.name + ' e=' + oe.e.toFixed(4));
    check('nor teleported across the system',
          Math.abs(V.dist(sys.canisters[0].pos, Sim.bodyPosition(planet, sys, t)) - r0)
            < r0 * 0.3,
          r0.toFixed(0) + ' -> ' +
            V.dist(sys.canisters[0].pos, Sim.bodyPosition(planet, sys, t)).toFixed(0));
  }

  /* Out of range it goes onto a Kepler rail rather than being frozen. This
   * is the bug the near-field version hid: a canister that simply stops
   * being integrated stands still in ABSOLUTE space while the planet it was
   * orbiting leaves at 42 km/s, so coming back for it found it a quarter of
   * a million kilometres away in open space. */
  var far = { x: 1e12, y: 0, z: 0 };
  var railT = t;
  Sim.updateCanisters(sys, far, railT, 30);
  check('out of range it goes onto a rail', !!sys.canisters[0].rail);

  var sleptFor = 5400;               // a couple of orbits, unwatched
  for (var k = 1; k <= 12; k++) {
    Sim.updateCanisters(sys, far, railT + k * (sleptFor / 12), 450);
  }
  var slept = sys.canisters[0];
  var railEnd = railT + sleptFor;
  check('and it keeps orbiting while nobody is looking',
        Math.abs(V.dist(slept.pos, Sim.bodyPosition(planet, sys, railEnd)) - r0)
          < r0 * 0.35,
        V.dist(slept.pos, Sim.bodyPosition(planet, sys, railEnd)).toFixed(0) +
          ' km from ' + planet.name);
  check('rather than standing still in absolute space',
        V.dist(slept.pos, p0) > 1000, V.dist(slept.pos, p0).toFixed(0) + ' km');

  // Coming back picks it up off the rail and hands it to the integrator.
  Sim.updateCanisters(sys, slept.pos, railEnd, 30);
  check('coming back wakes it again', !sys.canisters[0].rail);

  /* And after a day it is gone. A system that remembers every tonne anyone
   * ever dropped is a memory leak with a story attached. */
  Sim.updateCanisters(sys, far, Sim.CANISTER_LIFE + 1, 600);
  check('it eventually expires', sys.canisters.length === 0);

  /* One that falls into the planet stops existing rather than sitting
   * inside it. */
  var lander = Sim.circularOrbit(planet, sys, 0, 0.5, 0, 0);
  lander.vel = V.scale(lander.vel, 0.05);          // straight down
  var doomed = Sim.dropCanister(sys, lander, 'grain', 1, 0);
  var tt = 0;
  for (var j = 0; j < 400 && sys.canisters.length; j++) {
    Sim.updateCanisters(sys, lander.pos, tt, 5); tt += 5;
  }
  check('a canister that hits the ground is gone, not buried',
        sys.canisters.length === 0 && !!doomed);
})();

section('--- a destroyed ship comes apart ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];
  var here = Sim.bodyPosition(planet, sys, 0);
  var at = { x: here.x + 400, y: here.y, z: here.z };
  var vel = { x: 0, y: 3, z: 0 };
  sys.canisters = [];

  var made = Sim.spawnDebris(sys, 'n7', at, vel, 0.06, 0,
                             [{ cid: 'alloys', tonnes: 12 }]);
  check('a wreck throws a handful of shards', made.length >= 6 && made.length <= 16,
        made.length + ' shards');
  check('and they are in the canister list, not a second one',
        sys.canisters.length === made.length &&
        Sim.debrisAll(sys).length === made.length);

  /* SEED DISCIPLINE. The doctrine's first rule, in the one place it would
   * never be noticed if it were broken: nobody re-watches an explosion
   * frame by frame, which is exactly why Math.random() here would have
   * survived. */
  var sys2 = Gen.generateSystem('kawartha');
  sys2.canisters = [];
  var again = Sim.spawnDebris(sys2, 'n7', at, vel, 0.06, 0,
                              [{ cid: 'alloys', tonnes: 12 }]);
  var same = again.length === made.length;
  for (var q = 0; q < made.length && same; q++) {
    if (V.dist(made[q].vel, again[q].vel) > 1e-12) same = false;
    if (made[q].shard !== again[q].shard) same = false;
    if (Math.abs(made[q].spinRate - again[q].spinRate) > 1e-12) same = false;
  }
  check('the same wreck throws the same pieces the same way', same);

  var sys3 = Gen.generateSystem('kawartha');
  sys3.canisters = [];
  var other = Sim.spawnDebris(sys3, 'n8', at, vel, 0.06, 0, []);
  check('and a different ship does not',
        V.dist(other[0].vel, made[0].vel) > 1e-9);

  /* The index has to reach the hash properly. `wakeHash` appended it to a
   * shared prefix and read the high bits, FNV-1a did not diffuse it upward,
   * and every arc of a wake came out identical and drew stacked on itself. */
  var dirs = {}, meshes = {}, distinct = 0;
  for (var d = 0; d < made.length; d++) {
    var key = made[d].vel.x.toFixed(9) + ',' + made[d].vel.y.toFixed(9);
    if (!dirs[key]) { dirs[key] = true; distinct++; }
    meshes[made[d].shard] = true;
  }
  check('every shard goes its own way rather than stacking',
        distinct === made.length, distinct + ' of ' + made.length);
  check('and they are not all the same mesh',
        Object.keys(meshes).length > 2, Object.keys(meshes).length + ' shapes');

  /* Thrown outward from the wreck, carrying the ship's own velocity — an
   * explosion happens TO a ship, it does not stop one. */
  var outward = true, carried = true;
  for (var e = 0; e < made.length; e++) {
    if (V.dot(V.sub(made[e].pos, at), V.sub(made[e].vel, vel)) <= 0) outward = false;
    if (V.dist(made[e].vel, vel) > 0.5) carried = false;
  }
  check('each shard flies away from where the ship was', outward);
  check('and inherits the velocity it had', carried);

  /* Salvage rides on the shards, so the scoop and the hold accounting work
   * on it with no second system. Most of the field is scrap. */
  var withCargo = made.filter(function (c) { return c.cid && c.tonnes > 0; });
  check('some of the wreck is worth taking', withCargo.length >= 1 && withCargo.length <= 4,
        withCargo.length + ' salvageable');
  check('but most of it is scrap you fly through', withCargo.length < made.length / 2);
  var salvaged = 0;
  withCargo.forEach(function (c) { salvaged += c.tonnes; });
  check('and the salvage is a fraction of the hold, not a copy of it',
        salvaged > 0 && salvaged < 12, salvaged + ' t of 12');

  /* THE CHEAP PATH, and why it is a different one. A shard is integrated
   * near the player and simply dropped when it is not — no Kepler rail,
   * because solving an ellipse for something that will not exist by the
   * time it completes a degree of it is work done for nobody. */
  var p0 = V.clone(made[0].pos);
  var tt = 0;
  for (var i = 0; i < 30; i++) { Sim.updateCanisters(sys, at, tt, 1); tt += 1; }
  check('shards are simulated while you are watching', Sim.debrisAll(sys).length === made.length);
  check('and they move', V.dist(Sim.debrisAll(sys)[0].pos, p0) > 1e-6);
  var railed = Sim.debrisAll(sys).filter(function (c) { return c.rail; });
  check('without ever being put on a rail', railed.length === 0);

  /* It falls. One gravity evaluation against the body that dominated where
   * it died is the whole model, and it has to actually bend the path. */
  var sys4 = Gen.generateSystem('kawartha');
  sys4.canisters = [];
  var low = Sim.circularOrbit(planet, sys4, 0, planet.radius * 0.5, 0, 0);
  var one = Sim.spawnDebris(sys4, 'g1', low.pos, { x: 0, y: 0, z: 0 }, 0.05, 0, [])[0];
  var d0 = V.dist(one.pos, Sim.bodyPosition(planet, sys4, 0));
  var t4 = 0;
  for (var f = 0; f < 60; f++) { Sim.updateCanisters(sys4, low.pos, t4, 1); t4 += 1; }
  var d1 = V.dist(one.pos, Sim.bodyPosition(planet, sys4, t4));
  check('a shard dropped from rest falls toward the planet', d1 < d0,
        d0.toFixed(1) + ' -> ' + d1.toFixed(1) + ' km');

  /* Out of the area it is gone, which is what the player asked for and what
   * the wake radius already means. */
  Sim.updateCanisters(sys, { x: 1e12, y: 0, z: 0 }, tt, 1);
  check('leaving the area throws the wreckage away', Sim.debrisAll(sys).length === 0);

  /* Ninety seconds, not a day. */
  var sys5 = Gen.generateSystem('kawartha');
  sys5.canisters = [];
  Sim.spawnDebris(sys5, 'x1', at, vel, 0.06, 0, []);
  Sim.updateCanisters(sys5, at, Sim.DEBRIS_LIFE * 0.5, 1);
  check('wreckage is still there half a life in', Sim.debrisAll(sys5).length > 0);
  Sim.updateCanisters(sys5, at, Sim.DEBRIS_LIFE + 1, 1);
  check('and gone after ninety seconds', Sim.debrisAll(sys5).length === 0);
  check('which is far shorter than a canister lives',
        Sim.DEBRIS_LIFE < Sim.CANISTER_LIFE / 100);

  /* CAPPED, oldest first. An uncapped field is a memory leak that grows
   * with the body count, on a machine with integrated graphics. */
  var sys6 = Gen.generateSystem('kawartha');
  sys6.canisters = [];
  var crate = Sim.dropCanister(sys6, { pos: at, vel: vel, fwd: { x: 1, y: 0, z: 0 } },
                               'grain', 5, 0);
  for (var kk = 0; kk < 40; kk++) {
    Sim.spawnDebris(sys6, 'kill' + kk, at, vel, 0.20, 0, []);
  }
  check('the debris field is capped however many ships die',
        Sim.debrisAll(sys6).length <= Sim.DEBRIS_MAX,
        Sim.debrisAll(sys6).length + ' of ' + Sim.DEBRIS_MAX);
  check('and the cap never eats somebody\'s cargo',
        sys6.canisters.indexOf(crate) >= 0);
})();

/* Atmospheres, drag and re-entry heat. The thing these guard is that an
 * atmosphere is invisible until it kills you: there is no way to see from
 * the screen that density is wrong by a factor of a thousand until a ship
 * either burns up on a grazing pass or lands at orbital speed unharmed. */
section('--- atmospheres ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var withAir = sys.bodies.filter(function (b) { return b.atmosphere; });
  var airless = sys.bodies.filter(function (b) { return b.kind === 'planet' && !b.atmosphere; });
  check('some worlds have air', withAir.length > 0, withAir.length + ' of ' + sys.bodies.length);
  check('and rocky worlds do not', airless.every(function (b) {
    return b.type === 'rocky';
  }) || airless.length === 0, airless.map(function(b){return b.type;}).join(','));

  var sys2 = Gen.generateSystem('kawartha');
  var a1 = withAir[0], a2 = sys2.byId[a1.id];
  check('the same seed grows the same atmosphere',
        a2.atmosphere && Math.abs(a2.atmosphere.rho0 - a1.atmosphere.rho0) < 1e-12 &&
        Math.abs(a2.atmosphere.cloud - a1.atmosphere.cloud) < 1e-12);

  var at = a1.atmosphere;
  check('density falls by 1/e over one scale height',
        Math.abs(Sim.airDensity(a1, at.scaleHeight) / Sim.airDensity(a1, 0) - Math.exp(-1)) < 1e-9);
  check('density is finite below the surface, not infinite',
        Sim.airDensity(a1, -50) === Sim.airDensity(a1, 0));
  check('there is nothing left above the ceiling',
        Sim.airDensity(a1, at.top + 1) === 0);
  check('an airless world has no air at any altitude',
        airless.length === 0 || Sim.airDensity(airless[0], 0) === 0);
})();

section('--- drag and aerobraking ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var body = sys.bodies.filter(function (b) {
    return b.atmosphere && b.kind === 'planet';
  })[0];

  /* High and dry: a vacuum orbit must be unchanged by all of this, or the
   * drag model has leaked into space and every orbit in the game is wrong. */
  var high = Sim.circularOrbit(body, sys, 0, body.atmosphere.top * 4, 0, 0);
  Sim.refreshShip(high);
  check('there is no air to feel out there',
        Sim.atmosphereContext(high.pos, sys, 0) === null);
  var e0 = Sim.oscElements(high, sys, 0);
  for (var i = 0; i < 400; i++) Sim.stepShip(high, sys, i * 5, 5);
  var e1 = Sim.oscElements(high, sys, 2000);
  check('and an orbit up there holds its shape',
        Math.abs(e1.a - e0.a) / e0.a < 1e-4,
        'a ' + e0.a.toFixed(1) + ' -> ' + e1.a.toFixed(1) + ' km');

  /* Skimming the very top of the air, chosen by DENSITY rather than by a
   * count of scale heights. Picking "five scale heights up" put this molten
   * world at Earth-at-40-km, where both test ships deorbited into the
   * ground inside the sample window and the comparison below became
   * meaningless rather than wrong. Nine was still too thick. Solving for a
   * target density instead makes the test say what it means — "somewhere
   * the air is just barely detectable" — and keeps it valid across every
   * seed and world type rather than the one that happened to come up. */
  /* Anchored to the atmosphere's own ceiling rather than to an absolute
   * density. Solving for "where is the air 1e-5 kg/m^3" looked more
   * physical and was quietly broken: on a thick world that altitude sits
   * ABOVE the 12-scale-height cutoff, so airDensity returned zero, no drag
   * was applied at all, and the decay being measured was pure integrator
   * drift. A fraction of `top` is always inside the air by construction —
   * and the check below refuses to run if it somehow is not. */
  var at = body.atmosphere;
  var skimAlt = at.top * 0.8;
  var low = Sim.circularOrbit(body, sys, 0, skimAlt, 0, 0);
  Sim.refreshShip(low);
  check('the skim altitude really is inside the air',
        Sim.atmosphereContext(low.pos, sys, 0) !== null &&
        Sim.airDensity(body, skimAlt) > 0,
        'rho ' + Sim.airDensity(body, skimAlt).toExponential(2) +
        ' kg/m3 at ' + skimAlt.toFixed(0) + ' km');
  var d0 = Sim.oscElements(low, sys, 0);
  for (var j = 0; j < 100; j++) Sim.stepShip(low, sys, j * 2, 2);
  var d1 = Sim.oscElements(low, sys, 200);
  check('an orbit inside the atmosphere decays', d1.a < d0.a,
        'a ' + d0.a.toFixed(1) + ' -> ' + d1.a.toFixed(1) + ' km');
  check('and it is still flying, not buried',
        d1.periapsis > body.radius * 0.9);

  // Same shape, more mass: harder to push, so it holds its orbit longer.
  var laden = Sim.circularOrbit(body, sys, 0, skimAlt, 0, 0);
  laden.cargo = { grain: 60 }; Sim.refreshShip(laden);
  var empty = Sim.circularOrbit(body, sys, 0, skimAlt, 0, 0);
  empty.cargo = {}; Sim.refreshShip(empty);
  check('the laden ship really is heavier', laden.mass > empty.mass,
        laden.mass + ' t vs ' + empty.mass + ' t');
  check('a heavier ship has the same frontal area',
        Math.abs(laden.dragArea - empty.dragArea) < 1e-12);
  /* Compared on semimajor axis, i.e. on ENERGY, and NOT on speed.
   * Measuring speed here gives the wrong sign and looks like a bug in the
   * drag model: a decaying orbit is a shrinking orbit, and a lower orbit is
   * a FASTER one, so both ships finish this window travelling 0.05 m/s
   * quicker than they started despite drag having removed energy the whole
   * way. Energy is the thing drag can only ever take away.
   *
   * The integrator's own drift over this many steps is comparable to the
   * signal, which is fine precisely because it is common-mode: both ships
   * fly identical orbits through identical arithmetic, so comparing them
   * against EACH OTHER cancels it. Neither absolute number would be
   * trustworthy on its own. */
  for (var k = 0; k < 100; k++) {
    Sim.stepShip(laden, sys, k * 2, 2); Sim.stepShip(empty, sys, k * 2, 2);
  }
  var la = Sim.oscElements(laden, sys, 200).a;
  var ea = Sim.oscElements(empty, sys, 200).a;
  check('the heavier ship holds its orbit longer, being harder to push',
        la > ea, 'laden a ' + la.toFixed(2) + ' km vs empty ' + ea.toFixed(2) + ' km');
})();

section('--- re-entry heat ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var body = sys.bodies.filter(function (b) {
    return b.atmosphere && b.kind === 'planet';
  })[0];
  function shipAt(altKm) {
    var s = Sim.circularOrbit(body, sys, 0, altKm, 0, 0);
    s.hullHp = 100; s.hullMax = 100;
    return Sim.refreshShip(s);
  }

  check('vacuum does not heat anything',
        Sim.heatFlux(shipAt(body.atmosphere.top * 3), sys, 0) === 0);

  var deep = Sim.heatFlux(shipAt(body.atmosphere.scaleHeight * 2), sys, 0);
  var shallow = Sim.heatFlux(shipAt(body.atmosphere.scaleHeight * 7), sys, 0);
  check('deeper is hotter', deep > shallow, deep.toFixed(2) + ' vs ' + shallow.toFixed(2));

  /* The cube law is the whole design: it is what makes slowing down before
   * you commit worth doing, so it is worth a test of its own. */
  var fast = shipAt(body.atmosphere.scaleHeight * 4);
  var slow = shipAt(body.atmosphere.scaleHeight * 4);
  var bv = Sim.bodyState(body, sys, 0).vel;
  slow.vel = { x: bv.x + (slow.vel.x - bv.x) / 2,
               y: bv.y + (slow.vel.y - bv.y) / 2,
               z: bv.z + (slow.vel.z - bv.z) / 2 };
  var rf = Sim.heatFlux(fast, sys, 0) / Sim.heatFlux(slow, sys, 0);
  check('halving entry speed cuts heating about eightfold',
        rf > 7.2 && rf < 8.8, 'ratio ' + rf.toFixed(2));

  /* A hot enough ship cooks, and a heat shield is what stops it — tested in
   * the band where the shield is the DECIDING factor, i.e. where flux sits
   * between what a bare hull sheds and what a shielded one does. Deeper
   * than that both ships saturate at the heat cap and take identical
   * damage, which is correct behaviour and a useless test: it proves only
   * that a bad enough entry kills you either way. */
  function shipAtSpeed(altKm, speedFrac) {
    var s = shipAt(altKm);
    var bv = Sim.bodyState(body, sys, 0).vel;
    s.vel = { x: bv.x + (s.vel.x - bv.x) * speedFrac,
              y: bv.y + (s.vel.y - bv.y) * speedFrac,
              z: bv.z + (s.vel.z - bv.z) * speedFrac };
    return s;
  }
  var bandAlt = body.atmosphere.top * 0.7, bandSpeed = 0.6;
  var probe = shipAtSpeed(bandAlt, bandSpeed);
  var bandFlux = Sim.heatFlux(probe, sys, 0);
  check('the test sits in the band the shield decides',
        bandFlux > 18 && bandFlux < 18 + Combat.MODULES.heatshield.shed,
        'flux ' + bandFlux.toFixed(1) + ' units/s');

  var bare = shipAtSpeed(bandAlt, bandSpeed);
  var dmg = 0;
  for (var i = 0; i < 200; i++) dmg += Sim.updateHeating(bare, sys, 0, 0.5);
  check('an unshielded hull cooks there', dmg > 0, dmg.toFixed(1) + ' hull lost');

  var shielded = shipAtSpeed(bandAlt, bandSpeed);
  shielded.heatShed = Combat.MODULES.heatshield.shed;
  var dmg2 = 0;
  for (var j = 0; j < 200; j++) dmg2 += Sim.updateHeating(shielded, sys, 0, 0.5);
  check('and a shielded one rides it out', dmg2 === 0 && shielded.heat === 0,
        dmg2.toFixed(1) + ' hull lost, heat ' + shielded.heat.toFixed(1));

  check('the glow is normalised for the renderer',
        bare.reentryGlow >= 0 && bare.reentryGlow <= 1);

  // Cool ships cool off rather than staying hot forever.
  var cooling = shipAt(body.atmosphere.top * 3);
  cooling.heat = 50;
  for (var m = 0; m < 40; m++) Sim.updateHeating(cooling, sys, 0, 0.5);
  check('and a ship out of the air sheds its heat', cooling.heat === 0);
})();

section('--- landing gear ---');
(function () {
  var sys = Gen.generateSystem('kawartha');
  var planet = sys.bodies.filter(function (b) { return b.kind === 'planet'; })[0];

  check('the gear starts up', Sim.makeShip({x:0,y:0,z:0}, {x:0,y:0,z:0}).gear === false);

  /* Drag: down costs, up does not. Checked through refreshShip because that
   * is the only thing that recomputes the area, and a gear toggle that
   * forgets to call it would silently do nothing. */
  var s = Sim.makeShip({x:0,y:0,z:0}, {x:0,y:0,z:0});
  Sim.refreshShip(s);
  var upArea = s.dragArea;
  s.gear = true; Sim.refreshShip(s);
  check('gear down is more to push through the air',
        Math.abs(s.dragArea - upArea * Sim.GEAR_DRAG_FACTOR) < 1e-9,
        upArea.toFixed(2) + ' -> ' + s.dragArea.toFixed(2) + ' m2');
  s.gear = false; Sim.refreshShip(s);
  check('and raising it gives the area back', Math.abs(s.dragArea - upArea) < 1e-12);

  /* Touchdown. Same gentle arrival, twice, differing only in the gear —
   * this is the whole rule and it is worth pinning exactly. */
  function touchdown(gear) {
    var lv = Sim.bodyVelocity(planet, sys, 0);
    var up = { x: 1, y: 0, z: 0 };
    var bp = Sim.bodyPosition(planet, sys, 0);
    var sh = Sim.makeShip(V.add(bp, V.scale(up, planet.radius + 0.02)), V.clone(lv));
    sh.gear = gear;
    sh.noDrag = true;                  // isolate the gear rule from the air
    Sim.refreshShip(sh);
    var tt = 0, guard = 0;
    while (!sh.landed && guard++ < 20000) tt = Sim.advanceShip(sh, sys, tt, 0.5, 3000).t;
    return sh;
  }
  var down = touchdown(true), upGear = touchdown(false);
  check('a gentle touchdown on the gear is a landing',
        down.landed && !down.crashed,
        'at ' + (down.impactSpeed * 1000).toFixed(1) + ' m/s');
  check('the same arrival on the hull is a wreck',
        upGear.landed && upGear.crashed,
        'at ' + (upGear.impactSpeed * 1000).toFixed(1) + ' m/s');

  /* A pad now catches you whatever the gear and whatever the speed — the
   * FE2 model, where the game lets you make the mistake and charges hull
   * for it rather than silently declining to let you land. Gear down and
   * gentle is a clean seat; gear up or fast costs hull. */
  if ((sys.pads || []).length) {
    var pad = sys.pads[0];
    var ps = Sim.bodyState(pad, sys, 0);
    function atPad(gear, extraSpeed) {
      var sh = Sim.makeShip(V.clone(ps.pos), V.clone(ps.vel));
      sh.gear = gear;
      /* Add closing speed relative to the pad if asked, so we can test a
       * hard touchdown rather than only a rest-on-the-pad one. */
      if (extraSpeed) sh.vel = V.addScaled(sh.vel, sh.fwd, extraSpeed);
      Sim.refreshShip(sh);
      Combat.initShip(sh);             // give it a real numeric hull to subtract from
      var hull0 = sh.hullHp;
      var hit = Sim.checkImpact(sh, sys, 0, true);
      return { hit: hit, ship: sh, damage: hull0 - sh.hullHp };
    }
    var gentle = atPad(true, 0);       // gear down, at rest on the pad
    var bellyGentle = atPad(false, 0); // gear UP, at rest
    var hardHit = atPad(true, 0.06);   // gear down but coming in fast

    /* Docked OR on the arrival rail: a pad with a hangar under it carries
     * the hull in rather than parking it on the same frame. What this check
     * is about is whether the pad caught it at all. */
    check('a pad catches a ship with the gear down',
          !!gentle.hit &&
          (!!gentle.ship.docked || Sim.arrivalActive(gentle.ship)));
    check('a gentle gear-down landing takes no hull damage',
          gentle.damage === 0);
    check('and it catches a gear-up ship too, no longer refusing it',
          !!bellyGentle.hit);
    check('a fast touchdown costs hull',
          hardHit.damage > 0);
    /* landingDamage itself: gear-up multiplies the same contact speed. */
    check('a belly landing hurts more than the same hit with gear down',
          Sim.landingDamage(0.05, false) > Sim.landingDamage(0.05, true));
    check('and a gentle touch is free either way',
          Sim.landingDamage(0.01, false) === 0);
  }
})();

/* ---- the arrival, animated --------------------------------------------- */
section('the arrival rail');
(function () {
  var Galaxy = require(path.join(SRC, 'galaxy.js'));
  var g = Galaxy.build('kawartha');
  var sys = Gen.generateSystem(g.stars[0].seed);
  var port = (sys.ports || []).filter(function (p) { return p.surface && p.market; })[0];
  check('the seeded system has a surface port to arrive at', !!port,
        port && port.name);
  if (!port) return;

  var t0 = 1000;
  /* Built the way every other test in this file builds one — makeShip takes
   * a position and a velocity and derives the rest. Somewhere near the port
   * rather than at the origin, since the origin is the star. */
  function freshShip() {
    var near = Sim.bodyPosition(port, sys, t0);
    var sh = Sim.makeShip(V.add(near, { x: 0, y: 0, z: 0.5 }),
                          V.clone(Sim.bodyState(port, sys, t0).vel));
    Sim.refreshShip(sh);
    return sh;
  }

  /* THE INVARIANT THAT KEEPS THIS ADDITIVE. Everything that docked before
   * still docks in one call: save-load re-docks, and three suites dock
   * directly. If dockShip had become an animation, loading a save would
   * drop the player into the middle of a lift ride. */
  var snap = freshShip();
  Sim.dockShip(snap, port, sys, t0);
  check('dockShip is still instant, and is still the only thing save needs',
        snap.docked === port.id && !snap.arrival);

  var sh = freshShip();
  var began = Sim.beginArrival(sh, port, sys, t0);
  check('an arrival starts at a surface port', began === true);
  check('and the ship is NOT docked while it is being carried',
        !sh.docked && Sim.arrivalActive(sh));

  /* Continuity. A rail with a gap in it reads as the hull teleporting, and
   * the joins between legs are exactly where that would happen. Sampled
   * finely across the whole run and every step compared to the last. */
  var total = Sim.arrivalTotal();
  var berth = sh.arrival.berth;
  var prev = null, worst = 0, legsSeen = {};
  for (var i = 0; i <= 400; i++) {
    var el = total * i / 400;
    var pose = Sim.arrivalPose(port, sys, t0, berth, el);
    if (!pose) { check('pose resolves at el=' + el.toFixed(2), false); return; }
    legsSeen[pose.legId] = true;
    if (prev) worst = Math.max(worst, V.dist(pose.pos, prev));
    prev = pose.pos;
  }
  var r = port.radius || 1;
  check('the path is continuous — no leg boundary teleports the hull',
        worst < r * 0.25, 'worst step ' + (worst / r).toFixed(4) + ' pad radii');
  check('and every leg is actually visited',
        Object.keys(legsSeen).length === Sim.ARRIVAL_LEGS.length,
        Object.keys(legsSeen).join(','));

  /* The descent must actually descend, and the enclosure must switch on
   * exactly when the hull goes under the doors — not on arrival. */
  var basis = Sim.groundBasis(port, sys, t0);
  function heightAt(el) {
    var p = Sim.arrivalPose(port, sys, t0, berth, el);
    return V.dot(V.sub(p.pos, basis.entrance.pos), basis.up) / r;
  }
  check('the hull starts above the apron', heightAt(0) > 0, heightAt(0).toFixed(3));
  check('and ends below it, in the hangar', heightAt(total - 0.01) < 0,
        heightAt(total - 0.01).toFixed(3));

  var openAir = Sim.arrivalPose(port, sys, t0, berth, 1.0);
  var underground = Sim.arrivalPose(port, sys, t0, berth, total - 0.01);
  check('on the apron you are still outside — the sky is real',
        openAir.enclosed === false, openAir.legId);
  check('once the car is running you are indoors',
        underground.enclosed === true, underground.legId);

  /* The doors are a mechanism, not a flag: they have to be open when the
   * hull needs the hole and shut behind it. */
  var onPad = Sim.arrivalPose(port, sys, t0, berth, 3.0 + 2.4);
  check('the apron doors are open while the hull is on the pad',
        onPad.gates.apron < 0.2, String(onPad.gates.apron.toFixed(3)));
  check('and sealed again by the bottom of the shaft',
        underground.gates.apron > 0.8, String(underground.gates.apron.toFixed(3)));

  /* And the rail ends where dockShip would have put it. If these two ever
   * disagree the hull visibly jumps on the last frame. */
  /* The rail's own length, not the table's: an arrival that starts away
   * from the rail's first pose is drawn onto it first (see beginArrival),
   * and that pull-in is part of the ride. */
  var run = freshShip();
  Sim.beginArrival(run, port, sys, t0);
  var tEnd = t0 + (run.arrival ? run.arrival.dur : total) + 0.001;
  Sim.stepArrival(run, sys, tEnd);
  check('the rail ends docked', run.docked === port.id && !run.arrival);
  check('in the same berth it was carried to',
        run.dockOffset && run.dockOffset.berth === berth,
        run.dockOffset && String(run.dockOffset.berth));

  /* COMPARED AT THE SAME INSTANT, and the first version of this test was
   * not. It docked one ship at t0 and ran the other to t0+18.5, then
   * measured the distance between them in absolute space — which came out
   * at 3893 pad radii, roughly 500 km, because that is how far a port on
   * an orbiting planet travels in eighteen seconds. The port moves; the
   * berth does not move relative to the port. */
  var sameT = freshShip();
  Sim.dockShip(sameT, port, sys, tEnd);
  check('and at the pose dockShip sets, so the last frame does not jump',
        V.dist(run.pos, sameT.pos) < r * 0.02,
        (V.dist(run.pos, sameT.pos) / r).toFixed(5) + ' pad radii apart');
  check('facing the same way, too',
        V.dot(run.fwd, sameT.fwd) > 0.999,
        'dot ' + V.dot(run.fwd, sameT.fwd).toFixed(5));

  /* ---- AND IN ORBIT -----------------------------------------------------
   * This block used to pin the opposite claim — "an orbital station refuses
   * to run an arrival, with no shaft to run" — which was true of the SHAFT
   * legs and never of the idea. A station runs its own five, and the only
   * thing that made the old refusal necessary was arrivalPose asking for a
   * ground frame.
   *
   * This suite does not load ports.js, so the station here wears no model
   * and takes the HALL route: in through the hatch on the hub axis. That is
   * deliberately the case pinned here, because it is the fallback nobody
   * looks at. The modelled route — down a throat the art declares — is
   * measured in berths.test.js, which is the suite that loads both
   * libraries. */
  var station = (sys.ports || []).filter(function (p) { return !p.surface; })[0];
  if (station) {
    var os = freshShip();
    check('an orbital station runs an arrival now',
          Sim.beginArrival(os, station, sys, t0) === true);
    check('and is not docked while it is being carried',
          !os.docked && Sim.arrivalActive(os));

    var sTotal = Sim.arrivalTotal(station);
    check('a station arrival is timed off the station table, not the shaft one',
          sTotal !== Sim.arrivalTotal(), sTotal + ' s vs ' + Sim.arrivalTotal() + ' s');

    var sBerth = os.arrival.berth;
    var sPrev = null, sWorst = 0, sLegs = {};
    for (var si = 0; si <= 400; si++) {
      var sEl = sTotal * si / 400;
      var sp = Sim.arrivalPose(station, sys, t0, sBerth, sEl);
      if (!sp) { check('station pose resolves at el=' + sEl.toFixed(2), false); break; }
      sLegs[sp.legId] = true;
      if (sPrev) sWorst = Math.max(sWorst, V.dist(sp.pos, sPrev));
      sPrev = sp.pos;
    }
    var sr = station.radius || 1;
    check('the station rail has no gap in it', sWorst < sr * 0.05,
          'worst step ' + (sWorst / sr).toFixed(5) + ' station radii');
    check('and every leg of it is reached',
          Object.keys(sLegs).length === Sim.ORBITAL_LEGS.length,
          Object.keys(sLegs).join(' '));

    /* THE HANDOVER. The rail has to end exactly where dockShip would have
     * put the ship, or the last frame of the arrival is a jump cut into the
     * berth — which is the one moment the whole sequence is for. */
    var sEnd = Sim.arrivalPose(station, sys, t0, sBerth, sTotal - 0.001);
    var sSnap = freshShip();
    Sim.dockShip(sSnap, station, sys, t0);
    check('a station arrival ends at the pose dockShip sets',
          V.dist(sEnd.pos, sSnap.pos) < sr * 0.02,
          (V.dist(sEnd.pos, sSnap.pos) / sr).toFixed(5) + ' station radii apart');
    check('facing the same way, too', V.dot(sEnd.fwd, sSnap.fwd) > 0.999,
          'dot ' + V.dot(sEnd.fwd, sSnap.fwd).toFixed(5));

    /* AND IT NEVER TURNS. A berthed hull faces the way it leaves, and the
     * way it leaves is the way it came in, so a station draws a ship in
     * stern-first and the nose never moves. If this ever fails, something
     * has started animating a rotation that dockShip will then snap back. */
    var sSpin = 0;
    for (var sj = 0; sj <= 60; sj++) {
      var sq = Sim.arrivalPose(station, sys, t0, sBerth, sTotal * sj / 60);
      if (sq) sSpin = Math.max(sSpin, 1 - V.dot(sq.fwd, sEnd.fwd));
    }
    check('and the hull never turns on the way in', sSpin < 1e-6,
          'worst 1-dot ' + sSpin.toExponential(2));

    /* THE SKY GOES AWAY WHEN SOMETHING CLOSES OVER YOU, not when a flag
     * flips on arrival. Outside the doors it is there; past the door plane
     * it is not. */
    var sOut = Sim.arrivalPose(station, sys, t0, sBerth, 1.0);
    var sIn = Sim.arrivalPose(station, sys, t0, sBerth, sTotal - 0.01);
    check('lined up outside, the station is not yet an enclosure',
          sOut.enclosed === false, sOut.legId);
    check('on the stand, it is', sIn.enclosed === true, sIn.legId);

    /* THE DOORS, in the order a pilot would watch them: shut in front of
     * you, open to let you in, shut behind you, and then the inner gate
     * opens on the concourse — which is the last thing the arrival does,
     * so it does not end on a blank wall. */
    check('the outer doors are shut while you hold off',
          sOut.gates.apron > 0.99, sOut.gates.apron.toFixed(3));
    /* MIDWAY THROUGH THE `enter` LEG, FOUND RATHER THAN TYPED. This used to
     * read 3.0 + 2.5 + 2.5 — the leg table added up by hand. Leg durations
     * are no longer constants: a station five times the size of another has
     * five times the distance to cover, so sim.js now derives the two legs
     * that TRAVEL from how far they travel. The sum went stale the moment
     * it did, and the test failed on timing rather than on doors, which is
     * the failure telling you the wrong thing. So ask where the leg is. */
    var sThrough = null;
    for (var sk = 0; sk <= 400; sk++) {
      var sp = Sim.arrivalPose(station, sys, t0, sBerth, sTotal * sk / 400);
      if (sp && sp.legId === 'enter') { sThrough = sp; break; }
    }
    check('the arrival has a leg that goes through the doors', !!sThrough);
    check('open by the time you are through them',
          sThrough.gates.apron < 0.01 && sThrough.legId === 'enter',
          sThrough.legId + ' apron ' + sThrough.gates.apron.toFixed(3));
    check('and shut again behind you', sIn.gates.apron > 0.99,
          sIn.gates.apron.toFixed(3));
    check('the inner gate stays shut until you are parked',
          sThrough.gates.inner > 0.99, sThrough.gates.inner.toFixed(3));
    check('and the arrival ends with it open', sIn.gates.inner < 0.01,
          sIn.gates.inner.toFixed(3));
  }

  /* A port that stops existing under a running arrival — a system change —
   * must abandon the rail rather than ride it to nowhere. */
  var orphan = freshShip();
  Sim.beginArrival(orphan, port, sys, t0);
  orphan.arrival.port = 'no-such-port';
  Sim.stepArrival(orphan, sys, t0 + 1);
  check('an arrival whose port vanished is abandoned, not ridden',
        !orphan.arrival && !orphan.docked);
})();

/* ---- the arrival is an arrival, not a launch --------------------------
 *
 * WHAT THIS GUARDS. The arrival's waypoints are in STATION RADII, so every
 * distance the sequence covers scales with the station — but the clock it
 * covers them on used to be a fixed table of leg durations. Raising
 * STATION_SCALE from 0.35 to 3.5 therefore multiplied the speed by ten
 * without a single test noticing: the run-in leg crossed five kilometres in
 * three seconds, peaking at 761 m/s, and the suite stayed green because
 * nothing measured how fast the hull was moving.
 *
 * sim.js now derives the two travelling legs from the distance they travel,
 * and caps the hold point in kilometres. This is the check that says so —
 * and it is written against SPEED rather than against the leg table, so it
 * still means something the next time those durations change.
 *
 * THE CEILING IS MEASURED. Across 25 systems the worst peak is 305 m/s, at
 * the largest station in the galaxy; the calmest is 121. 450 sits half
 * again above anything the generator actually produces and well under the
 * 761 that was wrong, so it catches a regression of that size without
 * failing on ordinary variation. */
(function () {
  console.log('--- the arrival is an arrival ---');
  var peak = 0, peakWho = '', slowest = Infinity, checked = 0;
  var longest = 0, shortest = Infinity;
  for (var i = 0; i < 12; i++) {
    var sys = Gen.generateSystem('arrival-speed-' + i);
    var ports = sys.ports.filter(function (p) { return !p.surface; });
    for (var pi = 0; pi < ports.length; pi++) {
      var p = ports[pi];
      var total = Sim.arrivalTotal(p);
      if (!(total > 0)) continue;
      checked++;
      if (total > longest) longest = total;
      if (total < shortest) shortest = total;
      var prev = null, mx = 0, N = 200, step = total / N;
      for (var k = 0; k <= N; k++) {
        var q = Sim.arrivalPose(p, sys, 0, 0, total * k / N);
        if (!q) { prev = null; continue; }
        if (prev) {
          var v = V.dist(q.pos, prev) * 1000 / step;
          if (v > mx) mx = v;
        }
        prev = q.pos;
      }
      if (mx > peak) { peak = mx; peakWho = p.name + ' r=' + (p.radius * 1000).toFixed(0) + ' m'; }
      if (mx < slowest) slowest = mx;
    }
  }
  check('there are stations to fly into', checked > 0, checked + ' ports');
  check('no arrival exceeds 450 m/s at any station size', peak < 450,
        'peak ' + peak.toFixed(0) + ' m/s at ' + peakWho);
  /* AND IT DOES NOT BECOME A COMMUTE. The same derivation that stops the
   * sequence being a launch would, uncapped, open the largest station with
   * a two-minute cutscene. */
  check('and none of them takes longer than a minute', longest < 60,
        shortest.toFixed(1) + 's to ' + longest.toFixed(1) + 's');
  console.log('  peak ' + peak.toFixed(0) + ' m/s, calmest station peaks at ' +
              slowest.toFixed(0) + ' m/s; arrivals run ' +
              shortest.toFixed(1) + '-' + longest.toFixed(1) + ' s');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
