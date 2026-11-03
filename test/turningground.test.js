/* turningground.test.js - the ground turns, and everything near it knows (2026-11-03).
 *
 *     node test/turningground.test.js
 *
 * Planets spin, and since 2026-11-02 the HUD read speed against the turning
 * ground (Sim.surfaceVelocity) - but everything that FLEW the ship still
 * measured against the world's centre. On a fast equator (measured over 40
 * kawartha systems: airful rocky worlds up to 2,040 m/s, airless up to 798,
 * giants' air up to 20 km/s) that meant:
 *
 *   - a hull at REST on the ground was a crash at the ground's own speed,
 *     and one sliding in AT that speed set down clean (checkImpact);
 *   - a landed ship's nose swung once a day against the dirt;
 *   - a berthed ship at a shaft port lay over in her berth as the day went;
 *   - the air stood still while the ground went round under it, so a ship
 *     hovering over the ground was charged drag (and heat) for the spin.
 *
 * Each check here fails on the code before that day.
 */
global.window = global.window || global;
var V = require('../src/vec3.js');
require('../src/rng.js');
require('../src/kepler.js');
require('../src/economy.js');
var Gen = require('../src/generate.js');
var Galaxy = require('../src/galaxy.js');
require('../src/rings.js');
var Sim = require('../src/sim.js');
require('../src/hulls.js');
require('../src/ports.js');
require('../src/render.js');

var pass = 0, fail = 0;
function check(n, c, d) {
  if (c) { pass++; console.log('  ok   ' + n + (d ? '   ' + d : '')); }
  else { fail++; console.log('  FAIL  ' + n + (d ? '   ' + d : '')); }
}
function ms(kms) { return (kms * 1000).toFixed(2) + ' m/s'; }

/* The fastest equator among worlds with air, and among worlds without, in
 * the first 30 systems - and a turning world with a shaft port. */
var gal = Galaxy.build('kawartha');
var airW = null, bareW = null, shaft = null;
function eqSpeed(b) { return 2 * Math.PI * b.radius / Math.abs((b.rotation || { period: 86400 }).period); }
for (var s = 0; s < 30; s++) {
  var sy = Gen.generateSystem(gal.stars[s].seed, Galaxy.systemOpts(gal, gal.stars[s]));
  sy.bodies.forEach(function (b) {
    if (b.kind !== 'planet' && b.kind !== 'moon') return;
    if (b.type === 'gasGiant' || b.type === 'iceGiant') return;   // nothing to stand on
    var v = eqSpeed(b);
    if (b.atmosphere) { if (!airW || v > airW.v) airW = { b: b, sys: sy, v: v }; }
    else if (!bareW || v > bareW.v) bareW = { b: b, sys: sy, v: v };
  });
  (sy.ports || []).forEach(function (p) {
    if (!p.surface || p.seaPlatform || !p.parentBody) return;
    var v = eqSpeed(p.parentBody) * Math.cos(p.lat || 0);
    if (!shaft || v > shaft.v) shaft = { p: p, sys: sy, v: v };
  });
}
check('a fast-turning world with air', airW && airW.v > 0.3, airW && ms(airW.v) + ' at its equator');
check('and one without', bareW && bareW.v > 0.1, bareW && ms(bareW.v) + ' at its equator');

/* A point on the equator, h km above the ground, at time t - well away
 * from any port's shaft (insideShaft would excuse it from the ground). */
function spot(w, t, h) {
  var at = { lat: 0, lon: 2.0, elevation: h };
  var c = Sim.bodyState(w.b, w.sys, t), off = Sim.surfaceOffset(w.b, at, t);
  return { pos: V.add(c.pos, off.pos), ground: V.add(c.vel, off.vel), centre: c.vel,
           up: V.norm(off.pos) };
}
function hull(pos, vel, up) {
  var sh = Sim.makeShip(pos, vel);
  sh.gear = true;
  var e = V.norm(V.cross({ x: 0, y: 0, z: 1 }, up));
  sh.fwd = e; sh.up = up; sh.right = V.cross(e, up);
  return sh;
}

[['air', airW], ['airless', bareW]].forEach(function (pair) {
  var w = pair[1]; if (!w) return;
  console.log('--- touching down on ' + w.b.name + ' (' + pair[0] + ', equator ' + ms(w.v) + ') ---');
  var t = 12345;
  /* Just under the surface: the contact checkImpact is there to catch. */
  var a = spot(w, t, -0.0005);
  var still = hull(a.pos, a.ground, a.up);
  var hit = Sim.checkImpact(still, w.sys, t, false);
  check('at rest against the ground, gear down: a landing, not a crash',
        hit === w.b && still.landed && !still.crashed, 'contact ' + ms(still.impactSpeed || 0));
  check('and she is left moving with the ground', V.dist(still.vel, Sim.surfaceVelocity(w.b, still.pos, w.sys, t)) < 1e-9);

  var spun = hull(a.pos, a.centre, a.up);
  Sim.checkImpact(spun, w.sys, t, false);
  check('still against the CENTRE is the ground\'s spin against the ground: a crash',
        spun.landed && spun.crashed, 'contact ' + ms(spun.impactSpeed || 0));

  /* Flown, not placed: from 20 m up, at rest with the ground, gear down. */
  var b = spot(w, t, 0.02);
  var drop = hull(b.pos, b.ground, b.up);
  var tt = t;
  for (var i = 0; i < 400 && !drop.landed; i++) { Sim.advanceShip(drop, w.sys, tt, 0.05, 50); tt += 0.05; }
  check('dropped from 20 m at rest with the ground, she lands', drop.landed && !drop.crashed,
        'contact ' + ms(drop.impactSpeed || 0) + ' after ' + (tt - t).toFixed(2) + ' s');

  /* An hour on the ground, at the spot she landed. */
  if (still.landedAt) {
    var at0 = { lat: still.landedAt.lat, lon: still.landedAt.lon };
    Sim.updateLandedShip(still, w.sys, t);
    var nose0 = Sim.bodyFixedDir(w.b, t, still.fwd, true);
    Sim.updateLandedShip(still, w.sys, t + 3600);
    var back = Sim.landSpot(w.b, w.sys, t + 3600, still.pos);
    var dLat = Math.abs(back.lat - at0.lat), dLon = Math.abs(back.lon - at0.lon);
    check('an hour later she is at the same latitude and longitude', dLat < 1e-9 && dLon < 1e-9,
          'moved ' + (Math.max(dLat, dLon) * w.b.radius * 1e6).toFixed(3) + ' mm');
    var nose1 = Sim.bodyFixedDir(w.b, t + 3600, still.fwd, true);
    check('and her nose points the same way across the ground', V.dist(nose0, nose1) < 1e-9,
          'turned ' + (Math.acos(Math.max(-1, Math.min(1, V.dot(nose0, nose1)))) * 180 / Math.PI).toFixed(4) + ' deg');
    check('moving with the ground under her', V.dist(still.vel, Sim.surfaceVelocity(w.b, still.pos, w.sys, t + 3600)) < 1e-9);

    /* A spot saved before fwdB existed takes the heading from her nose. */
    var old = { body: still.landedAt.body, lat: at0.lat, lon: at0.lon, elevation: 0.004 };
    var mig = hull(still.pos, still.vel, still.up);
    mig.fwd = V.clone(still.fwd); mig.landed = true; mig.landedAt = old;
    Sim.updateLandedShip(mig, w.sys, t + 3600);
    check('an old save\'s spot keeps the nose it was saved with', V.dist(mig.fwd, still.fwd) < 1e-9 && !!old.fwdB);

    /* Lift-off: the ground's velocity plus the climb, not the centre's. */
    var lift = hull(still.pos, still.vel, still.up);
    lift.landed = true; lift.landedAt = JSON.parse(JSON.stringify(still.landedAt));
    lift.maxAccel = 1; lift.throttle = 1;
    var tl = t + 3600;
    Sim.updateLandedShip(lift, w.sys, tl);
    var gv = V.clone(lift.vel), upL = V.clone(lift.up);
    var lo = Sim.liftOff(lift, w.sys, tl);
    var climb = V.sub(lift.vel, gv);
    check('lift-off leaves with the ground\'s velocity plus the climb', lo.ok &&
          Math.abs(V.dot(climb, upL) - 0.004) < 1e-12 && V.len(V.addScaled(climb, upL, -V.dot(climb, upL))) < 1e-12,
          'climb ' + ms(V.dot(climb, upL)) + ', ' + ms(V.dist(lift.vel, Sim.bodyVelocity(w.b, w.sys, tl))) + ' against the centre');
  }
});

console.log('--- the air turns with its world ---');
if (airW) {
  var t2 = 4000, w2 = airW, h2 = Math.min(10, w2.b.atmosphere.top * 0.1);
  var p2 = spot(w2, t2, h2);
  var atmo = Sim.atmosphereContext(p2.pos, w2.sys, t2);
  check('the air there knows how fast it turns', atmo && !!atmo.omega);
  var ship2 = hull(p2.pos, p2.ground, p2.up);
  var dCo = V.len(Sim.dragAccel ? Sim.dragAccel(p2.pos, p2.ground, atmo, ship2) : { x: 0, y: 0, z: 0 });
  var dCe = V.len(Sim.dragAccel ? Sim.dragAccel(p2.pos, p2.centre, atmo, ship2) : { x: 0, y: 0, z: 0 });
  check('dragAccel is exported for this', !!Sim.dragAccel);
  check('drag on a ship moving with the air is nothing', dCo < 1e-15, dCo.toExponential(2) + ' km/s^2');
  check('and still against the CENTRE she is in a gale', dCe > 1e-7, (dCe * 1000).toFixed(3) + ' m/s^2 at ' + h2.toFixed(1) + ' km');
  ship2.vel = p2.ground;
  var flux = Sim.airFlux ? Sim.airFlux(ship2, w2.sys, t2) : -1;
  check('and no heat moving with it', flux >= 0 && flux < 1e-12, String(flux));
  /* Hover assist's frame: the air at her is the ground's velocity there. */
  check('the air velocity at her is the ground velocity there',
        V.dist(Sim.airVelocity(atmo, p2.pos), Sim.surfaceVelocity(w2.b, p2.pos, w2.sys, t2)) < 1e-12);
}

console.log('--- berthed at a surface port, through the day ---');
if (shaft) {
  var port = shaft.p, sysS = shaft.sys, tA = 1000;
  var sh3 = Sim.makeShip(Sim.bodyPosition(port, sysS, tA), Sim.bodyVelocity(port, sysS, tA));
  Sim.dockShip(sh3, port, sysS, tA);
  var bsA = Sim.berthState(port, sysS, tA, sh3.dockOffset.berth);
  if (bsA && bsA.basis) {
    var upA = V.dot(sh3.up, bsA.basis.up);
    var tB = tA + Math.abs(port.parentBody.rotation.period) * 0.25;
    Sim.updateDockedShip(sh3, sysS, tB);
    var bsB = Sim.berthState(port, sysS, tB, sh3.dockOffset.berth);
    var upB = V.dot(sh3.up, bsB.basis.up);
    check('a quarter-day later she still stands level in her berth (' + port.name + ')',
          Math.abs(upA - 1) < 1e-9 && Math.abs(upB - 1) < 1e-9, 'up . floor ' + upA.toFixed(6) + ' then ' + upB.toFixed(6));
  } else {
    check('the port has a berth to stand in', false, port.name);
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
